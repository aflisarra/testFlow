const express = require('express')
const router = express.Router()

const authenticateUser = require('../middleware/authenticateUser')
const controller = require('../controllers/projectInvitation.controller')

router.use(authenticateUser)

router.get('/', controller.getMyPendingInvitations)
router.post('/:id/accept', controller.acceptInvitation)
router.post('/:id/ignore', controller.ignoreInvitation)

module.exports = router

