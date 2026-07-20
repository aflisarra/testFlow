const mongoose = require('mongoose')
const TestExecution = require('../models/TestExecution.model')
const TestSuite = require('../models/testsuite')
const TestPlan = require('../models/testplan.model')
const Project = require('../models/project.model')
const ProjectInvitation = require('../models/projectInvitation.model')
const User = require('../models/user.model')
const { runTestCase } = require('../services/selenium/selenium.service')
const { cancelExecution } = require('../services/selenium/cancellation.manager')
const { buildTestSuiteReportPdf } = require('../services/selenium/report.service')
const  MESSAGES = require('../constants/messages.js')
// ✅ AJOUT
const testCaseService = require('../services/testcase.service')

function normalizeUserPreview(user) {
  if (!user) return null
  const source = user?.user && typeof user.user === MESSAGES.CONSOLE.OBJECT ? user.user : user
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
  if (typeof screenshot === MESSAGES.CONSOLE.STRING) {
    const value = screenshot.trim()
    if (!value) return null
    return {
      filename: '',
      path: value,
      publicUrl: value,
      createdAt: '',
    }
  }
  if (typeof screenshot === MESSAGES.CONSOLE.OBJECT) {
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
    const user = await User.findById(userId).select(MESSAGES.USER.NAME_PICTURE).lean()
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
        return res.status(404).json({ status: MESSAGES.STATUSTEST.ERROR, message: MESSAGES.TESTCASES.NO_TEST_CASES })
      }
      testCase = casesFromDB[0]
    }

    if (!testCase || !Array.isArray(testCase.steps) || !testCase.steps.length) {
      return res.status(400).json({ status: MESSAGES.STATUSTEST.ERROR, message: MESSAGES.TESTCASES.STEPS_REQUIRED })
    }

    // ─── Passe l'executionId au service ────────────────────────────────────
    const result = await runTestCase({ ...testCase, executionId: generatedExecutionId })

    const safeResult = result || { status: MESSAGES.STATUSTEST.FAILED_EXECUTION, logs: [], stepResults: [] }
    const finishedAt = new Date()
    const duration = Math.round((Date.now() - startedAt) / 1000)
    const suiteId = testCase?.testSuiteId || null
    const isValidSuite = suiteId && mongoose.Types.ObjectId.isValid(suiteId)

    const executionData = {
      executionId: generatedExecutionId,   // ← même ID
      testCaseTitle: testCase.title || '',
      planKey: testCase.planId ? String(testCase.planId) : '',
      planTitle: testCase.planTitle || '',
      status: safeResult.status === MESSAGES.STATUSTEST.PASSED ? MESSAGES.STATUSTEST.PASSED
        : safeResult.status === MESSAGES.STATUSTEST.ABORTED ? MESSAGES.STATUSTEST.ABORTED     // ← ajoute aborted
        : safeResult.status === MESSAGES.STATUSTEST.FAILED_ASSERTION ? MESSAGES.STATUSTEST.FAILED_ASSERTION
        : MESSAGES.STATUSTEST.FAILED_EXECUTION,
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
        console.error(MESSAGES.SELENIUM.EXECTION_FAILED_SAVE, dbErr)
      }
    }

    return res.json({ 
  status: safeResult.status, 
  data: safeResult,
  executionId: generatedExecutionId,  // ← ajoute cette ligne
})

  } catch (err) {
    console.error(MESSAGES.TESTPLAN.CONTROLLER_ERROR, err)
    return res.status(500).json({ status: MESSAGES.STATUSTEST.ERROR, message: err.message })
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
    const viewerUserId = String(req.user?.userId || req.user?.id || req.user?._id || '').trim()

    // Do not expose inaccessible executions in history/analytics. We narrow
    // the database query to suites belonging to a project the user owns or is
    // assigned to; personal suites are visible only to their creator.
    if (!viewerUserId) {
      return res.json({ success: true, data: [], total: 0, page, limit })
    }

    const acceptedInvitations = await ProjectInvitation.find({
      userId: viewerUserId,
      status: 'accepted',
    }).select('projectId').lean()
    const acceptedProjectIds = acceptedInvitations.map((invitation) => invitation.projectId)
    const accessibleProjects = await Project.find({
      $or: [{ ownerId: viewerUserId }, { _id: { $in: acceptedProjectIds } }],
    }).select('_id').lean()
    const accessibleProjectIds = accessibleProjects.map((project) => project._id)
    const accessibleSuites = await TestSuite.find({
      $or: [
        { projectId: { $in: accessibleProjectIds } },
        { projectId: null, userId: viewerUserId },
      ],
    }).select('_id').lean()
    query.testSuiteId = { $in: accessibleSuites.map((suite) => suite._id) }

    // ✅ STATUS
    if (status) {
      query.status = String(status).trim()
    }

    // ✅ SUITE
    if (testSuiteId && mongoose.Types.ObjectId.isValid(testSuiteId)) {
      const requestedSuiteId = String(testSuiteId)
      const isAccessible = accessibleSuites.some((suite) => String(suite._id) === requestedSuiteId)
      query.testSuiteId = isAccessible
        ? new mongoose.Types.ObjectId(requestedSuiteId)
        : { $in: [] }
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
        .select(MESSAGES.USER.ID)
        .lean()

      const suiteIds = suites.map((s) => s._id)

      query.testSuiteId = { $in: suiteIds.filter((suiteId) => accessibleSuites.some((suite) => String(suite._id) === String(suiteId))) }
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

    console.log(MESSAGES.CONSOLE.FILTER_QUERY, query)

    const skip = (page - 1) * limit

    const [executions, total] = await Promise.all([
      TestExecution.find(query)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      TestExecution.countDocuments(query)
    ])

    // Execution documents only keep the suite id. Resolve the suite and its
    // project once for this page so the dashboard can display database names.
    const suiteIds = [...new Set(executions.map((row) => String(row.testSuiteId || '')).filter(Boolean))]
    const suites = suiteIds.length
      ? await TestSuite.find({ _id: { $in: suiteIds } }).populate('projectId', 'title').lean()
      : []
    const suitesById = new Map(suites.map((suite) => [String(suite._id), suite]))

    const planIds = [...new Set(executions.map((row) => String(row.planId || '')).filter(Boolean))]
    const mongoPlanIds = planIds.filter((id) => mongoose.Types.ObjectId.isValid(id))
    const plans = planIds.length
      ? await TestPlan.find({
          $or: [
            ...(mongoPlanIds.length ? [{ _id: { $in: mongoPlanIds } }] : []),
            { id: { $in: planIds } },
          ],
        }).select('_id id title').lean()
      : []
    const plansById = new Map()
    plans.forEach((plan) => {
      plansById.set(String(plan._id), plan)
      plansById.set(String(plan.id), plan)
    })

    const data = executions.map((row) => {
      const suite = suitesById.get(String(row.testSuiteId || ''))
      const project = suite?.projectId && typeof suite.projectId === 'object' ? suite.projectId : null
      const plan = plansById.get(String(row.planId || ''))

      return {
      executionId: row.executionId,
      testSuiteId: String(row.testSuiteId || ''),
      testSuiteName: suite?.nom || suite?.nametest || '',
      projectName: project?.title || '',
      planId: String(row.planId || ''),
      planKey: row.planKey || '',
      // The plan document is the source of truth; older executions may have
      // stored the plan identifier in planTitle.
      planTitle: plan?.title || row.planTitle || '',
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
      executedByPicture: row.executedBy?.picture || row.createdBy?.picture || null,
    }
    })

    return res.json({
      success: true,
      data,
      total,
      page,
      limit
    })

  } catch (err) {
    console.error(MESSAGES.SELENIUM.GET_EXECUTIONS_ERROR, err)

    return res.status(500).json({
      success: false,
      message: MESSAGES.SELENIUM.ERROR_FETCHING
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
      return res.status(404).json({ message: MESSAGES.SELENIUM.NOT_FOUND })
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
          status: MESSAGES.STATUSTEST.PASSED,
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
        (typeof step.screenshot === MESSAGES.CONSOLE.STRING ? step.screenshot : null) ||
        step.screenshot?.path ||
        (typeof step.screenshotPath === MESSAGES.CONSOLE.STRING ? step.screenshotPath : null) ||
        null,

      screenshot: step.screenshot || null,

      message: step.error || '',

      actualResult: step.actualResult || '',

      expectedResult: step.expectedResult || ''
    }))

    console.log(MESSAGES.SELENIUM.DETAILS_SENT, steps)

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
    console.error(MESSAGES.SELENIUM.GET_EXECUTION_DETAIL_ERROR, error)
    res.status(500).json({ message: error.message })
  }
}

