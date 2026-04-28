const mongoose = require('mongoose')

const ProjectInvitation = require('../models/projectInvitation.model')
const Project = require('../models/project.model')

function ensureObjectId(value, name = 'id') {
  const raw = String(value || '').trim()
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) {
    const err = new Error(`${name} is invalid`)
    err.statusCode = 400
    throw err
  }
  return new mongoose.Types.ObjectId(raw)
}

async function listPendingInvitationsForUser(userId) {
  const userObjectId = ensureObjectId(userId, 'userId')

  const invites = await ProjectInvitation.find({ userId: userObjectId, status: 'pending' })
    .populate('projectId', 'title description status ownerId assignedUsers')
    .populate('invitedBy', 'name email picture')
    .sort({ createdAt: -1 })
    .lean()

  return (invites || []).filter((inv) => {
    const project = inv?.projectId
    if (!project) return false
    const assigned = Array.isArray(project.assignedUsers) ? project.assignedUsers : []
    return assigned.some((id) => String(id) === String(userObjectId))
  })
}

async function acceptInvitation(invitationId, userId) {
  const inviteObjectId = ensureObjectId(invitationId, 'invitationId')
  const userObjectId = ensureObjectId(userId, 'userId')

  const invitation = await ProjectInvitation.findOne({ _id: inviteObjectId, userId: userObjectId })
  if (!invitation) {
    const err = new Error('Invitation not found')
    err.statusCode = 404
    throw err
  }

  if (invitation.status === 'accepted') return invitation
  if (invitation.status !== 'pending') {
    const err = new Error('Invitation is no longer pending')
    err.statusCode = 409
    throw err
  }

  const project = await Project.findById(invitation.projectId).select('_id assignedUsers').lean()
  if (!project) {
    invitation.status = 'revoked'
    invitation.respondedAt = new Date()
    await invitation.save()
    const err = new Error('Project no longer exists')
    err.statusCode = 410
    throw err
  }

  const assigned = Array.isArray(project.assignedUsers) ? project.assignedUsers : []
  const stillAssigned = assigned.some((id) => String(id) === String(userObjectId))
  if (!stillAssigned) {
    invitation.status = 'revoked'
    invitation.respondedAt = new Date()
    await invitation.save()
    const err = new Error('Invitation has been revoked')
    err.statusCode = 410
    throw err
  }

  invitation.status = 'accepted'
  invitation.respondedAt = new Date()
  const saved = await invitation.save()

  // Return a populated snapshot so the frontend can immediately navigate/show the project.
  const populated = await ProjectInvitation.findById(saved._id)
    .populate('projectId', 'title description status ownerId assignedUsers')
    .populate('invitedBy', 'name email picture')
    .lean()

  return populated || saved
}

async function ignoreInvitation(invitationId, userId) {
  const inviteObjectId = ensureObjectId(invitationId, 'invitationId')
  const userObjectId = ensureObjectId(userId, 'userId')

  const invitation = await ProjectInvitation.findOne({ _id: inviteObjectId, userId: userObjectId })
  if (!invitation) {
    const err = new Error('Invitation not found')
    err.statusCode = 404
    throw err
  }

  if (invitation.status === 'ignored') return invitation
  if (invitation.status !== 'pending') {
    const err = new Error('Invitation is no longer pending')
    err.statusCode = 409
    throw err
  }

  invitation.status = 'ignored'
  invitation.respondedAt = new Date()
  const saved = await invitation.save()

  const populated = await ProjectInvitation.findById(saved._id)
    .populate('projectId', 'title description status ownerId assignedUsers')
    .populate('invitedBy', 'name email picture')
    .lean()

  return populated || saved
}

module.exports = {
  listPendingInvitationsForUser,
  acceptInvitation,
  ignoreInvitation,
}
