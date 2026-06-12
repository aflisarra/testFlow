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
    logs
  }

  try {

    let steps = testCase.executionModel?.steps || []

    // ✅ FALLBACK SI STEP NON STRUCTURÉ
    if (!steps.length && Array.isArray(testCase.steps)) {
      steps = testCase.steps.map((raw, i) => ({
        action: i === 0
          ? "navigate"
          : (raw.toLowerCase().includes("submit") ? "click" : "type"),
        raw,
        target: { url: testCase.url }
      }))
    }

    console.log("🔥 STEPS:", steps)

    for (let i = 0; i < steps.length; i++) {

      const step = steps[i]

      const result = await runStructuredUiStep(driver, step, ctx, i + 1)

      stepResults.push({
        index: i + 1,
        name: step.raw,
        status: 'passed',
        screenshotPath: result?.screenshot || null
      })
    }

    addLog(logs, steps.length, "SUCCESS", "Test finished")

    return {
      status: 'passed',
      logs,
      stepResults
    }

  } catch (err) {

    addLog(logs, 999, "ERROR", err.message)

    return {
      status: 'failed',
      logs,
      stepResults
    }

  } finally {

    await new Promise(r => setTimeout(r, 2000))
    await driver.quit()

  }
}

module.exports = { runTestCase }
