const mongoose = require('mongoose')

const Project = require('../models/project.model')
const TestSuite = require('../models/testsuite')
const TestPlan = require('../models/testplan.model')
const TestCase = require('../models/testcase.model')
const {
  hasOwn,
  normalizeRequirements,
  normalizeString,
  normalizeStringList,
  normalizeTestData,
  validatePriority,
  validateSeverity,
  validateTestCaseType,
} = require('../utils/test-artifact-fields')

const TEST_STATUS_VALUES = new Set(['Draft', 'Generating', 'Incomplete', 'Ready', 'Passed', 'Failed'])
const PLAN_STATUS_VALUES = new Set(['pending', 'generating', 'reviewing', 'confirmed', 'completed', 'incomplete'])
const VALIDATION_PLAN_STATUS_VALUES = new Set(['pending', 'generating', 'reviewing', 'confirmed', 'rejected'])
const EXECUTION_PLAN_STATUS_VALUES = new Set(['completed', 'incomplete'])

function makeError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizeTestStatus(value) {
  const raw = String(value || '').trim()
  return [...TEST_STATUS_VALUES].find((status) => status.toLowerCase() === raw.toLowerCase()) || ''
}

function normalizeSessionStatus(value) {
  return String(value || '').toLowerCase().trim() === 'complete'
    ? 'complete'
    : 'incomplete'
}

function normalizeCompletionStatus(value) {
  return normalizeSessionStatus(value) === 'complete' ? 'completed' : 'incomplete'
}

function normalizePlanStatusValue(value, fallback = 'incomplete') {
  const raw = String(value || '').toLowerCase().trim()

  if (PLAN_STATUS_VALUES.has(raw))
    return raw

  return fallback
}

function normalizeValidationPlanStatusValue(value, fallback = 'pending') {
  const raw = String(value || '').toLowerCase().trim()
  if (VALIDATION_PLAN_STATUS_VALUES.has(raw)) return raw
  if (raw === 'ready' || raw === 'completed' || raw === 'complete' || raw === 'validated') return 'confirmed'
  if (raw === 'incomplete' || raw === 'invalid' || raw === 'draft') return 'pending'
  return fallback
}

function normalizeExecutionPlanStatusValue(value, fallback = 'incomplete') {
  const raw = String(value || '').toLowerCase().trim()
  if (EXECUTION_PLAN_STATUS_VALUES.has(raw)) return raw
  if (raw === 'ready' || raw === 'complete' || raw === 'validated' || raw === 'confirmed') return 'completed'
  return fallback
}

function normalizeStatusRows(statuses = {}, normalizeStatus = normalizePlanStatusValue) {
  const normalizeRow = (planId, status) => {
    const normalizedPlanId = String(planId || '').trim()
    if (!normalizedPlanId) return null
    return {
      planId: normalizedPlanId,
      status: normalizeStatus(status),
    }
  }

  if (Array.isArray(statuses)) {
    return statuses
      .map((row) => normalizeRow(row?.planId, row?.status))
      .filter(Boolean)
  }

  return Object.entries(statuses || {})
    .map(([planId, status]) => normalizeRow(planId, status))
    .filter(Boolean)
}

function normalizePlanStatuses(planStatuses = {}) {
  return normalizeStatusRows(planStatuses, normalizePlanStatusValue)
}

function normalizeValidationPlanStatuses(planStatuses = {}) {
  return normalizeStatusRows(planStatuses, normalizeValidationPlanStatusValue)
}

function normalizeExecutionPlanStatuses(planStatuses = {}) {
  return normalizeStatusRows(planStatuses, normalizeExecutionPlanStatusValue)
}

