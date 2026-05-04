const mongoose = require('mongoose')

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
  },
  { timestamps: true }
)

// Prevent duplicated docs for the same suite + plan + case id during dual-write.
testCaseSchema.index({ testSuiteId: 1, planId: 1, id: 1 }, { unique: true })

module.exports = mongoose.model('TestCase', testCaseSchema)

/*
Future step:
- migrate TestSuite.testCasesByPlan → TestCase collection
- then remove embedded arrays safely
*/

