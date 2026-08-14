const mongoose = require('mongoose')
const {
  PRIORITY_VALUES,
  castPriority,
  normalizeRequirements,
  normalizeEvidence,
} = require('../utils/test-artifact-fields')

const requirementSchema = new mongoose.Schema(
  {
    id: { type: String, default: '', trim: true },
    title: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    source: { type: String, default: '', trim: true },
    priority: { type: String, default: '', trim: true },
  },
  { _id: false }
)

const evidenceSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true, trim: true },
    externalId: { type: String, default: '', trim: true },
    role: { type: String, required: true, trim: true },
    title: { type: String, default: '', trim: true },
    description: { type: String, required: true, trim: true },
    source: { type: String, default: '', trim: true },
  },
  { _id: false }
)

const testPlanSchema = new mongoose.Schema(
  {
    testSuiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestSuite',
      required: true,
      index: true,
    },
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    objective: { type: String, default: '', trim: true },
    scope: { type: String, default: '', trim: true },
    module: { type: String, default: null, trim: true },
    moduleId: { type: String, default: null, trim: true },
    planKind: { type: String, enum: ['functional', 'quality'], default: 'functional' },
    coverageStatus: { type: String, enum: ['ready', 'needs_review'], default: 'ready' },
    priority: {
      type: String,
      enum: PRIORITY_VALUES,

      default: 'medium',
      set: castPriority,
    },
    requirements: {
      type: [requirementSchema],
      default: [],
      set: normalizeRequirements,
      validate: {
        validator: (requirements) =>
          Array.isArray(requirements) &&
          requirements.every((requirement) =>
            Boolean(
              String(requirement?.id || '').trim() ||
                String(requirement?.title || '').trim() ||
                String(requirement?.description || '').trim()
            )
          ),
        message: 'Each requirement must include at least an id, title, or description',
      },
    },
    evidence: { type: [evidenceSchema], default: [], set: normalizeEvidence },

    
  },
  { timestamps: true }
)

// Prevent duplicated docs for the same suite + plan id during dual-write.
testPlanSchema.index({ testSuiteId: 1, id: 1 }, { unique: true })

module.exports = mongoose.model('TestPlan', testPlanSchema)

/*
Future step:
- migrate TestSuite.testPlans → TestPlan collection
- then remove embedded arrays safely
*/
