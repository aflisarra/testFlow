const express = require('express')
const ollamaController = require('../controllers/ollama.controller')
const specsUploadModule = require('../utils/spec-upload')
const createSpecsUpload =
  specsUploadModule?.createSpecsUpload ||
  specsUploadModule?.default ||
  specsUploadModule

const router = express.Router()
if (typeof createSpecsUpload !== 'function') {
  throw new TypeError('Invalid spec-upload module: createSpecsUpload must be a function')
}
const upload = createSpecsUpload()

router.get('/health', ollamaController.health)
router.post('/chat', ollamaController.chat)

router.get('/testsuite/:id/plan', ollamaController.getPlan)
router.get('/testsuite/:id/test-plans', ollamaController.getTestPlans)
router.get('/testsuite/:id/spec-document', ollamaController.getSpecDocument)

router.post('/generate-plan', upload.single('file'), ollamaController.generatePlan)
router.post('/generate-test-cases', ollamaController.generateTestCases)
router.post('/cancel-generation', ollamaController.cancelGeneration)

module.exports = router
