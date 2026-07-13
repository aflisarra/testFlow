const mongoose = require('mongoose')
const TestExecution = require('../models/TestExecution.model')
const User = require('../models/user.model')
const { runTestCase } = require('../services/selenium/selenium.service')
const { cancelExecution } = require('../services/selenium/cancellation.manager')
const { buildTestSuiteReportPdf } = require('../services/selenium/report.service')

// ✅ AJOUT
const testCaseService = require('../services/testcase.service')

function normalizeUserPreview(user) {
  if (!user) return null
  const source = user?.user && typeof user.user === 'object' ? user.user : user
  const firstName = String(source?.firstName || '').trim()
  const lastName = String(source?.lastName || '').trim()
  const fullName = String(source?.fullName || source?.name || source?.nom || '').trim()
  const name =
    fullName ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    String(source?.username || source?.email || '').trim()
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
  const firstName = String(actor?.firstName || '').trim()
  const lastName = String(actor?.lastName || '').trim()
  return String(
    actor?.fullName ||
    actor?.name ||
    actor?.nom ||
    actor?.username ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    actor?.email ||
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
        const generatedExecutionId = body.executionId || `EX-${Date.now()}`
 // ← généré ICI

    let testCase = body.testCase || body

    const startedAt = Date.now()
    const executedBy = await resolveActor(req)

    if (body.testCaseId) {
      const requestedCaseId = String(body.testCaseId || '').trim()
      const allCases = await testCaseService.getByPlan(body.planId)
      const matchedCase = allCases.find((tc) => String(tc?._id || tc?.id || '').trim() === requestedCaseId)
      if (matchedCase) {
        testCase = matchedCase
      }
    } else if (body.planId) {
      const casesFromDB = await testCaseService.getByPlan(body.planId)
      if (!casesFromDB.length) {
        return res.status(404).json({ status: 'error', message: 'No test cases found for this plan' })
      }
      testCase = casesFromDB[0]
    }

    if (!testCase || !Array.isArray(testCase.steps) || !testCase.steps.length) {
      return res.status(400).json({ status: 'error', message: 'testCase.steps is required' })
    }

    // ─── Passe l'executionId au service ────────────────────────────────────
    const result = await runTestCase({ ...testCase, executionId: generatedExecutionId })

    const safeResult = result || { status: 'failed_execution', logs: [], stepResults: [] }
    const finishedAt = new Date()
    const duration = Math.round((Date.now() - startedAt) / 1000)
    const suiteId = testCase?.testSuiteId || null
    const isValidSuite = suiteId && mongoose.Types.ObjectId.isValid(suiteId)

    const executionData = {
      executionId: generatedExecutionId,   // ← même ID
      testCaseTitle: testCase.title || '',
      planKey: testCase.planId ? String(testCase.planId) : '',
      planTitle: testCase.planTitle || '',
      status: safeResult.status === 'passed' ? 'passed'
        : safeResult.status === 'aborted' ? 'aborted'       // ← ajoute aborted
        : safeResult.status === 'failed_assertion' ? 'failed_assertion'
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
    if (testCase.id) executionData.testCaseKey = String(testCase.id)

    if (isValidSuite) {
      executionData.testSuiteId = new mongoose.Types.ObjectId(suiteId)
      if (testCase.planId && mongoose.Types.ObjectId.isValid(testCase.planId)) {
        executionData.planId = new mongoose.Types.ObjectId(testCase.planId)
      }
      try {
        await TestExecution.create(executionData)
      } catch (dbErr) {
        console.error('⚠️ Execution save failed:', dbErr)
      }
    }

    return res.json({ 
  status: safeResult.status, 
  data: safeResult,
  executionId: generatedExecutionId,  // ← ajoute cette ligne
})

  } catch (err) {
    console.error('❌ CONTROLLER ERROR:', err)
    return res.status(500).json({ status: 'error', message: err.message })
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
        getActorName(row.user) ||
        String(row.userName || '').trim() ||
        '',

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
        getActorName(execution.user) ||
        String(execution.userName || '').trim() ||
        '',
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

// Ajoute cette fonction
async function abortExecution(req, res) {
  try {
    const { executionId } = req.params

    if (!executionId) {
      return res.status(400).json({ message: 'executionId required' })
    }

    // ─── Annule le process Selenium en cours ───────────────────────────────
    const wasCancelled = cancelExecution(executionId)
    console.log(`🛑 Abort requested for ${executionId} — cancelled: ${wasCancelled}`)

    // ─── Met à jour le statut en DB ────────────────────────────────────────
    const updated = await TestExecution.findOneAndUpdate(
      { executionId },
      { $set: { status: 'aborted', finishedAt: new Date() } },
      { new: true }
    ).lean()

    return res.json({
      success: true,
      status: 'aborted',
      executionId,
      found: Boolean(updated),
    })
  } catch (err) {
    console.error('❌ abortExecution:', err)
    return res.status(500).json({ message: err.message })
  }
}

async function downloadTestSuiteReport(req, res) {
  try {
    const testSuiteId = String(req.params.testSuiteId || '').trim()
    if (!mongoose.Types.ObjectId.isValid(testSuiteId)) {
      return res.status(400).json({ message: 'Valid testSuiteId required' })
    }

    const pdfBuffer = await buildTestSuiteReportPdf(testSuiteId)
    const fileName = `test-suite-report-${testSuiteId}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    return res.status(200).send(pdfBuffer)
  } catch (error) {
    const status = error?.statusCode || 500
    return res.status(status).json({ message: error.message || 'Failed to generate report' })
  }
}

// Ajoute à module.exports
module.exports = {
  runTestCaseHandler,
  getExecutions,
  getExecutionDetail: exports.getExecutionDetail,
  abortExecution,   // ← ajoute ici
  downloadTestSuiteReport,
}
