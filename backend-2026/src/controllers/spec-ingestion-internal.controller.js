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

async function claimModuleGeneration(req, res) {
  try {
    const result = await service.claimModuleGeneration(req.params.specHash, {
      fingerprint: req.body?.fingerprint,
      algorithmVersion: req.body?.algorithm_version ?? req.body?.algorithmVersion,
      force: req.body?.force,
    })
    return result ? res.json(result) : res.status(404).json({ error: 'Spec ingestion not found' })
  } catch (error) { return sendError(res, error, 'Unable to claim module generation') }
}

async function commitModuleGeneration(req, res) {
  try {
    const result = await service.commitModuleGeneration(
      req.params.specHash,
      req.params.lease,
      req.body || {}
    )
    return res.json(result)
  } catch (error) { return sendError(res, error, 'Unable to commit module generation') }
}

async function failModuleGeneration(req, res) {
  try {
    const result = await service.failModuleGeneration(
      req.params.specHash,
      req.params.lease,
      req.body?.error
    )
    return result ? res.json(result) : res.status(404).json({ error: 'Module generation lease not found' })
  } catch (error) { return sendError(res, error, 'Unable to mark module generation failed') }
}

module.exports = {
  replace,
  get,
  pendingReview,
  resolveReview,
  claimModuleGeneration,
  commitModuleGeneration,
  failModuleGeneration,
}
