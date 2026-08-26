const assert = require('node:assert/strict')
const test = require('node:test')

const SpecIngestion = require('../src/models/spec-ingestion.model')
const SpecIngestionItem = require('../src/models/spec-ingestion-item.model')
const service = require('../src/services/spec-ingestion.service')
const { queryResult } = require('./helpers/mongoose-query')
const { VALID_HASH, moduleCard, specItem } = require('./helpers/spec-fixtures')

function mockSnapshotWrites(t, existingItems = []) {
  const begin = t.mock.method(SpecIngestion, 'findOneAndUpdate', () => queryResult({}))
  const findItems = t.mock.method(SpecIngestionItem, 'find', () => queryResult(existingItems))
  const bulkWrite = t.mock.method(SpecIngestionItem, 'bulkWrite', async () => ({ ok: 1 }))
  const deleteMany = t.mock.method(SpecIngestionItem, 'deleteMany', async () => ({ deletedCount: 0 }))
  const updateIngestion = t.mock.method(SpecIngestion, 'updateOne', async () => ({ modifiedCount: 1 }))
  return { begin, bulkWrite, deleteMany, findItems, updateIngestion }
}

test('replaceSnapshot rejects malformed snapshots before writing', async () => {
  await assert.rejects(() => service.replaceSnapshot('bad-hash', [], []), /sha256/)
  await assert.rejects(() => service.replaceSnapshot(VALID_HASH, {}, []), /must be arrays/)
  await assert.rejects(
    () => service.replaceSnapshot(VALID_HASH, [specItem(), specItem()], []),
    /item IDs must be unique/
  )
  await assert.rejects(
    () => service.replaceSnapshot(VALID_HASH, [specItem({ role: 'GUESS' })], []),
    /Invalid item role/
  )
  await assert.rejects(
    () => service.replaceSnapshot(VALID_HASH, [specItem({ role_method: 'guess' })], []),
    /Invalid item role method/
  )
  await assert.rejects(
    () => service.replaceSnapshot(VALID_HASH, [specItem()], Array.from({ length: 13 }, moduleCard)),
    /At most 12 modules/
  )
  await assert.rejects(
    () => service.replaceSnapshot(VALID_HASH, [specItem()], [moduleCard({ kind: 'other' })]),
    /invalid kind/
  )
  await assert.rejects(
    () => service.replaceSnapshot(VALID_HASH, [specItem()], [moduleCard({ source_item_ids: ['ITEM-99999'] })]),
    /no valid source item IDs/
  )
})

test('replaceSnapshot persists an item-only upload as module pending', async (t) => {
  const mocks = mockSnapshotWrites(t)

  await service.replaceSnapshot(VALID_HASH, [specItem()], [])

  assert.equal(mocks.begin.mock.callCount(), 1)
  assert.deepEqual(mocks.begin.mock.calls[0].arguments[1].$set, { status: 'writing' })
  assert.equal(mocks.bulkWrite.mock.callCount(), 1)
  assert.equal(mocks.bulkWrite.mock.calls[0].arguments[0][0].updateOne.update.$set.itemId, 'ITEM-00001')
  assert.equal(mocks.deleteMany.mock.callCount(), 1)
  assert.deepEqual(mocks.updateIngestion.mock.calls[0].arguments[1].$set, {
    status: 'ready',
    itemCount: 1,
    modules: [],
    moduleStatus: 'pending',
    moduleGenerationError: null,
  })
})

test('replaceSnapshot accepts camelCase fields and derives safe legacy defaults', async (t) => {
  const mocks = mockSnapshotWrites(t)

  await service.replaceSnapshot(VALID_HASH, [{
    item_id: 'ITEM-00001',
    sourceChunkId: 'CHUNK-001',
    headingPath: ['Notes'],
    text: 'Ambiguous note.',
    role_score: 'not-a-number',
    moduleIds: ['MOD-001'],
    primaryModuleId: 'MOD-001',
    moduleScore: '',
    reviewed: false,
  }], [{
    name: 'Notes', description: 'Unclassified notes.', sourceItemIds: ['ITEM-00001'],
  }])

  const item = mocks.bulkWrite.mock.calls[0].arguments[0][0].updateOne.update.$set
  assert.equal(item.role, 'UNTAGGED')
  assert.equal(item.roleMethod, 'none')
  assert.equal(item.reviewState, 'pending')
  assert.equal(item.roleScore, null)
  assert.equal(item.moduleScore, null)
  const finalSnapshot = mocks.updateIngestion.mock.calls[0].arguments[1].$set
  assert.equal(finalSnapshot.moduleStatus, 'ready')
  assert.equal(finalSnapshot.modules[0].id, 'MOD-001')
  assert.equal(finalSnapshot.modules[0].kind, 'functional')
})

