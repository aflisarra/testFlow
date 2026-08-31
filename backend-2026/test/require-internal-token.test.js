const assert = require('node:assert/strict')
const test = require('node:test')

const requireInternalToken = require('../src/middleware/requireInternalToken')
const { responseSpy } = require('./helpers/http-response')

function requestWithToken(token) {
  return {
    get(name) {
      assert.equal(name, 'X-Internal-Token')
      return token
    },
  }
}

test('requireInternalToken enforces configuration and constant-time token checks', () => {
  const previousInternal = process.env.INTERNAL_API_TOKEN
  const previousFastApi = process.env.FASTAPI_SECRET

  try {
    delete process.env.INTERNAL_API_TOKEN
    delete process.env.FASTAPI_SECRET
    let response = responseSpy()
    requireInternalToken(requestWithToken('anything'), response, () => assert.fail('next must not run'))
    assert.equal(response.statusCode, 503)
    assert.deepEqual(response.body, { error: 'Internal API token is not configured' })

    process.env.FASTAPI_SECRET = 'fallback-secret'
    response = responseSpy()
    requireInternalToken(requestWithToken('wrong'), response, () => assert.fail('next must not run'))
    assert.equal(response.statusCode, 401)

    process.env.INTERNAL_API_TOKEN = 'preferred-secret'
    response = responseSpy()
    requireInternalToken(requestWithToken('fallback-secret'), response, () => assert.fail('next must not run'))
    assert.equal(response.statusCode, 401)

    let nextCalls = 0
    response = responseSpy()
    requireInternalToken(requestWithToken('preferred-secret'), response, () => { nextCalls += 1 })
    assert.equal(nextCalls, 1)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, undefined)
  } finally {
    if (previousInternal === undefined) delete process.env.INTERNAL_API_TOKEN
    else process.env.INTERNAL_API_TOKEN = previousInternal
    if (previousFastApi === undefined) delete process.env.FASTAPI_SECRET
    else process.env.FASTAPI_SECRET = previousFastApi
  }
})
