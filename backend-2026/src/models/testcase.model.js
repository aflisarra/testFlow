const mongoose = require('mongoose')

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
    steps: { type: [String], default: [] },
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
