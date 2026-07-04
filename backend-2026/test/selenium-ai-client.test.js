const test = require('node:test')
const assert = require('node:assert/strict')
const { buildAiDecisionUrl } = require('../src/services/selenium/ai.client')

test('buildAiDecisionUrl defaults to the local FastAPI endpoint', () => {
  delete process.env.FASTAPI_BASE_URL
  delete process.env.PYTHON_API_URL

  assert.equal(buildAiDecisionUrl(), 'http://127.0.0.1:8000/ai/decide')
})

test('buildAiDecisionUrl uses a configured FastAPI base URL', () => {
  process.env.FASTAPI_BASE_URL = 'http://localhost:9000/'
  delete process.env.PYTHON_API_URL

  assert.equal(buildAiDecisionUrl(), 'http://localhost:9000/ai/decide')
})