function mergePlanStatuses({ existingStatuses = [], incomingStatuses = [], testPlans = [] } = {}) {
  const byPlanId = new Map()

  for (const row of normalizePlanStatuses(existingStatuses)) {
    byPlanId.set(row.planId, row.status)
  }

  for (const row of normalizePlanStatuses(incomingStatuses)) {
    byPlanId.set(row.planId, row.status)
  }

  return (Array.isArray(testPlans) ? testPlans : [])
    .map((plan) => {
      const planId = String(plan?._id || plan?.id || '').trim()
      if (!planId) return null

      const casesCount = Number(plan?.casesCount || 0)
      const currentStatus = byPlanId.get(planId) || (casesCount > 0 ? 'completed' : 'incomplete')
      const normalizedStatus = normalizePlanStatusValue(currentStatus, casesCount > 0 ? 'completed' : 'incomplete')
      return {
        planId,
        status:
          casesCount > 0 && ['pending', 'generating', 'incomplete'].includes(normalizedStatus)
            ? 'completed'
            : normalizedStatus,
      }
    })
    .filter(Boolean)
}

function mergeValidationPlanStatuses({ existingStatuses = [], incomingStatuses = [], testPlans = [] } = {}) {
  const byPlanId = new Map()

  for (const row of normalizeValidationPlanStatuses(existingStatuses)) {
    byPlanId.set(row.planId, row.status)
  }

  for (const row of normalizeValidationPlanStatuses(incomingStatuses)) {
    byPlanId.set(row.planId, row.status)
  }

  return (Array.isArray(testPlans) ? testPlans : [])
    .map((plan) => {
      const planId = String(plan?.id || plan?.planId || '').trim()
      if (!planId) return null
      return {
        planId,
        status: byPlanId.get(planId) || 'pending',
      }
    })
    .filter(Boolean)
}

function mergeExecutionPlanStatuses({ existingStatuses = [], incomingStatuses = [], testPlans = [] } = {}) {
  const byPlanId = new Map()

  for (const row of normalizeExecutionPlanStatuses(existingStatuses)) {
    byPlanId.set(row.planId, row.status)
  }

  for (const row of normalizeExecutionPlanStatuses(incomingStatuses)) {
    byPlanId.set(row.planId, row.status)
  }

  return (Array.isArray(testPlans) ? testPlans : [])
    .map((plan) => {
      const planId = String(plan?.id || plan?.planId || '').trim()
      if (!planId) return null
      return {
        planId,
        status: byPlanId.get(planId) || 'incomplete',
      }
    })
    .filter(Boolean)
}

function getSuiteCompletionFromPlanCases({ plansCount = 0, plansHavingTestCases = 0 } = {}) {
  const isComplete = plansCount > 0 && plansHavingTestCases === plansCount
  return {
    isComplete,
    testStatus: isComplete ? 'Ready' : 'Incomplete',
    sessionStatus: isComplete ? 'complete' : 'incomplete',
    completionStatus: isComplete ? 'completed' : 'incomplete',
  }
}

function logSuiteStatusRecalculation({ plansCount, plansHavingTestCases, calculatedSuiteStatus, planStatuses }) {
  console.log('[TestSuite status] total plans count:', plansCount)
  console.log('[TestSuite status] plans having test cases:', plansHavingTestCases)
  console.log('[TestSuite status] calculated suite status:', calculatedSuiteStatus)
  console.log('[TestSuite status] planStatuses payload before MongoDB update:', planStatuses)
}

function normalizeCreatedBy(value) {
  if (!value) return null
  return {
    userId: value.userId && mongoose.Types.ObjectId.isValid(String(value.userId)) ? value.userId : null,
    name: String(value.name || '').trim(),
    picture: String(value.picture || '').trim(),
  }
}

function normalizePlanMetadata(plan = {}) {
  return {
    objective: normalizeString(plan?.objective),
    scope: normalizeString(plan?.scope),
    priority: validatePriority(plan?.priority),
    requirements: normalizeRequirements(plan?.requirements),
  }
}

function normalizeCaseMetadata(testCase = {}) {
  const rawTestData = hasOwn(testCase, 'test_data') ? testCase.test_data : testCase?.testData

  return {
    objective: normalizeString(testCase?.objective),
    preconditions: normalizeStringList(testCase?.preconditions),
    test_data: normalizeTestData(rawTestData),
    priority: validatePriority(testCase?.priority),
    severity: validateSeverity(testCase?.severity),
    type: validateTestCaseType(testCase?.type),
    requirements: normalizeRequirements(testCase?.requirements),
  }
}

