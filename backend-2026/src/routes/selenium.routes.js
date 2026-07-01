const express = require('express')
const seleniumController = require('../controllers/selenium.controller')
const authenticateUser = require('../middleware/authenticateUser')
const { abortExecution } = require('../controllers/selenium.controller')

const router = express.Router()

router.use(authenticateUser)

router.post('/run-test-case', seleniumController.runTestCaseHandler)
router.get('/executions', seleniumController.getExecutions)

router.get('/executions/:id', seleniumController.getExecutionDetail)
router.patch('/executions/:executionId/abort', abortExecution)


module.exports = router
