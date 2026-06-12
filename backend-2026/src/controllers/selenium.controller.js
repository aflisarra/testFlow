const mongoose = require('mongoose')
const TestExecution = require('../models/TestExecution.model')
const { runTestCase } = require('../services/selenium/selenium.service')

async function runTestCaseHandler(req, res) {
  //addLog(logs, 0, "INFO", "Test started")
  
  try {
    
const testCase = req.body?.testCase || req.body

console.log("🔥 RECEIVED TEST CASE:", testCase)


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
//addLog(logs, 0, "INFO", "Test started")

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


async function getExecutions(req, res) {

  try {
    let {
      status,
      project,
      planId,
      testCaseId,
      days,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
      executionState
    } = req.query

    // ✅ convertir en nombres
    page = parseInt(page)
    limit = parseInt(limit)

    const query = {}

    // ✅ STATUS
    if (status) {
      query.status = status
    }

    // ✅ PROJECT
    if (project && mongoose.Types.ObjectId.isValid(project)) {
      query.testSuiteId = new mongoose.Types.ObjectId(project)
    }

    // ✅ PLAN
    if (planId && mongoose.Types.ObjectId.isValid(planId)) {
      query.planId = new mongoose.Types.ObjectId(planId)
    }

    // ✅ TEST CASE
    if (testCaseId && mongoose.Types.ObjectId.isValid(testCaseId)) {
      query.testCaseId = new mongoose.Types.ObjectId(testCaseId)
    }

    // ✅ DATE FILTER (PRIORITÉ : vraie date > days)
    const now = new Date()

    if (fromDate || toDate) {

      query.startedAt = {}

      if (fromDate) {
        query.startedAt.$gte = new Date(fromDate)
      }

      if (toDate) {
        query.startedAt.$lte = new Date(toDate)
      }

    } else if (days) {

      const d = new Date()
      d.setDate(now.getDate() - parseInt(days))

      query.startedAt = {
        $gte: d
      }
    }

    // ✅ RUNNING / FINISHED
    if (executionState === 'running') {
      query.finishedAt = null
    }

    if (executionState === 'finished') {
      query.finishedAt = { $ne: null }
    }

    console.log("🔎 FILTER QUERY:", query)

    const skip = (page - 1) * limit

    const executions = await TestExecution.find(query)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)

    const total = await TestExecution.countDocuments(query)

    return res.json({
      success: true,
      data: executions,
      total,
      page,
      limit
    })

  } catch (err) {
    console.error("❌ getExecutions:", err)

    return res.status(500).json({
      success: false,
      message: "Error fetching executions"
    })
  }
}


exports.getExecutionDetail = async (req, res) => {
  try {

    const executionId = req.params.id

    const execution = await require('../models/TestExecution.model')
      .findOne({ executionId })
      .lean()

    if (!execution) {
      return res.status(404).json({ message: 'Execution not found' })
    }

    // ✅ FORMAT STEPS (timeline)
    const steps = (execution.stepsResults || []).map((step, index) => ({
      index: index + 1,
      name: step.step || `Step ${index + 1}`,
      status: step.status,
      screenshotPath: step.screenshot || null,
      message: step.error || ''
    }))

    // ✅ FORMAT LOGS
    const logs = (execution.logs || []).map(log => ({
      timestamp: log.timestamp || new Date().toISOString(),
      level: log.level || 'INFO',
      message: log.message || ''
    }))

    // ✅ RESPONSE FINAL

res.json({
  executionId: execution.executionId,
  testCaseKey: execution.testCaseKey, 
  testCaseTitle: execution.testCaseTitle,
  planTitle: execution.planTitle,
  status: execution.status,
  duration: execution.duration,
  startedAt: execution.startedAt,
  finishedAt: execution.finishedAt,
  steps,
  logs
})


  } catch (error) {
    console.error('🔥 getExecutionDetail error:', error)
    res.status(500).json({ message: error.message })
  }
}

module.exports = {
  runTestCaseHandler,
  getExecutions,
  getExecutionDetail: exports.getExecutionDetail
}