function normalizeStepDetails(value, fallbackSteps = []) {
  const source = Array.isArray(value) ? value : []

  if (source.length) {
    return source.map((item, index) => ({
      step: normalizeString(item?.step || item?.raw || item?.title || fallbackSteps[index] || `Step ${index + 1}`),
      expected_result: normalizeString(item?.expected_result || item?.expectedResult || item?.expected || ''),
      actual_result: normalizeString(item?.actual_result || item?.actualResult || ''),
      status: normalizeString(item?.status || 'pending') || 'pending',
    }))
  }

  return fallbackSteps.map((step, index) => ({
    step: normalizeString(step || `Step ${index + 1}`),
    expected_result: '',
    actual_result: '',
    status: 'pending',
  }))
}

function getPopulatedProject(suite) {
  return suite?.projectId && typeof suite.projectId === 'object' ? suite.projectId : null
}

function formatSuiteSummary(
  suite,
  { plansCount = 0, testCasesCount = 0, plansHavingTestCases = 0, canOpen = true } = {}
) {
  const project = getPopulatedProject(suite)
  const user = suite?.userId && typeof suite.userId === 'object' ? suite.userId : null
  const completion = getSuiteCompletionFromPlanCases({ plansCount, plansHavingTestCases })

  return {
    ...suite,
    projectId: project ?? suite?.projectId ?? null,
    projectTitle: project ? String(project.title || '').trim() : '',
    creatorName: user?.name || user?.email || 'Unknown User',
    picture: user?.picture || null,
    canOpen,
    totalTestCases: testCasesCount,
    totalCases: testCasesCount,
    casesCount: testCasesCount,
    plansCount,
    plansHavingTestCases,
    status: completion.completionStatus,
  }
}

async function getSuitePlansAndCases(testSuiteId) {
  const plans = await TestPlan.find({ testSuiteId }).sort({ createdAt: 1 }).lean()
  const cases = await TestCase.find({ testSuiteId }).sort({ createdAt: 1 }).lean()
  const casesByMongoPlanId = new Map()

  for (const testCase of cases) {
    const key = String(testCase.planId || '')
    if (!casesByMongoPlanId.has(key)) casesByMongoPlanId.set(key, [])
    casesByMongoPlanId.get(key).push(testCase)
  }

  const testPlans = plans.map((plan) => {
    const testCases = casesByMongoPlanId.get(String(plan._id)) || []
    return {
      _id: plan._id,
      id: plan.id,
      title: plan.title,
      description: plan.description || '',
      objective: plan.objective || '',
      scope: plan.scope || '',
      priority: plan.priority || 'medium',
      requirements: plan.requirements || [],
      casesCount: testCases.length,
      testCases: testCases.map((testCase) => ({
        ...testCase,
        test_data: Array.isArray(testCase.test_data)
          ? testCase.test_data
          : testCase.test_data != null
            ? [testCase.test_data]
            : [],
        stepDetails: Array.isArray(testCase.stepDetails) ? testCase.stepDetails : [],
      })),
    }
  })

 
const testCasesByPlan = plans.map((plan) => ({
  planId: plan.id, 
  testCases: (casesByMongoPlanId.get(String(plan._id)) || []).map((testCase) => ({
    ...testCase,
    test_data: Array.isArray(testCase.test_data)
      ? testCase.test_data
      : testCase.test_data != null
        ? [testCase.test_data]
        : [],
    stepDetails: Array.isArray(testCase.stepDetails) ? testCase.stepDetails : [],
  })),
}))

  const plansHavingTestCases = plans.filter((plan) => (casesByMongoPlanId.get(String(plan._id)) || []).length > 0).length

  return { testPlans, testCasesByPlan, plansCount: plans.length, testCasesCount: cases.length, plansHavingTestCases }
}

