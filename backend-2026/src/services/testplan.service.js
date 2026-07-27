const TestPlan = require('../models/testplan.model')
const TestCase = require('../models/testcase.model')

const FormData = require('form-data')
const {
  hasOwn,
  normalizeRequirements,
  normalizeString,
  validatePriority,
} = require('../utils/test-artifact-fields')

function normalizeTestPlanMetadata(data = {}, { includeDefaults = false } = {}) {
  const payload = {}

  if (includeDefaults || hasOwn(data, 'objective')) {
    payload.objective = normalizeString(data.objective)
  }

  if (includeDefaults || hasOwn(data, 'scope')) {
    payload.scope = normalizeString(data.scope)
  }

  if (includeDefaults || hasOwn(data, 'priority')) {
    payload.priority = validatePriority(data.priority)
  }

  if (includeDefaults || hasOwn(data, 'requirements')) {
    payload.requirements = normalizeRequirements(data.requirements)
  }

  return payload
}

/**
 * Create test plan
 */
async function createTestPlan(data = {}) {
  const { testSuiteId, id, title, description } = data
  const normalizedTitle = normalizeString(title)

  if (!testSuiteId || !normalizedTitle) {
    const error = new Error('testSuiteId and title are required')
    error.statusCode = 400
    throw error
  }

  const existingCount = await TestPlan.countDocuments({ testSuiteId })

  return await TestPlan.create({
    testSuiteId,
    id: String(id || `TP-${existingCount + 1}`).trim(),
    title: normalizedTitle,
    description: normalizeString(description),
    ...normalizeTestPlanMetadata(data, { includeDefaults: true }),
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
  const update = normalizeTestPlanMetadata(data)
  if (hasOwn(data, 'title')) update.title = normalizeString(data.title)
  if (hasOwn(data, 'description')) update.description = normalizeString(data.description)

  const plan = await TestPlan.findByIdAndUpdate(
    planId,
    update,
    { new: true, runValidators: true }
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

/**
 * Generate plans from AI (NO DB)
 */

const axios = require('axios')
const { readSpecTextFromUpload } = require('../services/ollama.service')

async function generateTestPlansPreview({ file, styleConfig, applicationUrl }) {
  try {
    let specText = ''

    // ✅ 1. EXTRACTION
    if (file) {
      console.log('FILE DEBUG:', {
        hasBuffer: !!file.buffer,
        path: file.path,
        name: file.originalname,
        size: file.size,
      })

      specText = await readSpecTextFromUpload(file)

      if (!specText) {
        throw new Error('Spec extraction failed (empty text)')
      }

      console.log('✅ SPEC LENGTH:', specText.length)
      console.log('✅ SPEC PREVIEW:', specText.slice(0, 200))
    }

    // ✅ 2. ENVOI TEXTE À FASTAPI

    console.log("PAYLOAD SENT:", {
      specText: specText.slice(0, 100)
    })

    const formData = new FormData()

    formData.append('spec_text', specText)   // ✅ NOM CORRECT
    formData.append('style_config', styleConfig || '')
    formData.append('url_cible', applicationUrl || '')

    const response = await axios.post(
      'http://localhost:8000/generate-plan',
      formData,
      {
        headers: {
          ...formData.getHeaders(), // ✅ IMPORTANT
        },
      }
    )

    console.log('✅ FastAPI RESPONSE:', response.data)

    const testPlans = response.data?.test_plans || []

    return testPlans.map((plan, index) => ({
      id: plan.id || `TP-${index + 1}`,
      title: normalizeString(plan.title) || `Test Plan ${index + 1}`,
      description: normalizeString(plan.description),
      objective: normalizeString(plan.objective),
      scope: normalizeString(plan.scope),
      priority: validatePriority(plan.priority),
      requirements: normalizeRequirements(plan.requirements),
    }))

  } catch (error) {
    console.error('🔥 ERROR:', error.response?.data || error.stack || error.message)

    const err = new Error(
      error.response?.data?.error || error.message || 'AI generation failed'
    )
    err.statusCode = error.response?.status || 500
    throw err
  }
}

module.exports = {
  createTestPlan,
  getPlansBySuite,
  getPlanById,
  updateTestPlan,
  deleteTestPlan,
  generateTestPlansPreview,
}