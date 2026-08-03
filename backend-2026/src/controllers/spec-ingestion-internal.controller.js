const service = require('../services/spec-ingestion.service')

function sendError(res, error, fallback) {
  return res.status(Number(error?.statusCode) || 500).json({ error: error?.message || fallback })
}

async function replace(req, res) {
  try {
    await service.replaceSnapshot(req.params.specHash, req.body?.items, req.body?.modules)
    return res.status(204).end()
  } catch (error) { return sendError(res, error, 'Unable to persist ingestion snapshot') }
}

async function get(req, res) {
  try {
    const snapshot = await service.getSnapshot(req.params.specHash)
    return snapshot ? res.json(snapshot) : res.status(404).json({ error: 'Spec ingestion not found' })
  } catch (error) { return sendError(res, error, 'Unable to read ingestion snapshot') }
}

async function pendingReview(req, res) {
  try {
    const items = await service.getPendingReview(req.params.specHash)
    return items ? res.json({ items }) : res.status(404).json({ error: 'Spec ingestion not found' })
  } catch (error) { return sendError(res, error, 'Unable to read review queue') }
}

async function resolveReview(req, res) {
  try {
    const item = await service.resolveReview(req.params.specHash, req.params.itemId, req.body?.role, req.body?.reviewer)
    return item ? res.json(item) : res.status(404).json({ error: 'Spec ingestion item not found' })
  } catch (error) { return sendError(res, error, 'Unable to resolve review item') }
}

module.exports = { replace, get, pendingReview, resolveReview }