async function getSuiteOrThrow(testSuiteId) {
  if (!mongoose.Types.ObjectId.isValid(String(testSuiteId || ''))) {
    throw makeError('Invalid TestSuite ID', 400)
  }

  const suite = await TestSuite.findById(testSuiteId)
    .populate({
  path: 'projectId',
  select: 'title startDate endDate milestoneDate assignedUsers ownerId',
  populate: [
    { path: 'assignedUsers', select: 'name email picture' },
    { path: 'ownerId', select: 'name email picture' }
  ]
})
    .populate('userId', 'name email picture')
    .lean()

  if (!suite) throw makeError('TestSuite not found', 404)
  return suite
}

async function getAllTestSuites(viewerUserId = '') {
  const suites = await TestSuite.find()
    .populate('projectId', 'title')
    .populate('userId', 'name email picture')
    .sort({ createdAt: -1 })
    .lean()

  return Promise.all(
    suites.map(async (suite) => {
      const planData = await getSuitePlansAndCases(suite._id)
      const canOpen = !viewerUserId || String(suite?.userId?._id || suite?.userId) === String(viewerUserId)
      return formatSuiteSummary(suite, { ...planData, canOpen })
    })
  )
}

async function getTestSuitesByUser(userId) {
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) throw makeError('User ID is required', 400)

  const projects = await Project.find({
    $or: [{ ownerId: safeUserId }, { assignedUsers: safeUserId }],
  }).select('_id').lean()
  const projectIds = projects.map((project) => project._id)

  const suites = await TestSuite.find({
    $or: [{ projectId: { $in: projectIds } }, { projectId: null, userId: safeUserId }],
  })
    .populate('projectId', 'title')
    .populate('userId', 'name email picture')
    .sort({ createdAt: -1 })
    .lean()

  return Promise.all(
    suites.map(async (suite) => {
      const planData = await getSuitePlansAndCases(suite._id)
      return formatSuiteSummary(suite, { ...planData, canOpen: true })
    })
  )
}

async function getTestSuitesByProject(projectId) {
  if (!mongoose.Types.ObjectId.isValid(String(projectId || ''))) {
    throw makeError('Invalid project ID', 400)
  }

  const suites = await TestSuite.find({ projectId })
    .populate('projectId', 'title')
    .populate('userId', 'name email picture')
    .sort({ createdAt: -1 })
    .lean()

  return Promise.all(
    suites.map(async (suite) => {
      const planData = await getSuitePlansAndCases(suite._id)
      return formatSuiteSummary(suite, { ...planData, canOpen: true })
    })
  )
}

async function getTestSuiteById(testSuiteId) {
  
  const suite = await getSuiteOrThrow(testSuiteId)
  const planData = await getSuitePlansAndCases(testSuiteId)

  return {
    ...formatSuiteSummary(suite, planData),
    testPlans: planData.testPlans,
    testCasesByPlan: planData.testCasesByPlan,
  }
}

async function createTestSuite(data = {}) {
  const userId = String(data.userId || '').trim()
  const nom = String(data.nom || data.name || data.suiteName || data.nametest || 'New Test Suite').trim()

  if (!userId) throw makeError('userId is required', 400)

  return TestSuite.create({
  nom,
  nametest: String(data.nametest || '').trim(),
  description: String(data.description || '').trim(),
  specFilePath: data.specFilePath || null,
  specFileName: data.specFileName || null,
  specText: data.specText || null,
  styleConfig: String(data.styleConfig || ''),
  urlCible: String(data.urlCible || data.url || '').trim(),
  userId,
  projectId: data.projectId || null,

  testStatus: 'Draft',
  sessionStatus: 'incomplete',
  validationStatus: 'incomplete',
  executionStatus: 'incomplete'
})
}

async function updateTestSuite(testSuiteId, data = {}) {
  const allowed = {}
  for (const key of ['nom', 'nametest', 'description', 'specFilePath', 'specFileName', 'specText', 'styleConfig', 'urlCible']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) allowed[key] = data[key]
  }

  const suite = await TestSuite.findByIdAndUpdate(testSuiteId, allowed, { new: true }).lean()
  if (!suite) throw makeError('TestSuite not found', 404)
  return suite
}

