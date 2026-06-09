const { By, until } = require('selenium-webdriver')

function hasAny(text, patterns) {
  return patterns.some((p) => text.includes(p))
}

function normalizeStep(stepText) {
  if (!stepText) return ''
  if (typeof stepText === 'string') return stepText
  if (typeof stepText === 'object') {
    return stepText.step || stepText.text || stepText.name || JSON.stringify(stepText)
  }
  return String(stepText)
}

function toUrl(rawUrl) {
  const value = String(rawUrl || '').trim()
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function joinUrl(baseUrl, path) {
  const base = toUrl(baseUrl).replace(/\/+$/, '')
  const nextPath = String(path || '').trim()
  if (!base || !nextPath) return base
  return `${base}/${nextPath.replace(/^\/+/, '')}`
}

function getSelector(ctx, key, fallback) {
  return ctx?.selectors?.[key] || fallback
}

async function getCurrentUrlSafe(driver) {
  try {
    return await driver.getCurrentUrl()
  } catch {
    return 'unknown'
  }
}

function normalizeAction(step) {
  return String(step?.action || '').trim().toLowerCase()
}

function normalizeTargetName(step) {
  const target = step?.target || {}
  return String(target.name || target.kind || step?.raw || step?.id || '').trim().toLowerCase()
}

function targetHas(step, patterns) {
  const value = `${normalizeTargetName(step)} ${String(step?.raw || '').toLowerCase()} ${String(step?.value?.key || '').toLowerCase()}`
  return hasAny(value, patterns)
}

function semanticWords(step) {
  const raw = `${step?.target?.name || ''} ${step?.raw || ''}`.toLowerCase()
  return Array.from(new Set(raw.split(/[^a-z0-9]+/).filter((word) => word.length > 2))).slice(0, 8)
}

function looksLikeGenericValidFieldFill(description) {
  const t = String(description || '').toLowerCase()
  return (
    t.includes('valid values') ||
    t.includes('mandatory fields') ||
    t.includes('required fields') ||
    t.includes('all mandatory fields') ||
    t.includes('fill all fields') ||
    t.includes('enter all details') ||
    t.includes('enter details') ||
    t.includes('complete the form')
  )
}

function structuredValue(step, ctx) {
  const value = step?.value || {}
  const source = String(value.source || '').toLowerCase()
  const key = String(value.key || '').toLowerCase()

  if (source === 'credential') {
    if (key.includes('password')) return String(ctx?.credentials?.password || '')
    if (key.includes('apitoken') || key.includes('token')) return String(ctx?.credentials?.apiToken || '')
    if (key.includes('username')) return String(ctx?.credentials?.username || ctx?.credentials?.email || '')
    if (key.includes('email')) return String(ctx?.credentials?.email || ctx?.credentials?.username || '')
  }

  if (source === 'context' && key.includes('baseurl')) {
    return toUrl(ctx?.baseUrl)
  }

  return String(value.text || '')
}

function buildTextXpath(tags, words) {
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const tagFilter = tags.map((tag) => `self::${tag}`).join(' or ')
  const wordFilter = words
    .map((word) => `contains(translate(normalize-space(.), '${upper}', '${lower}'), '${word}')`)
    .join(' or ')

  return `//*[${tagFilter}][${wordFilter}]`
}

async function findFirstVisible(driver, locators, timeoutMs = 15000) {
  return driver.wait(async () => {
    for (const locator of locators) {
      const elements = await driver.findElements(locator)

      for (const element of elements) {
        try {
          if (await element.isDisplayed()) return element
        } catch {
          // Element disappeared while Selenium was inspecting it.
        }
      }
    }

    return false
  }, timeoutMs)
}

async function safeClick(driver, element) {
  await driver.executeScript(
    'arguments[0].scrollIntoView({block: "center", inline: "center", behavior: "instant"});',
    element
  )
  await driver.sleep(250)

  try {
    await element.click()
    return 'webdriver'
  } catch (err) {
    const message = String(err?.message || err || '')
    if (!/intercepted|not clickable|other element would receive the click/i.test(message)) {
      throw err
    }

    await driver.executeScript('arguments[0].click();', element)
    return 'javascript'
  }
}

async function openLoginPage(driver, ctx) {
  const explicitUrl = toUrl(ctx?.loginUrl || ctx?.authUrl || ctx?.signInUrl)
  if (explicitUrl) {
    await driver.get(explicitUrl)
    await driver.wait(until.elementLocated(By.css('body')), 15000)
    return explicitUrl
  }

  const baseUrl = toUrl(ctx.baseUrl)
  if (!baseUrl) throw new Error('baseUrl is missing')

  await driver.get(baseUrl)
  await driver.wait(until.elementLocated(By.css('body')), 15000)

  if (/login|signin|sign-in|signup|auth|session|account/i.test(baseUrl)) {
    return baseUrl
  }

  try {
    const loginTrigger = await findFirstVisible(
      driver,
      [
        By.css(getSelector(ctx, 'loginLink', 'a[href*="login"], a[href*="signin"], a[href*="sign-in"], a[href*="auth"], button[name*="login"], button[id*="login"]')),
        By.xpath(buildTextXpath(['a', 'button'], ['login', 'log in', 'sign in', 'signin', 'connexion', 'se connecter'])),
      ],
      5000
    )
    await loginTrigger.click()
    await driver.sleep(1500)
    await driver.wait(until.elementLocated(By.css('body')), 15000)
    return await driver.getCurrentUrl()
  } catch {
    // Some applications expose login directly under a conventional path.
  }

  const loginPaths = [ctx?.loginPath, '/login', '/signin', '/sign-in', '/auth/sign-in'].filter(Boolean)
  for (const loginPath of loginPaths) {
    const candidateUrl = joinUrl(baseUrl, loginPath)
    await driver.get(candidateUrl)
    await driver.wait(until.elementLocated(By.css('body')), 15000)

    try {
      await findFirstVisible(
        driver,
        [
          By.css(getSelector(ctx, 'email', 'input[type="email"], input[name*="email"], input[id*="email"], input[name*="user"], input[id*="user"], input[autocomplete="username"], input[type="text"]')),
          By.css(getSelector(ctx, 'password', 'input[type="password"]')),
        ],
        2500
      )
      return candidateUrl
    } catch {
      // Try the next common path.
    }
  }

  return await driver.getCurrentUrl()
}

async function fillUserIdentifier(driver, ctx) {
  const selector = getSelector(
    ctx,
    'email',
    [
      'input[type="email"]',
      'input[name*="email"]',
      'input[id*="email"]',
      'input[placeholder*="email"]',
      'input[placeholder*="Email"]',
      'input[name*="username"]',
      'input[id*="username"]',
      'input[name*="user"]',
      'input[id*="user"]',
      'input[autocomplete="username"]',
      'input[type="text"]',
      'input:not([type])'
    ].join(', ')
  )
  const value = String(ctx?.credentials?.email || ctx?.credentials?.username || '')

  if (!value) {
    throw new Error('Missing login email/username. Provide credentials.email/username or APP_LOGIN_EMAIL.')
  }

  let element = null
  try {
    element = await findFirstVisible(driver, [By.css(selector)], 15000)
  } catch (err) {
    const currentUrl = await getCurrentUrlSafe(driver)
    throw new Error(`Email/username field not found on ${currentUrl}. Tried selector: ${selector}`)
  }
  await driver.wait(until.elementIsEnabled(element), 15000)
  await element.clear()
  await element.sendKeys(value)

  return { selector, value }
}

async function clearUserIdentifier(driver, ctx) {
  const selector = getSelector(
    ctx,
    'email',
    [
      'input[type="email"]',
      'input[name*="email"]',
      'input[id*="email"]',
      'input[placeholder*="email"]',
      'input[placeholder*="Email"]',
      'input[name*="username"]',
      'input[id*="username"]',
      'input[name*="user"]',
      'input[id*="user"]',
      'input[autocomplete="username"]',
      'input[type="text"]',
      'input:not([type])'
    ].join(', ')
  )
  const element = await findFirstVisible(driver, [By.css(selector)], 15000)
  await driver.wait(until.elementIsEnabled(element), 15000)
  await element.clear()

  return { selector }
}

async function clickNextIfPresent(driver, ctx) {
  try {
    await findFirstVisible(driver, [By.css(getSelector(ctx, 'password', 'input[type="password"], input[name*="password"], input[id*="password"]'))], 1000)
    return false
  } catch {
    // Multi-step login pages often show the password field only after clicking Next.
  }

  try {
    const nextButton = await findFirstVisible(
      driver,
      [
        By.css(getSelector(ctx, 'nextButton', '#identifierNext button, button[name*="next"], button[id*="next"]')),
        By.xpath(buildTextXpath(['button', 'a'], ['next', 'continue', 'suivant', 'continuer'])),
      ],
      2500
    )

    await nextButton.click()
    await driver.sleep(1200)
    return true
  } catch {
    return false
  }
}

async function fillPassword(driver, ctx) {
  const selector = getSelector(ctx, 'password', 'input[type="password"], input[name*="password"], input[id*="password"]')
  const value = String(ctx?.credentials?.password || '')

  if (!value) {
    throw new Error('Missing login password. Provide credentials.password or APP_LOGIN_PASSWORD.')
  }

  const element = await findFirstVisible(driver, [By.css(selector)], 15000)
  await driver.wait(until.elementIsEnabled(element), 15000)
  await element.clear()
  await element.sendKeys(value)

  return { selector }
}

async function clearPassword(driver, ctx) {
  const selector = getSelector(ctx, 'password', 'input[type="password"], input[name*="password"], input[id*="password"]')
  const element = await findFirstVisible(driver, [By.css(selector)], 15000)
  await driver.wait(until.elementIsEnabled(element), 15000)
  await element.clear()

  return { selector }
}

async function clickSubmitLogin(driver, ctx) {
  const selector = getSelector(
    ctx,
    'submit',
    'button[type="submit"], input[type="submit"], #passwordNext button, #login button, button[name*="login"], button[id*="login"]'
  )

  const element = await findFirstVisible(
    driver,
    [
      By.css(selector),
      By.xpath(buildTextXpath(['button', 'a', 'input'], ['login', 'log in', 'sign in', 'submit', 'continue', 'connexion', 'se connecter'])),
    ],
    15000
  )

  await driver.wait(until.elementIsEnabled(element), 15000)
  await safeClick(driver, element)
  await driver.sleep(3000)

  return { selector }
}

async function clickSemanticTarget(driver, step, ctx) {
  const words = semanticWords(step)
  const locators = []

  if (words.length) {
    locators.push(By.xpath(buildTextXpath(['button', 'a', 'input'], words)))
  }
  locators.push(By.css(getSelector(ctx, 'genericClickable', 'button, a, [role="button"], input[type="button"], input[type="submit"]')))

  const element = await findFirstVisible(driver, locators, 15000)
  await driver.wait(until.elementIsEnabled(element), 15000)
  await safeClick(driver, element)

  return { selector: words.length ? `semantic:${words.join('|')}` : 'genericClickable' }
}

function genericFieldValueForElement(meta = {}) {
  const haystack = `${meta.name || ''} ${meta.id || ''} ${meta.placeholder || ''} ${meta.ariaLabel || ''} ${meta.type || ''}`.toLowerCase()
  const today = new Date().toISOString().slice(0, 10)

  if (haystack.includes('password')) return 'P@ssw0rd123!'
  if (haystack.includes('email')) return 'john.doe@example.com'
  if (haystack.includes('username') || haystack.includes('user')) return 'john.doe'
  if (haystack.includes('first name') || haystack.includes('firstname') || haystack.includes('given name')) return 'John'
  if (haystack.includes('last name') || haystack.includes('lastname') || haystack.includes('surname') || haystack.includes('family name')) return 'Doe'
  if (haystack.includes('full name') || haystack.includes('name')) return 'John Doe'
  if (haystack.includes('phone') || haystack.includes('mobile') || haystack.includes('tel')) return '5551234567'
  if (haystack.includes('address')) return '123 Main Street'
  if (haystack.includes('city')) return 'Tunis'
  if (haystack.includes('country')) return 'Tunisia'
  if (haystack.includes('postal') || haystack.includes('zip')) return '1000'
  if (haystack.includes('date')) return today
  if (haystack.includes('age')) return '25'
  if (haystack.includes('search')) return 'sample'
  return 'Sample Value'
}

async function fillGenericMandatoryFields(driver, ctx, description) {
  const selectors = getSelector(
    ctx,
    'genericInput',
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"], select'
  )
  const elements = await driver.findElements(By.css(selectors))
  const filled = []

  for (const element of elements) {
    try {
      if (!(await element.isDisplayed())) continue
      if (!(await element.isEnabled())) continue

      const tagName = String(await element.getTagName()).toLowerCase()
      const type = tagName === 'input' ? String(await element.getAttribute('type') || '').toLowerCase() : ''
      const name = String(await element.getAttribute('name') || '')
      const id = String(await element.getAttribute('id') || '')
      const placeholder = String(await element.getAttribute('placeholder') || '')
      const ariaLabel = String(await element.getAttribute('aria-label') || '')

      if (type === 'checkbox' || type === 'radio') {
        const selected = await element.isSelected().catch(() => false)
        if (!selected) {
          await element.click()
          filled.push(`${tagName}:${name || id || placeholder || 'option'}`)
        }
        continue
      }

      if (tagName === 'select') {
        const options = await element.findElements(By.css('option'))
        let selectedOption = null
        for (const opt of options) {
          try {
            const value = String(await opt.getAttribute('value') || '').trim()
            const text = String(await opt.getText() || '').trim()
            if (Boolean(value) && value !== '0' && text && !/select|choose|--/i.test(text)) {
              selectedOption = opt
              break
            }
          } catch {
            // continue scanning options
          }
        }
        selectedOption = selectedOption || options[1] || options[0] || null
        if (selectedOption) {
          await selectedOption.click()
          filled.push(`${tagName}:${name || id || placeholder || 'select'}`)
        }
        continue
      }

      const value = genericFieldValueForElement({ name, id, placeholder, ariaLabel, type })
      await element.clear()
      await element.sendKeys(value)
      filled.push(`${tagName}:${name || id || placeholder || value}`)
    } catch {
      // Skip fields that are not interactable.
    }
  }

  if (!filled.length) {
    throw new Error(`Missing value for structured step: ${description}`)
  }

  return filled
}

async function verifyAuthenticatedArea(driver, ctx) {
  const expectedUrlParts = String(ctx?.expectedUrlContains || '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  const defaultUrlParts = ['dashboard', 'home', 'app', 'account', 'projects', 'success']
  const acceptedUrlParts = expectedUrlParts.length ? expectedUrlParts : defaultUrlParts

  await driver.wait(async () => {
    const url = await driver.getCurrentUrl()
    const lowerUrl = String(url || '').toLowerCase()

    return (
      acceptedUrlParts.some((part) => lowerUrl.includes(part)) ||
      !/login|signin|sign-in|signup|auth/.test(lowerUrl)
    )
  }, 20000)
}

async function runStructuredUiStep(driver, step, ctx) {
  const action = normalizeAction(step)
  const description = step?.raw || step?.id || action

  console.log('\n============================')
  console.log('STEP:', description)
  console.log('MODEL ACTION:', action)
  console.log('============================')

  if (action === 'open_app' || action === 'navigate') {
    const url = step?.target?.url ? toUrl(step.target.url) : toUrl(ctx.baseUrl)
    if (!url) throw new Error('baseUrl is missing')

    await driver.get(url)
    await driver.wait(until.elementLocated(By.css('body')), 15000)

    return {
      action: 'open',
      target: step?.target?.name || 'application',
      description,
      selector: null
    }
  }

  if (action === 'open_login') {
    const url = step?.target?.url ? toUrl(step.target.url) : await openLoginPage(driver, ctx)
    await driver.get(url)
    await driver.wait(until.elementLocated(By.css('body')), 15000)

    return {
      action: 'navigate',
      target: 'login',
      description,
      selector: null
    }
  }

  if (action === 'type_credentials') {
    const emailResult = await fillUserIdentifier(driver, ctx)
    await clickNextIfPresent(driver, ctx)
    const passwordResult = await fillPassword(driver, ctx)

    return {
      action: 'type',
      target: 'credentials',
      description,
      selector: `${emailResult.selector} + ${passwordResult.selector}`
    }
  }

  if (action === 'type') {
    if (targetHas(step, ['password'])) {
      const result = await fillPassword(driver, ctx)
      return { action: 'type', target: 'password', description, selector: result.selector }
    }

    if (targetHas(step, ['email', 'username', 'user'])) {
      const result = await fillUserIdentifier(driver, ctx)
      return { action: 'type', target: 'email', description, selector: result.selector }
    }

    const selector = getSelector(ctx, 'genericInput', 'input:not([type="hidden"]), textarea, [contenteditable="true"]')
    const value = structuredValue(step, ctx)
    if (!value) {
      if (looksLikeGenericValidFieldFill(description)) {
        const filled = await fillGenericMandatoryFields(driver, ctx, description)
        return { action: 'type', target: step?.target?.name || 'fields', description, selector: filled.join(' | ') }
      }
      throw new Error(`Missing value for structured step: ${description}`)
    }

    const element = await findFirstVisible(driver, [By.css(selector)], 15000)
    await driver.wait(until.elementIsEnabled(element), 15000)
    await element.clear()
    await element.sendKeys(value)

    return { action: 'type', target: step?.target?.name || 'field', description, selector }
  }

  if (action === 'clear_field' || action === 'leave_empty') {
    if (targetHas(step, ['password'])) {
      const result = await clearPassword(driver, ctx)
      return { action: 'clear', target: 'password', description, selector: result.selector }
    }

    if (targetHas(step, ['email', 'username', 'user', 'field'])) {
      const result = await clearUserIdentifier(driver, ctx)
      return { action: 'clear', target: 'email', description, selector: result.selector }
    }

    const selector = getSelector(ctx, 'genericInput', 'input:not([type="hidden"]), textarea, [contenteditable="true"]')
    const element = await findFirstVisible(driver, [By.css(selector)], 15000)
    await driver.wait(until.elementIsEnabled(element), 15000)
    await element.clear()

    return { action: 'clear', target: step?.target?.name || 'field', description, selector }
  }

  if (action === 'submit' || action === 'click') {
    if (action === 'submit' || targetHas(step, ['login', 'sign in', 'submit', 'connexion'])) {
      const result = await clickSubmitLogin(driver, ctx)
      return { action: 'click', target: 'login button', description, selector: result.selector }
    }

    const result = await clickSemanticTarget(driver, step, ctx)
    return { action: 'click', target: step?.target?.name || 'button', description, selector: result.selector }
  }

  if (action === 'assert_authenticated') {
    await verifyAuthenticatedArea(driver, ctx)
    return { action: 'assert', target: 'authenticated area', description, selector: null }
  }

  if (action === 'assert_url') {
    const expected = String(step?.assertion?.expected || step?.target?.path || '').toLowerCase()
    if (!expected) throw new Error(`Missing expected URL fragment for structured step: ${description}`)

    await driver.wait(async () => {
      const url = String(await driver.getCurrentUrl()).toLowerCase()
      return url.includes(expected)
    }, 15000)

    return { action: 'assert', target: 'url', description, selector: null }
  }

  if (action === 'assert_visible' || action === 'assert_text') {
    const words = semanticWords(step)
    if (!words.length) throw new Error(`Missing visible target for structured step: ${description}`)

    const element = await findFirstVisible(driver, [By.xpath(buildTextXpath(['body', 'main', 'section', 'div', 'span', 'p', 'h1', 'h2'], words))], 15000)
    return { action: 'assert', target: step?.target?.name || 'text', description, selector: `semantic:${words.join('|')}`, element }
  }

  if (action === 'wait') {
    await driver.sleep(1000)
    return { action: 'wait', target: step?.target?.name || 'page', description, selector: null }
  }

  if (action === 'unknown' && step?.raw) {
    return runHumanStep(driver, step.raw, ctx)
  }

  throw new Error(`Unsupported UI execution action: ${action || 'unknown'}`)
}

async function runHumanStep(driver, stepText, ctx) {
  if (stepText && typeof stepText === 'object' && stepText.action) {
    return runStructuredUiStep(driver, stepText, ctx)
  }

  const t = normalizeStep(stepText).trim().toLowerCase()

  console.log('\n============================')
  console.log('🚀 STEP:', stepText)
  console.log('============================')

  if (
    hasAny(t, ['leave', 'keep', 'clear', 'empty', 'blank', 'without entering', 'do not enter', "don't enter"]) &&
    hasAny(t, ['email', 'username', 'password', 'field'])
  ) {
    if (hasAny(t, ['password'])) {
      const result = await clearPassword(driver, ctx)
      return { action: 'clear', target: 'password', description: stepText, selector: result.selector }
    }

    const result = await clearUserIdentifier(driver, ctx)
    return { action: 'clear', target: 'email', description: stepText, selector: result.selector }
  }

  if (hasAny(t, ['valid values', 'mandatory fields', 'required fields', 'fill all fields', 'complete the form'])) {
    const filled = await fillGenericMandatoryFields(driver, ctx, stepText)
    return {
      action: 'type',
      target: 'fields',
      description: stepText,
      selector: filled.join(' | ')
    }
  }

  // =========================
  // OPEN APPLICATION
  // =========================
  if (hasAny(t, ['open application', 'open app', 'open url', 'go to url', 'navigate to'])) {

    console.log('📍 OPEN APPLICATION')

    if (!ctx.baseUrl) {
      throw new Error('baseUrl is missing')
    }

    const url = toUrl(ctx.baseUrl)

    console.log('🌐 URL =', url)

    await driver.get(url)

    console.log('⏳ waiting body...')
    await driver.wait(until.elementLocated(By.css('body')), 15000)

    console.log('✅ APPLICATION OPENED')

    return {
      action: 'open',
      target: 'application',
      description: stepText,
      selector: null
    }
  }

  // =========================
  // LOGIN PAGE
  // =========================
  if (hasAny(t, ['go to login', 'open login', 'navigate login', 'login page'])) {

    console.log('📍 LOGIN PAGE')

    const url = await openLoginPage(driver, ctx)

    console.log('🌐 LOGIN URL =', url)

    await driver.get(url)

    await driver.wait(until.elementLocated(By.css('body')), 15000)

    console.log('✅ LOGIN PAGE OPENED')

    return {
      action: 'navigate',
      target: 'login',
      description: stepText,
      selector: null
    }
  }

  // =========================
  // EMAIL + PASSWORD SAME STEP
  // =========================
if (
  hasAny(t, [
    'email and password',
    'username and password',
    'enter valid email and password',
    'enter valid username and password',
    'credentials',
    'login credentials',
    'valid credentials'
  ])
) {

    console.log('📍 EMAIL + PASSWORD STEP')

    console.log('✍️ typing email...')
    const emailResult = await fillUserIdentifier(driver, ctx)

    console.log('✅ EMAIL FILLED')

    await clickNextIfPresent(driver, ctx)

    console.log('✍️ typing password...')
    const passwordResult = await fillPassword(driver, ctx)

    console.log('✅ PASSWORD FILLED')

    return {
      action: 'type',
      target: 'credentials',
      description: stepText,
      selector: `${emailResult.selector} + ${passwordResult.selector}`
    }
  }

  // =========================
  // EMAIL ONLY
  // =========================
  if (
    !t.includes('password') &&
    hasAny(t, ['fill email', 'enter email', 'type email', 'valid email', 'email address'])
  ) {

    console.log('📍 EMAIL STEP')

    console.log('✍️ typing email...')
    const result = await fillUserIdentifier(driver, ctx)

    console.log('✅ EMAIL FILLED')

    return {
      action: 'type',
      target: 'email',
      description: stepText,
      selector: result.selector
    }
  }

  // =========================
  // PASSWORD ONLY
  // =========================
  if (hasAny(t, ['fill password', 'enter password', 'type password', 'valid password'])) {

    console.log('📍 PASSWORD STEP')

    console.log('✍️ typing password...')
    const result = await fillPassword(driver, ctx)

    console.log('✅ PASSWORD FILLED')

    return {
      action: 'type',
      target: 'password',
      description: stepText,
      selector: result.selector
    }
  }

  // =========================
  // CLICK LOGIN
  // =========================
  if (hasAny(t, ['click login', 'submit login', 'sign in', 'click sign in'])) {

    console.log('📍 CLICK LOGIN')

    console.log('🖱 clicking login...')
    const result = await clickSubmitLogin(driver, ctx)

    console.log('🌍 current url =', await driver.getCurrentUrl())

    return {
      action: 'click',
      target: 'login button',
      description: stepText,
      selector: result.selector
    }
  }

  // =========================
  // VERIFY DASHBOARD
  // =========================
  if (hasAny(t, ['verify dashboard', 'assert dashboard', 'check dashboard'])) {

    console.log('📍 VERIFY DASHBOARD')

    const expectedUrlParts = String(ctx?.expectedUrlContains || '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
    const defaultUrlParts = ['dashboard', 'home', 'app', 'account', 'projects', 'success']
    const acceptedUrlParts = expectedUrlParts.length ? expectedUrlParts : defaultUrlParts

    await driver.wait(async () => {
      const url = await driver.getCurrentUrl()
      console.log('🌍 current url =', url)
      const lowerUrl = String(url || '').toLowerCase()

      return (
        acceptedUrlParts.some((part) => lowerUrl.includes(part)) ||
        !/login|signin|sign-in|signup|auth/.test(lowerUrl)
      )
    }, 20000)

    console.log('✅ DASHBOARD VERIFIED')

    return {
      action: 'assert',
      target: 'dashboard',
      description: stepText,
      selector: null
    }
  }

  console.error('❌ Unsupported UI step:', stepText)

  throw new Error(`Unsupported UI step: ${stepText}`)
}

module.exports = { runHumanStep }