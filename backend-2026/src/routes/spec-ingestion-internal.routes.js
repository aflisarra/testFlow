const express = require('express')
const controller = require('../controllers/spec-ingestion-internal.controller')
const requireInternalToken = require('../middleware/requireInternalToken')

const router = express.Router()
router.use(requireInternalToken)
router.put('/spec-ingestions/:specHash', controller.replace)
router.get('/spec-ingestions/:specHash/review-queue', controller.pendingReview)
router.patch('/spec-ingestions/:specHash/items/:itemId/review', controller.resolveReview)
router.post('/spec-ingestions/:specHash/module-generation/claim', controller.claimModuleGeneration)
router.put('/spec-ingestions/:specHash/module-generation/:lease', controller.commitModuleGeneration)
router.post('/spec-ingestions/:specHash/module-generation/:lease/fail', controller.failModuleGeneration)
router.get('/spec-ingestions/:specHash', controller.get)

module.exports = router
