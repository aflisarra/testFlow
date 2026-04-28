const mongoose = require('mongoose')

// Legacy model kept for backward compatibility.
// Some services/routes still call PlanTest.find(...) to migrate old test plans.
const planTestSchema = new mongoose.Schema(
  {
    contenu: { type: String, required: true, trim: true },
    ordre: { type: Number, required: true },
    testSuiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestSuite',
      required: true,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('PlanTest', planTestSchema)

