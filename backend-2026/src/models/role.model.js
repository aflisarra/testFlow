const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const roleSchema = new mongoose.Schema({
  _id: { type: Number },
  name: { type: String, required: true },
  description: { type: String, required: true },
  actions: [{ type: Number, ref: 'Action', default: [] }]

}, { _id: false });

roleSchema.plugin(AutoIncrement, { inc_field: '_id', start_seq: 1 });

module.exports = mongoose.model('Role', roleSchema);
