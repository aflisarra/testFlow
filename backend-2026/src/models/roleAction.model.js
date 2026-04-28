const mongoose = require('mongoose');

const roleActionSchema = new mongoose.Schema({
  // Legacy support: roleId can be an ObjectId (new roles) OR a Number (old seeded roles)
  roleId: { type: mongoose.Schema.Types.Mixed, ref: 'Role', required: true },
  // Action ids are numeric (see action.model.js)
  actionId: { type: Number, ref: 'Action', required: true }
}, { timestamps: true });

module.exports = mongoose.model('RoleAction', roleActionSchema);
