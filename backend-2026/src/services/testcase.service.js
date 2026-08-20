const TestCase = require('../models/testcase.model')
const TestPlan = require('../models/testplan.model')
const mongoose = require('mongoose')
const {
  hasOwn,
  normalizeRequirements,
  normalizeAutomationTestData,
  normalizeString,
  normalizeStringList,
  normalizeTestData,
  validatePriority,
  validateSeverity,
  validateTestCaseType,
} = require('../utils/test-artifact-fields')

function pickFirst(data, keys) {
  for (const key of keys) {
    if (hasOwn(data, key)) return data[key]
  }
  return undefined
}

async function resolvePlanId(planId) {
  const raw = String(planId || '').trim()
  if (!raw) return null

  const direct = await TestPlan.findById(raw).select('_id id').lean().catch(() => null)
  if (direct) {
    return { _id: direct._id, id: direct.id || raw }
  }

  const byStableId = await TestPlan.findOne({ id: raw }).select('_id id').lean().catch(() => null)
  if (byStableId) {
    return { _id: byStableId._id, id: byStableId.id || raw }
  }

  return null
}

function normalizeTestCaseMetadata(data = {}, { includeDefaults = false } = {}) {
  const payload = {}

  if (includeDefaults || hasOwn(data, 'objective')) {
    payload.objective = normalizeString(data.objective)
  }

  if (includeDefaults || hasOwn(data, 'preconditions')) {
    payload.preconditions = normalizeStringList(data.preconditions)
  }

  // ✅ Ne mettre test_data que si la clé existe vraiment
  const hasTestData = hasOwn(data, 'test_data') || hasOwn(data, 'testData')
  if (hasTestData) {
    const testData = pickFirst(data, ['test_data', 'testData'])
    payload.test_data = normalizeAutomationTestData(normalizeTestData(testData))
  } else if (includeDefaults) {
    payload.test_data = []
  }

  if (includeDefaults || hasOwn(data, 'priority')) {
    payload.priority = validatePriority(data.priority)
  }

  if (includeDefaults || hasOwn(data, 'severity')) {
    payload.severity = validateSeverity(data.severity)
  }

  if (includeDefaults || hasOwn(data, 'type')) {
    payload.type = validateTestCaseType(data.type)
  }

  if (includeDefaults || hasOwn(data, 'requirements')) {
    payload.requirements = normalizeRequirements(data.requirements)
  }

  return payload
}

/*function normalizeStepDetails(value, fallbackSteps = []) {
  const source = Array.isArray(value) ? value : []
  return source
    .map((item, index) => {
      if (typeof item === 'string') {
        const step = normalizeString(item)
        if (!step) return null
        return {
          step,
          expected_result: '',
          actual_result: '',
          status: 'pending',
        }
      }

      if (item && typeof item === 'object') {
        const step = normalizeString(item.step || item.raw || item.text || item.name)
        if (!step) return null
        return {
          step,
          expected_result: normalizeString(item.expected_result || item.expectedResult || item.expected || ''),
          actual_result: normalizeString(item.actual_result || item.actualResult || ''),
          status: String(item.status || 'pending'),
        }
      }

      const fallback = normalizeString(fallbackSteps[index] || '')
      return fallback
        ? {
            step: fallback,
            expected_result: '',
            actual_result: '',
            status: 'pending',
          }
        : null
    })
    .filter(Boolean)
}*/

/**
 * Create test case
 */
async function createTestCase(data) {

  const {
    testSuiteId,
    testPlanId,
    planId,
    id,
    title,
    steps,
    expected_result,
    expectedResult,
    executionModel,
    execution_model,
    createdBy,
    stepDetails,
    step_details,
  } = data

  let resolvedPlanId = planId || testPlanId
  let resolvedTestSuiteId = testSuiteId

  if (!resolvedPlanId) {
    const error = new Error('planId is required')
    error.statusCode = 400
    throw error
  }

  const normalizedTitle = normalizeString(title)

  if (!resolvedTestSuiteId || !resolvedPlanId || !normalizedTitle) {
    const error = new Error('testSuiteId, planId and title are required')
    error.statusCode = 400
    throw error
  }

  const resolvedPlan = await resolvePlanId(resolvedPlanId)
  if (!resolvedPlan) {
    const error = new Error('TestPlan not found')
    error.statusCode = 404
    throw error
  }

  resolvedPlanId = resolvedPlan._id

  console.log('[TestCase:create] resolved plan', {
    requestedPlanId: String(planId || testPlanId || '').trim(),
    mongoPlanId: String(resolvedPlanId),
    stablePlanId: String(resolvedPlan.id || ''),
    testSuiteId: String(resolvedTestSuiteId),
  })

  const existingCount = await TestCase.countDocuments({
    testSuiteId: resolvedTestSuiteId,
    planId: resolvedPlanId,
  })

  const normalizedTestData = normalizeAutomationTestData(
    normalizeTestData(data.test_data)
  )
  const normalizedStepDetails = normalizeStepDetails(stepDetails || step_details, steps)

  console.log('[TestCase:create] normalized test_data', {
    requestedTestSuiteId: String(resolvedTestSuiteId),
    requestedPlanId: String(resolvedPlanId),
    count: Array.isArray(normalizedTestData) ? normalizedTestData.length : 0,
    test_data: normalizedTestData,
  })

  const saved = await TestCase.create({
    testSuiteId: resolvedTestSuiteId,
    planId: resolvedPlanId,
    id: String(id || `TC-${existingCount + 1}`).trim(),
    title: normalizedTitle,

    // ✅ IMPORTANT → METADATA SANS test_data
    objective: normalizeString(data.objective),
    preconditions: normalizeStringList(data.preconditions),

    priority: validatePriority(data.priority),
    severity: validateSeverity(data.severity),
    type: validateTestCaseType(data.type),
    requirements: normalizeRequirements(data.requirements || []),

    steps: normalizeStringList(steps),
    stepDetails: normalizedStepDetails,
    expected_result: normalizeString(expected_result || expectedResult),
    executionModel: executionModel || execution_model || null,
    createdBy: createdBy || null,

    test_data: normalizedTestData
  })

  console.log('[TestCase:create] saved document', {
    _id: String(saved?._id || ''),
    id: String(saved?.id || ''),
    title: String(saved?.title || ''),
    planId: String(saved?.planId || ''),
    testSuiteId: String(saved?.testSuiteId || ''),
  })

  return saved
}


