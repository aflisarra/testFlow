const TestSuite = require('../models/testsuite')
const Project = require('../models/project.model')

/**
 * Guard d'accès à une TestSuite :
 * - Si la suite est liée à un projet : autorise si owner OU user présent dans assignedUsers du projet.
 * - Si la suite n'a pas de projet : autorise uniquement le créateur (suite.userId).
 */
async function requireTestSuiteAccess(req, res, next) {
  try {
    const userId = String(req.user?.userId || req.user?.id || req.user?._id || '').trim()
    const suiteId = String(req.params?.id || '').trim()

    if (!userId) return res.status(401).json({ message: 'Unauthorized' })
    if (!suiteId) return res.status(400).json({ message: 'Missing testSuite ID' })

    const suite = await TestSuite.findById(suiteId).select('_id userId projectId').lean()
    if (!suite) return res.status(404).json({ message: 'TestSuite not found' })

    if (!suite.projectId) {
      const isCreator = String(suite.userId) === String(userId)
      if (!isCreator) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      req.testSuite = suite
      return next()
    }

    const project = await Project.findById(suite.projectId).select('ownerId assignedUsers').lean()
    if (!project) return res.status(404).json({ message: 'Project not found' })

    const isOwner = String(project.ownerId) === String(userId)
    const isAssigned = Array.isArray(project.assignedUsers)
      ? project.assignedUsers.some((u) => String(u?._id || u) === String(userId))
      : false

    if (!isOwner && !isAssigned) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    req.testSuite = suite
    req.project = project
    return next()
  } catch (err) {
    return next(err)
  }
}

module.exports = { requireTestSuiteAccess }

