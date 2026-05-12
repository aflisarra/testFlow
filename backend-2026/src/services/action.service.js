const Action = require('../models/action.model')

async function listActions() {
  return Action.find({}, { _id: 1, name: 1, path: 1 }).lean()
}

module.exports = {
  listActions,
}

