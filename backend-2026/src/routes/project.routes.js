const express = require('express')
const router = express.Router()
const authenticateUser = require('../middleware/authenticateUser')
const projectController = require('../controllers/project.controller')

router.use(authenticateUser)

router.post('/', projectController.createProject)
router.get('/', projectController.getProjects)
router.get('/:id', projectController.getProjectById)
router.put('/:id', projectController.updateProject)
router.patch('/:id/users', projectController.assignUsers)
router.delete('/:id', projectController.deleteProject)

module.exports = router
