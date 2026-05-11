const { Builder, By, until } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const fs = require('fs')
const path = require('path')

function getEnvBool(name, defaultValue = false) {
  const raw = process.env[name]
  if (raw == null) return defaultValue
  const v = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false
  return defaultValue
}

function getEnvInt(name, defaultValue) {
  const raw = process.env[name]
  const n = Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) ? n : defaultValue
}

function parseSelector(raw) {
  const s = String(raw || '').trim()
  if (!s) return null

  const m = s.match(/^(css|xpath|id|name)\s*=\s*(.+)$/i)
  if (m) {
    return { kind: m[1].toLowerCase(), value: m[2].trim() }
  }

  // Default to CSS if no prefix is provided
  return { kind: 'css', value: s }
}

function byFromSelector(selector) {
  if (!selector) return null
  const { kind, value } = selector
  if (!value) return null
  switch (kind) {
    case 'css':
      return By.css(value)
    case 'xpath':
      return By.xpath(value)
    case 'id':
      return By.id(value)
    case 'name':
      return By.name(value)
    default:
      return null
  }
}

function normalizeStep(step) {
  if (!step) return null

  // Object format
  if (typeof step === 'object') {
    const action = String(step.action || step.type || '').trim().toLowerCase()
    const selector =
      step.selector?.value
        ? { kind: String(step.selector.kind || step.selector.type || 'css'), value: String(step.selector.value) }
        : parseSelector(step.selector || step.target || step.element)

    const value = step.value ?? step.text ?? step.input ?? undefined
    const ms = step.ms ?? step.timeoutMs ?? step.waitMs ?? undefined

    return {
      action,
      selector,
      value: value == null ? undefined : String(value),
      ms: ms == null ? undefined : Number(ms),
    }
  }

  // String format: "click css=.btn", "type css=#email test@test.com", "wait 1500"
  const raw = String(step).trim()
  if (!raw) return null

  const actionMatch = raw.match(/^(\w+)\s+(.*)$/)
  if (!actionMatch) return null
  const action = actionMatch[1].toLowerCase()
  const rest = actionMatch[2].trim()

  if (action === 'wait') {
    const msOnly = rest.match(/^(\d+)\s*ms?$/i) || rest.match(/^(\d+)$/)
    if (msOnly) return { action: 'wait', ms: Number(msOnly[1]) }

    const parts = rest.split(/\s+/)
    const maybeMs = parts[parts.length - 1]
    const selectorRaw = parts.slice(0, -1).join(' ')
    const ms = Number(maybeMs)
    if (selectorRaw && Number.isFinite(ms)) {
      return { action: 'wait', selector: parseSelector(selectorRaw), ms }
    }
    return { action: 'wait', selector: parseSelector(rest) }
  }

  if (action === 'click') {
    return { action: 'click', selector: parseSelector(rest) }
  }

  if (action === 'type') {
    const arrow = rest.split(/\s*=>\s*/)
    if (arrow.length >= 2) {
      return { action: 'type', selector: parseSelector(arrow[0]), value: arrow.slice(1).join('=>') }
    }
    const parts = rest.split(/\s+/)
    const selectorRaw = parts[0]
    const value = parts.slice(1).join(' ')
    return { action: 'type', selector: parseSelector(selectorRaw), value }
  }

  return { action, raw }
}

function resolveTestCaseUrl(testCase) {
  const url = String(testCase?.url || testCase?.urlCible || testCase?.targetUrl || '').trim()
  return url || null
}

function resolveCredentials(testCase) {
  const email =
    testCase?.credentials?.email ??
    testCase?.email ??
    process.env.SELENIUM_LOGIN_EMAIL ??
    ''
  const password =
    testCase?.credentials?.password ??
    testCase?.password ??
    process.env.SELENIUM_LOGIN_PASSWORD ??
    ''

  const normalizedEmail = String(email || '').trim()
  const normalizedPassword = String(password || '').trim()
  return { email: normalizedEmail, password: normalizedPassword }
}

function toAbsoluteUrl(baseUrl, maybePath) {
  const base = String(baseUrl || '').trim()
  const rel = String(maybePath || '').trim()
  if (!base) return null
  try {
    return new URL(rel, base.endsWith('/') ? base : `${base}/`).toString()
  } catch {
    return null
  }
}

