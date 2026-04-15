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
    const ownerId = mineOnly ? req.user?.userId : undefined
    const projects = await projectService.getProjects({ ownerId })
    res.json(projects)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.getProjectById = async (req, res) => {
  try {
    const project = await projectService.getProjectById(req.params.id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    res.json(project)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.updateProject = async (req, res) => {
  try {
    const project = await projectService.updateProject(req.params.id, req.body)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    res.json({ message: 'Project updated successfully', project })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.assignUsers = async (req, res) => {
  try {
    const project = await projectService.assignUsers(req.params.id, req.body?.assignedUsers || [])
    if (!project) return res.status(404).json({ message: 'Project not found' })
    res.json({ message: 'Users assigned successfully', project })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}

exports.deleteProject = async (req, res) => {
  try {
    const project = await projectService.deleteProject(req.params.id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    res.json({ message: 'Project deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' })
  }
}
