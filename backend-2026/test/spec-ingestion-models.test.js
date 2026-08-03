const test = require('node:test')
const assert = require('node:assert/strict')

const SpecIngestion = require('../src/models/spec-ingestion.model')
const SpecIngestionItem = require('../src/models/spec-ingestion-item.model')

test('SpecIngestion stores bounded module-card fields', () => {
  const ingestion = new SpecIngestion({
    specHash: 'a'.repeat(64),
    status: 'ready',
    itemCount: 1,
    modules: [{ name: 'Playback', description: 'Listening behavior', source_item_ids: ['ITEM-00001'] }],
  })
  assert.equal(ingestion.validateSync(), undefined)

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
    reviewed: true, reviewedBy: 'alice', requirementId: 'REQ-00001',
  })
  assert.equal(valid.validateSync(), undefined)

  const invalid = new SpecIngestionItem({
    specHash: 'a'.repeat(64), itemId: 'ITEM-00002', sourceChunkId: 'CHUNK-001',
    text: 'Invalid role.', role: 'GUESS', roleMethod: 'none',
  })
  assert.ok(invalid.validateSync()?.errors.role)
})
