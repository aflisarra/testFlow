const express = require('express')
const seleniumController = require('../controllers/selenium.controller')

const router = express.Router()

router.post('/run-test-case', seleniumController.runTestCaseHandler)
router.get('/executions', seleniumController.getExecutions)

router.get('/executions/:id', seleniumController.getExecutionDetail)

module.exports = router
