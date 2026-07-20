/**
 * AI Failure Detection Controller
 * Handles requests for analyzing test execution failures
 * and providing fix recommendations.
 */

const aiFixService = require('../services/ai-fix.service')
const MESSAGES = require('../constants/messages')
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
        message: MESSAGES.FASTAPI.FAILED,
      })
    }

    console.log(`[Controller] Detecting failure for execution: ${payload.executionId || MESSAGES.FASTAPI.UNKNOWN}`)

    const analysis = await aiFixService.detectFailure(payload)

    return res.status(200).json({
      success: true,
      data: analysis,
    })
  } catch (err) {
    console.error(MESSAGES.FASTAPI.DETECTION_ERROR, err.message)
    const statusCode = err.statusCode || 500
    return res.status(statusCode).json({
      message: err.message || MESSAGES.FASTAPI.FAILED_TO_DETECT_FAILURE,
      error: process.env.NODE_ENV === MESSAGES.FASTAPI.DEVLOPMENT ? err.message : undefined,
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
        message: MESSAGES.FASTAPI.FAILED,
      })
    }

    console.log(`[Controller] Getting fix suggestion for execution: ${payload.executionId || MESSAGES.FASTAPI.UNKNOWN}`)

    const suggestion = await aiFixService.getFixSuggestion(payload)

    return res.status(200).json({
      success: true,
      data: suggestion,
    })
  } catch (err) {
    console.error(MESSAGES.FASTAPI.GETFIX_ERROR, err.message)
    const statusCode = err.statusCode || 500
    return res.status(statusCode).json({
      message: err.message || MESSAGES.FASTAPI.FAILED_TO_GETFIX,
      error: process.env.NODE_ENV === MESSAGES.FASTAPI.DEVLOPMENT ? err.message : undefined,
    })
  }
}

module.exports = {
  detectFailure,
  getFixSuggestion,
}