async function deleteTestSuite(testSuiteId) {
  const suite = await TestSuite.findByIdAndDelete(testSuiteId)
  if (!suite) throw makeError('TestSuite not found', 404)

  await TestPlan.deleteMany({ testSuiteId })
  await TestCase.deleteMany({ testSuiteId })
  return true
}

async function getTestPlansByTestSuiteId(testSuiteId) {
  const suite = await getSuiteOrThrow(testSuiteId)
  const { testPlans, testCasesByPlan } = await getSuitePlansAndCases(testSuiteId)

  return {
    testSuiteId: String(suite._id),
    testPlans,
    testCasesByPlan,
    testStatus: suite.testStatus || 'Draft',
    lastGeneratedAt: suite.lastGeneratedAt || null,
    savedAt: suite.savedAt || null,
    executedAt: suite.executedAt || null,
    sessionStatus: suite.sessionStatus || 'incomplete',
    planStatuses: mergePlanStatuses({
      existingStatuses: suite.planStatuses || [],
      testPlans,
    }),
    sessionSavedAt: suite.sessionSavedAt || null,
    validationStatus: normalizeCompletionStatus(suite.validationStatus),
    validationPlanStatuses: mergeValidationPlanStatuses({
      existingStatuses: suite.validationPlanStatuses || [],
      testPlans,
    }),
    validationSavedAt: suite.validationSavedAt || null,
    executionStatus: suite.executionStatus || 'incomplete',
    executionPlanStatuses: mergeExecutionPlanStatuses({
      existingStatuses: suite.executionPlanStatuses || [],
      testPlans,
    }),
    executionSavedAt: suite.executionSavedAt || null,
  }
}

async function upsertPlans(testSuiteId, testPlans = []) {
  const ops = testPlans
    .map((plan, index) => {
      const id = String(plan?.id || plan?.planId || `TP-${index + 1}`).trim()
      const title = String(plan?.title || `Test Plan ${index + 1}`).trim()
      if (!id || !title) return null

      return {
        updateOne: {
          filter: { testSuiteId, id },
          update: {
            $set: {
              testSuiteId,
              id,
              title,
              description: String(plan?.description || '').trim(),
              ...normalizePlanMetadata(plan),
            },
          },
          upsert: true,
        },
      }
    })
    .filter(Boolean)

  if (ops.length) await TestPlan.bulkWrite(ops, { ordered: false })
}

async function upsertCasesByPlan(testSuiteId, testCasesByPlan = []) {
  for (const block of testCasesByPlan) {
    const stablePlanId = String(block?.planId || '').trim()
    if (!stablePlanId) continue

    let plan = await TestPlan.findOne({ testSuiteId, id: stablePlanId }).select('_id id title')
    if (!plan) {
      plan = await TestPlan.create({
        testSuiteId,
        id: stablePlanId,
        title: String(block?.planTitle || stablePlanId).trim(),
        description: '',
        objective: normalizeString(block?.objective),
        scope: normalizeString(block?.scope),
        priority: validatePriority(block?.priority),
        requirements: normalizeRequirements(block?.requirements),
      })
    }

    const ops = (Array.isArray(block?.testCases) ? block.testCases : [])
      .map((testCase, index) => {
        const id = String(testCase?.id || `TC-${index + 1}`).trim()
        const title = String(testCase?.title || `Test Case ${index + 1}`).trim()
        if (!id || !title) return null

        // ✅ CHANGEMENT ICI — extraire meta puis retirer test_data si absent
        const meta = normalizeCaseMetadata(testCase)
        const hasTestData = hasOwn(testCase, 'test_data') || hasOwn(testCase, 'testData')
        if (!hasTestData) delete meta.test_data
        const hasStepDetails = hasOwn(testCase, 'stepDetails') || hasOwn(testCase, 'step_details')
        const normalizedStepDetails = normalizeStepDetails(
          hasStepDetails ? (testCase.stepDetails || testCase.step_details) : [],
          Array.isArray(testCase?.steps) ? testCase.steps : []
        )

        return {
          updateOne: {
            filter: { testSuiteId, planId: plan._id, id },
            update: {
              $set: {
                testSuiteId,
                planId: plan._id,
                id,
                title,
                ...meta, // ✅ meta sans test_data si absent
                steps: Array.isArray(testCase?.steps)
                  ? testCase.steps.map((step) => String(step || '').trim()).filter(Boolean)
                  : [],
                expected_result: String(testCase?.expected_result || testCase?.expectedResult || '').trim(),
                stepDetails: normalizedStepDetails,
                executionModel: testCase?.executionModel || testCase?.execution_model || null,
                createdBy: normalizeCreatedBy(testCase?.createdBy),
              },
            },
            upsert: true,
          },
        }
      })
      .filter(Boolean)

    if (ops.length) await TestCase.bulkWrite(ops, { ordered: false })
  }
}

