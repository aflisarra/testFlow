const mongoose = require('mongoose')

/* ─────────────────────────────────────────────
   STEP RESULT SCHEMA
───────────────────────────────────────────── */

const stepResultSchema = new mongoose.Schema({

  index: {
    type: Number,
    default: 0
  },

  step: {
    type: String,
    default: ''
  },

  action: {
    type: String,
    default: ''
  },

status: {
  type: String,
  enum: [
    'passed',
    'failed_execution',
    'failed_assertion',
    'skipped'
  ],
  default: 'passed'
},

actualResult: {
  type: String,
  default: ''
},

expectedResult: {
  type: String,
  default: ''
},

  duration: {
    type: Number,
    default: 0
  },

  error: {
    type: String,
    default: ''
  },

  selector: {
    type: String,
    default: ''
  },

screenshot: {

  filename: {
    type: String,
    default: ''
  },

  path: {
    type: String,
    default: ''
  },

  publicUrl: {
    type: String,
    default: ''
  },

  createdAt: {
    type: String,
    default: ''
  }
},

  startedAt: {
    type: Date,
    default: Date.now
  },

  finishedAt: {
    type: Date,
    default: null
  }

}, { _id: false })

/* ─────────────────────────────────────────────
   LOG SCHEMA
───────────────────────────────────────────── */

const logSchema = new mongoose.Schema({

  timestamp: {
    type: String,
    default: () => new Date().toISOString()
  },

  stepIndex: {
    type: Number,
    default: 0
  },

  level: {
    type: String,
    enum: [
      'INFO',
      'ACTION',
      'SUCCESS',
      'WARN',
      'ERROR'
    ],
    default: 'INFO'
  },

  message: {
    type: String,
    default: ''
  },

  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }

}, { _id: false })

/* ─────────────────────────────────────────────
   MAIN EXECUTION SCHEMA
───────────────────────────────────────────── */

const testExecutionSchema = new mongoose.Schema({

  executionId: {
    type: String,
    required: true,
    unique: true
  },

  /* ───────────────────────── */

  testSuiteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestSuite',
    required: true
  },

  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestPlan',
    default: null
  },

  testCaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestCase',
    default: null
  },

  /* ───────────────────────── */

  planKey: {
    type: String,
    default: ''
  },

  testCaseKey: {
    type: String,
    default: ''
  },

  /* ───────────────────────── */

  planTitle: {
    type: String,
    default: ''
  },

  testCaseTitle: {
    type: String,
    default: ''
  },

  /* ───────────────────────── */

  status: {
    type: String,
   enum: [
  'running',
  'passed',
  'failed',
  'failed_execution',
  'failed_assertion',
  'aborted'
]
,
    default: 'running'
  },

  /* ───────────────────────── */

  environment: {
    type: String,
    default: 'Staging'
  },

  browser: {
    type: String,
    default: 'Chrome'
  },

  platform: {
    type: String,
    default: 'Windows'
  },

  /* ───────────────────────── */

  logs: {
    type: [logSchema],
    default: []
  },

  /* ───────────────────────── */

  screenshots: {
    type: [String],
    default: []
  },

  videoUrl: {
    type: String,
    default: null
  },

  /* ───────────────────────── */

  duration: {
    type: Number,
    default: 0
  },

  /* ───────────────────────── */

  nodeMetrics: {

    cpuLoad: {
      type: Number,
      default: 0
    },

    memoryUsage: {
      type: String,
      default: ''
    },

    latency: {
      type: String,
      default: ''
    },

    threads: {
      type: Number,
      default: 0
    }
  },

  /* ───────────────────────── */

  stepsResults: {
    type: [stepResultSchema],
    default: []
  },

  /* ───────────────────────── */

  executionModel: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
//for debug 
  linkedDefects: [{
  id: String,
  title: String
}],

  /* ───────────────────────── */

  startedAt: {
    type: Date,
    default: Date.now
  },

  finishedAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
})

module.exports = mongoose.model(
  'TestExecution',
  testExecutionSchema
)