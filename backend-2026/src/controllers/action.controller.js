const actionService = require('../services/action.service')

async function list(req, res) {
  try {
    const actions = await actionService.listActions()
    return res.json(actions)
  } catch (err) {
    // Keep log for debugging; avoid throwing raw error to client.
    // eslint-disable-next-line no-console
    console.error(err)
    return res.status(500).json({ message: 'Failed to load actions' })
  }
}

module.exports = {
  list,
}