/**
 * Get cases by plan
 */
async function getByPlan(planId) {
  const resolvedPlan = await resolvePlanId(planId)
  if (!resolvedPlan) {
    console.log('[TestCase:getByPlan] no plan found', { requestedPlanId: String(planId || '') })
    return []
  }

  const cases = await TestCase.find({ planId: resolvedPlan._id })
  .sort({ createdAt: 1 })
  .lean()

  console.log('[TestCase:getByPlan] loaded cases', {
    requestedPlanId: String(planId || ''),
    mongoPlanId: String(resolvedPlan._id || ''),
    count: cases.length,
  })

  return cases.map(tc => ({
  ...tc,

  // ✅ FIX CRITIQUE
  test_data: Array.isArray(tc.test_data)
    ? tc.test_data
    : tc.test_data
      ? [tc.test_data]
      : []
}))
}

/**
 * Update test case
 */
async function updateTestCase(testCaseId, data) {
  const update = normalizeTestCaseMetadata(data)

  if (hasOwn(data, 'title')) update.title = normalizeString(data.title)
  if (hasOwn(data, 'steps')) update.steps = normalizeStringList(data.steps)
  if (hasOwn(data, 'stepDetails') || hasOwn(data, 'step_details')) {
    update.stepDetails = normalizeStepDetails(data.stepDetails || data.step_details, data.steps || [])
  }
  if (hasOwn(data, 'expected_result') || hasOwn(data, 'expectedResult')) {
    update.expected_result = normalizeString(data.expected_result || data.expectedResult)
  }

  if (hasOwn(data, 'executionModel') || hasOwn(data, 'execution_model')) {
    update.executionModel = data.executionModel || data.execution_model || null
  }

  if (hasOwn(data, 'test_data') || hasOwn(data, 'testData')) {
    console.log('[TestCase:update] incoming test_data', {
      testCaseId,
      raw: pickFirst(data, ['test_data', 'testData']),
    })
  }

  if (hasOwn(update, 'test_data')) {
    console.log('[TestCase:update] normalized test_data', {
      testCaseId,
      test_data: update.test_data,
      count: Array.isArray(update.test_data) ? update.test_data.length : 0,
    })
  }

  if (hasOwn(update, 'stepDetails')) {
    console.log('[TestCase:update] normalized stepDetails', {
      testCaseId,
      count: Array.isArray(update.stepDetails) ? update.stepDetails.length : 0,
    })
  }

  const updated = await TestCase.findByIdAndUpdate(
    testCaseId,
    update,
    { new: true, runValidators: true }
  )

  if (!updated) {
    const error = new Error('TestCase not found')
    error.statusCode = 404
    throw error
  }

  return updated
}

/**
 * Delete test case
 */
async function deleteTestCase(testCaseId) {
  const deleted = await TestCase.findByIdAndDelete(testCaseId)

  if (!deleted) {
    const error = new Error('TestCase not found')
    error.statusCode = 404
    throw error
  }

  return true
}

/**
 * Convert natural language step → Selenium action
 */
/**
 * Selenium-ready format
 */
async function getTestCasesForSelenium(testSuiteId) {
  const cases = await TestCase.find({ testSuiteId })
    .populate('planId', 'id title')
    .sort({ createdAt: 1 })
    .lean()

  console.log('[TestCase:getForSelenium]', {
    testSuiteId: String(testSuiteId || ''),
    count: cases.length,
  })

  return cases.map((tc) => ({
    testCaseId: tc._id,
    id: tc.id,
    title: tc.title,
    plan: {
      id: tc.planId?.id,
      title: tc.planId?.title,
    },
    objective: tc.objective || '',
    preconditions: tc.preconditions || [],
    test_data: normalizeAutomationTestData(tc.test_data || []),
    stepDetails: Array.isArray(tc.stepDetails) ? tc.stepDetails : [],
    priority: tc.priority || 'medium',
    severity: tc.severity || 'major',
    type: tc.type || 'functional',
    requirements: tc.requirements || [],
    steps: tc.steps || [],
    executionModel: tc.executionModel || null,
    expected_result: tc.expected_result,
  }))
}

async function getTypeBreakdown(filters = {}) {
  const match = {}
  if (filters.testSuiteId && mongoose.Types.ObjectId.isValid(filters.testSuiteId)) {
    match.testSuiteId = new mongoose.Types.ObjectId(filters.testSuiteId)
  }
  if (filters.planId && mongoose.Types.ObjectId.isValid(filters.planId)) {
    match.planId = new mongoose.Types.ObjectId(filters.planId)
  }

  const raw = await TestCase.aggregate([
    { $match: match },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ])

  const total = raw.reduce((sum, r) => sum + r.count, 0) || 1
  return raw.map((r) => ({
    type: r._id || 'functional',
    count: r.count,
    percent: Math.round((r.count / total) * 100),
  }))
}

module.exports = {
  createTestCase,
  getByPlan,
  updateTestCase,
  deleteTestCase,
  getTestCasesForSelenium,
  getTypeBreakdown,
}
