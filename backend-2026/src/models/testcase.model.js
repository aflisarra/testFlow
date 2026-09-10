const mongoose = require('mongoose')
const {
  PRIORITY_VALUES,
  SEVERITY_VALUES,
  TEST_CASE_TYPE_VALUES,
  castPriority,
  castSeverity,
  castTestCaseType,
  normalizeStringList,
  normalizeRequirements,
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

const stepDetailSchema = new mongoose.Schema(
  {
    step: { type: String, default: '', trim: true },
    expected_result: { type: String, default: '', trim: true },
    actual_result: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['pending', 'passed', 'failed_execution', 'failed_assertion', 'skipped'],
      default: 'pending',
    },
  },
  { _id: false }
)

const createdBySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    name: { type: String, default: '' },
    picture: { type: String, default: '' },
  },
  { _id: false }
)

const testCaseSchema = new mongoose.Schema(
  {
    testSuiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestSuite',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestPlan',
      required: true,
      index: true,
    },
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    objective: { type: String, default: '', trim: true },
    preconditions: {
      type: [String],
      default: [],
      set: normalizeStringList,
    },
    dependsOn: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'TestCase',
        },
      ],
      default: [],
    },
    
// Mixed, not [String]: the generator produces a keyed map
// ({"Username": "Admin", "Password": "admin123456"}) and casting that to
// an array of strings silently discarded the keys, leaving the executor
// with bare values it could only assign to fields by position. Mixed keeps
// the mapping intact while still accepting the legacy array-of-strings
// documents already stored.
test_data: {
  type: mongoose.Schema.Types.Mixed,
  default: () => ({}),
},

    priority: {
      type: String,
      enum: PRIORITY_VALUES,
      default: 'medium',
      set: castPriority,
    },
    severity: {
      type: String,
      enum: SEVERITY_VALUES,
      default: 'major',
      set: castSeverity,
    },
    type: {
      type: String,
      enum: TEST_CASE_TYPE_VALUES,
      default: 'functional',
      set: castTestCaseType,
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
    steps: { type: [String], default: [] },
    stepDetails: {
      type: [stepDetailSchema],
      default: [],
    },
    expected_result: { type: String, default: '', trim: true },
    executionModel: { type: mongoose.Schema.Types.Mixed, default: null },

    // ✅ FIXED
    createdBy: {
      type: createdBySchema,
      default: null,
    },
  },
  { timestamps: true }
)

testCaseSchema.index({ testSuiteId: 1, planId: 1, id: 1 }, { unique: true })

module.exports = mongoose.model('TestCase', testCaseSchema)
