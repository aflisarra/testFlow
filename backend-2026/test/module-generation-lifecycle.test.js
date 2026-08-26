const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const test = require('node:test')

const SpecIngestion = require('../src/models/spec-ingestion.model')
const SpecIngestionItem = require('../src/models/spec-ingestion-item.model')
const service = require('../src/services/spec-ingestion.service')
const { queryResult } = require('./helpers/mongoose-query')
const { VALID_HASH, assignment, moduleCard } = require('./helpers/spec-fixtures')

function readySnapshot(overrides = {}) {
  return {
    specHash: VALID_HASH,
    status: 'ready',
    moduleStatus: 'pending',
    moduleVersion: 0,
    modules: [],
    ...overrides,
  }
}

test('claimModuleGeneration reuses a matching ready module version', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult(readySnapshot({
    moduleStatus: 'ready',
    moduleVersion: 3,
    modules: [moduleCard()],
    moduleEvidenceFingerprint: 'fingerprint-1',
    moduleAlgorithmVersion: 'module-v2',
    moduleCoverageSummary: { assigned: 1 },
  })))
  const claim = t.mock.method(SpecIngestion, 'findOneAndUpdate', () => queryResult(null))

  const result = await service.claimModuleGeneration(VALID_HASH, {
    fingerprint: 'fingerprint-1',
    algorithmVersion: 'module-v2',
  })

  assert.deepEqual(result, {
    claimed: false,
    reused: true,
    in_progress: false,
    module_status: 'ready',
    module_version: 3,
    modules: [moduleCard()],
    module_coverage: { assigned: 1 },
  })
  assert.equal(claim.mock.callCount(), 0)
})

test('claimModuleGeneration force-claims a new deterministic lease', async (t) => {
  const existing = readySnapshot({ moduleStatus: 'ready', moduleVersion: 2, modules: [moduleCard()] })
  t.mock.method(SpecIngestion, 'findOne', () => queryResult(existing))
  const claim = t.mock.method(SpecIngestion, 'findOneAndUpdate', () => queryResult({ moduleVersion: 2 }))
  t.mock.method(crypto, 'randomUUID', () => 'lease-0001')

  const result = await service.claimModuleGeneration(VALID_HASH, {
    fingerprint: 'fingerprint-2', algorithmVersion: 'module-v3', force: true,
  })

  assert.equal(result.claimed, true)
  assert.equal(result.lease, 'lease-0001')
  assert.equal(result.module_version, 2)
  assert.deepEqual(result.previous_modules, [moduleCard()])
  const [filter, update] = claim.mock.calls[0].arguments
  assert.equal(filter.specHash, VALID_HASH)
  assert.equal(filter.status, 'ready')
  assert.ok(filter.$or[1].moduleGenerationStartedAt.$lt instanceof Date)
  assert.equal(update.$set.moduleStatus, 'generating')
  assert.equal(update.$set.moduleGenerationLease, 'lease-0001')
})

test('claimModuleGeneration reports active generation and missing snapshots', async (t) => {
  const find = t.mock.method(SpecIngestion, 'findOne', () => queryResult(readySnapshot({ moduleVersion: 4 })))
  t.mock.method(SpecIngestion, 'findOneAndUpdate', () => queryResult(null))

  const active = await service.claimModuleGeneration(VALID_HASH, {
    fingerprint: 'new-fingerprint', algorithmVersion: 'module-v3',
  })
  assert.deepEqual(active, {
    claimed: false,
    reused: false,
    in_progress: true,
    module_status: 'generating',
    module_version: 4,
  })

  find.mock.mockImplementationOnce(() => queryResult(null))
  assert.equal(await service.claimModuleGeneration(VALID_HASH, {
    fingerprint: 'new-fingerprint', algorithmVersion: 'module-v3',
  }), null)
})

test('claimModuleGeneration validates fingerprint and algorithm version', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult(readySnapshot()))

  await assert.rejects(
    () => service.claimModuleGeneration(VALID_HASH, { algorithmVersion: 'module-v2' }),
    /module evidence fingerprint is required/
  )
  await assert.rejects(
    () => service.claimModuleGeneration(VALID_HASH, { fingerprint: 'fingerprint-1' }),
    /module algorithm version is required/
  )
})

