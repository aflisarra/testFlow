const mongoose = require('mongoose')

const ROLE_LABELS = ['CONTEXT', 'ACTOR', 'FEATURE', 'REQUIREMENT', 'ACCEPTANCE', 'NON_FUNCTIONAL', 'OUT_OF_SCOPE', 'GLOSSARY', 'UNTAGGED']
const ROLE_METHODS = ['regex', 'heading', 'human', 'none']
const REVIEW_STATES = ['pending', 'resolved', 'dismissed']
const MODULE_METHODS = ['source', 'heading', 'hybrid', 'human', 'none']
const MODULE_DISPOSITIONS = ['assigned', 'unassigned', 'cross_cutting', 'excluded']

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
  moduleIds: { type: [String], default: [] },
  primaryModuleId: { type: String, default: null, trim: true },
  moduleMethod: { type: String, enum: MODULE_METHODS, required: true, default: 'none' },
  moduleScore: { type: Number, default: null },
  moduleMargin: { type: Number, default: null },
  moduleDisposition: { type: String, enum: MODULE_DISPOSITIONS, required: true, default: 'unassigned' },
  moduleAlgorithmVersion: { type: String, default: null, trim: true },
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
module.exports.MODULE_METHODS = MODULE_METHODS
module.exports.MODULE_DISPOSITIONS = MODULE_DISPOSITIONS
