const { runTestCase } = require('../services/selenium/selenium.service')

async function runTestCaseHandler(req, res) {
  try {
    const testCase = req.body?.testCase || req.body

    // validation simple
    if (!testCase || !testCase.steps) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payload: testCase or steps missing.'
      })
    }

    console.log('[INFO] Running test case:', testCase?.id || testCase?.title)

    const result = await runTestCase(testCase)

    return res.status(200).json({
      status: result.status,
      message: result.message,
      data: result
    })

  } catch (err) {
    console.error('[ERROR] runTestCaseHandler:', err)

    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Unexpected server error.'
    })
  }
}

module.exports = {
  runTestCaseHandler,
}
