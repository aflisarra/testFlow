const mongoose = require('mongoose');

const roleActionSchema = new mongoose.Schema({
  roleId: { type: Number, ref: 'Role', required: true },
  actionId: { type: Number, ref: 'Action', required: true }
}, { timestamps: true });

module.exports = mongoose.model('RoleAction', roleActionSchema);