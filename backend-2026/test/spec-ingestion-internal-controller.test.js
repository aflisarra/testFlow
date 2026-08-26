const assert = require('node:assert/strict')
const test = require('node:test')

const controller = require('../src/controllers/spec-ingestion-internal.controller')
const service = require('../src/services/spec-ingestion.service')
const { responseSpy } = require('./helpers/http-response')
const { VALID_HASH } = require('./helpers/spec-fixtures')

function request(overrides = {}) {
  return {
    params: { specHash: VALID_HASH, itemId: 'ITEM-00001', lease: 'lease-1' },
    body: {},
    ...overrides,
  }
}

test('internal ingestion controller maps all successful service operations', async (t) => {
  const replaceSnapshot = t.mock.method(service, 'replaceSnapshot', async () => undefined)
  t.mock.method(service, 'getSnapshot', async () => ({ items: [] }))
  t.mock.method(service, 'getPendingReview', async () => [])
  t.mock.method(service, 'resolveReview', async () => ({ id: 'ITEM-00001' }))
  t.mock.method(service, 'claimModuleGeneration', async () => ({ claimed: true }))
  t.mock.method(service, 'commitModuleGeneration', async () => ({ module_version: 1 }))
  t.mock.method(service, 'failModuleGeneration', async () => ({ module_status: 'failed' }))

  let response = responseSpy()
  await controller.replace(request({ body: { items: [], modules: [] } }), response)
  assert.equal(response.statusCode, 204)
  assert.equal(response.ended, true)
  assert.deepEqual(replaceSnapshot.mock.calls[0].arguments, [VALID_HASH, [], []])

  response = responseSpy()
  await controller.get(request(), response)
  assert.deepEqual(response.body, { items: [] })

  response = responseSpy()
  await controller.pendingReview(request(), response)
  assert.deepEqual(response.body, { items: [] })

  response = responseSpy()
  await controller.resolveReview(request({ body: { role: 'ACTOR', reviewer: 'user-1' } }), response)
  assert.deepEqual(response.body, { id: 'ITEM-00001' })

  response = responseSpy()
  await controller.claimModuleGeneration(request({
    body: { fingerprint: 'fingerprint-1', algorithm_version: 'module-v2', force: true },
  }), response)
  assert.deepEqual(response.body, { claimed: true })

  response = responseSpy()
  await controller.commitModuleGeneration(request({ body: { modules: [], assignments: [] } }), response)
  assert.deepEqual(response.body, { module_version: 1 })

  response = responseSpy()
  await controller.failModuleGeneration(request({ body: { error: 'generation failed' } }), response)
  assert.deepEqual(response.body, { module_status: 'failed' })
})

test('internal ingestion controller returns 404 for missing resources', async (t) => {
  t.mock.method(service, 'getSnapshot', async () => null)
  t.mock.method(service, 'getPendingReview', async () => null)
  t.mock.method(service, 'resolveReview', async () => null)
  t.mock.method(service, 'claimModuleGeneration', async () => null)
  t.mock.method(service, 'failModuleGeneration', async () => null)

  for (const operation of [
    controller.get,
    controller.pendingReview,
    controller.resolveReview,
    controller.claimModuleGeneration,
    controller.failModuleGeneration,
  ]) {
    const response = responseSpy()
    await operation(request(), response)
    assert.equal(response.statusCode, 404)
    assert.match(response.body.error, /not found/i)
  }
})

test('internal ingestion controller preserves service status and fallback errors', async (t) => {
  const validationError = new Error('Invalid assignment')
  validationError.statusCode = 422
  t.mock.method(service, 'commitModuleGeneration', async () => { throw validationError })
  t.mock.method(service, 'replaceSnapshot', async () => { throw {} })

  let response = responseSpy()
  await controller.commitModuleGeneration(request(), response)
  assert.equal(response.statusCode, 422)
  assert.deepEqual(response.body, { error: 'Invalid assignment' })

  response = responseSpy()
  await controller.replace(request(), response)
  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.body, { error: 'Unable to persist ingestion snapshot' })
})
