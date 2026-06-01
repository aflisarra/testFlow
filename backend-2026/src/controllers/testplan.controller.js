const testPlanService = require('../services/testplan.service')

exports.create = async (req, res) => {
  try {
    const plan = await testPlanService.createTestPlan(req.body)

    res.status(201).json(plan)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}

exports.getBySuite = async (req, res) => {
  try {
    const plans = await testPlanService.getPlansBySuite(
      req.params.testSuiteId
    )

    res.status(200).json(plans)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

exports.getById = async (req, res) => {
  try {
    const plan = await testPlanService.getPlanById(req.params.id)

    res.status(200).json(plan)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}

exports.update = async (req, res) => {
  try {
    const plan = await testPlanService.updateTestPlan(
      req.params.id,
      req.body
    )

    res.status(200).json(plan)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}

exports.delete = async (req, res) => {
  try {
    await testPlanService.deleteTestPlan(req.params.id)

    res.status(200).json({
      message: 'TestPlan deleted successfully',
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}