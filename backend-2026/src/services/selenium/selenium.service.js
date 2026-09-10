/* global window, document */
const { createDriver } = require('./driver.factory')
const { runStructuredUiStep } = require('./ui.executor')
const { addLog } = require('../../utils/logger')
const { captureStepScreenshot } = require('../../utils/screenshot')

/*const {
  createExecutionController,
  isExecutionCancelled,
  cleanupExecution,
} = require('../../controllers/selenium.controller')*/

// NOTE: adjust these two paths if your Mongoose models live somewhere else.
// They were referenced below (getExecutionTrend / getTypeBreakdown) but never
// imported, which is what triggered the "not defined" errors.
const TestExecution = require('../../models/TestExecution.model')
const TestCase = require('../../models/testcase.model')

// Keep one live browser session per suite so dependent tests share the
// authenticated cookies created by the prerequisite test.
const suiteDrivers = new Map()

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function tokenizeText(value) {
  const stopwords = new Set([
    'a', 'an', 'and', 'are', 'as', 'be', 'by', 'do', 'for', 'from', 'has',
    'have', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'user', 'with',
    'your', 'you', 'was', 'were', 'will', 'can', 'may', 'should', 'would',
    'accept', 'accepted', 'accepts', 'displayed', 'shown', 'visible',
    'provided', 'result', 'results', 'success', 'successful', 'successfully',
    'page'
  ])

  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopwords.has(token))
}

function fuzzyMatchExpected(actualText, expectedText) {
  if (!expectedText) return true
  if (!actualText) return false
  if (actualText.includes(expectedText) || expectedText.includes(actualText)) {
    return true
  }

  const actualTokens = new Set(tokenizeText(actualText))
  const expectedTokens = tokenizeText(expectedText)

  if (!expectedTokens.length) {
    return false
  }

  const matchedTokens = expectedTokens.filter((token) => actualTokens.has(token))
  const ratio = matchedTokens.length / expectedTokens.length

  return matchedTokens.length >= 2 || ratio >= 0.4
}

function semanticPageMatch(actualText, expectedText) {
  const actual = normalizeText(actualText)
  const expected = normalizeText(expectedText)

  if (!expected || !actual) return false

  const expectsRegistration =
    /\b(registration|register|signup|sign up|create account|account creation)\b/.test(expected)
  if (expectsRegistration) {
    return /\b(registration|register|signup|sign up|create account|join github|github)\b/.test(actual)
  }

  const expectsLogin = /\b(login|log in|sign in|signin|authentication)\b/.test(expected)
  if (expectsLogin) {
    return /\b(login|log in|sign in|signin|authentication)\b/.test(actual)
  }

  return false
}

function resolveExpectedResult(testCase) {
  return String(
    testCase?.expected_result ||
    testCase?.expectedResult ||
    testCase?.expected ||
    ''
  ).trim()
}

function normalizeStepDefinition(step, index, fallbackExpected = '') {
  if (step && typeof step === 'object') {
    return {
      raw: String(step.raw || step.text || step.name || step.step || step.description || '').trim(),
      expectedResult: String(step.expected_result || step.expectedResult || step.expected || fallbackExpected || '').trim(),
    }
  }

  return {
    raw: String(step || '').trim(),
    expectedResult: String(fallbackExpected || '').trim(),
  }
}

function normalizeActionOverrides(rawOverrides) {
  const normalized = {}

  const push = (stepIndex, action) => {
    const index = Number(stepIndex)
    if (!Number.isFinite(index) || index <= 0 || !action || typeof action !== 'object') return
    const type = String(action.type || action.action || '').trim()
    const selector = String(action.selector || '').trim()
    if (!type || !selector) return
    normalized[index] ??= []
    normalized[index].push({
      type,
      selector,
      value: String(action.value || '').trim(),
    })
  }

  if (Array.isArray(rawOverrides)) {
    for (const action of rawOverrides) {
      push(action?.stepIndex || action?.step || action?.index, action)
    }
    return normalized
  }

  if (rawOverrides && typeof rawOverrides === 'object') {
    for (const [stepIndex, actions] of Object.entries(rawOverrides)) {
      if (Array.isArray(actions)) {
        actions.forEach((action) => push(stepIndex, action))
      }
    }
  }

  return normalized
}

function getStepDefinitions(testCase) {
  const rawSteps = Array.isArray(testCase?.steps) ? testCase.steps : []
  const stepDetails = Array.isArray(testCase?.stepDetails) ? testCase.stepDetails : []

  return rawSteps.map((step, index) => {
    const detail = stepDetails[index] || {}
    const base = normalizeStepDefinition(step, index + 1, '')
    return {
      raw: base.raw || `Step ${index + 1}`,
      expectedResult: String(
        detail.expected_result ||
        detail.expectedResult ||
        base.expectedResult ||
        testCase?.expected_result ||
        testCase?.expectedResult ||
        ''
      ).trim(),
    }
  })
}

