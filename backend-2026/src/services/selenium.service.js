const { Builder, By, until } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')

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
    await driver.get(url)

    for (let i = 0; i < steps.length; i++) {
      await runStep(driver, steps[i], { stepTimeoutMs })
    }

    return { status: 'passed', message: 'Test case executed successfully.' }
  } catch (err) {
    const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err)
    return { status: 'failed', message: msg || 'Test case failed.' }
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

