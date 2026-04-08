const mongoose = require('mongoose')
const Project = require('../models/project.model')
const User = require('../models/user.model')

function toObjectIdList(ids) {
  if (!Array.isArray(ids)) return []
  return ids
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id))
}

async function validateUsers(userIds) {
  if (!userIds.length) return []
  const count = await User.countDocuments({ _id: { $in: userIds } })
  if (count !== userIds.length) {
    throw new Error('One or more users were not found')
  }
  return userIds
}

exports.createProject = async ({ ownerId, title, description, startDate, endDate, milestoneDate, status, assignedUsers }) => {
  const normalizedUsers = await validateUsers(toObjectIdList(assignedUsers))

  const project = new Project({
    ownerId,
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    startDate: startDate || null,
    endDate: endDate || null,
    milestoneDate: milestoneDate || null,
    status: status || 'draft',
    assignedUsers: normalizedUsers,
  })

  return project.save()
}

exports.getProjects = async ({ ownerId } = {}) => {
  const filter = ownerId ? { ownerId } : {}
  return Project.find(filter)
    .populate('ownerId', 'name email role')
    .populate('assignedUsers', 'name email role picture')
    .sort({ createdAt: -1 })
}

exports.getProjectById = async (id) => {
  return Project.findById(id)
    .populate('ownerId', 'name email role')
    .populate('assignedUsers', 'name email role picture')
}

exports.updateProject = async (id, payload) => {
  const update = {}
  if (payload.title !== undefined) update.title = String(payload.title || '').trim()
  if (payload.description !== undefined) update.description = String(payload.description || '').trim()
  if (payload.startDate !== undefined) update.startDate = payload.startDate || null
  if (payload.endDate !== undefined) update.endDate = payload.endDate || null
  if (payload.milestoneDate !== undefined) update.milestoneDate = payload.milestoneDate || null
  if (payload.status !== undefined) update.status = payload.status || 'draft'

  if (payload.assignedUsers !== undefined) {
    const normalizedUsers = await validateUsers(toObjectIdList(payload.assignedUsers))
    update.assignedUsers = normalizedUsers
  }

  return Project.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .populate('ownerId', 'name email role')
    .populate('assignedUsers', 'name email role picture')
}

exports.assignUsers = async (id, assignedUsers) => {
  const normalizedUsers = await validateUsers(toObjectIdList(assignedUsers))

  return Project.findByIdAndUpdate(
    id,
    { assignedUsers: normalizedUsers },
    { new: true, runValidators: true }
  )
    .populate('ownerId', 'name email role')
    .populate('assignedUsers', 'name email role picture')
}

exports.deleteProject = async (id) => {
  return Project.findByIdAndDelete(id)
}
