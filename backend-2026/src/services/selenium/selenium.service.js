const { createDriver } = require('./driver.factory')
const { runStructuredUiStep } = require('./ui.executor')
const { addLog } = require('../../utils/logger')

async function runTestCase(testCase) {

  const driver = await createDriver()

  const logs = []
  const stepResults = []

  addLog(logs, 0, "INFO", "Execution started")

  const ctx = {
    baseUrl: testCase.url,
    testCase: testCase,
    logs
  }

  try {

    const steps = testCase.steps || []

    for (let i = 0; i < steps.length; i++) {

      const step = steps[i]

      console.log(`➡️ STEP ${i + 1}: ${step}`)

      try {

        const result = await runStructuredUiStep(
          driver,
          step,
          ctx,
          i + 1
        )

       stepResults.push({
  index: i + 1,
  step: step,

  status: result.status,

  actualResult: JSON.stringify(result.actual || ""),
  expectedResult: testCase.expected_result || "",

  // ✅ IMPORTANT → prendre seulement le dernier screenshot ou mapper
  screenshot: (result.screenshots && result.screenshots[0]) || null,

  // ✅ garder aussi tous les screenshots si besoin
  allScreenshots: result.screenshots || [],

  error: result.error || "",

  startedAt: new Date(),
  finishedAt: new Date()
})

        if (result.status !== 'passed') {
          throw new Error(result.error || "Step failed")
        }

      } catch (err) {

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

    return {
      status: 'passed',
      logs,
      stepResults
    }

  } catch (err) {

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