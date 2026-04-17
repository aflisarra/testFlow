const express = require('express')
const router = express.Router()

const authenticateUser = require('../middleware/authenticateUser')
const requireAction = require('../middleware/requireAction')
const projectController = require('../controllers/project.controller')
const { requireProjectAccess } = require('../middleware/project-access.middleware')

router.use(authenticateUser)

// Accessible à tous les users authentifiés (avec action correspondante)
router.post('/', requireAction(12), projectController.createProject)
router.get('/', requireAction(11), projectController.getProjects)
router.get('/:id', requireAction(13), requireProjectAccess, projectController.getProjectById)

// Réservées owner / membre accepté (et action correspondante)
router.put('/:id', requireAction(14), requireProjectAccess, projectController.updateProject)
router.patch('/:id/users', requireAction(16), requireProjectAccess, projectController.assignUsers)
router.delete('/:id', requireAction(15), requireProjectAccess, projectController.deleteProject)

module.exports = router
