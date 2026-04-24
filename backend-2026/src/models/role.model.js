const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  actions: [{ type: Number, ref: 'Action', default: [] }]
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
