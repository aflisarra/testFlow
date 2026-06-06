const mongoose = require('mongoose')

const stepResultSchema = new mongoose.Schema(
  {
    step: String,

    status: {
      type: String,
      enum: ['passed', 'failed', 'skipped'],
      default: 'passed',
    },

    error: {
      type: String,
      default: '',
    },

    screenshot: {
      type: String,
      default: null,
    },
  },
  { _id: false }
)

const testExecutionSchema = new mongoose.Schema(
  {
    executionId: {
      type: String,
      required: true,
      unique: true,
    },

    testSuiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestSuite',
      required: true,
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestPlan',
      default: null,
    },

    testCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestCase',
      default: null,
    },

    planKey: {
      type: String,
      default: '',
    },

    testCaseKey: {
      type: String,
      default: '',
    },

    planTitle: {
      type: String,
      default: '',
    },

    testCaseTitle: {
      type: String,
      default: '',
    },

    status: {
      type: String,
      enum: ['running', 'passed', 'failed', 'aborted'],
      default: 'running',
    },

    environment: {
      type: String,
      default: 'Staging',
    },

    browser: {
      type: String,
      default: 'Chrome',
    },

    logs: {
      type: [String],
      default: [],
    },

    screenshots: {
      type: [String],
      default: [],
    },

    videoUrl: {
      type: String,
      default: null,
    },

    duration: {
      type: Number,
      default: 0,
    },

    nodeMetrics: {
      cpuLoad: Number,
      memoryUsage: String,
      latency: String,
      threads: Number,
    },

    stepsResults: {
      type: [stepResultSchema],
      default: [],
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    finishedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('TestExecution', testExecutionSchema)