test('replaceSnapshot supports an empty item snapshot without bulkWrite', async (t) => {
  const mocks = mockSnapshotWrites(t)

  await service.replaceSnapshot(VALID_HASH, [], [])

  assert.equal(mocks.findItems.mock.callCount(), 0)
  assert.equal(mocks.bulkWrite.mock.callCount(), 0)
  assert.deepEqual(mocks.deleteMany.mock.calls[0].arguments[0], { specHash: VALID_HASH })
})

test('replaceSnapshot preserves human resolution and dismissal audit fields', async (t) => {
  const existingItems = [
    {
      itemId: 'ITEM-00001', role: 'ACCEPTANCE', roleMethod: 'human', roleScore: null,
      reviewed: true, reviewedBy: 'reviewer-1', reviewState: 'resolved', requirementId: null,
    },
    {
      itemId: 'ITEM-00002', reviewed: false, reviewState: 'dismissed',
      dismissedAt: new Date('2026-08-01T00:00:00Z'), dismissedBy: 'reviewer-2',
      dismissalReason: 'Not testable',
    },
  ]
  const mocks = mockSnapshotWrites(t, existingItems)

  await service.replaceSnapshot(VALID_HASH, [
    specItem(),
    specItem({ id: 'ITEM-00002', text: 'Editorial note.', role: 'UNTAGGED', role_method: 'none' }),
  ], [])

  const operations = mocks.bulkWrite.mock.calls[0].arguments[0]
  const resolved = operations[0].updateOne.update.$set
  const dismissed = operations[1].updateOne.update.$set
  assert.equal(resolved.role, 'ACCEPTANCE')
  assert.equal(resolved.roleMethod, 'human')
  assert.equal(resolved.reviewedBy, 'reviewer-1')
  assert.equal(resolved.reviewState, 'resolved')
  assert.equal(dismissed.reviewState, 'dismissed')
  assert.equal(dismissed.dismissedBy, 'reviewer-2')
  assert.equal(dismissed.dismissalReason, 'Not testable')
})

test('replaceSnapshot marks the ingestion failed when item persistence fails', async (t) => {
  const mocks = mockSnapshotWrites(t)
  mocks.bulkWrite.mock.mockImplementationOnce(async () => { throw new Error('write failed') })

  await assert.rejects(() => service.replaceSnapshot(VALID_HASH, [specItem()], []), /write failed/)

  assert.deepEqual(mocks.updateIngestion.mock.calls[0].arguments[1], { $set: { status: 'failed' } })
})

test('getSnapshot returns null for a non-ready ingestion', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult(null))
  const findItems = t.mock.method(SpecIngestionItem, 'find', () => queryResult([]))

  assert.equal(await service.getSnapshot(VALID_HASH), null)
  assert.equal(findItems.mock.callCount(), 0)
})

test('getSnapshot sorts and serializes a ready legacy snapshot', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult({
    specHash: VALID_HASH,
    status: 'ready',
    modules: [],
  }))
  const findItems = t.mock.method(SpecIngestionItem, 'find', () => queryResult([{
    itemId: 'ITEM-00001', sourceChunkId: 'CHUNK-001', headingPath: ['Requirements'],
    text: 'The user can sign in.', role: 'REQUIREMENT', roleMethod: 'regex',
    roleScore: 0.9, module: 'UNTAGGED', moduleIds: [], primaryModuleId: null,
    moduleMethod: 'none', moduleScore: null, moduleMargin: null,
    moduleDisposition: 'unassigned', moduleAlgorithmVersion: null, reviewed: false,
    reviewedBy: null, reviewState: 'resolved', dismissedAt: null, dismissedBy: null,
    dismissalReason: null, suggestedRole: null, requirementId: 'REQ-00001',
  }]))

  const snapshot = await service.getSnapshot(VALID_HASH)

  assert.equal(findItems.mock.calls[0].arguments[0].specHash, VALID_HASH)
  assert.equal(snapshot.module_status, 'pending')
  assert.equal(snapshot.module_version, 0)
  assert.deepEqual(snapshot.module_coverage, {})
  assert.equal(snapshot.items[0].source_chunk_id, 'CHUNK-001')
  assert.equal(snapshot.items[0].requirement_id, 'REQ-00001')
})

