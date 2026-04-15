/**
 * ================================================================================
 * TEST SUITE CONTROLLER (testsuite.controller.js)
 * ================================================================================
 * 
 * PURPOSE:
 * Handles HTTP requests for TestSuite CRUD operations.
 * Receives requests from routes, calls service functions,
 * and sends responses back to the client.
 * 
 * DEPENDENCIES:
 * - testSuiteService: Contains business logic for TestSuite operations
 * 
 * ================================================================================
 */

const testSuiteService = require("../services/testsuite.service");

/**
 * ================================================================================
 * CREATE TEST SUITE
 * ================================================================================
 * Endpoint: POST /api/testsuites
 * 
 * Creates a new test suite with the provided data.
 */
exports.create = async (req, res) => {
  try {
    const suite = await testSuiteService.createTestSuite(req.body);
    res.status(201).json(suite);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ================================================================================
 * GET ALL TEST SUITES
 * ================================================================================
 * Endpoint: GET /api/testsuites
 * 
 * Retrieves all test suites from the database.
 */
exports.getAll = async (req, res) => {
  try {
    const suites = await testSuiteService.getAllTestSuites();
    res.json(suites);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ================================================================================
 * GET TEST SUITE BY ID
 * ================================================================================
 * Endpoint: GET /api/testsuites/:id
 * 
 * Retrieves a single test suite by its ID.
 */
exports.getById = async (req, res) => {
  try {
    const suite = await testSuiteService.getTestSuiteById(req.params.id);
    res.json(suite);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ================================================================================
 * GET TEST SUITES BY USER
 * ================================================================================
 * Endpoint: GET /api/testsuites/user/:userId
 * 
 * Retrieves all test suites created by a specific user.
 */
exports.getByUser = async (req, res) => {
  try {
    const suites = await testSuiteService.getTestSuitesByUser(req.params.userId);
    res.json(suites);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ================================================================================
 * UPDATE TEST SUITE
 * ================================================================================
 * Endpoint: PUT /api/testsuites/:id
 * 
 * Updates an existing test suite with new data.
 */
exports.update = async (req, res) => {
  try {
    const suite = await testSuiteService.updateTestSuite(req.params.id, req.body);
    res.json(suite);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ================================================================================
 * DELETE TEST SUITE
 * ================================================================================
 * Endpoint: DELETE /api/testsuites/:id
 * 
 * Deletes a test suite by its ID.
 */
exports.delete = async (req, res) => {
  try {
    await testSuiteService.deleteTestSuite(req.params.id);
    res.json({ message: "TestSuite supprimé" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * ================================================================================
 * GET TEST PLANS FOR SUITE
 * ================================================================================
 * Endpoint: GET /api/testsuites/:id/plans
 * 
 * Retrieves all test plans and test cases for a specific test suite.
 */
exports.getPlans = async (req, res) => {
  try {
    const result = await testSuiteService.getTestPlansByTestSuiteId(req.params.id)
    res.json(result)
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message })
  }
}

/**
 * ================================================================================
 * SAVE TEST SUITE SESSION
 * ================================================================================
 * Endpoint: PATCH /api/testsuites/:id/session
 * 
 * Saves session data including:
 * - sessionStatus (complete/incomplete)
 * - planStatuses (per-plan status)
 * - testCasesByPlan (test cases for each plan)
 */
exports.saveSession = async (req, res) => {
  try {
    const suite = await testSuiteService.saveSuiteSession(req.params.id, req.body || {})
    res.json({
      message: 'Session saved successfully',
      suite: {
        _id: suite._id,
        sessionStatus: suite.sessionStatus,
        planStatuses: suite.planStatuses || [],
        sessionSavedAt: suite.sessionSavedAt || null,
      },
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message })
  }
}
