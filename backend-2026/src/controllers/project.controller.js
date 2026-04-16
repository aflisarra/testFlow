const projectService = require('../services/project.service')

exports.createProject = async (req, res) => {
  try {
    const ownerId = req.user?.userId
    if (!ownerId) return res.status(401).json({ message: 'Unauthorized' })

    if (!req.body?.title || !String(req.body.title).trim()) {
      return res.status(400).json({ message: 'Project title is required' })
    }

    const project = await projectService.createProject({ ownerId, ...req.body })
    res.status(201).json({ message: 'Project created successfully', project })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.getProjects = async (req, res) => {
  try {
    const mineOnly = String(req.query.mine || '').toLowerCase() === 'true'
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: 'Unauthorized' })

    const ownerId = mineOnly ? currentUserId : undefined
    const userId = mineOnly ? undefined : currentUserId
    const projects = await projectService.getProjects({ ownerId, userId })
    res.json(projects)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.getProjectById = async (req, res) => {
  try {
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: 'Unauthorized' })

    const project = await projectService.getProjectById(req.params.id)
    if (!project) return res.status(404).json({ message: 'Project not found' })

    const isOwner = String(project?.ownerId?._id || project?.ownerId || '') === String(currentUserId)
    const isAssigned = Array.isArray(project?.assignedUsers)
      ? project.assignedUsers.some((u) => String(u?._id || u) === String(currentUserId))
      : false
    if (!isOwner) {
      if (!isAssigned) return res.status(403).json({ message: 'Forbidden' })

      const ProjectInvitation = require('../models/projectInvitation.model')
      const invitation = await ProjectInvitation.findOne({
        projectId: project._id,
        userId: currentUserId,
      })
        .select('status')
        .lean()

      const hasAcceptedInvite = invitation?.status === 'accepted'
      const isLegacyAssigned = !invitation
      if (!hasAcceptedInvite && !isLegacyAssigned) {
        return res.status(403).json({ message: 'Forbidden' })
      }
    }

    res.json(project)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.updateProject = async (req, res) => {
  try {
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: 'Unauthorized' })

    const existing = await projectService.getProjectById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Project not found' })
    const isOwner = String(existing?.ownerId?._id || existing?.ownerId || '') === String(currentUserId)
    if (!isOwner) return res.status(403).json({ message: 'Forbidden' })

    const project = await projectService.updateProject(req.params.id, req.body)
    res.json({ message: 'Project updated successfully', project })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.assignUsers = async (req, res) => {
  try {
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: 'Unauthorized' })

    const existing = await projectService.getProjectById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Project not found' })
    const isOwner = String(existing?.ownerId?._id || existing?.ownerId || '') === String(currentUserId)
    if (!isOwner) return res.status(403).json({ message: 'Forbidden' })

    const project = await projectService.assignUsers(req.params.id, req.body?.assignedUsers || [])
    res.json({ message: 'Users assigned successfully', project })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.deleteProject = async (req, res) => {
  try {
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: 'Unauthorized' })

    const existing = await projectService.getProjectById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Project not found' })
    const isOwner = String(existing?.ownerId?._id || existing?.ownerId || '') === String(currentUserId)
    if (!isOwner) return res.status(403).json({ message: 'Forbidden' })

    const project = await projectService.deleteProject(req.params.id)
    res.json({ message: 'Project deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}