test('pending review list and count use the legacy-compatible filter', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult({ specHash: VALID_HASH, status: 'ready' }))
  const findItems = t.mock.method(SpecIngestionItem, 'find', () => queryResult([]))
  const count = t.mock.method(SpecIngestionItem, 'countDocuments', async () => 2)

  assert.deepEqual(await service.getPendingReview(VALID_HASH), [])
  assert.equal(await service.countPendingReview(VALID_HASH), 2)

  const filter = findItems.mock.calls[0].arguments[0]
  assert.equal(filter.role, 'UNTAGGED')
  assert.equal(filter.reviewed, false)
  assert.deepEqual(filter.$or, [
    { reviewState: 'pending' },
    { reviewState: { $exists: false } },
  ])
  assert.deepEqual(count.mock.calls[0].arguments[0], filter)
})

test('resolveReview validates the role and marks structural changes stale', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult({ specHash: VALID_HASH, status: 'ready' }))
  const resolveItem = t.mock.method(SpecIngestionItem, 'findOneAndUpdate', () => queryResult({
    itemId: 'ITEM-00042', sourceChunkId: 'CHUNK-001', headingPath: [], text: 'Required.',
    role: 'REQUIREMENT', roleMethod: 'human', reviewed: true, reviewedBy: 'user-1',
    reviewState: 'resolved', requirementId: 'REQ-00042',
  }))
  const updateIngestion = t.mock.method(SpecIngestion, 'updateOne', async () => ({ modifiedCount: 1 }))

  await assert.rejects(() => service.resolveReview(VALID_HASH, 'ITEM-00042', 'UNTAGGED'), /Invalid review role/)
  const item = await service.resolveReview(VALID_HASH, 'ITEM-00042', 'requirement', ' user-1 ')

  const update = resolveItem.mock.calls[0].arguments[1].$set
  assert.equal(update.role, 'REQUIREMENT')
  assert.equal(update.roleMethod, 'human')
  assert.equal(update.reviewedBy, 'user-1')
  assert.equal(update.requirementId, 'REQ-00042')
  assert.equal(item.requirement_id, 'REQ-00042')
  assert.deepEqual(updateIngestion.mock.calls[0].arguments[1], { $set: { moduleStatus: 'stale' } })
})

test('resolveReview leaves module status unchanged for a non-structural role', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult({ specHash: VALID_HASH, status: 'ready' }))
  t.mock.method(SpecIngestionItem, 'findOneAndUpdate', () => queryResult({
    itemId: 'ITEM-00042', headingPath: [], role: 'ACTOR', roleMethod: 'human',
    reviewed: true, reviewState: 'resolved',
  }))
  const updateIngestion = t.mock.method(SpecIngestion, 'updateOne', async () => ({ modifiedCount: 0 }))

  await service.resolveReview(VALID_HASH, 'ITEM-00042', 'ACTOR')

  assert.equal(updateIngestion.mock.callCount(), 0)
})

test('dismissReview retains the item and writes audit metadata', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult({ specHash: VALID_HASH, status: 'ready' }))
  const dismissItem = t.mock.method(SpecIngestionItem, 'findOneAndUpdate', () => queryResult({
    itemId: 'ITEM-00007', headingPath: [], role: 'UNTAGGED', roleMethod: 'none',
    reviewed: false, reviewState: 'dismissed', dismissedBy: 'user-2',
    dismissalReason: 'Duplicate',
  }))

  const item = await service.dismissReview(VALID_HASH, 'ITEM-00007', ' user-2 ', ' Duplicate ')

  const update = dismissItem.mock.calls[0].arguments[1].$set
  assert.ok(update.dismissedAt instanceof Date)
  assert.equal(update.dismissedBy, 'user-2')
  assert.equal(update.dismissalReason, 'Duplicate')
  assert.equal(item.review_state, 'dismissed')
})

test('review mutations return null for missing ingestions and stale items', async (t) => {
  const findIngestion = t.mock.method(SpecIngestion, 'findOne', () => queryResult(null))
  const updateItem = t.mock.method(SpecIngestionItem, 'findOneAndUpdate', () => queryResult(null))

  assert.equal(await service.resolveReview(VALID_HASH, 'ITEM-1', 'ACTOR'), null)
  assert.equal(await service.dismissReview(VALID_HASH, 'ITEM-1'), null)
  assert.equal(updateItem.mock.callCount(), 0)

  findIngestion.mock.mockImplementation(() => queryResult({ specHash: VALID_HASH, status: 'ready' }))
  assert.equal(await service.resolveReview(VALID_HASH, 'ITEM-1', 'ACTOR', '  '), null)
  assert.equal(await service.dismissReview(VALID_HASH, 'ITEM-1', '  ', '  '), null)
  assert.equal(updateItem.mock.callCount(), 2)
})
