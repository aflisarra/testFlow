const express = require('express')
const ollamaController = require('../controllers/ollama.controller')
const { createSpecsUpload } = require('../utils/spec-upload')

const router = express.Router()
const upload = createSpecsUpload()

router.get('/health', ollamaController.health)
router.post('/chat', ollamaController.chat)

router.get('/testsuite/:id/plan', ollamaController.getPlan)
router.get('/testsuite/:id/test-plans', ollamaController.getTestPlans)

router.post('/generate-plan', upload.single('file'), ollamaController.generatePlan)
router.post('/generate-test-cases', ollamaController.generateTestCases)

module.exports = router

