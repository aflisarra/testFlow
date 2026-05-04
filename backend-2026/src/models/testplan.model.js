const mongoose = require('mongoose')

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

