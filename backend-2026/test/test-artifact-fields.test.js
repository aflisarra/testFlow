const assert = require('node:assert/strict')
const test = require('node:test')

const {
  castPriority,
  castSeverity,
  castTestCaseType,
  hasOwn,
  normalizeAutomationTestData,
  normalizeEvidence,
  normalizeRequirements,
  normalizeString,
  normalizeStringList,
  normalizeTestData,
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

test('enum casts and validators provide stable defaults', () => {
  assert.equal(castPriority('P2'), 'medium')
  assert.equal(castSeverity('High'), 'critical')
  assert.equal(castTestCaseType('end_to_end'), 'e2e')
  assert.equal(validatePriority(undefined), 'medium')
  assert.equal(validateSeverity(null, 'minor'), 'minor')
  assert.equal(validateTestCaseType('  ', 'api'), 'api')
  assert.equal(normalizeString(' value '), 'value')
  assert.equal(normalizeString(null), '')
})

test('requirements discard unsupported, blank, and duplicate representations', () => {
  const requirements = normalizeRequirements([
    null,
    false,
    '  ',
    42,
    { code: 'REQ-42', name: 'Search', statement: 'Search is available', section: 'Discovery' },
    { id: 'REQ-42', title: 'Search', description: 'Search is available', source: 'Discovery' },
    {},
  ])

  assert.equal(requirements.length, 2)
  assert.equal(requirements[0].description, '42')
  assert.deepEqual(requirements[1], {
    id: 'REQ-42',
    title: 'Search',
    description: 'Search is available',
    source: 'Discovery',
    priority: '',
  })
  assert.deepEqual(normalizeRequirements({ requirement: 'Single object' }), [{
    id: '', title: '', description: 'Single object', source: '', priority: '',
  }])
})

test('evidence normalization drops invalid and duplicate traceability rows', () => {
  assert.deepEqual(normalizeEvidence([
    null,
    'not-an-object',
    { item_id: '', role: 'REQUIREMENT', description: 'Missing ID' },
    { item_id: 'ITEM-1', role: '', description: 'Missing role' },
    { item_id: 'ITEM-1', role: 'requirement', text: 'Valid evidence' },
    { itemId: 'ITEM-1', role: 'REQUIREMENT', description: 'Duplicate evidence' },
  ]), [{
    itemId: 'ITEM-1', externalId: '', role: 'REQUIREMENT', title: '',
    description: 'Valid evidence', source: '',
  }])
  assert.deepEqual(normalizeEvidence({
    itemId: 'ITEM-2', externalId: 'NFR-2', role: 'NON_FUNCTIONAL',
    description: 'Respond within two seconds.',
  }), [{
    itemId: 'ITEM-2', externalId: 'NFR-2', role: 'NON_FUNCTIONAL', title: '',
    description: 'Respond within two seconds.', source: '',
  }])
})

test('test data normalization parses JSON and preserves plain input', () => {
  assert.equal(normalizeTestData(undefined), null)
  assert.equal(normalizeTestData(' null '), null)
  assert.deepEqual(normalizeTestData('{"email":"user@example.com"}'), { email: 'user@example.com' })
  assert.equal(normalizeTestData('plain value'), 'plain value')
  const value = { existing: true }
  assert.equal(normalizeTestData(value), value)
})

test('automation data flattens nested preferred and fallback values', () => {
  assert.deepEqual(normalizeAutomationTestData(null), [])
  assert.deepEqual(normalizeAutomationTestData(' value '), ['value'])
  assert.deepEqual(normalizeAutomationTestData([1, true, '', false]), ['1', 'true', 'false'])
  assert.deepEqual(normalizeAutomationTestData({
    email: ' user@example.com ',
    password: { value: 'secret' },
    ignored: 'not selected while preferred keys exist',
  }), ['secret', 'user@example.com'])
  assert.deepEqual(normalizeAutomationTestData({
    account: { identifier: 'alpha' },
    retries: 2,
  }), ['alpha', '2'])
})

test('hasOwn distinguishes missing and explicitly undefined fields', () => {
  assert.equal(hasOwn({ value: undefined }, 'value'), true)
  assert.equal(hasOwn({}, 'value'), false)
  assert.equal(hasOwn(null, 'value'), false)
})