test('commitModuleGeneration writes only module-owned item fields and increments once', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult(readySnapshot({
    moduleStatus: 'generating', moduleGenerationLease: 'lease-1',
  })))
  t.mock.method(SpecIngestionItem, 'find', () => queryResult([{ itemId: 'ITEM-00001' }]))
  const bulkWrite = t.mock.method(SpecIngestionItem, 'bulkWrite', async () => ({ modifiedCount: 1 }))
  const complete = t.mock.method(SpecIngestion, 'findOneAndUpdate', () => queryResult({
    modules: [moduleCard()],
    moduleStatus: 'needs_review',
    moduleVersion: 5,
    moduleCoverageSummary: { assigned: 1, unassigned: 0 },
  }))

  const result = await service.commitModuleGeneration(VALID_HASH, 'lease-1', {
    algorithm_version: 'module-v2',
    fingerprint: 'fingerprint-1',
    modules: [moduleCard()],
    assignments: [assignment()],
    coverage: { assigned: 1, unassigned: 0 },
    module_status: 'needs_review',
  })

  const fields = bulkWrite.mock.calls[0].arguments[0][0].updateOne.update.$set
  assert.deepEqual(Object.keys(fields).sort(), [
    'module', 'moduleAlgorithmVersion', 'moduleDisposition', 'moduleIds',
    'moduleMargin', 'moduleMethod', 'moduleScore', 'primaryModuleId',
  ].sort())
  assert.equal(fields.module, 'Accounts')
  assert.equal(fields.moduleAlgorithmVersion, 'module-v2')
  assert.equal('role' in fields, false)
  assert.equal('reviewed' in fields, false)
  assert.equal('reviewState' in fields, false)
  assert.equal('dismissalReason' in fields, false)

  const finalUpdate = complete.mock.calls[0].arguments[1]
  assert.deepEqual(finalUpdate.$inc, { moduleVersion: 1 })
  assert.equal(finalUpdate.$set.moduleGenerationLease, null)
  assert.equal(finalUpdate.$set.moduleStatus, 'needs_review')
  assert.deepEqual(result, {
    modules: [moduleCard()],
    module_status: 'needs_review',
    module_version: 5,
    module_coverage: { assigned: 1, unassigned: 0 },
  })
})

test('commitModuleGeneration rejects stale leases and malformed payloads', async (t) => {
  const findIngestion = t.mock.method(SpecIngestion, 'findOne', () => queryResult(null))
  t.mock.method(SpecIngestionItem, 'find', () => queryResult([{ itemId: 'ITEM-00001' }]))

  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: [], assignments: [],
    }),
    (error) => error.statusCode === 409 && /stale or invalid/.test(error.message)
  )

  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: {}, assignments: [],
    }),
    /must be arrays/
  )
  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1',
      modules: Array.from({ length: 13 }, moduleCard), assignments: [],
    }),
    /At most 12 modules/
  )

  findIngestion.mock.mockImplementation(() => queryResult(readySnapshot({ moduleStatus: 'generating' })))
  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: [], assignments: [],
    }),
    /At least one valid module/
  )
  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1',
      modules: [moduleCard(), moduleCard({ name: 'Duplicate' })], assignments: [assignment()],
    }),
    /Module IDs must be unique/
  )
})

test('commitModuleGeneration validates assignment dispositions and completeness', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult(readySnapshot({ moduleStatus: 'generating' })))
  const findItems = t.mock.method(SpecIngestionItem, 'find', () => queryResult([
    { itemId: 'ITEM-00001' }, { itemId: 'ITEM-00002' },
  ]))

  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: [moduleCard()],
      assignments: [assignment()],
    }),
    /assignment disposition for every item/
  )

  findItems.mock.mockImplementation(() => queryResult([{ itemId: 'ITEM-00001' }]))
  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: [moduleCard()],
      assignments: [assignment({ module_ids: [], primary_module_id: null })],
    }),
    /exactly one primary module/
  )
  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: [moduleCard()],
      assignments: [assignment({ module_disposition: 'cross_cutting' })],
    }),
    /at least two modules/
  )
  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: [moduleCard()],
      assignments: [assignment(), assignment()],
    }),
    /assignment item IDs must be unique/
  )
  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: [moduleCard()],
      assignments: [assignment({ item_id: 'ITEM-99999' })],
    }),
    /unknown item/
  )
})

