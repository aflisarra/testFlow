const mongoose = require('mongoose');

const actionSchema = new mongoose.Schema({
  _id: { type: Number, required: true },
  name: { type: String, required: true, unique: true },
  path: { type: String, required: true, unique: true }
}, { _id: false });

module.exports = mongoose.model('Action', actionSchema);