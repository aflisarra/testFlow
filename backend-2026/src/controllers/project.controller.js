const projectService = require('../services/project.service')
const MESSAGES = require('../constants/messages.js');
exports.createProject = async (req, res) => {
  try {
    const ownerId = req.user?.userId
    if (!ownerId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    if (!req.body?.title || !String(req.body.title).trim()) {
      return res.status(400).json({ message: MESSAGES.PROJECT.TITLE_REQUIRED })
    }

    const project = await projectService.createProject({ ownerId, ...req.body })
    res.status(201).json({ message: MESSAGES.PROJECT.CREATED, project })
  } catch (error) {
    res.status(500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

exports.getProjects = async (req, res) => {
  try {
    const mineOnly = String(req.query.mine || '').toLowerCase() === 'true'
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    const ownerId = mineOnly ? currentUserId : undefined
    const userId = mineOnly ? undefined : currentUserId
    const projects = await projectService.getProjects({ ownerId, userId })
    res.json(projects)
  } catch (error) {
    res.status(500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

exports.getProjectById = async (req, res) => {
  try {
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    const project = await projectService.getProjectById(req.params.id)
    if (!project) return res.status(404).json({ message: MESSAGES.PROJECT.NOT_FOUND })

    const isOwner = String(project?.ownerId?._id || project?.ownerId || '') === String(currentUserId)
    const isAssigned = Array.isArray(project?.assignedUsers)
      ? project.assignedUsers.some((u) => String(u?._id || u) === String(currentUserId))
      : false
    if (!isOwner) {
      if (!isAssigned) return res.status(403).json({ message: MESSAGES.INVITATION.FORBIDDEN })

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
        return res.status(403).json({ message: MESSAGES.INVITATION.FORBIDDEN })
      }
    }

    res.json(project)
  } catch (error) {
    res.status(500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

exports.updateProject = async (req, res) => {
  try {
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    const existing = req.project || (await projectService.getProjectById(req.params.id))
    if (!existing) return res.status(404).json({ message: MESSAGES.PROJECT.NOT_FOUND })

    const project = await projectService.updateProject(req.params.id, req.body)
    res.json({ message: MESSAGES.PROJECT.UPDATED, project })
  } catch (error) {
    res.status(500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

exports.assignUsers = async (req, res) => {
  try {
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    const existing = req.project || (await projectService.getProjectById(req.params.id))
    if (!existing) return res.status(404).json({ message: MESSAGES.PROJECT.NOT_FOUND })

    const project = await projectService.assignUsers(req.params.id, req.body?.assignedUsers || [])
    res.json({ message: MESSAGES.PROJECT.ASSIGNED, project })
  } catch (error) {
    res.status(500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

exports.deleteProject = async (req, res) => {
  try {
    const currentUserId = req.user?.userId
    if (!currentUserId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    const existing = req.project || (await projectService.getProjectById(req.params.id))
    if (!existing) return res.status(404).json({ message: MESSAGES.PROJECT.NOT_FOUND })

    const project = await projectService.deleteProject(req.params.id)
    res.json({ message: MESSAGES.PROJECT.DELETED, project })
  } catch (error) {
    res.status(500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

exports.getUsersByProject = async (req, res) => {
  try {
    const users = await projectService.getUsersByProject(req.params.id)

    res.status(200).json(users)

  } catch (error) {
    if (error.message === MESSAGES.PROJECT.NOT_FOUND) {
      return res.status(404).json({ message: MESSAGES.PROJECT.NOT_FOUND })
    }

    res.status(500).json({ message: MESSAGES.ERROR.SERVER })
  }
}
