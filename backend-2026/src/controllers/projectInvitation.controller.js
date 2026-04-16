const invitationService = require('../services/projectInvitation.service')

exports.getMyPendingInvitations = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const invitations = await invitationService.listPendingInvitationsForUser(userId)
    res.json(invitations)
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server error' })
  }
}

exports.acceptInvitation = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const updated = await invitationService.acceptInvitation(req.params.id, userId)
    res.json({ message: 'Invitation accepted', invitation: updated })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server error' })
  }
}

exports.ignoreInvitation = async (req, res) => {
  try {
    const userId = req.user?.userId
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const updated = await invitationService.ignoreInvitation(req.params.id, userId)
    res.json({ message: 'Invitation ignored', invitation: updated })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server error' })
  }
}

