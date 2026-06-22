const { createDriver } = require('./driver.factory')
const { runStructuredUiStep } = require('./ui.executor')
const { addLog } = require('../../utils/logger')

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function resolveExpectedResult(testCase) {
  return String(
    testCase?.expected_result ||
    testCase?.expectedResult ||
    testCase?.expected ||
    ''
  ).trim()
}

function compareExpectedResult(actual, expected, stepResults = []) {
  const actualText = normalizeText([
    actual?.url,
    actual?.title,
    actual?.text
  ].filter(Boolean).join(' '))

  const expectedText = normalizeText(expected)
  const stepSummary = normalizeText(
    stepResults
      .map((step) => `${step.status || ''} ${step.error || ''} ${step.actualResult || ''}`)
      .join(' ')
  )

  if (!expectedText) {
    return {
      status: 'passed',
      matched: true,
      reason: 'No expected result provided'
    }
  }

  const matched =
    actualText.includes(expectedText) ||
    expectedText.includes(actualText) ||
    stepSummary.includes(expectedText)

  return {
    status: matched ? 'passed' : 'failed_assertion',
    matched,
    reason: matched
      ? 'Actual result matches expected result'
      : 'Actual result does not match expected result'
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


  // ✅ 🔥 DEBUG TEST DATA (IMPORTANT)
  console.log("🧪 TEST DATA RECEIVED IN EXECUTOR:", ctx.testCase?.test_data)

  if (!ctx.baseUrl) {
    addLog(logs, 0, "ERROR", "Missing target URL (url/urlCible/baseUrl).")
    try {
      await driver.quit()
    } catch {}
    return {
      status: 'failed_execution',
      logs,
      stepResults: [
        {
          index: 0,
          step: '',
          status: 'failed_execution',
          error: 'Missing target URL (url/urlCible/baseUrl).'
        }
      ]
    }
  }

  try {

    const steps = testCase.steps || []
    const expectedResult = resolveExpectedResult(testCase)

    for (let i = 0; i < steps.length; i++) {

      const step = steps[i]

      console.log(`➡️ STEP ${i + 1}: ${step}`)

      try {

        // ✅ 🔥 LOG BEFORE STEP
        console.log("🧪 TEST DATA BEFORE STEP:", ctx.testCase?.test_data)

        const result = await runStructuredUiStep(
          driver,
          step,
          ctx,
          i + 1
        )

        // ✅ 🔥 LOG AFTER STEP
        console.log("🧪 TEST DATA AFTER STEP:", ctx.testCase?.test_data)

        const actualResult = JSON.stringify(result.actual || {})
        const comparison = compareExpectedResult(result.actual || {}, expectedResult, stepResults)

        const finalStepStatus =
          result.status !== 'passed'
            ? result.status
            : comparison.status

        stepResults.push({
          index: i + 1,
          step: step,
          status: finalStepStatus,
          actualResult,
          expectedResult,
          comparison: {
            matched: comparison.matched,
            reason: comparison.reason
          },
          screenshot: (result.screenshots && result.screenshots[0]) || null,
          allScreenshots: result.screenshots || [],
          error: result.error || "",
          startedAt: new Date(),
          finishedAt: new Date()
        })

        if (finalStepStatus !== 'passed') {
          throw new Error(result.error || "Step failed")
        }

      } catch (err) {

        console.log("❌ STEP ERROR:", err.message)

        stepResults.push({
          index: i + 1,
          name: step,
          status: 'failed_execution',
          error: err.message
        })

        return {
          status: 'failed_execution',
          logs,
          stepResults
        }
      }
    }

    const finalComparison = compareExpectedResult(
      stepResults.length
        ? JSON.parse(stepResults[stepResults.length - 1].actualResult || '{}')
        : {},
      expectedResult,
      stepResults
    )

    return {
      status: finalComparison.status === 'passed' ? 'passed' : 'failed_assertion',
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

    return {
      status: 'failed',
      logs,
      stepResults
    }

  } finally {

    await driver.quit()
  }
}

module.exports = { runTestCase }