// Ajoute cette fonction
async function abortExecution(req, res) {
  try {
    const { executionId } = req.params

    if (!executionId) {
      return res.status(400).json({ message: MESSAGES.SELENIUM.EXECUTION_ID_REQUIRED })
    }

    // ─── Annule le process Selenium en cours ───────────────────────────────
    const wasCancelled = cancelExecution(executionId)
    console.log(`🛑 Abort requested for ${executionId} — cancelled: ${wasCancelled}`)

    // ─── Met à jour le statut en DB ────────────────────────────────────────
    const updated = await TestExecution.findOneAndUpdate(
      { executionId },
      { $set: { status: MESSAGES.STATUSTEST.ABORTED, finishedAt: new Date() } },
      { new: true }
    ).lean()

    return res.json({
      success: true,
      status: MESSAGES.STATUSTEST.ABORTED,
      executionId,
      found: Boolean(updated),
    })
  } catch (err) {
    console.error(MESSAGES.SELENIUM.ABORT_EXECUTION_ERROR, err)
    return res.status(500).json({ message: err.message })
  }
}

async function downloadTestSuiteReport(req, res) {
  try {
    const testSuiteId = String(req.params.testSuiteId || '').trim()
    if (!mongoose.Types.ObjectId.isValid(testSuiteId)) {
      return res.status(400).json({ message: MESSAGES.TESTSUITE.TESTSUITE_ID_REQUIRED})
    }

    const pdfBuffer = await buildTestSuiteReportPdf(testSuiteId)
    const fileName = `test-suite-report-${testSuiteId}.pdf`

    res.setHeader(MESSAGES.DOC.CONTENT_TYPE, MESSAGES.DOC.APPLICATION_PDF)
    res.setHeader(MESSAGES.DOC.CONTENT_DISPOSITION, `attachment; filename="${fileName}"`)
    return res.status(200).send(pdfBuffer)
  } catch (error) {
    const status = error?.statusCode || 500
    return res.status(status).json({ message: error.message || MESSAGES.DOC.FAILED_GENERATE_REPORT })
  }
}

