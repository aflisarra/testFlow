const mongoose = require('mongoose')
const TestExecution = require('../models/TestExecution.model')
const { runTestCase } = require('../services/selenium/selenium.service')

// ✅ AJOUT
const testCaseService = require('../services/testcase.service')

async function runTestCaseHandler(req, res) {

  try {

    const body = req.body || {}

    console.log("🔥 REQUEST BODY:", body)

    let testCase = body.testCase || body
    let result

    const startedAt = Date.now()

    // ✅ ✅ ✅ CAS 1 : EXECUTION PAR planId (CORRECT)
    if (body.planId) {

      console.log("📥 Loading test cases from DB using planId:", body.planId)

      const casesFromDB = await testCaseService.getByPlan(body.planId)

      if (!casesFromDB.length) {
        return res.status(404).json({
          status: 'error',
          message: 'No test cases found for this plan'
        })
      }

      testCase = casesFromDB[0]

      console.log("✅ TEST CASE FROM DB:", testCase)
    }

    // ✅ ✅ ✅ VALIDATION
    if (!testCase || !Array.isArray(testCase.steps) || !testCase.steps.length) {
      return res.status(400).json({
        status: 'error',
        message: 'testCase.steps is required'
      })
    }

    // ✅ ✅ ✅ EXECUTION
    result = await runTestCase(testCase)

    const safeResult = result || {
      status: 'failed_execution',
      logs: [],
      stepResults: []
    }

    const finishedAt = new Date()
    const duration = Math.round((Date.now() - startedAt) / 1000)

    const suiteId = testCase?.testSuiteId || null
    const isValidSuite = suiteId && mongoose.Types.ObjectId.isValid(suiteId)

    const executionData = {
      executionId: `EX-${Date.now()}`,
      testCaseTitle: testCase.title || "",
      planKey: testCase.planId ? String(testCase.planId) : '',
      planTitle: testCase.planTitle || '',
      status:
        safeResult.status === 'passed'
          ? 'passed'
          : safeResult.status === 'failed_assertion'
            ? 'failed_assertion'
            : 'failed_execution',
      duration,
      startedAt: new Date(startedAt),
      finishedAt,
      logs: safeResult.logs || [],
      stepResults: safeResult.stepResults || [],
    }

    if (testCase.id) {
      executionData.testCaseKey = String(testCase.id)
    }

    if (isValidSuite) {

      executionData.testSuiteId = new mongoose.Types.ObjectId(suiteId)

      if (testCase.planId && mongoose.Types.ObjectId.isValid(testCase.planId)) {
        executionData.planId = new mongoose.Types.ObjectId(testCase.planId)
      }

      try {
        await TestExecution.create(executionData)
        console.log("✅ Execution saved")
      } catch (dbErr) {
        console.error("⚠️ Execution save failed:", dbErr)
      }
    }

    return res.json({
      status: safeResult.status,
      data: safeResult
    })

  } catch (err) {

    console.error("❌ CONTROLLER ERROR:", err)

    return res.status(500).json({
      status: 'error',
      message: err.message
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

    const rawSteps = execution.stepResults || execution.stepsResults || []

    const steps = rawSteps.map((step, index) => ({
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