async function saveSuiteSession(testSuiteId, payload = {}) {
  const suite = await TestSuite.findById(testSuiteId)
  if (!suite) throw makeError('TestSuite not found', 404)

  if (Array.isArray(payload.testPlans)) await upsertPlans(testSuiteId, payload.testPlans)
  if (Array.isArray(payload.testCasesByPlan)) await upsertCasesByPlan(testSuiteId, payload.testCasesByPlan)

  const now = new Date()
  const suitePlanData = await getSuitePlansAndCases(testSuiteId)
  const completion = getSuiteCompletionFromPlanCases(suitePlanData)
  const planStatuses = mergePlanStatuses({
    existingStatuses: suite.planStatuses || [],
    incomingStatuses: payload.planStatuses || {},
    testPlans: suitePlanData.testPlans,
  })
  const validationPlanStatuses = mergeValidationPlanStatuses({
    existingStatuses: suite.validationPlanStatuses || [],
    incomingStatuses: payload.sessionKind === 'validation' ? payload.planStatuses || {} : [],
    testPlans: suitePlanData.testPlans,
  })

  logSuiteStatusRecalculation({
    plansCount: suitePlanData.plansCount,
    plansHavingTestCases: suitePlanData.plansHavingTestCases,
    calculatedSuiteStatus: completion.testStatus,
    planStatuses,
  })

  const update = {
    testStatus: completion.testStatus,
    savedAt: completion.isComplete ? now : null,
    lastGeneratedAt: now,
    sessionStatus: completion.sessionStatus,
    planStatuses,
    sessionSavedAt: now,
    validationPlanStatuses,
  }

  if (payload.sessionKind === 'validation') {
    update.validationStatus = completion.completionStatus
    update.validationSavedAt = now
  }

  if (payload.sessionKind === 'execution') {
    update.executionStatus = completion.completionStatus
    update.executionPlanStatuses = mergeExecutionPlanStatuses({
      existingStatuses: suite.executionPlanStatuses || [],
      incomingStatuses: payload.planStatuses || {},
      testPlans: suitePlanData.testPlans,
    })
    update.executionSavedAt = now
  }
  if (suitePlanData.testPlans.length > 0) {
  update.testStatus = 'Ready'
}

  return TestSuite.findByIdAndUpdate(testSuiteId, update, { new: true, runValidators: true }).lean()
}

async function updateTestSuiteStatus(testSuiteId, nextStatus) {
  const status = normalizeTestStatus(nextStatus)
  if (!status) throw makeError('Invalid status', 400)

  let nextTestStatus = status
  if (status === 'Ready') {
    const suitePlanData = await getSuitePlansAndCases(testSuiteId)
    const completion = getSuiteCompletionFromPlanCases(suitePlanData)
    nextTestStatus = completion.testStatus

    logSuiteStatusRecalculation({
      plansCount: suitePlanData.plansCount,
      plansHavingTestCases: suitePlanData.plansHavingTestCases,
      calculatedSuiteStatus: completion.testStatus,
      planStatuses: mergePlanStatuses({
        incomingStatuses: {},
        testPlans: suitePlanData.testPlans,
      }),
    })
  }

  const update = { testStatus: nextTestStatus }
  const now = new Date()
  if (nextTestStatus === 'Ready') update.savedAt = now
  if (nextTestStatus === 'Incomplete') update.savedAt = null
  if (nextTestStatus === 'Passed' || nextTestStatus === 'Failed') update.executedAt = now
  if (nextTestStatus === 'Generating')
  update.lastGeneratedAt = now

  const suite = await TestSuite.findByIdAndUpdate(testSuiteId, update, { new: true, runValidators: true }).lean()
  if (!suite) throw makeError('TestSuite not found', 404)
  return suite
}

