// ============================================================
// models/testsuite.js
// TestSuite MongoDB model
// Stores : description, docx file path, app URL, userId
// After creation → AI generates the test plan (planSteps)
// ============================================================
const mongoose = require('mongoose');
const planStepSchema = new mongoose.Schema(
    {
        contenu: {
            type: String,
            required: true,
            trim: true
        },
        ordre: {
            type: Number,
            required: true
        }
    },
    { _id: true }
);
const testPlanSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, trim: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, default: "", trim: true }
    },
    { _id: false }
);
const testCaseSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, trim: true },
        title: { type: String, required: true, trim: true },
        steps: { type: [String], default: [] },
        expected_result: { type: String, default: "", trim: true },
        createdBy: {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            name: { type: String, default: '' },
            picture: { type: String, default: '' }
        }
    },
    { _id: false }
);
const testCasesByPlanSchema = new mongoose.Schema(
    {
        planId: { type: String, required: true, trim: true },
        planTitle: { type: String, required: true, trim: true },
        testCases: { type: [testCaseSchema], default: [] }
    },
    { _id: false }
);
const planStatusSchema = new mongoose.Schema(
    {
        planId: { type: String, required: true, trim: true },
        status: { type: String, enum: ['pending', 'generating', 'reviewing', 'confirmed', 'completed', 'incomplete'], default: 'pending' }
    },
    { _id: false }
);
const validationPlanStatusSchema = new mongoose.Schema(
    {
        planId: { type: String, required: true, trim: true },
        status: { type: String, enum: ['pending', 'generating', 'reviewing', 'confirmed', 'rejected'], default: 'pending' }
    },
    { _id: false }
);
const executionPlanStatusSchema = new mongoose.Schema(
    {
        planId: { type: String, required: true, trim: true },
        status: { type: String, enum: ['completed', 'incomplete'], default: 'incomplete' }
    },
    { _id: false }
);

const lastActionBySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        name: {
            type: String,
            default: ''
        },
        action: {
            type: String,
            default: null,
            set: (value) => {
                if (value === null || value === undefined) return null
                const v = String(value || '').trim()
                return v || null
            },
            validate: {
                validator: (value) => {
                    if (value === null || value === undefined) return true
                    return ['generate-plan', 'generate-test-case', 'regenerate-plan', 'regenerate-test-case'].includes(
                        String(value).trim()
                    )
                },
                message:
                    'lastActionBy.action must be "generate-plan", "generate-test-case", "regenerate-plan", "regenerate-test-case", or null',
            },
        },
        at: {
            type: Date,
            default: null
        }
    },
    { _id: false }
);
const testSuiteSchema = new mongoose.Schema({
    // Name of the test suite (auto-generated or user-defined)
    nom: {
        type: String,
        required: true,
        trim: true
    },
    // Optional user-facing test name shown in listing tables
    nametest: {
        type: String,
        default: "",
        trim: true
    },
    // Short description entered by the user in the textarea
    // "What do you want to test ?"
    description: {
        type: String,
        trim: true
    },
    // Path to the uploaded .docx specification file
    // Stored on disk after multer upload
    specFilePath: {
        type: String,
        default: null
    },
    // Original filename of the uploaded .docx (for display)
    specFileName: {
        type: String,
        default: null
    },
    // Text extracted from the .docx by mammoth
    // Sent to FastAPI → Ollama to generate the test plan
    specText: {
        type: String,
        default: null
    },
    // Style configuration entered by the user (frontend)
    styleConfig: {
        type: String,
        default: ""
    },
    // Embedded test plan steps (preferred storage)
    // Avoids storing one MongoDB document per step in a separate collection.
    planSteps: {
        type: [planStepSchema],
        default: []
    },
    // New format: high-level test plans (TP-1, TP-2...)
    testPlans: {
        type: [testPlanSchema],
        default: []
    },
    // New format: generated test cases grouped by plan
    testCasesByPlan: {
        type: [testCasesByPlanSchema],
        default: []
    },

    // Session-level completion status persisted by frontend workflow
    sessionStatus: {
        type: String,
        enum: ['complete', 'incomplete'],
        default: 'incomplete'
    },
    // Persisted status per plan id
    planStatuses: {
        type: [planStatusSchema],
        default: []
    },
    // ============================================================
    // Enterprise Test Status System (AI generation + save + execution)
    // ============================================================
    // NOTE: This is intentionally separate from the computed `status` field
    // returned by services (completed/incomplete) to avoid
    // breaking existing UI flows.
    testStatus: {
        type: String,
        enum: ["Draft", "Generating", "Incomplete", "Ready", "Passed", "Failed"],
        default: "Draft",
    },
    lastGeneratedAt: {
        type: Date,
        default: null,
    },
    savedAt: {
        type: Date,
        default: null,
    },
    executedAt: {
        type: Date,
        default: null,
    },
    sessionSavedAt: {
        type: Date,
        default: null
    },
    // Manual validation of AI-generated plans/cases
    validationStatus: {
        type: String,
        enum: ['completed', 'incomplete', 'validated', 'invalid'],
        set: (value) => {
            const raw = String(value || '').toLowerCase().trim()
            if (raw === 'validated' || raw === 'completed' || raw === 'complete') return 'completed'
            if (raw === 'invalid' || raw === 'incomplete') return 'incomplete'
            return 'incomplete'
        },
        default: 'incomplete'
    },
    validationPlanStatuses: {
        type: [validationPlanStatusSchema],
        default: []
    },
    validationSavedAt: {
        type: Date,
        default: null
    },
    // Selenium execution results (null means "not executed yet")
    executionStatus: {
        type: String,
        default: null,
        set: (value) => {
            if (value === null || value === undefined) return null
            const v = String(value || '').toLowerCase().trim()
            return v || null
        },
        validate: {
            validator: (value) => {
                if (value === null || value === undefined) return true
                return ['completed', 'incomplete'].includes(String(value).toLowerCase().trim())
            },
            message: 'executionStatus must be "completed", "incomplete", or null',
        },
    },
    executionPlanStatuses: {
        type: [executionPlanStatusSchema],
        default: []
    },
    executionSavedAt: {
        type: Date,
        default: null
    },

    // Lightweight actor tracking (latest generation action only).
    // Additive only, no migration required.
    lastActionBy: {
        type: lastActionBySchema,
        default: () => ({})
    },
    // Target URL of the application to test
    urlCible: {
        type: String,
        trim: true
    },
    // Reference to the user who created this suite
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // A test suite belongs to a single project.
    // One project can own many test suites.
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null,
        index: true
    }
}, { timestamps: true });

module.exports = mongoose.model('TestSuite', testSuiteSchema);
