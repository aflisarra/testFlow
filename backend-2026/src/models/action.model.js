const mongoose = require('mongoose')

// Actions use fixed numeric ids (1..16) to keep compatibility with requireAction(6/7/8/...) and the frontend menu.
const actionSchema = new mongoose.Schema(
  {
    _id: { type: Number, required: true },
    name: { type: String, required: true, unique: true },
    path: { type: String, required: true, unique: true },
  },
  { _id: false }
)

module.exports = mongoose.model('Action', actionSchema)

