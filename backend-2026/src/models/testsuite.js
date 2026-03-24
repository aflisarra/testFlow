// ============================================================
// models/testsuite.js
// TestSuite MongoDB model
// Stores : description, docx file path, app URL, userId
// After creation → AI generates the test plan (PlanTest)
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

const testSuiteSchema = new mongoose.Schema({

    // Name of the test suite (auto-generated or user-defined)
    nom: {
        type: String,
        required: true,
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

    // Embedded test plan steps (preferred storage)
    // Avoids storing one MongoDB document per step in a separate collection.
    planSteps: {
        type: [planStepSchema],
        default: []
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
    }

}, { timestamps: true });

module.exports = mongoose.model('TestSuite', testSuiteSchema);