function compareExpectedResult(actual, expected, stepResults = []) {
  // Treat generic/placeholder expected strings as "no assertion defined"
  // to avoid false failed_assertion at the test-case level.
  if (isGenericActionExpected(expected)) {
    // Still fail if any step had a UI error.
    const hasStepFailure = stepResults.some(s =>
      s.status === 'failed_assertion' || s.status === 'failed_execution'
    )
    if (hasStepFailure) {
      return { status: 'failed_assertion', matched: false, reason: 'One or more steps failed' }
    }
    return { status: 'passed', matched: true, reason: 'No explicit test-level assertion defined' }
  }

  const actualText = normalizeText([
    actual?.url,
    actual?.title,
    actual?.text,
    actual?.errorMessage,
    actual?.successMessage
  ].filter(Boolean).join(' '))

  const expectedText = normalizeText(expected)
  const stepSummary = normalizeText(
    stepResults
      .map((step) => `${step.status || ''} ${step.error || ''} ${step.actualResult || ''}`)
      .join(' ')
  )

  if (!expectedText) {
    return { status: 'passed', matched: true, reason: 'No expected result provided' }
  }

  const matched =
    fuzzyMatchExpected(actualText, expectedText) ||
    stepSummary.includes(expectedText)

  return {
    status: matched ? 'passed' : 'failed_assertion',
    matched,
    reason: matched
      ? 'Actual result matches expected result'
      : 'Actual result does not match expected result'
  }
}

// ─── Helpers: detect action-step type and generic placeholder assertions ─────

/**
 * Returns true when `stepText` is a pure action step (click/submit/toggle…)
 * that does not need a semantic text assertion — its success is determined by
 * the Selenium execution outcome and by navigation, not by text comparison.
 */
function isActionStep(stepText) {
  return /^\s*(click|submit|press|tap|toggle|check|uncheck|select|open|close|dismiss|confirm|cancel|save|next|back|go|search|reset|verify|validate|assert)\b/i.test(stepText)
}

/**
 * Returns true when `expected` is a generic/auto-generated placeholder string
 * that should NOT be used as a real assertion.  Examples:
 *   "The action is triggered"   (from _step_for fallback)
 *   "The Login action is triggered"
 *   "The action is submitted"
 *   "The action is performed"
 *   "Click action is submitted"
 */
function isGenericActionExpected(expected) {
  if (!expected) return true
  const e = normalizeText(expected)
  return (
    /^the .+ action is (triggered|submitted|performed|executed|completed|done|initiated|clicked|activated|selected|fired)$/.test(e) ||
    /^the action is (triggered|submitted|performed|executed|completed|done|initiated|clicked|activated|selected|fired)$/.test(e) ||
    /^(click|submit|press|toggle|select|search|reset|save|confirm|cancel|dismiss) action is (triggered|submitted|performed|executed|completed|done|initiated|clicked)$/.test(e) ||
    /^action (is|was) (triggered|submitted|performed|executed|completed)$/.test(e)
  )
}

