const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  // Actions IDs are numeric (see action.model.js) and must stay stable for requireAction(6/7/8/...)
  actions: [{ type: Number, ref: 'Action', default: [] }]
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