async function getTrend(req, res) {
  try {
    const days = Number(req.query.days) || 7
    const { project, testSuiteId, planId } = req.query

    const since = new Date()
    since.setDate(since.getDate() - (days - 1))
    since.setHours(0, 0, 0, 0)

    const match = { startedAt: { $gte: since } }

    if (testSuiteId && mongoose.Types.ObjectId.isValid(testSuiteId)) {
      match.testSuiteId = new mongoose.Types.ObjectId(testSuiteId)
    } else if (project && mongoose.Types.ObjectId.isValid(project)) {
      const TestSuite = require('../models/testsuite')
      const suites = await TestSuite.find({ projectId: new mongoose.Types.ObjectId(project) })
        .select(MESSAGES.USER.ID)
        .lean()
      match.testSuiteId = { $in: suites.map((s) => s._id) }
    }

    if (planId && mongoose.Types.ObjectId.isValid(planId)) {
      match.planId = new mongoose.Types.ObjectId(planId)
    }

    const raw = await TestExecution.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: MESSAGES.DATE.FORME_DATE, date: MESSAGES.DATE.START_DATE } },
            status: MESSAGES.DATE.STATUS,
          },
          count: { $sum: 1 },
        },
      },
    ])

    const dayList = []
    for (let i = 0; i < days; i++) {
      const d = new Date(since)
      d.setDate(d.getDate() + i)
      dayList.push(d.toISOString().slice(0, 10))
    }

    const data = dayList.map((day) => {
      const passed = raw.find((r) => r._id.day === day && r._id.status === MESSAGES.STATUSTEST.PASSED)?.count || 0
      const failed = raw
        .filter((r) => r._id.day === day && r._id.status === MESSAGES.STATUSTEST.FAIL)
        .reduce((sum, r) => sum + r.count, 0)
      return { day, passed, failed }
    })

    return res.json({ data })
  } catch (error) {
    console.error('❌ getTrend:', error)
    return res.status(500).json({ message: error.message })
  }
}

async function getTypeBreakdown(req, res) {
  try {
    const filters = {
      testSuiteId: req.query.testSuiteId,
      planId: req.query.planId,
    }
    const data = await testCaseService.getTypeBreakdown(filters)
    return res.json({ data })
  } catch (error) {
    console.error('❌ getTypeBreakdown:', error)
    return res.status(500).json({ message: error.message })
  }
}

module.exports = {
  runTestCaseHandler,
  getExecutions,
  getExecutionDetail: exports.getExecutionDetail,
  abortExecution,   
  downloadTestSuiteReport,
  getTypeBreakdown,
  getTrend
}