// ─── FIX 1 : compareStepExpectedResult ───────────────────────────────────────
// Avant : comparaison fuzzy sur url+title+text seulement → rate les erreurs UI
// Après : détecte l'intention sémantique de l'expected (erreur vs succès vs URL)
//         et vérifie le bon signal dans actualResult
// ─────────────────────────────────────────────────────────────────────────────
function compareStepExpectedResult(actual, expected, stepText = '') {

  // ── GUARD: Generic / placeholder expected string means NO real assertion ──
  // The test-case generator sometimes produces "The X action is triggered" as a
  // fallback label.  This MUST NOT be used as a fuzzy-text assertion against the
  // actual page state — it will never match and will always produce a false
  // failed_assertion.  Treat it identically to "no expected result provided".
  if (isGenericActionExpected(expected)) {
    // For action steps: if there is no execution error, the step passed.
    // Navigation to a different URL is a strong positive success signal.
    if (actual?.errorMessage) {
      return {
        status: 'failed_assertion',
        matched: false,
        reason: `UI error detected: "${actual.errorMessage}"`,
      }
    }
    return {
      status: 'passed',
      matched: true,
      reason: 'No explicit assertion defined — action executed successfully',
    }
  }

const inputStepPatterns =
  /enter|fill|provide|type|insert|set|select|choose/i

if (inputStepPatterns.test(expected || '')) {
  return {
    status: 'passed',
    matched: true,
    reason: 'Input action executed successfully'
  }
}

  const navigateStepPatterns = /navigate|go to|open|visit/i
  if (navigateStepPatterns.test(stepText || '') || navigateStepPatterns.test(expected || '')) {
    if (!actual?.errorMessage) {
      return {
        status: 'passed',
        matched: true,
        reason: 'Navigation executed successfully'
      }
    }
  }

  const exp = normalizeText(expected)

  if (!expected || exp === '') {
    return { status: 'passed', matched: true, reason: 'No expected result defined' }
  }

  const currentUrl = String(actual?.url || '')
  const staysOnLoginPage = /\/auth\/login|login/i.test(currentUrl) || /login/i.test(stepText || '')
  const invalidLoginExpectation = /invalid username|invalid user|invalid credentials|not submit|not submitted|not navigate.*dashboard|stay.*login|remain.*login|reject.*login|login failed/i.test(exp)
  if (invalidLoginExpectation && staysOnLoginPage) {
    return {
      status: 'passed',
      matched: true,
      reason: actual?.errorMessage
        ? `Invalid login was rejected while staying on the login page: "${actual.errorMessage}"`
        : `Invalid login was rejected (stayed on login page as expected).`,
    }
  }

  const errorKeywords = [
    'error', 'invalid', 'failed', 'incorrect',
    'unauthorized', 'wrong', 'erreur', 'échec'
  ]
  const expectsError = errorKeywords.some(k => exp.includes(k))

  // Never let fuzzy matching turn a real UI error into a successful step.
  // Negative login data is only successful when the expected result explicitly
  // asks for an authentication error.
  if (actual?.errorMessage && !expectsError) {
    return {
      status: 'failed_assertion',
      matched: false,
      reason: `UI error detected: "${actual.errorMessage}"`,
    }
  }

  const actualText = normalizeText([
    actual?.url,
    actual?.title,
    actual?.text,
    actual?.errorMessage,
    actual?.successMessage
  ].join(' '))

  // ─────────────────────────────────────
  // ✅ 1. Détection erreur attendue
  // ─────────────────────────────────────
  if (expectsError) {

    if (actual?.errorMessage) {
      return {
        status: 'passed',
        matched: true,
        reason: `Error detected: "${actual.errorMessage}"`
      }
    }

    if (errorKeywords.some(k => actualText.includes(k))) {
      return {
        status: 'passed',
        matched: true,
        reason: 'Error found in page content'
      }
    }

    return {
      status: 'failed_assertion',
      matched: false,
      reason: 'Expected an error but none found'
    }
  }

  // Un "login initié / succès" ne peut pas être détecté en cherchant le mot
  // "login" sur la page — une fois connecté, on a justement QUITTÉ la page
  // de login. On considère l'assertion validée si on a navigué hors de
  // /auth/login et qu'il n'y a pas d'erreur affichée.
  const expectsLoginKeyword = /\b(login|log in|sign in|signin|authentication)\b/.test(exp)
  if (expectsLoginKeyword) {
    const navigatedAwayFromLogin = actual?.url && !String(actual.url).includes('/auth/login')
    if (navigatedAwayFromLogin && !actual?.errorMessage) {
      return {
        status: 'passed',
        matched: true,
        reason: 'Navigated away from login page — login succeeded'
      }
    }
  }
  // ─────────────────────────────────────
  // ✅ 2. Détection succès / redirect
  // ─────────────────────────────────────
  const successKeywords = [
    'success', 'welcome', 'dashboard', 'home',
    'redirect', 'logged in', 'bienvenue'
  ]

  const expectsSuccess = successKeywords.some(k => exp.includes(k))

  if (expectsSuccess) {

    if (actual?.errorMessage) {
      return {
        status: 'failed_assertion',
        matched: false,
        reason: `Got error instead: "${actual.errorMessage}"`
      }
    }

    // A dashboard expectation is a navigation assertion, not a text-only
    // fuzzy match. The login page may contain words such as "dashboard" in
    // hidden labels or instructions, so require the actual URL to leave the
    // authentication route and contain a dashboard/home destination.
    const expectsDashboard = /\b(dashboard|admin area|home page)\b/.test(exp)
    if (expectsDashboard) {
      const actualUrl = String(actual?.url || '').toLowerCase()
      const reachedDashboard =
        !actualUrl.includes('/auth/login') &&
        /dashboard|\/web\/index\.php\/pim|\/home(?:[/?#]|$)/.test(actualUrl)
      if (!reachedDashboard) {
        return {
          status: 'failed_assertion',
          matched: false,
          reason: `Expected dashboard navigation but current URL is ${actual?.url || 'unknown'}`,
        }
      }
    }

    if (successKeywords.some(k => actualText.includes(k))) {
      return {
        status: 'passed',
        matched: true,
        reason: 'Success detected'
      }
    }

    return {
      status: 'failed_assertion',
      matched: false,
      reason: 'Expected success but not detected'
    }
  }

  // ─────────────────────────────────────
  // ✅ 3. Match intelligent (général)
  // ─────────────────────────────────────
  const matched = fuzzyMatchExpected(actualText, exp) || semanticPageMatch(actualText, exp)

  return {
    status: matched ? 'passed' : 'failed_assertion',
    matched,
    reason: matched
      ? 'Matched using fuzzy logic'
      : `Mismatch — actual: ${actual?.url}`
  }
}


// ─── FIX 2 : buildActualResultForStep ────────────────────────────────────────
// Avant : pour les steps click/submit, retournait url+title+text brut du body
//         → le message d'erreur OrangeHRM était noyé dans des milliers de chars
// Après : capture AUSSI errorMessage et successMessage via des sélecteurs ciblés
// ─────────────────────────────────────────────────────────────────────────────
async function buildActualResultForStep(driver, stepText, stepIndex, stepRunResult = {}, ctx = {}) {
  const stepLower = String(stepText || '').toLowerCase()

  const pageState = await driver.executeScript(() => {
    // ── Texte brut du body ──────────────────────────────────────────────────
   const text = Array.from(document.querySelectorAll('body *:not(style):not(script):not(noscript)'))
      .map((el) => el?.innerText || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    // ── Valeurs des champs de formulaire ────────────────────────────────────
    const values = Array.from(document.querySelectorAll('input, textarea, select'))
      .filter((el) => {
        const style = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return style && style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               rect.width > 0 && rect.height > 0
      })
      .map((el) => ({
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        type: el.type || '',
        value: el.value || '',
        tag: el.tagName.toLowerCase(),
      }))

    // ── FIX : capture des messages d'erreur / succès ─────────────────────
    const errorSelectors = [
      '.oxd-alert-content-text',
      '.oxd-text--p.orangehrm-login-error',
      '[role="alert"]',
      '.alert-danger',
      '.error-message',
      '[class*="error-message"]',
      '[class*="alert-content"]',
      '[class*="login-error"]',

      
// GitHub
  '.flash-error',
  '.flash-full',
  '.js-flash-alert',
  '[class*="flash-error"]'

    ]
    let errorMessage = null
    for (const sel of errorSelectors) {
      const el = document.querySelector(sel)
      if (el && el.textContent.trim()) {
        errorMessage = el.textContent.trim()
        break
      }
    }

    const successSelectors = [
      '.oxd-toast-content',
      '.alert-success',
      '[class*="success"]',
      '[class*="toast"]',
    ]
    let successMessage = null
    for (const sel of successSelectors) {
      const el = document.querySelector(sel)
      if (el && el.textContent.trim()) {
        successMessage = el.textContent.trim()
        break
      }
    }

    // ── FIX: capture des messages de validation PAR CHAMP (texte rouge
    // sous un input précis, ex: "Your password must contain minimum 1
    // number", "Passwords do not match") — jusqu'ici seuls les bandeaux
    // globaux de page (role="alert", toast...) étaient captés, donc ces
    // messages n'atteignaient jamais l'analyse IA de l'échec.
    const fieldErrorSelectors = [
      '.oxd-input-field-error-message',
      '[class*="input-field-error"]',
      '[class*="field-error-message"]',
      '.invalid-feedback',
      '.help-block--error',
      '[class*="error-message"]',
      '[class*="validation-message"]',
    ]
    const isVisible = (el) => {
      const style = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return Boolean(
        style && style.display !== 'none' && style.visibility !== 'hidden' &&
        style.opacity !== '0' && rect.width > 0 && rect.height > 0
      )
    }
    const fieldValidationErrors = []
    for (const sel of fieldErrorSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const msg = (el.textContent || '').trim()
        if (msg && isVisible(el) && !fieldValidationErrors.includes(msg)) {
          fieldValidationErrors.push(msg)
        }
      })
    }

    return {
      url: window.location.href,
      title: document.title,
      text,
      values,
      errorMessage,
      successMessage,
      fieldValidationErrors,
    }
  })

  // ✅ Ignore any error/success text that was ALREADY on the page before
  // this test even started (e.g. static demo-credential hints, cookie
  // banners, promo text picked up by accident by the generic selectors
  // above). We compare against a baseline captured right after the page
  // first loaded — no keyword guessing, just "did this text appear
  // because of what we just did, or was it already there".
  if (pageState.errorMessage && pageState.errorMessage === ctx.baselineErrorMessage) {
    pageState.errorMessage = null
  }
  if (pageState.successMessage && pageState.successMessage === ctx.baselineSuccessMessage) {
    pageState.successMessage = null
  }

  // Same "was this already there before the step ran" filter as above,
  // applied per message so a validation error already visible on page
  // load doesn't get misattributed to this step.
  const baselineFieldErrors = new Set(
    Array.isArray(ctx.baselineFieldValidationErrors) ? ctx.baselineFieldValidationErrors : []
  )
  const fieldValidationErrors = Array.isArray(pageState.fieldValidationErrors)
    ? pageState.fieldValidationErrors.filter((msg) => !baselineFieldErrors.has(msg))
    : []

  // Field-level validation messages ("Passwords do not match", "Your
  // password must contain minimum 1 number"...) are exactly the kind of
  // evidence the failure analysis needs but a page-level banner selector
  // will never see. Fold them into errorMessage whenever there isn't
  // already a page-level banner, so every consumer that only ever checks
  // `actual.errorMessage` (assertion checks, AI failure analysis) reliably
  // gets them too — not just the dedicated fieldValidationErrors array.
  if (!pageState.errorMessage && fieldValidationErrors.length) {
    pageState.errorMessage = fieldValidationErrors.join(' | ')
  }

  const valuesText = Array.isArray(pageState.values)
    ? pageState.values
        .map((item) => {
          const key = String(item.id || item.name || item.placeholder || item.tag || '').trim()
          const value = String(item.value || '').trim()
          return key && value ? `${key}=${value}` : value
        })
        .filter(Boolean)
        .join(' | ')
    : ''

  if (/enter|fill|provide|type|insert|set/i.test(stepLower)) {
    return {
      url: pageState.url,
      title: pageState.title,
      text: valuesText || pageState.text,
      errorMessage: pageState.errorMessage,
      successMessage: pageState.successMessage,
      fieldValidationErrors,
    }
  }

  if (/click|submit|login|sign in|sign-in|open|navigate|go/i.test(stepLower)) {
    return {
      url: pageState.url,
      title: pageState.title,
      text: pageState.text,
      errorMessage: pageState.errorMessage,
      successMessage: pageState.successMessage,
      fieldValidationErrors,
    }
  }

  return stepRunResult?.actual || {
    url: pageState.url,
    title: pageState.title,
    text: pageState.text,
    errorMessage: pageState.errorMessage,
    successMessage: pageState.successMessage,
    fieldValidationErrors,
  }
}

// ─── FIX 3 : waitForPageReaction ─────────────────────────────────────────────
// Nouvelle fonction utilitaire appelée après les steps de type click/submit
// pour laisser le DOM se stabiliser avant de capturer l'état
// ─────────────────────────────────────────────────────────────────────────────
async function waitForPageReactionWithAbort(driver, executionId, timeoutMs = 5000) {
  const { isExecutionCancelled } = require('./cancellation.manager')
  const start = Date.now()
  
  while (Date.now() - start < timeoutMs) {
    // ─── Check abort toutes les 300ms ─────────────────────────────────────
    if (isExecutionCancelled(executionId)) {
      return
    }

    const reacted = await driver.executeScript(() => {
      const errorSelectors = [
        '.oxd-alert-content-text', '[role="alert"]', '.alert',
        '[class*="error"]', '.oxd-toast-content',
      ]
      const hasError = errorSelectors.some(sel => {
        const el = document.querySelector(sel)
        return el && el.textContent.trim().length > 0
      })
      const navigatedAway = !window.location.href.includes('login')
      return hasError || navigatedAway
    }).catch(() => false)

    if (reacted) break
    await driver.sleep(300)
  }
}

// Give the browser a short settling period after the last action so SPA
// redirects and delayed authentication responses are reflected in finalUrl.
async function waitForStableFinalUrl(driver, waitMs = 6000) {
  let previousUrl = ''
  let stableReads = 0
  const deadline = Date.now() + waitMs

  while (Date.now() < deadline) {
    const currentUrl = await driver.getCurrentUrl().catch(() => '')
    console.log(`[SELENIUM] Current URL detected: ${currentUrl || '(empty)'}`)
    if (currentUrl && currentUrl === previousUrl) {
      stableReads += 1
      if (stableReads >= 3) {
        console.log(`[SELENIUM] Final URL stabilized: ${currentUrl}`)
        return currentUrl
      }
    } else {
      previousUrl = currentUrl
      stableReads = 0
    }
    await driver.sleep(250).catch(() => {})
  }

  const finalUrl = await driver.getCurrentUrl().catch(() => previousUrl)
  console.log(`[SELENIUM] Final URL after timeout: ${finalUrl || '(empty)'}`)
  return finalUrl
}

async function runTestCase(testCase, options = {}) {

 const {
    createExecutionController,
    isExecutionCancelled,
    cleanupExecution,
    registerAbortCallback,
    registerDriver,  // ← ajoute
  } = require('./cancellation.manager')

  const executionId = testCase.executionId || `EX-${Date.now()}`
   createExecutionController(executionId)

  const logs = []
  const stepResults = []
  const suiteKey = String(testCase?.testSuiteId || testCase?.suiteId || '').trim()
  const persistentSuiteSession = Boolean(suiteKey)
  let driver = options.driver
  let reusedSuiteSession = false

  if (!driver && persistentSuiteSession) {
    driver = suiteDrivers.get(suiteKey)
    reusedSuiteSession = Boolean(driver)

    // A user may close the Chrome window manually. Do not keep a dead
    // WebDriver in the suite session map and send every action to it.
    if (driver) {
      try {
        await driver.getWindowHandle()
      } catch (sessionError) {
        console.warn(
          `[SELENIUM] Stored browser session is closed for suite ${suiteKey}; creating a new one`
        )
        suiteDrivers.delete(suiteKey)
        driver = undefined
        reusedSuiteSession = false
      }
    }
  }

  if (!driver) {
    driver = await createDriver({
      profileKey: suiteKey || 'default',
    })
    if (persistentSuiteSession) suiteDrivers.set(suiteKey, driver)
  }

  const ownsDriver = !options.driver && !persistentSuiteSession
  console.log(
    `[SELENIUM] ${reusedSuiteSession ? 'Reusing' : 'Creating'} browser session for suite: ${suiteKey || 'standalone'}`
  )
  console.log(
    `[SELENIUM] Browser URL before test: ${await driver.getCurrentUrl().catch(() => '(empty)')}`
  )

   registerDriver(executionId, driver)

  registerAbortCallback(executionId, async () => {
    console.log(`🛑 Abort callback fired for ${executionId}`)
    try {
      await driver.quit()
    } catch (quitErr) {
      addLog(logs, 0, 'WARN', 'Driver already closed during abort', { message: quitErr.message })
    }
  })
  addLog(logs, 0, 'INFO', 'Execution started')

  const baseUrl =
    testCase?.urlCible ||
    testCase?.url ||
    testCase?.targetUrl ||
    testCase?.baseUrl ||
    ''

  console.log(`[SELENIUM] Starting test on URL: ${baseUrl || '(empty)'}`)

  const ctx = {
    baseUrl,
    testCase: {
      ...testCase,
      // Keep the payload shape sent by the frontend. The executor accepts
      // arrays, multiline strings, and keyed objects and normalizes them.
      test_data: testCase?.test_data ?? testCase?.testData ?? [],
    },
    actionOverrides: normalizeActionOverrides(testCase?.actionOverrides || testCase?.aiActionOverrides),
    logs,
  }

  if (!ctx.baseUrl) {
    addLog(logs, 0, 'ERROR', 'Missing target URL.')
    if (ownsDriver) {
      try {
        await driver.quit()
      } catch (quitErr) {
        addLog(logs, 0, 'WARN', 'Driver already closed', { message: quitErr.message })
      }
    }
    cleanupExecution(executionId)
    return {
      status: 'failed_execution',
      logs,
      stepResults: [{ index: 0, step: '', status: 'failed_execution', error: 'Missing target URL.' }],
    }
  }

  try {
    const steps = getStepDefinitions(testCase)
    const expectedResult = resolveExpectedResult(testCase)
    let encounteredFailure = false

    for (let i = 0; i < steps.length; i++) {

      // ─── CHECK ABORT avant chaque step ──────────────────────────────────
      if (isExecutionCancelled(executionId)) {
        addLog(logs, i + 1, 'WARN', `Execution aborted before step ${i + 1}`)
        stepResults.push({
          index: i + 1,
          step: steps[i].raw || `Step ${i + 1}`,
          status: 'aborted',
          error: 'Execution aborted by user',
        })
        // marque les steps restants comme skipped
        for (let j = i + 1; j < steps.length; j++) {
          stepResults.push({
            index: j + 1,
            step: steps[j].raw || `Step ${j + 1}`,
            status: 'skipped',
            error: 'Skipped — execution aborted',
          })
        }
        return {
          status: 'aborted',
          logs,
          stepResults,
          finalUrl: await driver.getCurrentUrl().catch(() => ''),
        }
      }

      const step = steps[i]
      const stepText = step.raw || `Step ${i + 1}`
      const stepExpectedResult = step.expectedResult || expectedResult

      addLog(logs, i + 1, 'INFO', `Step ${i + 1} started: ${stepText}`)

      try {
        const result = await runStructuredUiStep(driver, stepText, ctx, i + 1)

        const sessionError = String(result?.error || '')
        if (/no such window|web view not found|invalid session id|target window already closed/i.test(sessionError)) {
          if (suiteKey && suiteDrivers.get(suiteKey) === driver) {
            suiteDrivers.delete(suiteKey)
          }
          addLog(logs, i + 1, 'ERROR', 'Selenium browser session closed', {
            error: sessionError,
          })
          console.error(`[SELENIUM] Browser session closed for suite ${suiteKey || 'standalone'}; it will be recreated on the next run`)
          return {
            status: 'failed_execution',
            logs,
            stepResults,
            finalUrl: '',
          }
        }

        // ─── CHECK ABORT après chaque step ────────────────────────────────
        if (isExecutionCancelled(executionId)) {
          addLog(logs, i + 1, 'WARN', `Aborted after step ${i + 1}`)
          stepResults.push({
            index: i + 1,
            step: stepText,
            status: 'aborted',
            error: 'Execution aborted by user',
          })
          return {
            status: 'aborted',
            logs,
            stepResults,
            finalUrl: await driver.getCurrentUrl().catch(() => ''),
          }
        }

        const isInteractiveStep = /click|submit|login|sign.?in/i.test(stepText)
        if (isInteractiveStep) {
          await waitForPageReactionWithAbort(driver, executionId)

          // Le SPA peut naviguer avant d'avoir fini de s'hydrater : on
          // attend un vrai contenu rendu avant de capturer le texte.
          if (/login|sign.?in/i.test(stepText)) {
            await driver.wait(async () => {
              const url = await driver.getCurrentUrl().catch(() => '')
              if (url.includes('/auth/login')) return false
              const hasRenderedContent = await driver.executeScript(() => {
                return document.querySelectorAll('body *:not(style):not(script):not(noscript)').length > 20
              }).catch(() => false)
              return hasRenderedContent
            }, 10000).catch(() => {})
          }
        }
// ✅ Capture une seule fois, juste après l'étape 1 (ouverture de
        // page), l'état "tel que chargé" — sert de référence pour ignorer
        // les messages statiques déjà présents avant toute interaction.
        if (i === 0 && !ctx.baselineCaptured) {
          const baseline = await buildActualResultForStep(driver, stepText, i + 1, result, {})
          ctx.baselineErrorMessage = baseline.errorMessage
          ctx.baselineSuccessMessage = baseline.successMessage
          ctx.baselineFieldValidationErrors = baseline.fieldValidationErrors || []
          ctx.baselineCaptured = true
        }

        const actualResultObject = await buildActualResultForStep(driver, stepText, i + 1, result, ctx)
        if (actualResultObject.errorMessage) {
  console.log(
    '❌ UI ERROR DETECTED:',
    actualResultObject.errorMessage
  )
}

if (actualResultObject.successMessage) {
  console.log(
    '✅ UI SUCCESS DETECTED:',
    actualResultObject.successMessage
  )
}
        const actualResult = JSON.stringify(actualResultObject || {})
        let comparison

        // ── Classify step type ──────────────────────────────────────────────
        const isInputStep =
          /enter|fill|provide|type|insert|set/i.test(stepText.toLowerCase()) &&
          !/select|choose|pick|dropdown|calendar/i.test(stepText.toLowerCase())
        const isClickStep = isActionStep(stepText)
        const hasGenericExpected = isGenericActionExpected(stepExpectedResult)
        const hasExplicitExpected = Boolean(stepExpectedResult) && !hasGenericExpected

        // ── Detect whether navigation occurred ─────────────────────────────
        const currentUrlAfterStep = String(actualResultObject?.url || '')
        const navigationDetected =
          Boolean(currentUrlAfterStep) &&
          !currentUrlAfterStep.includes('about:blank')

        // ── Debug logs ─────────────────────────────────────────────────────
        console.log(`STEP TYPE = ${isInputStep ? 'INPUT' : isClickStep ? 'ACTION' : 'GENERIC'}`)
        console.log(`ACTION RESULT = ${result.status || 'unknown'}`)
        console.log(`EXECUTION ERROR = ${result.error || 'null'}`)
        console.log(`NAVIGATION DETECTED = ${navigationDetected}`)
        console.log(`FINAL URL = ${currentUrlAfterStep || '(none)'}`)
        console.log(`EXPLICIT ASSERTION = ${hasExplicitExpected ? stepExpectedResult : 'NONE'}`)

        // ── Determine comparison ───────────────────────────────────────────
        if (isInputStep) {
          const verifiedInput = result?.verifiedFieldValue
          const hasVerifiedValue = Boolean(String(verifiedInput?.value || '').trim())
          if (result?.status !== 'passed' || actualResultObject?.errorMessage || !hasVerifiedValue) {
            comparison = {
              status: 'failed_assertion',
              matched: false,
              reason: actualResultObject?.errorMessage
                ? `Input validation error: "${actualResultObject.errorMessage}"`
                : 'Input step did not expose a verified value in the DOM after typing.',
            }
          } else {
            comparison = {
              status: 'passed',
              matched: true,
              reason: `Input value verified in DOM: ${verifiedInput.value}`,
            }
          }
        } else if (isClickStep && !hasExplicitExpected) {
          // ACTION step with no real assertion:
          // Success is determined purely by execution outcome + absence of UI errors.
          // Navigation to a new URL is treated as a strong success signal.
          if (actualResultObject?.errorMessage) {
            comparison = {
              status: 'failed_assertion',
              matched: false,
              reason: `UI error detected: "${actualResultObject.errorMessage}"`,
            }
          } else {
            comparison = {
              status: 'passed',
              matched: true,
              reason: navigationDetected
                ? `Action executed successfully — navigated to ${currentUrlAfterStep}`
                : 'Action executed successfully — no explicit assertion defined',
            }
          }
        } else {
          // Generic or explicitly asserted step:
          comparison = compareStepExpectedResult(
            actualResultObject || {},
            stepExpectedResult,
            stepText
          )
        }

        console.log(`ASSERTION RESULT = ${hasExplicitExpected ? comparison.status : 'NOT_APPLICABLE'}`)
        console.log(`FAILURE DETECTION RESULT = ${actualResultObject?.errorMessage ? 'UI_ERROR' : result.error ? 'EXECUTION_ERROR' : 'NO_FAILURE'}`)
        console.log(`FINAL STEP STATUS = ${result.status !== 'passed' ? result.status : comparison.status}`)

        const finalStepStatus = result.status !== 'passed' ? result.status : comparison.status

        if (finalStepStatus !== 'passed') encounteredFailure = true

        // Let the executor know whether every preceding step really passed,
        // so a final submit (Save/Submit) is not fired on top of a broken
        // sequence — e.g. saving a form whose fields were never filled
        // because an earlier step silently failed.
        ctx.failedStepCount = (ctx.failedStepCount || 0) + (finalStepStatus === 'passed' ? 0 : 1)
        ctx.lastFailedStep = finalStepStatus === 'passed' ? ctx.lastFailedStep : stepText

        addLog(logs, i + 1, finalStepStatus === 'passed' ? 'SUCCESS' : 'ERROR',
  `Step ${i + 1} ${finalStepStatus}: ${comparison.reason}`,
  finalStepStatus !== 'passed'
    ? {
        actual: actualResultObject,
        expected: stepExpectedResult,
        executionError: result.error || null,
        executionErrorDetails: result.errorDetails || null,
      }
    : undefined
)

        stepResults.push({
          index: i + 1,
          step: stepText,
          status: finalStepStatus,
          actualResult,
          expectedResult: stepExpectedResult,
          comparison: { matched: comparison.matched, reason: comparison.reason },
          screenshot: (result.screenshots && result.screenshots[0]) || null,
          allScreenshots: result.screenshots || [],
          error: result.error || '',
          startedAt: new Date(),
          finishedAt: new Date(),
        })

      } catch (err) {
        // ─── Si l'erreur vient d'un abort signal ──────────────────────────
        if (isExecutionCancelled(executionId)) {
          addLog(logs, i + 1, 'WARN', `Step ${i + 1} interrupted by abort`)
          stepResults.push({
            index: i + 1,
            step: stepText,
            status: 'aborted',
            error: 'Interrupted by abort',
          })
          return { status: 'aborted', logs, stepResults }
        }

    stepResults.push({
          index: i + 1,
          step: stepText,
          status: 'failed_execution',
          error: err.message,
          errorDetails: {
            message: err.message,
            stack: err.stack,
          },
        })
        encounteredFailure = true
      }
    }

    const hasAssertionFailure = stepResults.some(s => s.status === 'failed_assertion')
    const hasExecutionFailure = stepResults.some(s => s.status === 'failed_execution')
    const finalComparison = compareExpectedResult(
      stepResults.length ? JSON.parse(stepResults[stepResults.length - 1].actualResult || '{}') : {},
      expectedResult,
      stepResults
    )
    const finalUrl = await waitForStableFinalUrl(driver)
    console.log(`[SELENIUM] URL returned to controller: ${finalUrl || '(empty)'}`)
    addLog(logs, steps.length + 1, 'INFO', 'Final URL detected', {
      url: finalUrl || '',
    })

    // Always preserve the terminal page evidence. This is used to decide
    // whether a real field validation error remains after all actions, and
    // gives the failure analysis a final screenshot when the DOM is ambiguous.
    const finalDom = await driver.executeScript(() => {
      const visible = (node) => {
        if (!node) return false
        const style = window.getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0
      }
      const validationErrors = []
      const selectors = [
        'mat-error',
        '.oxd-input-field-error-message',
        '[class*="input-field-error"]',
        '[class*="field-error-message"]',
        '[class*="fieldValidationErrors"]',
        '.invalid-feedback',
        '[class*="validation-message"]',
        '[role="alert"]',
      ]
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((node) => {
          const text = (node.textContent || '').trim()
          if (text && visible(node) && !validationErrors.includes(text)) validationErrors.push(text)
        })
      }
      document.querySelectorAll('[aria-describedby]').forEach((field) => {
        String(field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).forEach((id) => {
          const node = document.getElementById(id)
          const text = (node?.textContent || '').trim()
          if (text && visible(node) && !validationErrors.includes(text)) validationErrors.push(text)
        })
      })
      return {
        url: window.location.href,
        title: document.title,
        text: document.body.innerText.slice(0, 4000),
        validationErrors,
      }
    }).catch(() => ({ url: finalUrl || '', validationErrors: [] }))
    const finalScreenshot = await captureStepScreenshot(
      driver,
      steps.length + 1,
      finalDom.validationErrors?.length ? 'failed-final' : 'final'
    ).catch(() => null)
    addLog(logs, steps.length + 1, 'INFO', 'Final DOM captured for failure analysis', {
      finalDom,
      finalScreenshot,
      hasFieldValidationError: Boolean(finalDom.validationErrors?.length),
    })

    const terminalActual = stepResults.length
      ? JSON.parse(stepResults[stepResults.length - 1].actualResult || '{}')
      : {}
    terminalActual.finalDom = finalDom
    terminalActual.finalScreenshot = finalScreenshot
    terminalActual.fieldValidationErrors = finalDom.validationErrors || []

    return {
      status: hasExecutionFailure
        ? 'failed_execution'
        : hasAssertionFailure || finalComparison.status !== 'passed' || encounteredFailure
          ? 'failed_assertion'
          : 'passed',
      logs,
      stepResults,
      finalUrl,
      actualResult: JSON.stringify(terminalActual),
      expectedResult,
      comparison: finalComparison,
      finalDom,
      finalScreenshot,
    }

  } catch (err) {
    if (isExecutionCancelled(executionId)) {
      return { status: 'aborted', logs, stepResults }
    }
    addLog(logs, 0, 'ERROR', 'Unhandled execution error', { message: err.message, stack: err.stack })
    return { status: 'failed', logs, stepResults }

  } finally {
    cleanupExecution(executionId)
    if (ownsDriver) await driver.quit()
  }
}
// Renvoie, pour chaque jour des N derniers jours, le nombre de passed/failed
async function getExecutionTrend(filters = {}, days = 7) {
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))
  since.setHours(0, 0, 0, 0)

  const match = { startedAt: { $gte: since } }
  if (filters.project)     match.project = filters.project
  if (filters.testSuiteId) match.testSuiteId = filters.testSuiteId
  if (filters.planId)      match.planId = filters.planId

  const raw = await TestExecution.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } },
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
  ])

  const days_ = []
  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    days_.push(d.toISOString().slice(0, 10))
  }

  const result = days_.map((day) => {
    const passed = raw.find((r) => r._id.day === day && r._id.status === 'passed')?.count || 0
    const failed = raw
      .filter((r) => r._id.day === day && String(r._id.status || '').includes('fail'))
      .reduce((sum, r) => sum + r.count, 0)
    return { day, passed, failed }
  })

  return result
}

// Répartition des test cases exécutés par type (functional / integration / ...)
async function getTypeBreakdown(filters = {}) {
  const match = {}
  if (filters.testSuiteId) match.testSuiteId = filters.testSuiteId
  if (filters.planId)      match.planId = filters.planId

  const raw = await TestCase.aggregate([
    { $match: match },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ])

  const total = raw.reduce((sum, r) => sum + r.count, 0) || 1
  return raw.map((r) => ({
    type: r._id || 'functional',
    count: r.count,
    percent: Math.round((r.count / total) * 100),
  }))
}

module.exports = {
  runTestCase,
  getExecutionTrend,
  getTypeBreakdown,
  compareStepExpectedResult,
  buildActualResultForStep,
}
