const mongoose = require('mongoose')

const moduleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  source_item_ids: { type: [String], default: [] },
}, { _id: false })

const schema = new mongoose.Schema({
  specHash: { type: String, required: true, unique: true, trim: true },
  status: { type: String, enum: ['writing', 'ready', 'failed'], required: true, default: 'writing' },
  itemCount: { type: Number, required: true, default: 0, min: 0 },
  modules: {
    type: [moduleSchema],
    default: [],
    validate: { validator: (modules) => Array.isArray(modules) && modules.length <= 12, message: 'At most 12 modules are allowed' },
  },
}, { timestamps: true })

module.exports = mongoose.model('SpecIngestion', schema)
