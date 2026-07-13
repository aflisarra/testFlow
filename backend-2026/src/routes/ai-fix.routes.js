const express = require('express')
const aiFixController = require('../controllers/ai-fix.controller')

const router = express.Router()

/**
 * Detect and analyze a test execution failure
 * POST /ai/detect-failure
 */
router.post('/detect-failure', aiFixController.detectFailure)

/**
 * Get simplified fix suggestion for a failure
 * POST /ai/get-fix-suggestion
 */
router.post('/get-fix-suggestion', aiFixController.getFixSuggestion)

module.exports = router
