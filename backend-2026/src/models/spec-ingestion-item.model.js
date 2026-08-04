const mongoose = require('mongoose')

const ROLE_LABELS = ['CONTEXT', 'ACTOR', 'FEATURE', 'REQUIREMENT', 'ACCEPTANCE', 'NON_FUNCTIONAL', 'OUT_OF_SCOPE', 'GLOSSARY', 'UNTAGGED']
const ROLE_METHODS = ['regex', 'heading', 'human', 'none']
const REVIEW_STATES = ['pending', 'resolved', 'dismissed']

const schema = new mongoose.Schema({
  specHash: { type: String, required: true, index: true, trim: true },
  itemId: { type: String, required: true, trim: true },
  sourceChunkId: { type: String, required: true, trim: true },
  headingPath: { type: [String], default: [] },
  text: { type: String, required: true },
  role: { type: String, enum: ROLE_LABELS, required: true, default: 'UNTAGGED' },
  roleMethod: { type: String, enum: ROLE_METHODS, required: true, default: 'none' },
  roleScore: { type: Number, default: null },
  module: { type: String, required: true, default: 'UNTAGGED' },
  moduleScore: { type: Number, required: true, default: 0 },
  reviewed: { type: Boolean, required: true, default: false },
  reviewedBy: { type: String, default: null, trim: true },
  reviewState: { type: String, enum: REVIEW_STATES, required: true, default: 'pending' },
  dismissedAt: { type: Date, default: null },
  dismissedBy: { type: String, default: null, trim: true },
  dismissalReason: { type: String, default: null, trim: true },
  suggestedRole: { type: String, default: null },
  requirementId: { type: String, default: null },
}, { timestamps: true })

schema.index({ specHash: 1, itemId: 1 }, { unique: true })
schema.index({ specHash: 1, role: 1, reviewed: 1 })

const SpecIngestionItem = mongoose.model('SpecIngestionItem', schema)
module.exports = SpecIngestionItem
module.exports.ROLE_LABELS = ROLE_LABELS
module.exports.ROLE_METHODS = ROLE_METHODS
module.exports.REVIEW_STATES = REVIEW_STATES
