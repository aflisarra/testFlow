const express = require('express')
const seleniumController = require('../controllers/selenium.controller')

const router = express.Router()

router.post('/run-test-case', seleniumController.runTestCaseHandler)

module.exports = router
