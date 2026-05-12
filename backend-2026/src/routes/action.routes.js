const express = require('express')
const actionController = require('../controllers/action.controller')

const router = express.Router()

// GET all actions
router.get('/', actionController.list)

module.exports = router
