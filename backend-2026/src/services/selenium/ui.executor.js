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

  const element = await findFirstVisible(driver, [By.css(selector)], 15000)
  await driver.wait(until.elementIsEnabled(element), 15000)
  await element.clear()
  await element.sendKeys(value)

  return { selector, value }
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
  await element.click()
  await driver.sleep(3000)

  return { selector }
}

async function runHumanStep(driver, stepText, ctx) {
  const t = normalizeStep(stepText).trim().toLowerCase()

  console.log('\n============================')
  console.log('🚀 STEP:', stepText)
  console.log('============================')

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
