const specificationService = require('../services/specification.service')
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

async function getContent(req, res) {
  try {
    const testSuiteId = String(req.params.id || '').trim()
    const data = await specificationService.getSpecificationContent(testSuiteId)
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 500)
    return res.status(status).json({ message: messageFromError(error, MESSAGES.SPECIFICATION.FAILED) })
  }
}

async function updateContent(req, res) {
  try {
    const testSuiteId = String(req.params.id || '').trim()
    const data = await specificationService.updateSpecificationContent(testSuiteId, req.body?.content)
    return res.json(data)
  } catch (error) {
    const status = statusFromError(error, 500)
    return res.status(status).json({ message: messageFromError(error, MESSAGES.SPECIFICATION.UPDATE_FAILED) })
  }
}

module.exports = {
  getContent,
  updateContent,
}
