const { createDriver } = require('./driver.factory')
const { runStructuredUiStep } = require('./ui.executor')
const { addLog } = require('../../utils/logger')
/*const {
  createExecutionController,
  isExecutionCancelled,
  cleanupExecution,
} = require('../../controllers/selenium.controller')*/

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

// ─── FIX 1 : compareStepExpectedResult ───────────────────────────────────────
// Avant : comparaison fuzzy sur url+title+text seulement → rate les erreurs UI
// Après : détecte l'intention sémantique de l'expected (erreur vs succès vs URL)
//         et vérifie le bon signal dans actualResult
// ─────────────────────────────────────────────────────────────────────────────
function compareStepExpectedResult(actual, expected) {

  
const inputStepPatterns =
  /enter|fill|provide|type|insert|set|select|choose/i

if (inputStepPatterns.test(expected || '')) {
  return {
    status: 'passed',
    matched: true,
    reason: 'Input action executed successfully'
  }
}


  if (!expected || normalizeText(expected) === '') {
    return { status: 'passed', matched: true, reason: 'No expected result defined' }
  }

  const exp = normalizeText(expected)

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
  const errorKeywords = [
    'error', 'invalid', 'failed', 'incorrect',
    'unauthorized', 'wrong', 'erreur', 'échec'
  ]

  const expectsError = errorKeywords.some(k => exp.includes(k))

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
    const text = Array.from(document.querySelectorAll('body *'))
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

    return {
      url: window.location.href,
      title: document.title,
      text,
      values,
      errorMessage,
      successMessage,
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

  if (stepIndex === 1) {
    return {
      url: pageState.url,
      title: pageState.title,
      text: pageState.text,
      errorMessage: pageState.errorMessage,
      successMessage: pageState.successMessage,
    }
  }

  if (/enter|fill|provide|type|insert|set/i.test(stepLower)) {
    return {
      url: pageState.url,
      title: pageState.title,
      text: valuesText || pageState.text,
      errorMessage: pageState.errorMessage,
      successMessage: pageState.successMessage,
    }
  }

  if (/click|submit|login|sign in|sign-in|open|navigate|go/i.test(stepLower)) {
    return {
      url: pageState.url,
      title: pageState.title,
      text: pageState.text,
      errorMessage: pageState.errorMessage,
      successMessage: pageState.successMessage,
    }
  }

  return stepRunResult?.actual || {
    url: pageState.url,
    title: pageState.title,
    text: pageState.text,
    errorMessage: pageState.errorMessage,
    successMessage: pageState.successMessage,
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

async function runTestCase(testCase) {

 const {
    createExecutionController,
    isExecutionCancelled,
    cleanupExecution,
    registerAbortCallback,
    registerDriver,  // ← ajoute
  } = require('./cancellation.manager')

 const executionId = testCase.executionId || `EX-${Date.now()}`
  createExecutionController(executionId)

  const driver = await createDriver()

  registerDriver(executionId, driver)

  registerAbortCallback(executionId, async () => {
    console.log(`🛑 Abort callback fired for ${executionId}`)
    try { await driver.quit() } catch {}
  })
  const logs = []
  const stepResults = []

  addLog(logs, 0, 'INFO', 'Execution started')

  const baseUrl =
    testCase?.url ||
    testCase?.urlCible ||
    testCase?.targetUrl ||
    testCase?.baseUrl ||
    ''

  const ctx = {
    baseUrl,
    testCase: {
      ...testCase,
      test_data: Array.isArray(testCase?.test_data) ? testCase.test_data : [],
    },
    actionOverrides: normalizeActionOverrides(testCase?.actionOverrides || testCase?.aiActionOverrides),
    logs,
  }

  if (!ctx.baseUrl) {
    addLog(logs, 0, 'ERROR', 'Missing target URL.')
    try { await driver.quit() } catch {}
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
        }
      }

      const step = steps[i]
      const stepText = step.raw || `Step ${i + 1}`
      const stepExpectedResult = step.expectedResult || expectedResult

      addLog(logs, i + 1, 'INFO', `Step ${i + 1} started: ${stepText}`)

      try {
        const result = await runStructuredUiStep(driver, stepText, ctx, i + 1)

        // ─── CHECK ABORT après chaque step ────────────────────────────────
        if (isExecutionCancelled(executionId)) {
          addLog(logs, i + 1, 'WARN', `Aborted after step ${i + 1}`)
          stepResults.push({
            index: i + 1,
            step: stepText,
            status: 'aborted',
            error: 'Execution aborted by user',
          })
          return { status: 'aborted', logs, stepResults }
        }

        const isInteractiveStep = /click|submit|login|sign.?in/i.test(stepText)
        if (isInteractiveStep) await waitForPageReactionWithAbort(driver, executionId)
// ✅ Capture une seule fois, juste après l'étape 1 (ouverture de
        // page), l'état "tel que chargé" — sert de référence pour ignorer
        // les messages statiques déjà présents avant toute interaction.
        if (i === 0 && !ctx.baselineCaptured) {
          const baseline = await buildActualResultForStep(driver, stepText, i + 1, result, {})
          ctx.baselineErrorMessage = baseline.errorMessage
          ctx.baselineSuccessMessage = baseline.successMessage
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

const isInputStep =
  /enter|fill|provide|type|insert|set|select|choose/i.test(stepText.toLowerCase())

if (isInputStep) {
  comparison = {
    status: 'passed',
    matched: true,
    reason: 'Input step executed'
  }
} else {
  comparison = compareStepExpectedResult(
    actualResultObject || {},
    stepExpectedResult
  )
}
       
        
        const finalStepStatus = result.status !== 'passed' ? result.status : comparison.status

        if (finalStepStatus !== 'passed') encounteredFailure = true

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

    return {
      status: hasExecutionFailure
        ? 'failed_execution'
        : hasAssertionFailure || finalComparison.status !== 'passed' || encounteredFailure
          ? 'failed_assertion'
          : 'passed',
      logs,
      stepResults,
      actualResult: stepResults.length ? stepResults[stepResults.length - 1].actualResult : '',
      expectedResult,
      comparison: finalComparison,
    }

  } catch (err) {
    if (isExecutionCancelled(executionId)) {
      return { status: 'aborted', logs, stepResults }
    }
    return { status: 'failed', logs, stepResults }

  } finally {
    cleanupExecution(executionId)
    await driver.quit()
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

module.exports = { runTestCase,
  
 }
