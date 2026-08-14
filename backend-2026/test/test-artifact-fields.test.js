const assert = require('node:assert/strict')
const test = require('node:test')

const {
  normalizeEvidence,
  normalizeRequirements,
  normalizeStringList,
  validatePriority,
  validateSeverity,
  validateTestCaseType,
} = require('../src/utils/test-artifact-fields')

test('normalizes typed plan evidence from FastAPI snake_case fields', () => {
  assert.deepEqual(normalizeEvidence([{
    item_id: 'ITEM-00042',
    external_id: 'AC-00042',
    role: 'acceptance',
    title: 'Checkout',
    description: 'Then a receipt is displayed.',
    source: 'CHUNK-009',
  }]), [{
    itemId: 'ITEM-00042',
    externalId: 'AC-00042',
    role: 'ACCEPTANCE',
    title: 'Checkout',
    description: 'Then a receipt is displayed.',
    source: 'CHUNK-009',
  }])
})

test('normalizes enum-like QA metadata', () => {
  assert.equal(validatePriority('High'), 'high')
  assert.equal(validatePriority('P0'), 'critical')
  assert.equal(validateSeverity('fatal'), 'blocker')
  assert.equal(validateTestCaseType('Error handling'), 'error-handling')
})

test('rejects unsupported enum values', () => {
  assert.throws(() => validatePriority('immediate'), /priority must be one of/)
  assert.throws(() => validateSeverity('catastrophic'), /severity must be one of/)
  assert.throws(() => validateTestCaseType('unknown'), /type must be one of/)
})

test('normalizes requirements from strings and objects', () => {
  const requirements = normalizeRequirements([
    'REQ-1',
    {
      requirementId: 'REQ-2',
      module: 'Authentication',
      text: 'Users can sign in',
      priority: 'High',
    },
    'REQ-1',
  ])

  assert.equal(requirements.length, 2)
  assert.deepEqual(requirements[0], {
    id: '',
    title: '',
    description: 'REQ-1',
    source: '',
    priority: '',
  })
  assert.equal(requirements[1].id, 'REQ-2')
  assert.equal(requirements[1].title, 'Authentication')
  assert.equal(requirements[1].description, 'Users can sign in')
})

test('normalizes string lists while dropping blank values', () => {
  assert.deepEqual(normalizeStringList([' ready ', '', 'configured']), ['ready', 'configured'])
  assert.deepEqual(normalizeStringList('single value'), ['single value'])
})
