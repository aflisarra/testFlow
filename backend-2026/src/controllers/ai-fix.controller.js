/**
 * AI Failure Detection Controller
 * Handles requests for analyzing test execution failures
 * and providing fix recommendations.
 */

const aiFixService = require('../services/ai-fix.service')

/**
 * Detect and analyze a test execution failure
 * POST /ai/detect-failure
 */
async function detectFailure(req, res) {
  try {
    const {
      failedStep,
      failed_step,
      logs,
      aiActions,
      ai_actions,
      testCase,
      test_case,
      errorMessage,
      error_message,
      errorType,
      error_type,
      stepIndex,
      step_index,
      domState,
      dom_state,
      screenshotUrl,
      screenshot_url,
      executionId,
      execution_id,
    } = req.body

    // Normalize payload for Python API
    const payload = {
      failedStep: failedStep || failed_step,
      logs: logs || [],
      aiActions: aiActions || ai_actions,
      testCase: testCase || test_case,
      errorMessage: errorMessage || error_message,
      errorType: errorType || error_type,
      stepIndex: stepIndex || step_index,
      domState: domState || dom_state,
      screenshotUrl: screenshotUrl || screenshot_url,
      executionId: executionId || execution_id,
    }

    // Validate minimum required data
    if (!payload.failedStep && !payload.logs) {
      return res.status(400).json({
        message: 'Either failedStep or logs must be provided',
      })
    }

    console.log(`[Controller] Detecting failure for execution: ${payload.executionId || 'unknown'}`)

    const analysis = await aiFixService.detectFailure(payload)

    return res.status(200).json({
      success: true,
      data: analysis,
    })
  } catch (err) {
    console.error('[Controller] detectFailure error:', err.message)
    const statusCode = err.statusCode || 500
    return res.status(statusCode).json({
      message: err.message || 'Failed to detect failure',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}

/**
 * Get simplified fix suggestion for a failure
 * POST /ai/get-fix-suggestion
 */
async function getFixSuggestion(req, res) {
  try {
    const {
      failedStep,
      failed_step,
      logs,
      aiActions,
      ai_actions,
      testCase,
      test_case,
      errorMessage,
      error_message,
      errorType,
      error_type,
      stepIndex,
      step_index,
      domState,
      dom_state,
      screenshotUrl,
      screenshot_url,
      executionId,
      execution_id,
    } = req.body

    // Normalize payload for Python API
    const payload = {
      failedStep: failedStep || failed_step,
      logs: logs || [],
      aiActions: aiActions || ai_actions,
      testCase: testCase || test_case,
      errorMessage: errorMessage || error_message,
      errorType: errorType || error_type,
      stepIndex: stepIndex || step_index,
      domState: domState || dom_state,
      screenshotUrl: screenshotUrl || screenshot_url,
      executionId: executionId || execution_id,
    }

    // Validate minimum required data
    if (!payload.failedStep && !payload.logs) {
      return res.status(400).json({
        message: 'Either failedStep or logs must be provided',
      })
    }

    console.log(`[Controller] Getting fix suggestion for execution: ${payload.executionId || 'unknown'}`)

    const suggestion = await aiFixService.getFixSuggestion(payload)

    return res.status(200).json({
      success: true,
      data: suggestion,
    })
  } catch (err) {
    console.error('[Controller] getFixSuggestion error:', err.message)
    const statusCode = err.statusCode || 500
    return res.status(statusCode).json({
      message: err.message || 'Failed to get fix suggestion',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}

module.exports = {
  detectFailure,
  getFixSuggestion,
}
