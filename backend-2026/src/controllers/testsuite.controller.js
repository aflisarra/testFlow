const mongoose = require('mongoose')
const TestExecution = require('../models/TestExecution.model')
const User = require('../models/user.model')
const testSuiteService = require('../services/testsuite.service')

function getUserId(req) {
  return String(req.user?.userId || req.user?.id || req.user?._id || '').trim()
}

function normalizeActor(req) {
  const source = req?.user || {}
  const firstName = String(source?.firstName || '').trim()
  const lastName = String(source?.lastName || '').trim()
  const name =
    String(source?.fullName || source?.name || source?.nom || '').trim() ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    String(source?.username || source?.email || '').trim()
  const picture = String(source?.picture || source?.avatar || '').trim()
  const userId = getUserId(req)
  if (!userId && !name && !picture) return null
  return { userId: userId || null, name, picture }
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
  const direct = normalizeActor(req)
  if (direct?.name || direct?.picture) return direct

  const userId = getUserId(req)
  if (!userId) return direct

  try {
    const user = await User.findById(userId).select('name picture email').lean()
    if (!user) return direct
    return {
      userId,
      name: String(user.name || user.email || '').trim(),
      picture: String(user.picture || '').trim(),
    }
  } catch {
    return direct
  }
}

function handleError(res, error) {
  return res.status(error.statusCode || 500).json({
    message: error.message || 'Unexpected server error',
  })
}

