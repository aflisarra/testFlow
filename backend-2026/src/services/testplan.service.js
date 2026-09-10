const TestPlan = require('../models/testplan.model')
const TestCase = require('../models/testcase.model')
const TestSuite = require('../models/testsuite')

const FormData = require('form-data')
const {
  hasOwn,
  normalizeRequirements,
  normalizeString,
  validatePriority,
} = require('../utils/test-artifact-fields')

const MIN_TEST_PLAN_COUNT = 10
const MAX_TEST_PLAN_COUNT = 1000

function getFastApiBaseUrl() {
  const raw = String(process.env.FASTAPI_BASE_URL || process.env.PYTHON_API_URL || '').trim()
  if (!raw) throw new Error('FASTAPI_BASE_URL is not set')
  return raw.replace(/\/+$/, '')
}

function httpError(statusCode, message) {
  const err = new Error(message || 'Error')
  err.statusCode = Number(statusCode) || 500
  return err
}

function getFastApiHeaders() {
  const secret = String(process.env.FASTAPI_SECRET || '').trim()
  return secret ? { 'X-Internal-Token': secret } : {}
}

function getFastApiTimeoutMs(fallbackMs = 185_000) {
  const raw = String(process.env.FASTAPI_TIMEOUT_MS || process.env.FASTAPI_GENERATION_TIMEOUT_MS || '').trim()
  if (!raw) return fallbackMs

  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallbackMs
}

function validateRequestedPlanCount(value, source = 'test_plan_count') {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < MIN_TEST_PLAN_COUNT || parsed > MAX_TEST_PLAN_COUNT) {
    throw httpError(400, `${source} must be an integer between 10 and 1000`)
  }

  return Math.floor(parsed)
}

function getPreviewPlanCount(requestedCount) {
  const explicitCount = validateRequestedPlanCount(requestedCount)
  if (explicitCount !== null) return explicitCount

  const envCount = String(process.env.TEST_PLAN_PREVIEW_COUNT || '').trim()
  return envCount ? validateRequestedPlanCount(envCount, 'TEST_PLAN_PREVIEW_COUNT') : null
}

function isTimeoutError(error) {
  return error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))
}

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

async function generateTestPlansPreview({
  file,
  styleConfig,
  applicationUrl,
  testPlanCount,
  testSuiteId,
  regenerate,
}) {
  try {
    let specText = ''
    let promptStyleConfig = String(styleConfig || '')

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

    if (!file && testSuiteId) {
      const suite = await TestSuite.findById(testSuiteId).select('specText styleConfig urlCible').lean()
      specText = String(suite?.specText || '').trim()
      if (!promptStyleConfig.trim()) promptStyleConfig = String(suite?.styleConfig || '')
      if (!applicationUrl) applicationUrl = String(suite?.urlCible || '')
    }

    if (!specText) {
      throw httpError(400, 'spec_text or file is required')
    }

    if (regenerate && testSuiteId) {
      const existingPlans = await TestPlan.find({ testSuiteId }).select('id title').sort({ createdAt: 1 }).lean()
      if (existingPlans.length) {
        const existingTitles = existingPlans
          .map((plan) => `- ${String(plan?.id || '').trim()} ${String(plan?.title || '').trim()}`.trim())
          .filter(Boolean)
          .join('\n')

        promptStyleConfig = [
          promptStyleConfig,
          '',
          'Regeneration request: create a fresh set of distinct test plans for the same specification.',
          'Avoid repeating these existing test plan titles when the requirements allow it:',
          existingTitles,
        ].filter(Boolean).join('\n')
      }
    }

    console.log("PAYLOAD SENT:", {
      specText: specText.slice(0, 100)
    })

    const formData = new FormData()
    const previewPlanCount = getPreviewPlanCount(testPlanCount)

    formData.append('spec_text', specText)   // ✅ NOM CORRECT
    formData.append('style_config', promptStyleConfig || '')
    formData.append('url_cible', applicationUrl || '')
    if (previewPlanCount !== null) {
      formData.append('test_plan_count', String(previewPlanCount))
    }

    const response = await axios.post(
      `${getFastApiBaseUrl()}/generate-plan`,
      formData,
      {
        headers: {
          ...formData.getHeaders(), // ✅ IMPORTANT
          ...getFastApiHeaders(),
        },
        timeout: getFastApiTimeoutMs(420_000),
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

    if (isTimeoutError(error)) {
      throw httpError(
        504,
        'FastAPI request timed out while generating the test plan preview. Try a smaller spec or increase FASTAPI_TIMEOUT_MS.'
      )
    }

    throw httpError(
      error.response?.status || error.statusCode || 500,
      error.response?.data?.error || error.message || 'AI generation failed'
    )
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
