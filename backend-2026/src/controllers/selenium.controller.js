const mongoose = require('mongoose')
const TestExecution = require('../models/TestExecution.model')
const User = require('../models/user.model')
const { runTestCase } = require('../services/selenium/selenium.service')

// ✅ AJOUT
const testCaseService = require('../services/testcase.service')

function normalizeUserPreview(user) {
  if (!user) return null
  const source = user?.user && typeof user.user === 'object' ? user.user : user
  const name = String(source?.name || source?.nom || source?.username || source?.firstName || '').trim()
  const picture = String(source?.picture || source?.avatar || '').trim()
  const userId = String(source?.userId || source?.id || source?._id || source?.sub || '').trim()

  if (!name && !picture && !userId) return null
  return { userId: userId || null, name, picture }
}

function normalizeScreenshotEntry(screenshot) {
  if (!screenshot) return null
  if (typeof screenshot === 'string') {
    const value = screenshot.trim()
    if (!value) return null
    return {
      filename: '',
      path: value,
      publicUrl: value,
      createdAt: '',
    }
  }
  if (typeof screenshot === 'object') {
    const path = String(screenshot.path || screenshot.publicUrl || screenshot.url || '').trim()
    if (!path && !screenshot.filename) return null
    return {
      filename: String(screenshot.filename || '').trim(),
      path,
      publicUrl: String(screenshot.publicUrl || screenshot.url || path || '').trim(),
      createdAt: String(screenshot.createdAt || '').trim(),
    }
  }
  return null
}

function getActorName(actor) {
  if (!actor) return ''
  return String(
    actor?.name ||
    actor?.nom ||
    actor?.username ||
    actor?.fullName ||
    ''
  ).trim()
}

async function resolveActor(req) {
  const fromToken = normalizeUserPreview(req.user)
  if (fromToken?.name || fromToken?.picture) return fromToken

  const userId = String(req.user?.userId || req.user?.id || req.user?._id || '').trim()
  if (!userId) return fromToken

  try {
    const user = await User.findById(userId).select('name picture email').lean()
    if (!user) return fromToken
    return {
      userId,
      name: String(user.name || user.email || '').trim(),
      picture: String(user.picture || '').trim(),
    }
  } catch {
    return fromToken
  }
}

async function runTestCaseHandler(req, res) {

  try {

    const body = req.body || {}

    console.log("🔥 REQUEST BODY:", body)

    let testCase = body.testCase || body
    console.log("🧪 EXECUTION INPUT testCase:", {
      hasTestCase: Boolean(testCase),
      id: testCase?.id || '',
      planId: testCase?.planId || '',
      testSuiteId: testCase?.testSuiteId || '',
      test_data: testCase?.test_data || testCase?.testData || testCase?.data || [],
    })
    let result

    const startedAt = Date.now()
    const executedBy = await resolveActor(req)

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
      stepsResults: safeResult.stepResults || [],
    }

    if (executedBy) {
      executionData.executedBy = executedBy
      executionData.createdBy = executedBy
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
      executedBy: row.executedBy || row.createdBy || null,
      executedByName:
        getActorName(row.executedBy) ||
        getActorName(row.createdBy) ||
        String(row.userName || '').trim() ||
        'Unknown user',

         // ✅ AJOUTE CES DEUX LIGNES
  executedBy: row.executedBy || row.createdBy || null,
  executedByPicture: row.executedBy?.picture || row.createdBy?.picture || null,
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

    const rawSteps = execution.stepsResults || execution.stepResults || []
    const rawScreenshots = Array.isArray(execution.screenshots)
      ? execution.screenshots.map(normalizeScreenshotEntry).filter(Boolean)
      : []

    const resolvedSteps = rawSteps.length
      ? rawSteps
      : rawScreenshots.map((shot, index) => ({
          index: index + 1,
          step: `Step ${index + 1}`,
          status: 'passed',
          screenshot: shot,
          screenshotPath: shot.publicUrl || shot.path || '',
          actualResult: '',
          expectedResult: '',
          error: '',
        }))

    const steps = resolvedSteps.map((step, index) => ({
      index: step.index || index + 1,

      name: step.step || `Step ${index + 1}`,

      status: step.status,

      screenshotPath:
        step.screenshot?.publicUrl ||
        (typeof step.screenshot === 'string' ? step.screenshot : null) ||
        step.screenshot?.path ||
        (typeof step.screenshotPath === 'string' ? step.screenshotPath : null) ||
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
      executedByName:
        getActorName(execution.executedBy) ||
        getActorName(execution.createdBy) ||
        String(execution.userName || '').trim() ||
        'Unknown user',
      executedBy: execution.executedBy || execution.createdBy || null,
      status: execution.status,
      duration: execution.duration,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      steps,
      stepResults: steps,
      screenshots: rawScreenshots,
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
