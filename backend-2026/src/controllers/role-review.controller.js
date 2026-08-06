const TestSuite = require('../models/testsuite')
const reviewService = require('../services/spec-ingestion.service')

function httpError(statusCode, message, code = null) {
  const error = new Error(message)
  error.statusCode = statusCode
  if (code) error.code = code
  return error
}

function reviewerFromRequest(req) {
  return String(req.user?.userId || req.user?.id || req.user?._id || '').trim() || null
}

function toReviewItem(item) {
  const headingPath = Array.isArray(item?.heading_path) ? item.heading_path.map(String) : []
  return {
    itemId: String(item?.id || ''),
    text: String(item?.text || ''),
    headingPath,
    nearestHeading: headingPath.at(-1) || null,
    suggestedRole: item?.suggested_role ?? null,
  }
}

function toResolvedReviewItem(item) {
  return {
    ...toReviewItem(item),
    role: String(item?.role || ''),
    roleMethod: String(item?.role_method || ''),
    reviewed: Boolean(item?.reviewed),
    reviewState: String(item?.review_state || ''),
  }
}

async function suiteSpecHash(testSuiteId) {
  const suite = await TestSuite.findById(testSuiteId).select('_id specHash ingestionScope').lean()
  if (!suite) throw httpError(404, 'TestSuite not found')
  const specHash = String(suite.specHash || '').trim()
  if (!specHash || !String(suite.ingestionScope || '').trim()) {
    throw httpError(
      409,
      'This test suite was generated before role tagging was introduced. Re-upload the original specification.',
      'SPEC_NOT_INGESTED'
    )
  }
  return specHash
}

function sendError(res, error) {
  const status = Number(error?.statusCode) || 500
  const payload = { message: error?.message || 'Unable to process role review.' }
  if (error?.code) payload.code = error.code
  return res.status(status).json(payload)
}

async function list(req, res) {
  try {
    const specHash = await suiteSpecHash(req.params.id)
    const items = await reviewService.getPendingReview(specHash)
    const pendingCount = await reviewService.countPendingReview(specHash)
    if (items === null || pendingCount === null) {
      throw httpError(404, 'Specification ingestion not found for this test suite.')
    }
    return res.json({ specHash, pendingCount, items: items.map(toReviewItem) })
  } catch (error) {
    return sendError(res, error)
  }
}

async function resolve(req, res) {
  try {
    const specHash = await suiteSpecHash(req.params.id)
    const item = await reviewService.resolveReview(
      specHash,
      req.params.itemId,
      req.body?.role,
      reviewerFromRequest(req)
    )
    if (!item) throw httpError(404, 'Pending review item not found.')
    const pendingCount = await reviewService.countPendingReview(specHash)
    return res.json({ item: toResolvedReviewItem(item), pendingCount })
  } catch (error) {
    return sendError(res, error)
  }
}

async function dismiss(req, res) {
  try {
    const specHash = await suiteSpecHash(req.params.id)
    const item = await reviewService.dismissReview(
      specHash,
      req.params.itemId,
      reviewerFromRequest(req),
      req.body?.reason
    )
    if (!item) throw httpError(404, 'Pending review item not found.')
    return res.status(204).end()
  } catch (error) {
    return sendError(res, error)
  }
}

module.exports = { list, resolve, dismiss, toReviewItem, toResolvedReviewItem }
