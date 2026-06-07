const express = require('express')
const authenticateUser = require('../middleware/authenticateUser')
const { requireTestSuiteAccess } = require('../middleware/testsuite-access.middleware')
const specificationController = require('../controllers/specification.controller')

const router = express.Router()

router.use(authenticateUser)

router.get('/specifications/:id/content', requireTestSuiteAccess, specificationController.getContent)
router.put('/specifications/:id/content', requireTestSuiteAccess, specificationController.updateContent)

module.exports = router