function normalizeHumanStepText(step) {
  return String(step || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function inferHumanStepAction(stepText) {
  const t = normalizeHumanStepText(stepText)
  if (!t) return null

  if (t.includes('open application url') || t === 'open url' || t === 'open application') {
    return { kind: 'open_app' }
  }
  if (t.includes('go to login') || t.includes('go to sign in') || t.includes('go to signin') || t.includes('login page')) {
    return { kind: 'go_login' }
  }
  if (t.includes('fill email')) {
    return { kind: 'fill_email' }
  }
  if (t.includes('fill password')) {
    return { kind: 'fill_password' }
  }
  if (t.includes('click login') || t.includes('click sign in') || t.includes('submit login') || t.includes('click submit')) {
    return { kind: 'click_login' }
  }
  if (t.includes('verify redirect') || t.includes('verify dashboard') || t.includes('redirect to dashboard')) {
    return { kind: 'verify_dashboard' }
  }

  return null
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true })
}

function toSafeFilePart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .slice(0, 60) || 'testcase'
}


async function captureFailureScreenshot(driver, { testCaseId, stepIndex }) {
  const root = path.resolve(__dirname, '..', '..')
  const outDir = path.join(root, 'uploads', 'selenium')
  await ensureDir(outDir)

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const tc = toSafeFilePart(testCaseId)
  const fileName = `${ts}_${tc}_step-${stepIndex + 1}.png`
  const fullPath = path.join(outDir, fileName)

  const b64 = await driver.takeScreenshot()
  await fs.promises.writeFile(fullPath, b64, 'base64')

  // Return a path that maps to `GET /api/uploads/<screenshotPath>`
  return `selenium/${fileName}`
}

async function runStep(driver, step, timeouts) {
  const normalized = normalizeStep(step)
  if (!normalized) return

  const action = normalized.action
  if (!action) throw new Error('Invalid step: missing action')

  if (action === 'wait') {
    const ms = Number.isFinite(normalized.ms) ? normalized.ms : timeouts.stepTimeoutMs
    const selector = normalized.selector ? byFromSelector(normalized.selector) : null
    if (!selector) {
      await driver.sleep(ms)
      return
    }
    const el = await driver.wait(until.elementLocated(selector), timeouts.stepTimeoutMs)
    await driver.wait(until.elementIsVisible(el), timeouts.stepTimeoutMs)
    if (Number.isFinite(normalized.ms)) await driver.sleep(normalized.ms)
    return
  }

  if (action === 'click') {
    const by = byFromSelector(normalized.selector)
    if (!by) throw new Error('click step requires a selector (e.g. "click css=.btn")')
    const el = await driver.wait(until.elementLocated(by), timeouts.stepTimeoutMs)
    await driver.wait(until.elementIsVisible(el), timeouts.stepTimeoutMs)
    await driver.wait(until.elementIsEnabled(el), timeouts.stepTimeoutMs)
    await el.click()
    return
  }

  if (action === 'type') {
    const by = byFromSelector(normalized.selector)
    if (!by) throw new Error('type step requires a selector (e.g. "type css=#email test@example.com")')
    const value = String(normalized.value ?? '')
    const el = await driver.wait(until.elementLocated(by), timeouts.stepTimeoutMs)
    await driver.wait(until.elementIsVisible(el), timeouts.stepTimeoutMs)
    await el.clear()
    await el.sendKeys(value)
    return
  }

  throw new Error(`Unsupported step action: "${action}" (supported: click, type, wait)`)
}