test('commitModuleGeneration returns 409 if the lease expires before final update', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult(readySnapshot({ moduleStatus: 'generating' })))
  t.mock.method(SpecIngestionItem, 'find', () => queryResult([{ itemId: 'ITEM-00001' }]))
  t.mock.method(SpecIngestionItem, 'bulkWrite', async () => ({ modifiedCount: 1 }))
  t.mock.method(SpecIngestion, 'findOneAndUpdate', () => queryResult(null))

  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: [moduleCard()],
      assignments: [assignment()],
    }),
    (error) => error.statusCode === 409 && /expired before commit/.test(error.message)
  )
})

test('commitModuleGeneration accepts excluded camelCase assignments with ready defaults', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult(readySnapshot({ moduleStatus: 'generating' })))
  t.mock.method(SpecIngestionItem, 'find', () => queryResult([{ itemId: 'ITEM-00001' }]))
  const bulkWrite = t.mock.method(SpecIngestionItem, 'bulkWrite', async () => ({ modifiedCount: 1 }))
  t.mock.method(SpecIngestion, 'findOneAndUpdate', () => queryResult({
    modules: [{ id: 'MOD-001', name: 'Accounts' }], moduleStatus: 'ready', moduleVersion: 1,
  }))

  const result = await service.commitModuleGeneration(VALID_HASH, 'lease-1', {
    algorithmVersion: 'module-v2',
    fingerprint: 'fingerprint-1',
    modules: [{ name: 'Accounts', description: 'Account flows', sourceItemIds: ['ITEM-00001'] }],
    assignments: [{
      itemId: 'ITEM-00001', moduleIds: [], moduleMethod: 'none',
      moduleScore: 'invalid', moduleMargin: '', moduleDisposition: 'excluded',
    }],
    coverage: null,
    moduleStatus: 'unexpected',
  })

  const fields = bulkWrite.mock.calls[0].arguments[0][0].updateOne.update.$set
  assert.equal(fields.module, 'UNTAGGED')
  assert.equal(fields.primaryModuleId, null)
  assert.equal(fields.moduleScore, null)
  assert.equal(fields.moduleMargin, null)
  assert.equal(result.module_status, 'ready')
  assert.deepEqual(result.module_coverage, {})
})

test('commitModuleGeneration rejects unknown module methods and dispositions', async (t) => {
  t.mock.method(SpecIngestion, 'findOne', () => queryResult(readySnapshot({ moduleStatus: 'generating' })))
  t.mock.method(SpecIngestionItem, 'find', () => queryResult([{ itemId: 'ITEM-00001' }]))
  const payload = {
    algorithm_version: 'module-v2', fingerprint: 'fingerprint-1', modules: [moduleCard()],
  }

  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      ...payload, assignments: [assignment({ module_method: 'guess' })],
    }),
    /Invalid module method/
  )
  await assert.rejects(
    () => service.commitModuleGeneration(VALID_HASH, 'lease-1', {
      ...payload, assignments: [assignment({ module_disposition: 'maybe' })],
    }),
    /Invalid module disposition/
  )
})

test('failModuleGeneration clears a valid lease and caps its error', async (t) => {
  const update = t.mock.method(SpecIngestion, 'findOneAndUpdate', () => queryResult({ moduleStatus: 'failed' }))

  assert.deepEqual(await service.failModuleGeneration(VALID_HASH, 'lease-1', 'x'.repeat(1200)), {
    module_status: 'failed',
  })
  const fields = update.mock.calls[0].arguments[1].$set
  assert.equal(fields.moduleStatus, 'failed')
  assert.equal(fields.moduleGenerationError.length, 1000)
  assert.equal(fields.moduleGenerationLease, null)
  assert.ok(fields.moduleGenerationCompletedAt instanceof Date)

  update.mock.mockImplementationOnce(() => queryResult(null))
  assert.equal(await service.failModuleGeneration(VALID_HASH, 'lease-missing'), null)

  update.mock.mockImplementationOnce(() => queryResult({ moduleStatus: 'failed' }))
  await service.failModuleGeneration(VALID_HASH, 'lease-2', '  ')
  assert.equal(update.mock.calls[2].arguments[1].$set.moduleGenerationError, 'Module generation failed')
})
