const invitationService = require('../services/projectInvitation.service')
const MESSAGES = require('../constants/messages.js');
exports.getMyPendingInvitations = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    const invitations = await invitationService.listPendingInvitationsForUser(userId)
    res.json(invitations)
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

exports.acceptInvitation = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    const invitation = await invitationService.acceptInvitation(req.params.id, userId)
    const projectId = String((invitation && (invitation.projectId?._id || invitation.projectId)) || '').trim() || null

    res.json({ message: MESSAGES.INVITATION.ACCEPTED, projectId, invitation })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

exports.ignoreInvitation = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    const invitation = await invitationService.ignoreInvitation(req.params.id, userId)
    const projectId = String((invitation && (invitation.projectId?._id || invitation.projectId)) || '').trim() || null

    res.json({ message: MESSAGES.INVITATION.IGNORED, projectId, invitation })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}
