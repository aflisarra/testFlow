const assert = require('node:assert/strict')
const test = require('node:test')

const TestSuite = require('../src/models/testsuite')
const reviewService = require('../src/services/spec-ingestion.service')
const {
  dismiss,
  list,
  listAll,
  resolve,
  toReviewItem,
  toResolvedReviewItem,
  toSpecItem,
} = require('../src/controllers/role-review.controller')
const { responseSpy } = require('./helpers/http-response')
const { queryResult } = require('./helpers/mongoose-query')
const { VALID_HASH } = require('./helpers/spec-fixtures')

test('role-review response exposes heading context and hides a null suggestion', () => {
  const item = toReviewItem({
    id: 'ITEM-00042',
    text: 'The system must support search.',
    heading_path: ['Requirements', 'Search'],
    suggested_role: null,
  })

  assert.deepEqual(item, {
    itemId: 'ITEM-00042',
    text: 'The system must support search.',
    headingPath: ['Requirements', 'Search'],
    nearestHeading: 'Search',
    suggestedRole: null,
  })
})

test('role-review resolution response exposes the durable human outcome', () => {
  const item = toResolvedReviewItem({
    id: 'ITEM-00042', text: 'User details.', heading_path: ['Users'],
    role: 'ACTOR', role_method: 'human', reviewed: true, review_state: 'resolved',
  })

  assert.equal(item.role, 'ACTOR')
  assert.equal(item.roleMethod, 'human')
  assert.equal(item.reviewed, true)
  assert.equal(item.reviewState, 'resolved')
})

test('spec-items response exposes source chunk and classification metadata', () => {
  const item = toSpecItem({
    id: 'ITEM-00042',
    source_chunk_id: 'CHUNK-003',
    text: 'The system must support search.',
    heading_path: ['Requirements', 'Search'],
    role: 'REQUIREMENT',
    role_method: 'regex',
    reviewed: false,
    review_state: 'resolved',
    requirement_id: 'REQ-00042',
  })

  assert.deepEqual(item, {
    itemId: 'ITEM-00042',
    text: 'The system must support search.',
    headingPath: ['Requirements', 'Search'],
    nearestHeading: 'Search',
    sourceChunkId: 'CHUNK-003',
    role: 'REQUIREMENT',
    roleMethod: 'regex',
    reviewed: false,
    reviewState: 'resolved',
    requirementId: 'REQ-00042',
  })
})

test('role-review response mappers provide safe defaults for incomplete items', () => {
  assert.deepEqual(toReviewItem(null), {
    itemId: '', text: '', headingPath: [], nearestHeading: null, suggestedRole: null,
  })
  assert.deepEqual(toResolvedReviewItem(null), {
    itemId: '', text: '', headingPath: [], nearestHeading: null, suggestedRole: null,
    role: '', roleMethod: '', reviewed: false, reviewState: '',
  })
  assert.deepEqual(toSpecItem(null), {
    itemId: '', text: '', headingPath: [], nearestHeading: null, sourceChunkId: '',
    role: 'UNTAGGED', roleMethod: 'none', reviewed: false, reviewState: 'pending',
    requirementId: null,
  })
})

test('role-review list returns pending items with suite ingestion identity', async (t) => {
  t.mock.method(TestSuite, 'findById', () => queryResult({
    _id: 'suite-1', specHash: VALID_HASH, ingestionScope: 'suite-1',
  }))
  t.mock.method(reviewService, 'getPendingReview', async () => [{
    id: 'ITEM-00042', text: 'Ambiguous statement.', heading_path: ['Scope'], suggested_role: null,
  }])
  t.mock.method(reviewService, 'countPendingReview', async () => 1)
  const response = responseSpy()

  await list({ params: { id: 'suite-1' } }, response)

  assert.equal(response.statusCode, 200)
  assert.equal(response.body.specHash, VALID_HASH)
  assert.equal(response.body.pendingCount, 1)
  assert.equal(response.body.items[0].nearestHeading, 'Scope')
})

test('role-review facade distinguishes missing and legacy suites', async (t) => {
  const findSuite = t.mock.method(TestSuite, 'findById', () => queryResult(null))
  const getPending = t.mock.method(reviewService, 'getPendingReview', async () => null)
  t.mock.method(reviewService, 'countPendingReview', async () => null)

  let response = responseSpy()
  await list({ params: { id: 'missing' } }, response)
  assert.equal(response.statusCode, 404)
  assert.match(response.body.message, /TestSuite not found/)

  findSuite.mock.mockImplementationOnce(() => queryResult({ _id: 'legacy', specHash: '', ingestionScope: '' }))
  response = responseSpy()
  await list({ params: { id: 'legacy' } }, response)
  assert.equal(response.statusCode, 409)
  assert.equal(response.body.code, 'SPEC_NOT_INGESTED')

  findSuite.mock.mockImplementationOnce(() => queryResult({
    _id: 'suite-1', specHash: VALID_HASH, ingestionScope: 'suite-1',
  }))
  response = responseSpy()
  await list({ params: { id: 'suite-1' } }, response)
  assert.equal(response.statusCode, 404)
  assert.match(response.body.message, /ingestion not found/i)
  assert.equal(getPending.mock.callCount(), 1)
})

