const mongoose = require('mongoose')
const TestExecution = require('../models/TestExecution.model')
const { runTestCase } = require('../services/selenium/selenium.service')

async function runTestCaseHandler(req, res) {
  try {
    const testCase = req.body?.testCase || req.body

    const modelSteps = testCase?.executionModel?.steps || testCase?.execution_model?.steps
    const hasNaturalSteps = Array.isArray(testCase?.steps) && testCase.steps.length > 0
    const hasExecutionModel = Array.isArray(modelSteps) && modelSteps.length > 0

    // validation simple
    if (!testCase || (!hasNaturalSteps && !hasExecutionModel)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payload: testCase steps or executionModel missing.'
      })
    }

    console.log('[INFO] Running test case:', testCase?.id || testCase?.title)

    const startedAt = Date.now()
    const result = await runTestCase(testCase)
    const finishedAt = new Date()
    const duration = Math.max(0, Math.round((Date.now() - startedAt) / 1000))

    const suiteId = String(testCase?.testSuiteId || req.body?.testSuiteId || '').trim()
    const planId = String(testCase?.planId || req.body?.planId || '').trim()
    const testCaseId = String(testCase?.id || req.body?.testCaseId || '').trim()

    if (suiteId && mongoose.Types.ObjectId.isValid(suiteId)) {
      const executionId = `EX-${Date.now()}-${testCaseId.slice(-6)}`
      await TestExecution.create({
        executionId,
        testSuiteId: new mongoose.Types.ObjectId(suiteId),
        planId: mongoose.Types.ObjectId.isValid(planId) ? new mongoose.Types.ObjectId(planId) : null,
        testCaseId: null,
        planKey: planId,
        testCaseKey: testCaseId,
        planTitle: String(testCase?.planTitle || req.body?.planTitle || '').trim(),
        testCaseTitle: String(testCase?.title || req.body?.testCaseTitle || '').trim(),
        status: result.status === 'passed' ? 'passed' : 'failed',
        duration,
        startedAt: new Date(startedAt),
        finishedAt,
        logs: Array.isArray(result.logs) ? result.logs : [],
        screenshots: Array.isArray(result.screenshots) ? result.screenshots : [],
        stepsResults: Array.isArray(result.stepResults)
          ? result.stepResults.map((step) => ({
              step: String(step.name || step.id || ''),
              status: step.status === 'passed' ? 'passed' : 'failed',
              error: step.status === 'failed' ? String(step.message || '') : '',
              screenshot: step.screenshotPath || null,
            }))
          : [],
      })
      console.log('[INFO] TestExecution saved:', { suiteId, planId, testCaseId, status: result.status, duration })
    } else {
      console.warn('[WARN] TestExecution skipped: missing or invalid suiteId/planId/testCaseId', {
        suiteId,
        planId,
        testCaseId,
      })
    }

    return res.status(200).json({
      status: result.status,
      message: result.message,
      data: result
    })

  } catch (err) {
    console.error('[ERROR] runTestCaseHandler:', err)

    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Unexpected server error.'
    })
  }
}

module.exports = {
  runTestCaseHandler,
}
