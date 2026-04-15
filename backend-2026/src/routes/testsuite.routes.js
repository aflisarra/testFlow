/**
 * ================================================================================
 * TEST SUITE ROUTES (testsuite.routes.js)
 * ================================================================================
 * 
 * PURPOSE:
 * Defines API endpoints for TestSuite CRUD operations.
 * Maps HTTP methods and paths to controller functions.
 * 
 * BASE PATH: /api/testsuites
 * 
 * DEPENDENCIES:
 * - express: Router for defining routes
 * - testsuite.controller: Contains request handlers
 * 
 * AVAILABLE ROUTES:
 * - POST   /          → Create new test suite
 * - GET    /          → Get all test suites
 * - GET    /user/:userId → Get test suites by user
 * - GET    /:id       → Get single test suite by ID
 * - GET    /:id/plans → Get test plans for a test suite
 * - PATCH  /:id/session → Save session data
 * - PUT    /:id       → Update test suite
 * - DELETE /:id       → Delete test suite
 * 
 * ================================================================================
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/testsuite.controller');

/**
 * POST /
 * Create a new test suite
 * Request Body: { nom, description, urlCible, userId, ... }
 * Response: Created test suite object
 */
router.post('/', controller.create);

/**
 * GET /
 * Get all test suites
 * Response: Array of test suite objects
 */
router.get('/', controller.getAll);

/**
 * GET /user/:userId
 * Get test suites filtered by user ID
 * Response: Array of test suite objects for the specified user
 */
router.get('/user/:userId', controller.getByUser);

/**
 * GET /:id/plans
 * Get test plans for a specific test suite
 * Response: { testSuiteId, testPlans, testCasesByPlan, sessionStatus, ... }
 */
router.get('/:id/plans', controller.getPlans)

/**
 * PATCH /:id/session
 * Save session data for a test suite
 * Request Body: { suiteStatus, planStatuses, testCasesByPlan, ... }
 * Response: Updated test suite with session info
 */
router.patch('/:id/session', controller.saveSession);

/**
 * GET /:id
 * Get a single test suite by ID
 * Response: Test suite object
 */
router.get('/:id', controller.getById);

/**
 * PUT /:id
 * Update an existing test suite
 * Request Body: Updated fields { nom, description, ... }
 * Response: Updated test suite object
 */
router.put('/:id', controller.update);

/**
 * DELETE /:id
 * Delete a test suite by ID
 * Response: Success message
 */
router.delete('/:id', controller.delete);

// Export the router for use in index.js
module.exports = router;
