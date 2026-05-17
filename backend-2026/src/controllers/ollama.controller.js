const ollamaService = require('../services/ollama.service')

function statusFromError(err, fallback = 500) {
  const code = Number(err?.statusCode || err?.response?.status || fallback)
  return Number.isFinite(code) ? code : fallback
}

function messageFromError(err, fallbackMessage) {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    fallbackMessage
  )
}

async function health(req, res) {
  try {
    const data = await ollamaService.fastApiHealth()
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 502)
    return res.status(status).json({
      error: error?.response?.data || error?.message || 'FastAPI unreachable',
    })
  }
}

async function chat(req, res) {
  try {
    const { message } = req.body || {}
    const data = await ollamaService.fastApiChat(message)
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 502)
    return res.status(status).json({
      error: error?.response?.data || error?.message || 'FastAPI chat failed',
    })
  }
}

async function getPlan(req, res) {
  try {
    const testSuiteId = String(req.params.id || '').trim()
    const data = await ollamaService.getTestsuitePlan(testSuiteId)
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 500)
    return res.status(status).json({ message: messageFromError(error, 'Get plan failed') })
  }
}

async function getTestPlans(req, res) {
  try {
    const testSuiteId = String(req.params.id || '').trim()
    const data = await ollamaService.getTestsuiteTestPlans(testSuiteId)
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 500)
    return res.status(status).json({ message: messageFromError(error, 'Get test plans failed') })
  }
}

async function getSpecDocument(req, res) {
  try {
    const testSuiteId = String(req.params.id || '').trim()
    const data = await ollamaService.getSpecDocument(testSuiteId)
    return res.download(data.absolutePath, data.fileName)
  } catch (error) {
    const status = statusFromError(error, 500)
    return res.status(status).json({ message: messageFromError(error, 'Get specification document failed') })
  }
}

async function generatePlan(req, res) {
  try {
    const data = await ollamaService.generatePlan({ req, body: req.body, file: req.file })
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 500)
    if (status === 409) {
      return res.status(409).json({ message: messageFromError(error, 'Generation cancelled by user.') })
    }

    const maybeId = String(req.body?.testSuiteId || '').trim()
    if (maybeId) {
      // Keep old behavior: mark suite incomplete on failure if id exists.
      const TestSuite = require('../models/testsuite')
      await TestSuite.findByIdAndUpdate(maybeId, {
        testStatus: 'Incomplete',
        lastGeneratedAt: new Date(),
      }).catch(() => {})
    }
    return res.status(status).json({ message: messageFromError(error, 'Generate plan failed') })
  }
}

async function generateTestCases(req, res) {
  try {
    const data = await ollamaService.generateTestCases({ req, body: req.body })
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 500)
    if (status === 409) {
      return res.status(409).json({ message: messageFromError(error, 'Generation cancelled by user.') })
    }

    const testSuiteId = String(req.body?.testSuiteId || '').trim()
    if (testSuiteId) {
      const TestSuite = require('../models/testsuite')
      await TestSuite.findByIdAndUpdate(testSuiteId, {
        testStatus: 'Incomplete',
        lastGeneratedAt: new Date(),
      }).catch(() => {})
    }
    return res
      .status(status)
      .json({ message: messageFromError(error, 'Generate test cases failed') })
  }
}

async function cancelGeneration(req, res) {
  try {
    const data = await ollamaService.cancelGeneration(req.body || {})
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 502)
    return res.status(status).json({
      message: messageFromError(error, 'Cancel generation failed'),
    })
  }
}

module.exports = {
  health,
  chat,
  getPlan,
  getTestPlans,
  getSpecDocument,
  generatePlan,
  generateTestCases,
  cancelGeneration,
}
