/**
 * ================================================================================
 * TEST SUITE MODEL (testsuite.js)
 * ================================================================================
 * 
 * PURPOSE:
 * Defines the MongoDB schema for the TestSuite collection.
 * TestSuites are containers that hold test plans and test cases for
 * a specific application feature or module being tested.
 * 
 * RELATIONSHIPS:
 * - userId: Links to User collection (who created this suite)
 * 
 * EMBEDDED SUB-DOCUMENTS:
 * - planSteps: Array of test steps (AI-generated E2E test steps)
 * - testPlans: High-level test plan categories (TP-1, TP-2, etc.)
 * - testCasesByPlan: Test cases grouped by their parent plan
 * - planStatuses: Progress tracking for each test plan
 * 
 * ================================================================================
 */

const mongoose = require('mongoose');

/**
 * --------------------------------------------------------------------------------
 * SUBSCHEMA: planStepSchema
 * --------------------------------------------------------------------------------
 * Represents a single test step within a test plan.
 * Used for storing AI-generated E2E test steps.
 * 
 * Fields:
 * - contenu: The step description text (required)
 * - ordre: The step order/sequence number (required)
 * --------------------------------------------------------------------------------
 */
const planStepSchema = new mongoose.Schema(
    {
        // The actual step description/instruction
        contenu: {
            type: String,
            required: true,
            trim: true
        },
        // Order number for sequencing steps (1, 2, 3, ...)
        ordre: {
            type: Number,
            required: true
        }
    },
    { _id: true }
);

/**
 * --------------------------------------------------------------------------------
 * SUBSCHEMA: testPlanSchema
 * --------------------------------------------------------------------------------
 * Represents a high-level test plan category.
 * Example: "TP-1: Authentication", "TP-2: Form Validation"
 * 
 * Fields:
 * - id: Unique identifier (e.g., "TP-1", "TP-2")
 * - title: Short title for the test plan
 * - description: Detailed description of what's being tested
 * --------------------------------------------------------------------------------
 */
const testPlanSchema = new mongoose.Schema(
    {
        // Plan ID like "TP-1", "TP-2", etc.
        id: { type: String, required: true, trim: true },
        // Short title for the test area
        title: { type: String, required: true, trim: true },
        // Detailed description
        description: { type: String, default: "", trim: true }
    },
    { _id: false }
);

/**
 * --------------------------------------------------------------------------------
 * SUBSCHEMA: testCaseSchema
 * --------------------------------------------------------------------------------
 * Represents an individual test case within a test plan.
 * Contains test steps and expected results.
 * 
 * Fields:
 * - id: Unique identifier (e.g., "TC-1.1", "TC-1.2")
 * - title: Test case title
 * - steps: Array of step descriptions
 * - expected_result: Expected outcome of the test
 * --------------------------------------------------------------------------------
 */
const testCaseSchema = new mongoose.Schema(
    {
        // Test case ID like "TC-1.1", "TC-1.2", etc.
        id: { type: String, required: true, trim: true },
        // What this test case verifies
        title: { type: String, required: true, trim: true },
        // Array of step-by-step instructions
        steps: { type: [String], default: [] },
        // Expected outcome when test passes
        expected_result: { type: String, default: "", trim: true }
    },
    { _id: false }
);

/**
 * --------------------------------------------------------------------------------
 * SUBSCHEMA: testCasesByPlanSchema
 * --------------------------------------------------------------------------------
 * Groups test cases under their parent test plan.
 * 
 * Fields:
 * - planId: Reference to the parent plan (e.g., "TP-1")
 * - planTitle: Title of the parent plan
 * - testCases: Array of test cases for this plan
 * --------------------------------------------------------------------------------
 */
const testCasesByPlanSchema = new mongoose.Schema(
    {
        // The parent plan's ID
        planId: { type: String, required: true, trim: true },
        // The parent plan's title
        planTitle: { type: String, required: true, trim: true },
        // All test cases for this plan
        testCases: { type: [testCaseSchema], default: [] }
    },
    { _id: false }
);

/**
 * --------------------------------------------------------------------------------
 * SUBSCHEMA: planStatusSchema
 * --------------------------------------------------------------------------------
 * Tracks the status/progress of each test plan.
 * 
 * Fields:
 * - planId: Reference to the plan
 * - status: Current status (pending, generating, reviewing, confirmed, completed, incomplete)
 * --------------------------------------------------------------------------------
 */
const planStatusSchema = new mongoose.Schema(
    {
        planId: { type: String, required: true, trim: true },
        status: { type: String, enum: ['pending', 'generating', 'reviewing', 'confirmed', 'completed', 'incomplete'], default: 'pending' }
    },
    { _id: false }
);

/**
 * ================================================================================
 * MAIN TEST SUITE SCHEMA
 * ================================================================================
 * 
 * Fields:
 * - nom: Name of the test suite (required)
 * - nametest: Optional display name shown in UI
 * - description: User-entered description ("What do you want to test?")
 * - specFilePath: Path to uploaded .docx spec file
 * - specFileName: Original filename for display
 * - specText: Extracted text from .docx (sent to AI for processing)
 * - styleConfig: UI style configuration from frontend
 * - planSteps: Embedded array of test steps
 * - testPlans: Embedded array of high-level test plans
 * - testCasesByPlan: Embedded array of test cases grouped by plan
 * - sessionStatus: Overall session completion status
 * - planStatuses: Per-plan status tracking
 * - sessionSavedAt: Timestamp of last session save
 * - urlCible: Target URL being tested
 * - userId: Reference to creator user
 * 
 * TIMESTAMPS: Automatically adds createdAt and updatedAt fields
 * ================================================================================
 */

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
    // May include colors, fonts, UI preferences
    styleConfig: {
        type: String,
        default: ""
    },

    // Embedded test plan steps (preferred storage)
    // Avoids storing one MongoDB document per step in a separate collection.
    // Each step has 'contenu' (text) and 'ordre' (order)
    planSteps: {
        type: [planStepSchema],
        default: []
    },

    // New format: high-level test plans (TP-1, TP-2...)
    // Generated by FastAPI/Ollama from the spec
    testPlans: {
        type: [testPlanSchema],
        default: []
    },

    // New format: generated test cases grouped by plan
    // Each entry contains planId, planTitle, and an array of test cases
    testCasesByPlan: {
        type: [testCasesByPlanSchema],
        default: []
    },

    // Session-level completion status persisted by frontend workflow
    // 'complete' means all test plans have been reviewed/confirmed
    // 'incomplete' means work is still in progress
    sessionStatus: {
        type: String,
        enum: ['complete', 'incomplete'],
        default: 'incomplete'
    },

    // Persisted status per plan id
    // Tracks progress: pending → generating → reviewing → confirmed → completed
    planStatuses: {
        type: [planStatusSchema],
        default: []
    },

    // Timestamp of when the session was last saved
    sessionSavedAt: {
        type: Date,
        default: null
    },

    // Target URL of the application to test
    // Example: "https://myapp.com/login"
    urlCible: {
        type: String,
        trim: true
    },

    // Reference to the user who created this suite
    // Links to the User collection
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }

}, { timestamps: true });

// Export the TestSuite model for use throughout the application
module.exports = mongoose.model('TestSuite', testSuiteSchema);
