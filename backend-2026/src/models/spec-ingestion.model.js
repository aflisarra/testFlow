const mongoose = require('mongoose')

const moduleSchema = new mongoose.Schema({
  id: { type: String, default: null, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['functional', 'quality'], default: 'functional' },
  source_item_ids: { type: [String], default: [] },
}, { _id: false })

const MODULE_STATUSES = ['pending', 'generating', 'ready', 'needs_review', 'failed', 'stale']

const schema = new mongoose.Schema({
  specHash: { type: String, required: true, unique: true, trim: true },
  status: { type: String, enum: ['writing', 'ready', 'failed'], required: true, default: 'writing' },
  itemCount: { type: Number, required: true, default: 0, min: 0 },
  modules: {
    type: [moduleSchema],
    default: [],
    validate: { validator: (modules) => Array.isArray(modules) && modules.length <= 12, message: 'At most 12 modules are allowed' },
  },
  moduleStatus: { type: String, enum: MODULE_STATUSES, required: true, default: 'pending' },
  moduleVersion: { type: Number, required: true, default: 0, min: 0 },
  moduleAlgorithmVersion: { type: String, default: null, trim: true },
  moduleEvidenceFingerprint: { type: String, default: null, trim: true },
  moduleGenerationStartedAt: { type: Date, default: null },
  moduleGenerationCompletedAt: { type: Date, default: null },
  moduleGenerationError: { type: String, default: null },
  moduleGenerationLease: { type: String, default: null, trim: true },
  moduleCoverageSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true })

const SpecIngestion = mongoose.model('SpecIngestion', schema)
module.exports = SpecIngestion
module.exports.MODULE_STATUSES = MODULE_STATUSES
