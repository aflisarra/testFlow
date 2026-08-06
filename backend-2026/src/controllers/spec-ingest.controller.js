const ollamaService = require('../services/ollama.service')

function sendError(res, error) {
  // error.statusCode  → set by httpError() inside this service (trusted)
  // error.response    → axios response from python-2026 (upstream); never forward raw 404
  //   upstream 404 would be indistinguishable from an Express route 404 in the browser.
  const upstreamStatus = error?.response?.status
  const ownStatus      = error?.statusCode

  let status
  if (ownStatus) {
    status = Number(ownStatus)                  // our own httpError() — trust it
  } else if (upstreamStatus) {
    // Remap upstream HTTP errors: 5xx stay 502, 4xx that aren't 401/403 become 502
    const up = Number(upstreamStatus)
    status = (up === 401 || up === 403) ? up : 502
  } else {
    status = 500
  }

  const payload = {
    message: error?.message || error?.response?.data?.error || 'Unable to ingest specification.',
  }
  if (error?.code) payload.code = error.code
  if (upstreamStatus) payload.upstream = upstreamStatus   // keep upstream status for debugging
  return res.status(status).json(payload)
}

async function ingest(req, res) {
  try {
    const data = await ollamaService.ingestSpecification({ req, body: req.body, file: req.file })
    return res.status(201).json(data)
  } catch (error) {
    return sendError(res, error)
  }
}

async function reingest(req, res) {
  try {
    const data = await ollamaService.ingestSpecification({
      req, body: req.body, file: req.file, testSuiteId: req.params.id,
    })
    return res.json(data)
  } catch (error) {
    return sendError(res, error)
  }
}

async function generatePlan(req, res) {
  try {
    const data = await ollamaService.generatePlanForSuite({ req, testSuiteId: req.params.id, body: req.body })
    return res.json(data)
  } catch (error) {
    return sendError(res, error)
  }
}

module.exports = { ingest, reingest, generatePlan }
