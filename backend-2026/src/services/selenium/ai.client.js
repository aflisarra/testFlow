function getFastApiBaseUrl() {
  const raw = String(
    process.env.FASTAPI_BASE_URL || process.env.PYTHON_API_URL || ''
  ).trim()

  if (raw) {
    return raw.replace(/\/+$/, '')
  }

  return 'http://127.0.0.1:8000'
}

function buildAiDecisionUrl() {
  return `${getFastApiBaseUrl()}/ai/decide`
}

module.exports = {
  getFastApiBaseUrl,
  buildAiDecisionUrl,
}
