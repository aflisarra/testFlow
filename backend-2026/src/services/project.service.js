const mongoose = require('mongoose')
const Project = require('../models/project.model')
const User = require('../models/user.model')
const ProjectInvitation = require('../models/projectInvitation.model')

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

  const saved = await project.save()
  await syncInvitationsForProject(saved, { invitedBy: ownerId })
  return saved
}

exports.getProjects = async ({ ownerId, userId } = {}) => {
  if (ownerId) {
    return Project.find({ ownerId })
      .populate('ownerId', 'name email role')
      .populate('assignedUsers', 'name email role picture')
      .sort({ createdAt: -1 })
  }

  if (userId) {
    const accepted = await ProjectInvitation.find({ userId, status: 'accepted' })
      .select('projectId')
      .lean()
    const acceptedProjectIds = (accepted || []).map((x) => x.projectId).filter(Boolean)

    return Project.find({ $or: [{ ownerId: userId }, { _id: { $in: acceptedProjectIds } }] })
      .populate('ownerId', 'name email role')
      .populate('assignedUsers', 'name email role picture')
      .sort({ createdAt: -1 })
  }

  return Project.find({})
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

  const updated = await Project.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .populate('ownerId', 'name email role')
    .populate('assignedUsers', 'name email role picture')

  if (updated && payload.assignedUsers !== undefined) {
    await syncInvitationsForProject(updated, { invitedBy: updated.ownerId?._id || updated.ownerId })
  }
  return updated
}

exports.assignUsers = async (id, assignedUsers) => {
  const normalizedUsers = await validateUsers(toObjectIdList(assignedUsers))

  const updated = await Project.findByIdAndUpdate(
    id,
    { assignedUsers: normalizedUsers },
    { new: true, runValidators: true }
  )
    .populate('ownerId', 'name email role')
    .populate('assignedUsers', 'name email role picture')

  if (updated) {
    await syncInvitationsForProject(updated, { invitedBy: updated.ownerId?._id || updated.ownerId })
  }
  return updated
}

exports.deleteProject = async (id) => {
  return Project.findByIdAndDelete(id)
}

async function syncInvitationsForProject(project, { invitedBy }) {
  const projectId = project?._id
  if (!projectId) return

  const normalizeId = (value) => {
    let raw = ''
    if (value && typeof value === 'object') {
      raw = String(value?._id || value?.id || '').trim()
      if (!raw) raw = String(value).trim()
    } else {
      raw = String(value || '').trim()
    }
    if (!raw) return ''
    if (!mongoose.Types.ObjectId.isValid(raw)) return ''
    return raw
  }

  const ownerId = normalizeId(project?.ownerId)
  const invitedById = normalizeId(invitedBy) || ownerId

  const assigned = Array.isArray(project?.assignedUsers) ? project.assignedUsers : []
  const assignedIds = assigned.map((u) => normalizeId(u)).filter(Boolean)
  const inviteUserIds = assignedIds.filter((id) => id !== ownerId)

  const existing = await ProjectInvitation.find({ projectId }).select('_id userId status').lean()
  const existingByUser = new Map((existing || []).map((x) => [String(x.userId), x]))

  const upserts = inviteUserIds.map((userId) => {
    const current = existingByUser.get(String(userId))
    const keepAccepted = current?.status === 'accepted'

    const update = keepAccepted
      ? { $set: { invitedBy: invitedById } }
      : { $set: { invitedBy: invitedById, status: 'pending', respondedAt: null } }

    return ProjectInvitation.updateOne(
      { projectId, userId: new mongoose.Types.ObjectId(userId) },
      update,
      { upsert: true }
    )
  })

  const removedUserIds = (existing || [])
    .map((x) => String(x.userId))
    .filter((uid) => uid && !inviteUserIds.includes(uid))

  const removedObjectIds = removedUserIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id))

  const revoke = removedObjectIds.length
    ? ProjectInvitation.updateMany(
        { projectId, userId: { $in: removedObjectIds }, status: { $in: ['pending', 'accepted'] } },
        { $set: { status: 'revoked', respondedAt: new Date() } }
      )
    : Promise.resolve()

  await Promise.all([...upserts, revoke])
}