exports.create = async (req, res) => {
  try {
    const suite = await testSuiteService.createTestSuite({
      ...req.body,
      userId: req.body?.userId || getUserId(req),
    })

    return res.status(201).json(suite)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getAll = async (req, res) => {
  try {
    const suites = await testSuiteService.getAllTestSuites(getUserId(req))
    return res.status(200).json(suites)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getByUser = async (req, res) => {
  try {
    const suites = await testSuiteService.getTestSuitesByUser(getUserId(req) || req.params.userId)
    return res.status(200).json(suites)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getByProject = async (req, res) => {
  try {
    const suites = await testSuiteService.getTestSuitesByProject(req.params.projectId)
    return res.status(200).json(suites)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getById = async (req, res) => {
  try {
    const suite = await testSuiteService.getTestSuiteById(req.params.id)
    return res.status(200).json(suite)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.update = async (req, res) => {
  try {
    const suite = await testSuiteService.updateTestSuite(req.params.id, req.body)
    return res.status(200).json(suite)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.delete = async (req, res) => {
  try {
    await testSuiteService.deleteTestSuite(req.params.id)
    return res.status(200).json({ message: 'Test suite deleted successfully' })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getPlans = async (req, res) => {
  try {
    const result = await testSuiteService.getTestPlansByTestSuiteId(req.params.id)
    return res.status(200).json(result)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.saveSession = async (req, res) => {
  try {
    const suite = await testSuiteService.saveSuiteSession(req.params.id, req.body || {})
    return res.status(200).json({
      message: 'Session saved successfully',
      suite,
    })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.updateStatus = async (req, res) => {
  try {
    const suite = await testSuiteService.updateTestSuiteStatus(req.params.id, req.body?.status)
    return res.status(200).json({ suite })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.updateProject = async (req, res) => {
  try {
    const suite = await testSuiteService.setTestSuiteProject(req.params.id, req.body?.projectId ?? null, {
      viewerUserId: getUserId(req),
      role: req.user?.role,
    })

    return res.status(200).json({ suite })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.save = async (req, res) => {
  try {
    const suite = await testSuiteService.markTestSuiteSaved(req.params.id)
    return res.status(200).json({ suite })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.execute = async (req, res) => {
  try {
    const result = String(req.body?.result || req.body?.status || '').trim()
    if (!result) {
      // Start background execution using Selenium runner if available
      try {
        const TestCase = require('../models/testcase.model')
        const { runTestCase } = require('../services/selenium/selenium.service')

        // fire-and-forget background worker
        ;(async () => {
          try {
            const suiteId = String(req.params.id || '').trim()
            if (!suiteId) return
            console.log('[EXECUTE] Starting background execution for suite', suiteId)
            const cases = await TestCase.find({ testSuiteId: suiteId }).sort({ createdAt: 1 }).lean()
            for (const tc of cases) {
              try {
                console.log('[EXECUTE] Running test case', tc._id || tc.id || tc.title)
                const result = await runTestCase(tc)
                const actor = await resolveActor(req)
                // persist execution similar to selenium.controller.runTestCaseHandler
                const executionId = `EX-${Date.now()}-${String(tc.id || tc._id || '').slice(-6)}`
                const stepsResults = Array.isArray(result.stepResults)
                  ? result.stepResults.map((step) => ({
                      index: step.index || 0,
                      step: String(step.step || step.name || ''),
                      status:
                        step.status === 'passed'
                          ? 'passed'
                          : step.status === 'failed_assertion'
                            ? 'failed_assertion'
                            : 'failed_execution',
                      actualResult: String(step.actualResult || ''),
                      expectedResult: String(step.expectedResult || ''),
                      error: String(step.error || ''),
                      screenshot: step.screenshot || null,
                      screenshotPath:
                        step.screenshot?.publicUrl ||
                        step.screenshot?.path ||
                        (typeof step.screenshot === 'string' ? step.screenshot : ''),
                    }))
                  : []
                await TestExecution.create({
                  executionId,
                  testSuiteId: new mongoose.Types.ObjectId(suiteId),
                  planId: mongoose.Types.ObjectId.isValid(String(tc.planId || '')) ? new mongoose.Types.ObjectId(String(tc.planId)) : null,
                  testCaseId: null,
                  planKey: String(tc.planId || ''),
                  testCaseKey: String(tc.id || ''),
                  planTitle: String(tc.planTitle || ''),
                  testCaseTitle: String(tc.title || ''),
                  executionModel: tc.executionModel || null,
                  executedBy: actor,
                  createdBy: actor,
                  status:
  result.status === 'passed'
    ? 'passed'
    : result.status === 'failed_assertion'
      ? 'failed_assertion'
      : 'failed_execution',
                  duration: Array.isArray(result.stepResults) ? result.stepResults.length : 0,
                  startedAt: new Date(),
                  finishedAt: new Date(),
                  logs: Array.isArray(result.logs) ? result.logs : [],
                  screenshots: Array.isArray(result.screenshots) ? result.screenshots : [],
                  stepsResults,
                  stepResults: stepsResults,
                })
                console.log('[EXECUTE] Test case saved:', executionId)
              } catch (tcErr) {
                console.error('[EXECUTE] Test case execution error:', tcErr)
              }
            }
            console.log('[EXECUTE] Background execution finished for suite', suiteId)
          } catch (bgErr) {
            console.error('[EXECUTE] Background execution failed:', bgErr)
          }
        })()
      } catch (e) {
        console.warn('[EXECUTE] Selenium runner not available:', e?.message || e)
        return res.status(501).json({ message: 'Execution not implemented. Selenium runner not available.' })
      }

      return res.status(202).json({ message: 'Execution started' })
    }

    const suite = await testSuiteService.updateTestSuiteStatus(req.params.id, result)
    return res.status(200).json({ suite })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getExecutions = async (req, res) => {
  try {
    const {
      status,
      project,
      testSuiteId,
      planId,
      testCaseId,
      executionState,
      days,
      page = 1,
      limit = 10
    } = req.query

    console.log('🔎 FILTER QUERY:', req.query)

    const filter = {}

    // ✅ FILTER BY PROJECT
    if (project && mongoose.Types.ObjectId.isValid(project)) {
      const suites = await require('../models/testsuite')
        .find({ projectId: project })
        .select('_id')
        .lean()

      const suiteIds = suites.map(s => s._id)

      filter.testSuiteId = { $in: suiteIds }
    }

    // ✅ FILTER BY SUITE
    if (testSuiteId && mongoose.Types.ObjectId.isValid(testSuiteId)) {
      filter.testSuiteId = new mongoose.Types.ObjectId(testSuiteId)
    }

    // ✅ FILTER BY PLAN
    if (planId && mongoose.Types.ObjectId.isValid(planId)) {
      filter.planId = new mongoose.Types.ObjectId(planId)
    }

    // ✅ FILTER BY TEST CASE (IMPORTANT 🔥)
    if (testCaseId) {
      filter.testCaseKey = String(testCaseId)
    }

    // ✅ FILTER BY STATUS
    if (status) {
      filter.status = status
    }

    // ✅ FILTER BY EXECUTION STATE (optional)
    if (executionState) {
      if (executionState === 'running') {
        filter.finishedAt = null
      }
      if (executionState === 'finished') {
        filter.finishedAt = { $ne: null }
      }
    }

    // ✅ FILTER BY DATE
    if (days) {
      const date = new Date()
      date.setDate(date.getDate() - Number(days))
      filter.startedAt = { $gte: date }
    }

    // ✅ PAGINATION
    const skip = (Number(page) - 1) * Number(limit)

    const [rows, total] = await Promise.all([

      require('../models/TestExecution.model')
        .find(filter)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),

      require('../models/TestExecution.model')
        .countDocuments(filter)

    ])

    // ✅ FORMAT RESULT
    const data = rows.map(row => ({
      executionId: row.executionId,
      testSuiteId: String(row.testSuiteId || ''),
      planId: String(row.planId || ''),
      planTitle: row.planTitle || '',
      testCaseId: String(row.testCaseId || ''),
      testCaseKey: row.testCaseKey || '',
      testCaseTitle: row.testCaseTitle || '',
      status: row.status,
      duration: row.duration,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      executedBy: row.executedBy || row.createdBy || null,
      executedByName:
        getActorName(row.executedBy) ||
        getActorName(row.createdBy) ||
        getActorName(row.user) ||
        String(row.userName || '').trim() ||
        ''
    }))

    return res.status(200).json({
      total,
      data
    })

  } catch (error) {
    console.error('🔥 getExecutions error:', error)
    return res.status(500).json({ message: error.message })
  }
}

exports.getRecentExecutions = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit || 20), 1), 100)
    const rows = await TestExecution.find({})
      .sort({ startedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean()

    return res.status(200).json(rows.map((row) => ({
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
      updatedAt: row.updatedAt,
      executedBy: row.executedBy || row.createdBy || null,
      executedByName:
        getActorName(row.executedBy) ||
        getActorName(row.createdBy) ||
        getActorName(row.user) ||
        String(row.userName || '').trim() ||
        '',
    })))
  } catch (error) {
    return handleError(res, error)
  }
}
