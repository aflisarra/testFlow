const TestCase = require('../models/testcase.model')
const TestPlan = require('../models/testplan.model')

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

  if (!/^[0-9a-fA-F]{24}$/.test(String(resolvedPlanId))) {
    const plan = await TestPlan.findOne({
      id: String(resolvedPlanId).trim(),
      ...(resolvedTestSuiteId ? { testSuiteId: resolvedTestSuiteId } : {}),
    }).select('_id testSuiteId').lean()

    if (!plan) {
      const error = new Error('TestPlan not found')
      error.statusCode = 404
      throw error
    }

    resolvedPlanId = plan._id
    resolvedTestSuiteId = resolvedTestSuiteId || plan.testSuiteId
  } else if (!resolvedTestSuiteId) {
    const plan = await TestPlan.findById(resolvedPlanId).select('testSuiteId').lean()
    if (plan) resolvedTestSuiteId = plan.testSuiteId
  }

  if (!resolvedTestSuiteId || !resolvedPlanId || !title) {
    const error = new Error(
      'testSuiteId, planId and title are required'
    )
    error.statusCode = 400
    throw error
  }

  const existingCount = await TestCase.countDocuments({
    testSuiteId: resolvedTestSuiteId,
    planId: resolvedPlanId,
  })

  return await TestCase.create({
    testSuiteId: resolvedTestSuiteId,
    planId: resolvedPlanId,
    id: String(id || `TC-${existingCount + 1}`).trim(),
    title,
    steps: steps || [],
    expected_result: expected_result || expectedResult || '',
    executionModel: executionModel || execution_model || null,
    createdBy: createdBy || null,
  })
}

/**
 * Get cases by plan
 */
async function getByPlan(planId) {
  return await TestCase.find({ planId })
    .sort({ createdAt: 1 })
    .lean()
}

/**
 * Update test case
 */
async function updateTestCase(testCaseId, data) {
  const update = {
    title: data.title,
    steps: data.steps,
    expected_result: data.expected_result || data.expectedResult,
  }

  if (Object.prototype.hasOwnProperty.call(data, 'executionModel') || Object.prototype.hasOwnProperty.call(data, 'execution_model')) {
    update.executionModel = data.executionModel || data.execution_model || null
  }

  const updated = await TestCase.findByIdAndUpdate(
    testCaseId,
    update,
    { new: true }
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

///for selenium 
/**
 * Convert natural language step → Selenium action
 */
function mapStepToSelenium(stepText) {
  const step = String(stepText || '').toLowerCase()

  // TYPE
  if (step.includes('enter') || step.includes('type') || step.includes('fill')) {
    return {
      action: 'type',
      target: extractSelector(stepText),
      value: extractValue(stepText)
    }
  }

  // CLICK
  if (step.includes('click') || step.includes('press')) {
    return {
      action: 'click',
      target: extractSelector(stepText)
    }
  }

  // ASSERT
  if (step.includes('see') || step.includes('visible') || step.includes('displayed')) {
    return {
      action: 'assertVisible',
      target: extractSelector(stepText)
    }
  }

  return {
    action: 'unknown',
    raw: stepText
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
 * 🔥 Selenium-ready format
 * Transform DB TestCases → executable Selenium actions
 */
async function getTestCasesForSelenium(testSuiteId) {
  const cases = await TestCase.find({ testSuiteId })
    .populate('planId', 'id title')
    .sort({ createdAt: 1 })
    .lean()

  return cases.map(tc => ({
    testCaseId: tc._id,
    id: tc.id,
    title: tc.title,
    plan: {
      id: tc.planId?.id,
      title: tc.planId?.title
    },

    steps: tc.steps || [],
    executionModel: tc.executionModel || null,

    expected_result: tc.expected_result
  }))
}

module.exports = {
  createTestCase,
  getByPlan,
  updateTestCase,
  deleteTestCase,
  getTestCasesForSelenium
}
