const mongoose = require('mongoose')
const TestExecution = require('../models/TestExecution.model')
const { runTestCase } = require('../services/selenium/selenium.service')

async function runTestCaseHandler(req, res) {
  //addLog(logs, 0, "INFO", "Test started")
  
  try {
    
const testCase = req.body?.testCase || req.body

console.log("🔥 RECEIVED TEST CASE:", testCase)
console.log("✅ BODY:", JSON.stringify(req.body, null, 2))

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
      
console.log(
  '✅ RESULT STEP RESULTS BEFORE SAVE:',
  JSON.stringify(result.stepResults, null, 2)
)

      await TestExecution.create({
        executionId,
        testSuiteId: new mongoose.Types.ObjectId(suiteId),
        planId: mongoose.Types.ObjectId.isValid(planId) ? new mongoose.Types.ObjectId(planId) : null,
        testCaseId: null,
        planKey: planId,
        testCaseKey: testCaseId,
        executionModel: testCase.executionModel || null,
        planTitle: String(testCase?.planTitle || req.body?.planTitle || '').trim(),
        testCaseTitle: String(testCase?.title || req.body?.testCaseTitle || '').trim(),
        status:
  result.status === 'passed'
    ? 'passed'
    : result.status === 'failed_assertion'
      ? 'failed_assertion'
      : 'failed_execution',

        duration,
        startedAt: new Date(startedAt),
        finishedAt,
        logs: Array.isArray(result.logs) ? result.logs : [],
        screenshots: Array.isArray(result.screenshots) ? result.screenshots : [],
      stepsResults: Array.isArray(result.stepResults)
  ? result.stepResults.map((step) => {

      const screenshotsArray = Array.isArray(step.screenshots)
        ? step.screenshots.filter(Boolean)
        : []

      const firstScreenshot =
        screenshotsArray[0] ||
        step.screenshot ||
        null

      const publicUrl =
        firstScreenshot?.publicUrl ||
        firstScreenshot?.url ||
        step.screenshotPath ||
        ''

      const screenshotPath =
        firstScreenshot?.path ||
        ''

      return {
        index: Number(step.index || 0),

        step: String(step.name || step.step || step.id || ''),

        action: String(step.action || ''),

        status:
          step.status === 'passed'
            ? 'passed'
            : step.status === 'failed_assertion'
              ? 'failed_assertion'
              : step.status === 'skipped'
                ? 'skipped'
                : 'failed_execution',

        actualResult: String(step.actualResult || step.actual || ''),

        expectedResult: String(step.expectedResult || step.expected || ''),

        error: String(step.error || step.message || ''),

        // ✅ IMPORTANT: toujours objet compatible avec schema
        screenshot: {
          filename: firstScreenshot?.filename || '',
          path: screenshotPath,
          publicUrl,
          createdAt:
            firstScreenshot?.createdAt ||
            new Date().toISOString()
        }
      }
    })
  : [],

  executedBy: {
  userId: req.user?._id || req.user?.userId || null,
  name:
    req.user?.name ||
    req.user?.fullName ||
    req.user?.email ||
    testCase?.createdBy?.name ||
    'Unknown user',
  picture: req.user?.picture || ''
},

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

console.error(err.stack)


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
      testSuiteId,
      planId,
      days,
      fromDate,
      toDate,
      page = 1,
      limit = 10
    } = req.query

    page = parseInt(page)
    limit = parseInt(limit)

    const query = {}

    // ✅ STATUS
    if (status) {
      query.status = String(status).trim()
    }

    // ✅ SUITE
    if (testSuiteId && mongoose.Types.ObjectId.isValid(testSuiteId)) {
      query.testSuiteId = new mongoose.Types.ObjectId(testSuiteId)
    }

    // ✅ PROJECT seulement si pas de suite sélectionnée
    if (
      !testSuiteId &&
      project &&
      mongoose.Types.ObjectId.isValid(project)
    ) {
      const TestSuite = require('../models/testsuite')

      const suites = await TestSuite.find({
        projectId: new mongoose.Types.ObjectId(project)
      })
        .select('_id')
        .lean()

      const suiteIds = suites.map((s) => s._id)

      query.testSuiteId = { $in: suiteIds }
    }

    // ✅ PLAN
    if (planId && mongoose.Types.ObjectId.isValid(planId)) {
      query.planId = new mongoose.Types.ObjectId(planId)
    }

    // ✅ DATE FILTER
    if (fromDate || toDate) {
      query.startedAt = {}

      if (fromDate) {
        const from = new Date(fromDate)
        from.setHours(0, 0, 0, 0)
        query.startedAt.$gte = from
      }

      if (toDate) {
        const to = new Date(toDate)
        to.setHours(23, 59, 59, 999)
        query.startedAt.$lte = to
      }
    } else if (days) {
      const d = new Date()
      d.setDate(d.getDate() - Number(days))
      d.setHours(0, 0, 0, 0)

      query.startedAt = {
        $gte: d
      }
    }

    console.log('🔎 FILTER QUERY FINAL:', query)

    const skip = (page - 1) * limit

    const [executions, total] = await Promise.all([
      TestExecution.find(query)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      TestExecution.countDocuments(query)
    ])

    const data = executions.map((row) => ({
      executionId: row.executionId,
      testSuiteId: String(row.testSuiteId || ''),
      planId: String(row.planId || ''),
      planKey: row.planKey || '',
      planTitle: row.planTitle || '',
      testCaseId: String(row.testCaseId || ''),
      testCaseKey: row.testCaseKey || '',
      testCaseTitle: row.testCaseTitle || '',
      status: row.status,
      duration: row.duration,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,

      executedByName:
        row.executedBy?.name ||
        row.createdBy?.name ||
        row.userName ||
        'Unknown user'
    }))

    return res.json({
      success: true,
      data,
      total,
      page,
      limit
    })

  } catch (err) {
    console.error('❌ getExecutions:', err)

    return res.status(500).json({
      success: false,
      message: 'Error fetching executions'
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

    const steps = (execution.stepsResults || []).map((step, index) => ({
      index: step.index || index + 1,

      name: step.step || `Step ${index + 1}`,

      status: step.status,

      screenshotPath:
        step.screenshot?.publicUrl ||
        step.screenshot?.path ||
        null,

      screenshot: step.screenshot || null,

      message: step.error || '',

      actualResult: step.actualResult || '',

      expectedResult: step.expectedResult || ''
    }))

    console.log('✅ DETAIL STEPS SENT:', steps)

    const logs = (execution.logs || []).map(log => ({
      timestamp: log.timestamp || new Date().toISOString(),
      level: log.level || 'INFO',
      message: log.message || '',
      data: log.data || {}
    }))

    return res.json({
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