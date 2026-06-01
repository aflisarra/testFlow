const TestPlan = require('../models/testplan.model')
const TestCase = require('../models/testcase.model')

/**
 * Create test plan
 */
async function createTestPlan({ testSuiteId, id, title, description }) {
  if (!testSuiteId || !title) {
    const error = new Error('testSuiteId and title are required')
    error.statusCode = 400
    throw error
  }

  const existingCount = await TestPlan.countDocuments({ testSuiteId })

  return await TestPlan.create({
    testSuiteId,
    id: String(id || `TP-${existingCount + 1}`).trim(),
    title,
    description: description || '',
  })
}

/**
 * Get all plans of a suite
 */
async function getPlansBySuite(testSuiteId) {
  const plans = await TestPlan.find({ testSuiteId })
    .sort({ createdAt: 1 })
    .lean()

  const result = await Promise.all(
    plans.map(async (plan) => {
      const testCases = await TestCase.find({
        planId: plan._id,
      }).lean()

      return {
        ...plan,
        testCases,
      }
    })
  )

  return result
}

/**
 * Get single plan
 */
async function getPlanById(planId) {
  const plan = await TestPlan.findById(planId).lean()

  if (!plan) {
    const error = new Error('TestPlan not found')
    error.statusCode = 404
    throw error
  }

  const testCases = await TestCase.find({
    planId,
  }).lean()

  return {
    ...plan,
    testCases,
  }
}

/**
 * Update plan
 */
async function updateTestPlan(planId, data) {
  const plan = await TestPlan.findByIdAndUpdate(
    planId,
    {
      title: data.title,
      description: data.description,
    },
    { new: true }
  )

  if (!plan) {
    const error = new Error('TestPlan not found')
    error.statusCode = 404
    throw error
  }

  return plan
}

/**
 * Delete plan + its test cases
 */
async function deleteTestPlan(planId) {
  const plan = await TestPlan.findById(planId)

  if (!plan) {
    const error = new Error('TestPlan not found')
    error.statusCode = 404
    throw error
  }

  await TestCase.deleteMany({ planId })
  await TestPlan.findByIdAndDelete(planId)

  return true
}

module.exports = {
  createTestPlan,
  getPlansBySuite,
  getPlanById,
  updateTestPlan,
  deleteTestPlan,
}
