const testCaseService = require('../services/testcase.service')
const MESSAGES = require('../constants/messages')
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