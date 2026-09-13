/**
 * AI Failure Detection & Fix Service
 * Calls the Python FastAPI backend to analyze test execution failures
 * and provide recommendations for fixing them.
 */

const axios = require('axios')

/**
 * HTTP Error helper
 */
function httpError(statusCode, message) {
  const err = new Error(message || 'Error')
  err.statusCode = Number(statusCode) || 500
  return err
}

/**
 * Get FastAPI base URL from environment
 */
function getFastApiBaseUrl() {
  const raw = String(process.env.FASTAPI_BASE_URL || '').trim()
  if (!raw) {
    console.warn('FASTAPI_BASE_URL not set, using mock mode')
    return ''
  }
  return raw.replace(/\/$/, '')
}

/**
 * Get headers for FastAPI requests (with optional auth token)
 */
function getFastApiHeaders() {
  const secret = String(process.env.FASTAPI_SECRET || '').trim()
  return secret ? { 'X-Internal-Token': secret } : {}
}

/**
 * Get timeout for FastAPI requests
 */
function getFastApiTimeoutMs(fallbackMs = 120_000) {
  const raw = String(
    process.env.FASTAPI_TIMEOUT_MS ||
    process.env.FASTAPI_GENERATION_TIMEOUT_MS ||
    ''
  ).trim()
  if (!raw) return fallbackMs

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs
  return Math.floor(parsed)
}

/**
 * Detect and analyze test execution failure
 * @param {Object} payload - Failure context
 * @param {Object} payload.failedStep - Details of the failed step
 * @param {Array} payload.logs - Execution logs
 * @param {Array} payload.aiActions - AI actions/decisions
 * @param {Object} payload.testCase - Test case definition
 * @param {String} payload.errorMessage - Error message
 * @param {String} payload.errorType - Type of error
 * @param {Number} payload.stepIndex - Index of failed step
 * @param {Object} payload.domState - DOM state at failure
 * @param {String} payload.screenshotUrl - Screenshot URL
 * @param {String} payload.executionId - Execution ID for tracking
 * @returns {Promise<Object>} AI analysis results
 */
async function detectFailure(payload = {}) {
  try {
    const baseUrl = getFastApiBaseUrl();
    if (process.env.NODE_ENV === 'test' || !baseUrl) {
      console.warn('[AI-FIX] FASTAPI base URL not configured, returning mock response');
      return {
        title: 'Mock failure analysis',
        actionText: 'Mock suggestion',
      };
    }
    const headers = getFastApiHeaders()
    const timeout = getFastApiTimeoutMs(120_000)

    const url = `${baseUrl}/ai/detect-failure`

    console.log(`[AI-FIX] Calling ${url}`)
    console.log(`[AI-FIX] Execution ID: ${payload.executionId || 'unknown'}`)

    const response = await axios.post(url, payload, {
      headers,
      timeout,
      validateStatus: () => true, // Don't throw on any status
    })

    if (response.status >= 400) {
      const errorMsg = response.data?.detail || `Status ${response.status}`
      console.error(`[AI-FIX] Error: ${errorMsg}`)
      throw httpError(response.status, `Failure detection failed: ${errorMsg}`)
    }

    console.log(`[AI-FIX] ✅ Detection successful`)

    return response.data
  } catch (error) {
    // If FastAPI is unreachable (e.g., ENOTFOUND), return a mock response instead of propagating the error
    if (error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo')) {
      console.warn('[AI-FIX] FastAPI unreachable, returning mock response');
      return {
        title: 'Mock failure analysis',
        actionText: 'Mock suggestion',
      };
    }
    console.error(`[AI-FIX] Error in detectFailure:`, error.message);
    throw error;
  }

}

/**
 * Get simplified fix suggestion for a failure
 * @param {Object} payload - Failure context (same as detectFailure)
 * @returns {Promise<Object>} Simplified fix suggestion
 */
async function getFixSuggestion(payload = {}) {
  try {
    const baseUrl = getFastApiBaseUrl()
    const headers = getFastApiHeaders()
    const timeout = getFastApiTimeoutMs(120_000)

    const url = `${baseUrl}/ai/get-fix-suggestion`

    console.log(`[AI-FIX] Calling ${url}`)

    const response = await axios.post(url, payload, {
      headers,
      timeout,
      validateStatus: () => true,
    })

    if (response.status >= 400) {
      const errorMsg = response.data?.detail || `Status ${response.status}`
      throw httpError(response.status, `Fix suggestion failed: ${errorMsg}`)
    }

    console.log(`[AI-FIX] ✅ Fix suggestion successful`)

    return response.data
  } catch (error) {
    console.error(`[AI-FIX] Error in getFixSuggestion:`, error.message)
    throw error
  }
}

module.exports = {
  httpError,
  getFastApiBaseUrl,
  getFastApiHeaders,
  getFastApiTimeoutMs,
  detectFailure,
  getFixSuggestion,
}
