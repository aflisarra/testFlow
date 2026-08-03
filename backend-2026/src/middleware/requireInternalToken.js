const crypto = require('crypto')

function matches(expected, supplied) {
  const left = Buffer.from(expected)
  const right = Buffer.from(supplied)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

module.exports = function requireInternalToken(req, res, next) {
  const expected = String(process.env.INTERNAL_API_TOKEN || process.env.FASTAPI_SECRET || '').trim()
  const supplied = String(req.get('X-Internal-Token') || '').trim()
  if (!expected) return res.status(503).json({ error: 'Internal API token is not configured' })
  if (!supplied || !matches(expected, supplied)) return res.status(401).json({ error: 'Invalid internal API token' })
  return next()
}
