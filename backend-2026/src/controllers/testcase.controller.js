const testCaseService = require('../services/testcase.service')
const MESSAGES = require('../constants/messages')
const TestCase = require('../models/testcase.model')
exports.create = async (req, res) => {
  try {
    const testCase = await testCaseService.createTestCase(req.body)

    res.status(201).json(testCase)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}

exports.getByPlan = async (req, res) => {
  try {
    const cases = await testCaseService.getByPlan(
      req.params.testPlanId
    )

    res.status(200).json(cases)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

exports.update = async (req, res) => {
  try {
    const testCase = await testCaseService.updateTestCase(
      req.params.id,
      req.body
    )

    res.status(200).json(testCase)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}

exports.delete = async (req, res) => {
  try {
    await testCaseService.deleteTestCase(req.params.id)

    res.status(200).json({
      message: MESSAGES.TESTCASES.DELETED,
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}

exports.getDependencies = async (req, res) => {
  try {
    const testCase = await TestCase.findById(req.params.id).populate('dependsOn', 'id title').lean()
    if (!testCase) return res.status(404).json({ message: 'TestCase not found' })
    return res.status(200).json({ dependsOn: Array.isArray(testCase.dependsOn) ? testCase.dependsOn : [] })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message })
  }
}

exports.updateDependencies = async (req, res) => {
  try {
    const testCase = await testCaseService.updateTestCase(req.params.id, {
      dependsOn: Array.isArray(req.body?.dependsOn) ? req.body.dependsOn : [],
    })
    res.status(200).json(testCase)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
      details: error.details || undefined,
    })
  }
}

exports.validateDependencies = async (req, res) => {
  try {
    const result = await testCaseService.validateExecutionDependencies({
      testSuiteId: req.body?.testSuiteId,
      selectedCaseIds: req.body?.testCaseIds || req.body?.selectedCaseIds || [],
      includeDependencies: Boolean(req.body?.includeDependencies),
    })
    res.status(200).json(result)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      allowed: false,
      message: error.message,
      details: error.details || undefined,
    })
  }
}
exports.getForSelenium = async (req, res) => {
  try {
    const data = await testCaseService.getTestCasesForSelenium(
      req.params.testSuiteId
    )

    res.status(200).json({
      success: true,
      data
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
