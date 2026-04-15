const mongoose = require('mongoose')

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    milestoneDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'completed'],
      default: 'draft',
    },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
)

module.exports = mongoose.model('Project', projectSchema)
