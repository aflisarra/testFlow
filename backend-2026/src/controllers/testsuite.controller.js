const testSuiteService = require("../services/testsuite.service");

exports.create = async (req, res) => {
  try {
    const suite = await testSuiteService.createTestSuite(req.body);
    res.status(201).json(suite);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const suites = await testSuiteService.getAllTestSuites();
    res.json(suites);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const suite = await testSuiteService.getTestSuiteById(req.params.id);
    res.json(suite);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const suites = await testSuiteService.getTestSuitesByUser(req.params.userId);
    res.json(suites);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const suite = await testSuiteService.updateTestSuite(req.params.id, req.body);
    res.json(suite);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    await testSuiteService.deleteTestSuite(req.params.id);
    res.json({ message: "TestSuite supprimé" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPlans = async (req, res) => {
  try {
    const result = await testSuiteService.getTestPlansByTestSuiteId(req.params.id)
    res.json(result)
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message })
  }
}
