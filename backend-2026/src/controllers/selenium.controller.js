const { runTestCase } = require('../services/selenium.service')

async function runTestCaseHandler(req, res) {
  try {
    const testCase = req.body?.testCase ?? req.body
    if (!testCase) {
      return res.status(400).json({ status: 'error', message: 'Missing test case payload.' })
    }

    const result = await runTestCase(testCase)
    return res.json(result)
  } catch (err) {
    const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err)
    return res.status(500).json({ status: 'error', message: msg || 'Unexpected server error.' })
  }
}

module.exports = {
  runTestCaseHandler,
}