async function runHumanStep(driver, stepText, ctx, timeouts) {
  const action = inferHumanStepAction(stepText)
  if (!action) {
    throw new Error(
      `Unsupported step text: "${String(stepText)}". Supported (v1): Open application URL, Go to login page, Fill email field, Fill password field, Click login button, Verify redirect to dashboard.`
    )
  }

  // Fixed selectors for your current login page template
  const SELECTORS = {
    email: By.css('#example-email'),
    password: By.css('#example-password'),
    submit: By.css('form.authentication-form button[type="submit"]'),
  }

  if (action.kind === 'open_app') {
    await driver.get(ctx.baseUrl)
    return
  }

  if (action.kind === 'go_login') {
    const loginUrl = toAbsoluteUrl(ctx.baseUrl, '/auth/sign-in')
    if (!loginUrl) throw new Error('Unable to compute login URL from base url.')
    await driver.get(loginUrl)
    return
  }

  if (action.kind === 'fill_email') {
    if (!ctx.credentials.email) throw new Error('Missing email (provide testCase.email or testCase.credentials.email).')
    const el = await driver.wait(until.elementLocated(SELECTORS.email), timeouts.stepTimeoutMs)
    await driver.wait(until.elementIsVisible(el), timeouts.stepTimeoutMs)
    await el.clear()
    await el.sendKeys(ctx.credentials.email)
    return
  }

  if (action.kind === 'fill_password') {
    if (!ctx.credentials.password) throw new Error('Missing password (provide testCase.password or testCase.credentials.password).')
    const el = await driver.wait(until.elementLocated(SELECTORS.password), timeouts.stepTimeoutMs)
    await driver.wait(until.elementIsVisible(el), timeouts.stepTimeoutMs)
    await el.clear()
    await el.sendKeys(ctx.credentials.password)
    return
  }

  if (action.kind === 'click_login') {
    const el = await driver.wait(until.elementLocated(SELECTORS.submit), timeouts.stepTimeoutMs)
    await driver.wait(until.elementIsVisible(el), timeouts.stepTimeoutMs)
    await driver.wait(until.elementIsEnabled(el), timeouts.stepTimeoutMs)
    await el.click()
    return
  }

  if (action.kind === 'verify_dashboard') {
    await driver.wait(until.urlContains('/dashboard'), timeouts.stepTimeoutMs)
    return
  }

  throw new Error(`Unsupported step kind: "${action.kind}"`)
}

async function runTestCase(testCase) {
  const url = resolveTestCaseUrl(testCase)
  if (!url) {
    return { status: 'error', message: 'Missing testCase.url (or urlCible/targetUrl).' }
  }

  const steps = Array.isArray(testCase?.steps) ? testCase.steps : []
  if (!steps.length) {
    return { status: 'error', message: 'No steps provided for this test case.' }
  }

  const headless = getEnvBool('SELENIUM_HEADLESS', true)
  const stepTimeoutMs = getEnvInt('SELENIUM_STEP_TIMEOUT_MS', 10000)
  const pageLoadTimeoutMs = getEnvInt('SELENIUM_PAGELOAD_TIMEOUT_MS', 45000)

  const options = new chrome.Options()
  if (headless) options.addArguments('--headless=new')
  options.addArguments(
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1365,768'
  )

  /** @type {import('selenium-webdriver').ThenableWebDriver | null} */
  let driver = null

  try {
    driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build()
    await driver.manage().setTimeouts({ pageLoad: pageLoadTimeoutMs })

    const credentials = resolveCredentials(testCase)
    const testCaseId = String(testCase?.id || testCase?._id || testCase?.title || 'testcase')
    const stepResults = []
    const ctx = { baseUrl: url, credentials, testCaseId }

    for (let i = 0; i < steps.length; i++) {
      const name = typeof steps[i] === 'string' ? steps[i] : (steps[i]?.name || steps[i]?.label || steps[i]?.action || `Step ${i + 1}`)
      const result = { index: i + 1, name: String(name || `Step ${i + 1}`), status: 'passed' }
      try {
        if (typeof steps[i] === 'string') {
          await runHumanStep(driver, steps[i], ctx, { stepTimeoutMs })
        } else {
          await runStep(driver, steps[i], { stepTimeoutMs })
        }
        stepResults.push(result)
      } catch (err) {
        const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err)
        let screenshotPath = null
        try {
          screenshotPath = await captureFailureScreenshot(driver, { testCaseId, stepIndex: i })
        } catch {
          screenshotPath = null
        }

        stepResults.push({
          ...result,
          status: 'failed',
          message: msg || 'Step failed.',
          screenshotPath,
        })

        return {
          status: 'failed',
          message: msg || 'Test case failed.',
          errorMessage: msg || 'Test case failed.',
          screenshotPath,
          stepResults,
        }
      }
    }

    return {
      status: 'passed',
      message: 'Test case executed successfully.',
      stepResults,
    }
  } catch (err) {
    const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err)
    return { status: 'failed', message: msg || 'Test case failed.', errorMessage: msg || 'Test case failed.', stepResults: [] }
  } finally {
    try {
      if (driver) await driver.quit()
    } catch {
      // ignore quit errors
    }
  }
}

module.exports = {
  runTestCase,
}
