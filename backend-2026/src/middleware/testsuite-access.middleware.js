const TestSuite = require('../models/testsuite')
const Project = require('../models/project.model')
const ProjectInvitation = require('../models/projectInvitation.model')
const mongoose = require('mongoose')

/**
 * Guard d'accès à une TestSuite :
 * - Si la suite est liée à un projet : autorise si owner OU user présent dans assignedUsers du projet.
 * - Si la suite n'a pas de projet : autorise uniquement le créateur (suite.userId).
 */
async function requireTestSuiteAccess(req, res, next) {
  try {
    const userId = String(req.user?.userId || req.user?.id || req.user?._id || '').trim()
    const suiteId = String(req.params?.id || '').trim()
    const role = String(req.user?.role || '').toLowerCase().trim()

    if (!userId) return res.status(401).json({ message: 'Unauthorized' })
    if (!suiteId) return res.status(400).json({ message: 'Missing testSuite ID' })
    if (!mongoose.Types.ObjectId.isValid(suiteId)) {
      return res.status(400).json({ message: 'Invalid testSuite ID' })
    }

    // Admin can access any suite (useful for support/debug and avoids hard 403s in UI).
    if (role === 'admin') {
      return next()
    }

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

    const projectId = String(suite.projectId || '').trim()
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: 'Invalid project ID' })
    }

    const project = await Project.findById(projectId).select('ownerId assignedUsers').lean()
    if (!project) return res.status(404).json({ message: 'Project not found' })

    const isOwner = String(project.ownerId) === String(userId)
    const isAssigned = Array.isArray(project.assignedUsers)
      ? project.assignedUsers.some((u) => String(u?._id || u) === String(userId))
      : false

    if (!isOwner && !isAssigned) {
      return res.status(403).json({ message: 'Forbidden' })
    }

        // Enforce project-management permission: users without project actions shouldn't access TestSuite execution
        try {
          const User = require('../models/user.model')
          const Role = require('../models/role.model')

          const userDoc = await User.findById(userId).select('roleId role').lean()
          let effectiveActions = Array.isArray(req.user?.actions) ? req.user.actions.map((a) => Number(a)) : []

          if (userDoc) {
            const roleName = String(userDoc.role || '').trim()
            let roleDoc = null
            if (roleName) {
              roleDoc = await Role.findOne({ name: roleName }).select('actions').lean()
            }
            if (roleDoc && Array.isArray(roleDoc.actions) && roleDoc.actions.length) {
              effectiveActions = roleDoc.actions.map((id) => Number(id)).filter(Number.isFinite)
            }
          }

          // Project-related action IDs (create/view/edit/delete/invite project)
          const projectActionIds = [12, 13, 14, 15, 16]

          const hasProjectPermission = effectiveActions.some((id) => projectActionIds.includes(Number(id)))

          // If user is not owner and doesn't have any project-related action, forbid access to TestSuite features
          if (!isOwner && !hasProjectPermission) {
            return res.status(403).json({ message: "Forbidden: missing project management permission" })
          }
        } catch {
          // If permission check fails unexpectedly, deny access conservatively
          return res.status(403).json({ message: 'Forbidden' })
        }

    if (!isOwner) {
      const invitation = await ProjectInvitation.findOne({
        projectId: project._id,
        userId,
      }).select('status').lean()

      const hasAcceptedInvite = String(invitation?.status || '').trim().toLowerCase() === 'accepted'
      if (!hasAcceptedInvite) {
        return res.status(403).json({ message: 'Forbidden: invitation not accepted for this project' })
      }
    }

    req.testSuite = suite
    req.project = project
    return next()
  } catch (err) {
    return next(err)
  }
}

module.exports = { requireTestSuiteAccess }