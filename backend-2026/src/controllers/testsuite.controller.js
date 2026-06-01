const testSuiteService = require('../services/testsuite.service')

function getUserId(req) {
  return String(req.user?.userId || req.user?.id || req.user?._id || '').trim()
}

function handleError(res, error) {
  return res.status(error.statusCode || 500).json({
    message: error.message || 'Unexpected server error',
  })
}

exports.create = async (req, res) => {
  try {
    const suite = await testSuiteService.createTestSuite({
      ...req.body,
      userId: req.body?.userId || getUserId(req),
    })

    return res.status(201).json(suite)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getAll = async (req, res) => {
  try {
    const suites = await testSuiteService.getAllTestSuites(getUserId(req))
    return res.status(200).json(suites)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getByUser = async (req, res) => {
  try {
    const suites = await testSuiteService.getTestSuitesByUser(getUserId(req) || req.params.userId)
    return res.status(200).json(suites)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getByProject = async (req, res) => {
  try {
    const suites = await testSuiteService.getTestSuitesByProject(req.params.projectId)
    return res.status(200).json(suites)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getById = async (req, res) => {
  try {
    const suite = await testSuiteService.getTestSuiteById(req.params.id)
    return res.status(200).json(suite)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.update = async (req, res) => {
  try {
    const suite = await testSuiteService.updateTestSuite(req.params.id, req.body)
    return res.status(200).json(suite)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.delete = async (req, res) => {
  try {
    await testSuiteService.deleteTestSuite(req.params.id)
    return res.status(200).json({ message: 'Test suite deleted successfully' })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.getPlans = async (req, res) => {
  try {
    const result = await testSuiteService.getTestPlansByTestSuiteId(req.params.id)
    return res.status(200).json(result)
  } catch (error) {
    return handleError(res, error)
  }
}

exports.saveSession = async (req, res) => {
  try {
    const suite = await testSuiteService.saveSuiteSession(req.params.id, req.body || {})
    return res.status(200).json({
      message: 'Session saved successfully',
      suite,
    })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.updateStatus = async (req, res) => {
  try {
    const suite = await testSuiteService.updateTestSuiteStatus(req.params.id, req.body?.status)
    return res.status(200).json({ suite })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.updateProject = async (req, res) => {
  try {
    const suite = await testSuiteService.setTestSuiteProject(req.params.id, req.body?.projectId ?? null, {
      viewerUserId: getUserId(req),
      role: req.user?.role,
    })

    return res.status(200).json({ suite })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.save = async (req, res) => {
  try {
    const suite = await testSuiteService.markTestSuiteSaved(req.params.id)
    return res.status(200).json({ suite })
  } catch (error) {
    return handleError(res, error)
  }
}

exports.execute = async (req, res) => {
  try {
    const result = String(req.body?.result || req.body?.status || '').trim()
    if (!result) {
      return res.status(501).json({
        message: 'Execution not implemented. Provide {result:"Passed"|"Failed"} or integrate a Selenium runner.',
      })
    }

    const suite = await testSuiteService.updateTestSuiteStatus(req.params.id, result)
    return res.status(200).json({ suite })
  } catch (error) {
    return handleError(res, error)
  }
}
