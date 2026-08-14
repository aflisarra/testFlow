const test = require('node:test')
const assert = require('node:assert/strict')

const SpecIngestion = require('../src/models/spec-ingestion.model')
const SpecIngestionItem = require('../src/models/spec-ingestion-item.model')

test('SpecIngestion stores bounded module-card fields', () => {
  const ingestion = new SpecIngestion({
    specHash: 'a'.repeat(64),
    status: 'ready',
    itemCount: 1,
    moduleStatus: 'ready',
    moduleVersion: 1,
    moduleAlgorithmVersion: 'module-v2',
    modules: [{ id: 'MOD-001', name: 'Playback', description: 'Listening behavior', kind: 'functional', source_item_ids: ['ITEM-00001'] }],
  })
  assert.equal(ingestion.validateSync(), undefined)
  assert.equal(ingestion.moduleStatus, 'ready')
  assert.equal(ingestion.modules[0].id, 'MOD-001')

  const tooManyModules = new SpecIngestion({
    specHash: 'b'.repeat(64),
    modules: Array.from({ length: 13 }, (_, index) => ({ name: `Module ${index}`, description: 'x', source_item_ids: ['ITEM-00001'] })),
  })
  assert.ok(tooManyModules.validateSync()?.errors.modules)
})

test('SpecIngestionItem accepts human review metadata and rejects unknown roles', () => {
  const valid = new SpecIngestionItem({
    specHash: 'a'.repeat(64), itemId: 'ITEM-00001', sourceChunkId: 'CHUNK-001',
    text: 'The player must work offline.', role: 'REQUIREMENT', roleMethod: 'human',
    reviewed: true, reviewedBy: 'alice', reviewState: 'resolved', requirementId: 'REQ-00001',
    module: 'Playback', moduleIds: ['MOD-001'], primaryModuleId: 'MOD-001',
    moduleMethod: 'hybrid', moduleScore: 0.82, moduleMargin: 0.21,
    moduleDisposition: 'assigned', moduleAlgorithmVersion: 'module-v2',
  })
  assert.equal(valid.validateSync(), undefined)
  assert.deepEqual(valid.moduleIds, ['MOD-001'])

  const invalid = new SpecIngestionItem({
    specHash: 'a'.repeat(64), itemId: 'ITEM-00002', sourceChunkId: 'CHUNK-001',
    text: 'Invalid role.', role: 'GUESS', roleMethod: 'none',
  })
  assert.ok(invalid.validateSync()?.errors.role)
})

test('SpecIngestion defaults a new snapshot to pending module generation', () => {
  const ingestion = new SpecIngestion({ specHash: 'c'.repeat(64), status: 'ready', itemCount: 2 })

  assert.equal(ingestion.validateSync(), undefined)
  assert.equal(ingestion.moduleStatus, 'pending')
  assert.equal(ingestion.moduleVersion, 0)
})

test('SpecIngestionItem retains dismissed-review audit metadata', () => {
  const item = new SpecIngestionItem({
    specHash: 'a'.repeat(64), itemId: 'ITEM-00003', sourceChunkId: 'CHUNK-001',
    text: 'Editorial note.', role: 'UNTAGGED', roleMethod: 'none',
    reviewState: 'dismissed', dismissedBy: 'alice', dismissalReason: 'Not testable',
  })

  assert.equal(item.validateSync(), undefined)
  assert.equal(item.reviewState, 'dismissed')
  assert.equal(item.dismissalReason, 'Not testable')
})
