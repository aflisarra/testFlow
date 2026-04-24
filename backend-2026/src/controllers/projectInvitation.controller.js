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

    const updated = await invitationService.acceptInvitation(req.params.id, userId)
    res.json({ message: MESSAGES.INVITATION.ACCEPTED, invitation: updated })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

exports.ignoreInvitation = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ message: MESSAGES.INVITATION.UNAUTHORIZED })

    const updated = await invitationService.ignoreInvitation(req.params.id, userId)
    res.json({ message: MESSAGES.INVITATION.IGNORED, invitation: updated })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || MESSAGES.ERROR.SERVER })
  }
}

