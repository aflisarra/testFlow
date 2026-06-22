const TestCase = require('../models/testcase.model')
const TestPlan = require('../models/testplan.model')
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

  const existingCount = await TestCase.countDocuments({
    testSuiteId: resolvedTestSuiteId,
    planId: resolvedPlanId,
  })

  const normalizedTestData = normalizeAutomationTestData(
    normalizeTestData(data.test_data)
  )

  return await TestCase.create({
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
    expected_result: normalizeString(expected_result || expectedResult),
    executionModel: executionModel || execution_model || null,
    createdBy: createdBy || null,

    test_data: normalizedTestData
  })
}


/**
 * Get cases by plan
 */
async function getByPlan(planId) {
  const cases = await TestCase.find({ planId })
  .sort({ createdAt: 1 })
  .lean()

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
  if (hasOwn(data, 'expected_result') || hasOwn(data, 'expectedResult')) {
    update.expected_result = normalizeString(data.expected_result || data.expectedResult)
  }

  if (hasOwn(data, 'executionModel') || hasOwn(data, 'execution_model')) {
    update.executionModel = data.executionModel || data.execution_model || null
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
function mapStepToSelenium(stepText) {
  const step = String(stepText || '').toLowerCase()

  if (step.includes('enter') || step.includes('type') || step.includes('fill')) {
    return {
      action: 'type',
      target: extractSelector(stepText),
      value: extractValue(stepText),
    }
  }

  if (step.includes('click') || step.includes('press')) {
    return {
      action: 'click',
      target: extractSelector(stepText),
    }
  }

  if (step.includes('see') || step.includes('visible') || step.includes('displayed')) {
    return {
      action: 'assertVisible',
      target: extractSelector(stepText),
    }
  }

  return {
    action: 'unknown',
    raw: stepText,
  }
}

function extractSelector(text) {
  const t = String(text || '').toLowerCase()
  if (t.includes('email')) return '#email'
  if (t.includes('password')) return '#password'
  if (t.includes('login')) return '#login'
  if (t.includes('button')) return 'button'
  return 'body'
}

function extractValue(text) {
  const match = String(text).match(/"([^"]+)"|'([^']+)'/)
  return match ? (match[1] || match[2]) : 'test-data'
}

/**
 * Selenium-ready format
 */
async function getTestCasesForSelenium(testSuiteId) {
  const cases = await TestCase.find({ testSuiteId })
    .populate('planId', 'id title')
    .sort({ createdAt: 1 })
    .lean()

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
    priority: tc.priority || 'medium',
    severity: tc.severity || 'major',
    type: tc.type || 'functional',
    requirements: tc.requirements || [],
    steps: tc.steps || [],
    executionModel: tc.executionModel || null,
    expected_result: tc.expected_result,
  }))
}

module.exports = {
  createTestCase,
  getByPlan,
  updateTestCase,
  deleteTestCase,
  getTestCasesForSelenium,
}
