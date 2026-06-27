const { createDriver } = require('./driver.factory')
const { runStructuredUiStep } = require('./ui.executor')
const { addLog } = require('../../utils/logger')

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
  const matched = fuzzyMatchExpected(actualText, exp)

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
async function buildActualResultForStep(driver, stepText, stepIndex, stepRunResult = {}) {
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
async function waitForPageReaction(driver, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const reacted = await driver.executeScript(() => {
      const errorSelectors = [
        '.oxd-alert-content-text',
        '[role="alert"]',
        '.alert',
        '[class*="error"]',
        '.oxd-toast-content',
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

  const driver = await createDriver()
  const logs = []
  const stepResults = []

  addLog(logs, 0, "INFO", "Execution started")

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
      test_data: Array.isArray(testCase?.test_data) ? testCase.test_data : []
    },
    logs
  }

  console.log("🧪 TEST DATA RECEIVED IN EXECUTOR:", ctx.testCase?.test_data)

  if (!ctx.baseUrl) {
    addLog(logs, 0, "ERROR", "Missing target URL (url/urlCible/baseUrl).")
    try { await driver.quit() } catch {}
    return {
      status: 'failed_execution',
      logs,
      stepResults: [{
        index: 0,
        step: '',
        status: 'failed_execution',
        error: 'Missing target URL (url/urlCible/baseUrl).'
      }]
    }
  }

  try {

    const steps = getStepDefinitions(testCase)
    const expectedResult = resolveExpectedResult(testCase)
    let encounteredFailure = false

    for (let i = 0; i < steps.length; i++) {

      const step = steps[i]
      const stepText = step.raw || `Step ${i + 1}`
      const stepExpectedResult = step.expectedResult || expectedResult

      console.log(`➡️ STEP ${i + 1}: ${stepText}`)
      addLog(logs, i + 1, "INFO", `Step ${i + 1} started: ${stepText}`)

      try {

        console.log("🧪 TEST DATA BEFORE STEP:", ctx.testCase?.test_data)

        const result = await runStructuredUiStep(driver, stepText, ctx, i + 1)

        console.log("🧪 TEST DATA AFTER STEP:", ctx.testCase?.test_data)

        // ── FIX 3 : attendre la réaction DOM après click/submit ─────────────
        const isInteractiveStep = /click|submit|login|sign.?in/i.test(stepText)
        if (isInteractiveStep) {
          await waitForPageReaction(driver)
        }

        const actualResultObject = await buildActualResultForStep(driver, stepText, i + 1, result)
        const actualResult = JSON.stringify(actualResultObject || {})
        const comparison = compareStepExpectedResult(actualResultObject || {}, stepExpectedResult)

        const finalStepStatus =
          result.status !== 'passed'
            ? result.status
            : comparison.status

        if (finalStepStatus !== 'passed') {
          encounteredFailure = true
        }

        addLog(
          logs,
          i + 1,
          finalStepStatus === 'passed' ? "SUCCESS" : "ERROR",
          `Step ${i + 1} ${finalStepStatus}: ${comparison.reason}`
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
          error: result.error || "",
          startedAt: new Date(),
          finishedAt: new Date()
        })

      } catch (err) {

        console.log("❌ STEP ERROR:", err.message)
        stepResults.push({
          index: i + 1,
          step: stepText,
          status: 'failed_execution',
          error: err.message
        })
        encounteredFailure = true
      }
    }

    const hasAssertionFailure = stepResults.some((s) => s.status === 'failed_assertion')
    const hasExecutionFailure = stepResults.some((s) => s.status === 'failed_execution')
    const finalComparison = compareExpectedResult(
      stepResults.length
        ? JSON.parse(stepResults[stepResults.length - 1].actualResult || '{}')
        : {},
      expectedResult,
      stepResults
    )

    return {
      status: hasExecutionFailure
        ? 'failed_execution'
        : (hasAssertionFailure || finalComparison.status !== 'passed' || encounteredFailure)
          ? 'failed_assertion'
          : 'passed',
      logs,
      stepResults,
      actualResult: stepResults.length
        ? stepResults[stepResults.length - 1].actualResult
        : '',
      expectedResult,
      comparison: finalComparison
    }

  } catch (err) {

    console.log("❌ TEST CASE ERROR:", err.message)
    return { status: 'failed', logs, stepResults }

  } finally {
    await driver.quit()
  }
}

module.exports = { runTestCase }