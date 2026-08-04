const ollamaService = require('../services/ollama.service')
const MESSAGES = require('../constants/messages')
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
      error: error?.response?.data || error?.message || MESSAGES.FASTAPI.FASTAPI_ERROR,
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
      error: error?.response?.data || error?.message || MESSAGES.FASTAPI.FASTAPI_CHAT_ERROR,
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
    return res.status(status).json({ message: messageFromError(error, MESSAGES.FASTAPI.GET_PLAN_ERROR) })
  }
}

async function getTestPlans(req, res) {
  try {
    const testSuiteId = String(req.params.id || '').trim()
    const data = await ollamaService.getTestsuiteTestPlans(testSuiteId)
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 500)
    return res.status(status).json({ message: messageFromError(error, MESSAGES.FASTAPI.GET_TEST_PLANS_ERROR) })
  }
}

async function getSpecDocument(req, res) {
  try {
    const testSuiteId = String(req.params.id || '').trim()
    const data = await ollamaService.getSpecDocument(testSuiteId)
    return res.download(data.absolutePath, data.fileName)
  } catch (error) {
    const status = statusFromError(error, 500)
    return res.status(status).json({ message: messageFromError(error, MESSAGES.FASTAPI.GET_SPECIFICATION_DOCUMENT_ERROR) })
  }
}

async function generatePlan(req, res) {
  try {
    const data = await ollamaService.generatePlan({ req, body: req.body, file: req.file })
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 500)
    if (status === 409 && error?.code === 'SPEC_NOT_INGESTED') {
      return res.status(409).json({
        code: 'SPEC_NOT_INGESTED',
        message: messageFromError(error, 'Specification has not been ingested.'),
      })
    }
    if (status === 409) {
      return res.status(409).json({ message: messageFromError(error, MESSAGES.FASTAPI.GENERATION_CANCELLED_BY_USER) })
    }

    const maybeId = String(req.body?.testSuiteId || '').trim()
    if (maybeId) {
      // Keep old behavior: mark suite incomplete on failure if id exists.
      const TestSuite = require('../models/testsuite')
      await TestSuite.findByIdAndUpdate(maybeId, {
        testStatus: MESSAGES.FASTAPI.INCOMPLETE,
        lastGeneratedAt: new Date(),
      }).catch(() => {})
    }
    return res.status(status).json({ message: messageFromError(error, MESSAGES.FASTAPI.GENERATE_PLAN_ERROR) })
  }
}

async function generateTestCases(req, res) {
  try {
    const data = await ollamaService.generateTestCases({ req, body: req.body })
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 500)
    if (status === 409 && error?.code === 'SPEC_NOT_INGESTED') {
      return res.status(409).json({
        code: 'SPEC_NOT_INGESTED',
        message: messageFromError(error, 'Specification has not been ingested.'),
      })
    }
    if (status === 409) {
      return res.status(409).json({ message: messageFromError(error, MESSAGES.FASTAPI.GENERATION_CANCELLED_BY_USER) })
    }
console.log(MESSAGES.FASTAPI.STEP_DETAILS, tc.stepDetails)
    const testSuiteId = String(req.body?.testSuiteId || '').trim()
    if (testSuiteId) {
      const TestSuite = require('../models/testsuite')
      await TestSuite.findByIdAndUpdate(testSuiteId, {
        testStatus: MESSAGES.FASTAPI.INCOMPLETE,
        lastGeneratedAt: new Date(),
      }).catch(() => {
        console.error(MESSAGES.TESTPLAN.CONTROLLER_ERROR, error.message, error.statusCode)
      })
    }
    return res
      .status(status)
      .json({ message: messageFromError(error, MESSAGES.TESTCASES.GENERATE_ERROR) })
  }
}


async function cancelGeneration(req, res) {
  try {
    const data = await ollamaService.cancelGeneration(req.body || {})
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 502)
    return res.status(status).json({
      message: messageFromError(error, MESSAGES.TESTCASES.CANCEL_GENERATE),
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
