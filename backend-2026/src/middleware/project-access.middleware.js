const Project = require('../models/project.model')

/**
 * Guard pour les actions sensibles d'un projet (edit, delete, invite).
 * Logique demandée :
 *  - Si user = owner du projet → accès
 *  - Si user est invité (dans assignedUsers) → accès
 *  - Sinon → pas accès
 */
const requireProjectAccess = async (req, res, next) => {
  try {
    const userId = String(req.user?.userId || req.user?.id || req.user?._id || '').trim()
    const projectId = req.params.id

    if (!userId) return res.status(401).json({ message: 'Unauthorized' })
    if (!projectId) return res.status(400).json({ message: 'Missing project ID' })

    const project = await Project.findById(projectId).lean()
    if (!project) return res.status(404).json({ message: 'Project not found' })

    const isOwner = String(project.ownerId) === String(userId)
    const assigned = Array.isArray(project.assignedUsers) ? project.assignedUsers : []
    const isAssigned = assigned.some((u) => String(u?._id || u) === String(userId))

    if (!isOwner && !isAssigned) {
      return res.status(403).json({
        message: 'Access denied: you are not owner or member of this project',
      })
    }

    req.project = project
    return next()
  } catch (err) {
    return next(err)
  }
}

module.exports = { requireProjectAccess }