async function markTestSuiteSaved(testSuiteId) {
  const existingSuite = await TestSuite.findById(testSuiteId).select('planStatuses').lean()
  if (!existingSuite) throw makeError('TestSuite not found', 404)

  const suitePlanData = await getSuitePlansAndCases(testSuiteId)
  const completion = getSuiteCompletionFromPlanCases(suitePlanData)
  const now = new Date()
  const planStatuses = mergePlanStatuses({
    existingStatuses: existingSuite.planStatuses || [],
    incomingStatuses: {},
    testPlans: suitePlanData.testPlans,
  })

  logSuiteStatusRecalculation({
    plansCount: suitePlanData.plansCount,
    plansHavingTestCases: suitePlanData.plansHavingTestCases,
    calculatedSuiteStatus: completion.testStatus,
    planStatuses,
  })

  const suite = await TestSuite.findByIdAndUpdate(
    testSuiteId,
    {
      testStatus: completion.testStatus,
      savedAt: completion.isComplete ? now : null,
      lastGeneratedAt: now,
      sessionStatus: completion.sessionStatus,
      planStatuses,
    },
    { new: true, runValidators: true }
  ).lean()
  return suite
}

async function setTestSuiteProject(testSuiteId, nextProjectId, viewer = {}) {
  const suite = await TestSuite.findById(testSuiteId).select('_id userId projectId').lean()
  if (!suite) throw makeError('TestSuite not found', 404)

  const rawProjectId = nextProjectId === null || nextProjectId === undefined ? '' : String(nextProjectId).trim()
  if (!rawProjectId) {
    return TestSuite.findByIdAndUpdate(testSuiteId, { projectId: null }, { new: true }).lean()
  }

  if (!mongoose.Types.ObjectId.isValid(rawProjectId)) throw makeError('Invalid project ID', 400)

  const project = await Project.findById(rawProjectId).select('_id ownerId assignedUsers').lean()
  if (!project) throw makeError('Project not found', 404)

  const role = String(viewer.role || '').toLowerCase().trim()
  const viewerUserId = String(viewer.viewerUserId || '').trim()

  if (role !== 'admin') {
    const isOwner = String(project.ownerId) === viewerUserId
    const isAssigned = Array.isArray(project.assignedUsers)
      ? project.assignedUsers.some((user) => String(user?._id || user) === viewerUserId)
      : false
    if (!isOwner && !isAssigned) throw makeError('Forbidden', 403)
  }

  return TestSuite.findByIdAndUpdate(
    testSuiteId,
    { projectId: new mongoose.Types.ObjectId(rawProjectId) },
    { new: true }
  )
    .populate('projectId', 'title')
    .lean()
}



exports.getTestPlansByTestSuiteId = async (suiteId) => {

  // ✅ get plans
  const plans = await TestPlan.find({ testSuiteId: suiteId }).lean()

  // ✅ get test cases of all plans
  const cases = await TestCase.find({ testSuiteId: suiteId }).lean()

  // ✅ mapping CORRECT (IMPORTANT 🔥)
  const testCasesByPlan = plans.map(plan => {

    const filteredCases = cases.filter(tc =>
      String(tc.planId) === String(plan._id) 
    )

    return {
      planId: plan.id, 
      planTitle: plan.title,
      testCases: filteredCases
    }
  })

  return {
    testSuiteId: suiteId,
    testPlans: plans,
    testCasesByPlan
  }
}

module.exports = {
  createTestSuite,
  getAllTestSuites,
  getTestSuiteById,
  getTestSuitesByUser,
  getTestSuitesByProject,
  updateTestSuite,
  deleteTestSuite,
  getTestPlansByTestSuiteId,
  saveSuiteSession,
  updateTestSuiteStatus,
  markTestSuiteSaved,
  setTestSuiteProject,
}