test('role-review resolve writes through Node service and refreshes the count', async (t) => {
  t.mock.method(TestSuite, 'findById', () => queryResult({
    _id: 'suite-1', specHash: VALID_HASH, ingestionScope: 'suite-1',
  }))
  const resolveReview = t.mock.method(reviewService, 'resolveReview', async () => ({
    id: 'ITEM-00042', text: 'The buyer checks out.', heading_path: ['Checkout'],
    role: 'ACTOR', role_method: 'human', reviewed: true, review_state: 'resolved',
  }))
  t.mock.method(reviewService, 'countPendingReview', async () => 0)
  const response = responseSpy()

  await resolve({
    params: { id: 'suite-1', itemId: 'ITEM-00042' },
    body: { role: 'ACTOR' },
    user: { userId: 'user-1' },
  }, response)

  assert.deepEqual(resolveReview.mock.calls[0].arguments, [
    VALID_HASH, 'ITEM-00042', 'ACTOR', 'user-1',
  ])
  assert.equal(response.body.pendingCount, 0)
  assert.equal(response.body.item.roleMethod, 'human')
})

test('role-review resolve returns 404 when the pending item no longer exists', async (t) => {
  t.mock.method(TestSuite, 'findById', () => queryResult({
    _id: 'suite-1', specHash: VALID_HASH, ingestionScope: 'suite-1',
  }))
  t.mock.method(reviewService, 'resolveReview', async () => null)
  const count = t.mock.method(reviewService, 'countPendingReview', async () => 0)
  const response = responseSpy()

  await resolve({ params: { id: 'suite-1', itemId: 'missing' }, body: { role: 'ACTOR' } }, response)

  assert.equal(response.statusCode, 404)
  assert.equal(count.mock.callCount(), 0)
})

test('role-review dismiss forwards audit context and returns 204', async (t) => {
  t.mock.method(TestSuite, 'findById', () => queryResult({
    _id: 'suite-1', specHash: VALID_HASH, ingestionScope: 'suite-1',
  }))
  const dismissReview = t.mock.method(reviewService, 'dismissReview', async () => ({ id: 'ITEM-00042' }))
  const response = responseSpy()

  await dismiss({
    params: { id: 'suite-1', itemId: 'ITEM-00042' },
    body: { reason: 'Not testable' },
    user: { _id: 'user-2' },
  }, response)

  assert.deepEqual(dismissReview.mock.calls[0].arguments, [
    VALID_HASH, 'ITEM-00042', 'user-2', 'Not testable',
  ])
  assert.equal(response.statusCode, 204)
  assert.equal(response.ended, true)
})

test('role-review listAll exposes every stored item', async (t) => {
  t.mock.method(TestSuite, 'findById', () => queryResult({
    _id: 'suite-1', specHash: VALID_HASH, ingestionScope: 'suite-1',
  }))
  t.mock.method(reviewService, 'getSnapshot', async () => ({
    items: [{
      id: 'ITEM-00001', source_chunk_id: 'CHUNK-001', text: 'Requirement.',
      heading_path: ['Requirements'], role: 'REQUIREMENT', role_method: 'regex',
      reviewed: false, review_state: 'resolved', requirement_id: 'REQ-00001',
    }],
  }))
  const response = responseSpy()

  await listAll({ params: { id: 'suite-1' } }, response)

  assert.equal(response.body.totalCount, 1)
  assert.equal(response.body.items[0].sourceChunkId, 'CHUNK-001')
  assert.equal(response.body.items[0].requirementId, 'REQ-00001')
})

test('role-review listAll and dismiss return 404 for missing stored items', async (t) => {
  t.mock.method(TestSuite, 'findById', () => queryResult({
    _id: 'suite-1', specHash: VALID_HASH, ingestionScope: 'suite-1',
  }))
  t.mock.method(reviewService, 'getSnapshot', async () => null)
  t.mock.method(reviewService, 'dismissReview', async () => null)

  let response = responseSpy()
  await listAll({ params: { id: 'suite-1' } }, response)
  assert.equal(response.statusCode, 404)

  response = responseSpy()
  await dismiss({ params: { id: 'suite-1', itemId: 'missing' }, body: {}, user: { id: 'user-3' } }, response)
  assert.equal(response.statusCode, 404)
})

test('role-review requires ingestion scope and applies fallback errors', async (t) => {
  const findSuite = t.mock.method(TestSuite, 'findById', () => queryResult({
    _id: 'suite-1', specHash: VALID_HASH, ingestionScope: '',
  }))
  const getPending = t.mock.method(reviewService, 'getPendingReview', async () => { throw {} })

  let response = responseSpy()
  await list({ params: { id: 'suite-1' } }, response)
  assert.equal(response.statusCode, 409)
  assert.equal(response.body.code, 'SPEC_NOT_INGESTED')

  findSuite.mock.mockImplementationOnce(() => queryResult({
    _id: 'suite-1', specHash: VALID_HASH, ingestionScope: 'scope-1',
  }))
  response = responseSpy()
  await list({ params: { id: 'suite-1' } }, response)
  assert.equal(response.statusCode, 500)
  assert.equal(response.body.message, 'Unable to process role review.')
  assert.equal(getPending.mock.callCount(), 1)
})
