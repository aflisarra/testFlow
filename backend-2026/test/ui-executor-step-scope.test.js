const test = require('node:test')
const assert = require('node:assert/strict')

const {
  parseStepFieldAndValue,
  parseStepTargetField,
  filterActionsForCurrentStep,
  buildTestDataMap,
  testDataMapToObject,
} = require('../src/services/selenium/ui.executor')

const ADD_USER_STEPS = [
  'Click Add button',
  'Select Admin in User Role dropdown',
  'Enter manda user in Employee Name field',
  'Select Enabled in Status dropdown',
  'Enter testuser1 in Username field',
  'Enter Password123! in Password password field',
  'Enter Password123! in Confirm Password password field',
  'Click Save button',
]

// ── Step sentence parsing ────────────────────────────────────────────────

test('parseStepFieldAndValue pairs the value with the field named in the same step', () => {
  assert.deepEqual(parseStepFieldAndValue('Enter manda user in Employee Name field'), {
    field: 'Employee Name',
    value: 'manda user',
    action: 'type',
  })
  assert.deepEqual(parseStepFieldAndValue('Select Admin in User Role dropdown'), {
    field: 'User Role',
    value: 'Admin',
    action: 'select',
  })
  assert.deepEqual(parseStepFieldAndValue('Enter Password123! in Confirm Password password field'), {
    field: 'Confirm Password',
    value: 'Password123!',
    action: 'type',
  })
})

test('parseStepFieldAndValue treats placeholder wording as "no literal value"', () => {
  assert.equal(parseStepFieldAndValue('Enter a valid value in Username field').value, '')
  assert.equal(parseStepFieldAndValue('Select date in From Date').value, '')
})

test('parseStepTargetField resolves the target of a click step', () => {
  assert.equal(parseStepTargetField('Click Save button'), 'Save')
  assert.equal(parseStepTargetField('Click Add button'), 'Add')
})

// ── Test data mapping (requirement: never by array position) ─────────────

test('keyed test_data keeps its field mapping and gains fields named only by steps', () => {
  const map = buildTestDataMap(
    {
      'Employee Name': 'manda user',
      Status: 'Enabled',
      Username: 'testuser1',
      Password: 'Password123!',
      'Confirm Password': 'Password123!',
    },
    ADD_USER_STEPS
  )
  const obj = testDataMapToObject(map)
  assert.equal(obj['Employee Name'], 'manda user')
  assert.equal(obj.Username, 'testuser1')
  assert.equal(obj['Confirm Password'], 'Password123!')
  // "User Role" is absent from test_data but named by a step.
  assert.equal(obj['User Role'], 'Admin')
})

test('legacy bare array maps by step CONTENT, not by position', () => {
  // Deliberately scrambled relative to step order.
  const map = buildTestDataMap(
    ['Enabled', 'Password123!', 'Admin', 'testuser1', 'manda user'],
    ADD_USER_STEPS
  )
  const obj = testDataMapToObject(map)

  assert.equal(obj['User Role'], 'Admin')
  assert.equal(obj['Employee Name'], 'manda user')
  assert.equal(obj.Status, 'Enabled')
  assert.equal(obj.Username, 'testuser1')

  // The regression this guards: "Admin" must never land in Employee Name.
  assert.notEqual(obj['Employee Name'], 'Admin')
})

test('steps alone provide the data when test_data is missing entirely', () => {
  const obj = testDataMapToObject(buildTestDataMap([], ADD_USER_STEPS))
  assert.equal(obj['User Role'], 'Admin')
  assert.equal(obj['Employee Name'], 'manda user')
  assert.equal(obj.Username, 'testuser1')
})

// ── Current step is the source of truth ──────────────────────────────────

test('actions carrying another field\'s value are rejected for the current step', () => {
  const map = buildTestDataMap(
    {
      'Employee Name': 'manda user',
      Status: 'Enabled',
      Username: 'testuser1',
      'User Role': 'Admin',
    },
    ADD_USER_STEPS
  )

  const result = filterActionsForCurrentStep(
    'Enter testuser1 in Username field',
    [
      { type: 'type', selector: '[name="username"]', value: 'testuser1' },
      { type: 'type', selector: '[name="employeeName"]', value: 'Admin' },
      { type: 'select', selector: '.status', value: 'Enabled' },
    ],
    map
  )

  assert.equal(result.actions.length, 1)
  assert.equal(result.actions[0].value, 'testuser1')
  assert.equal(result.rejected.length, 2)
})

test('a correct action for the current step is kept untouched', () => {
  const map = buildTestDataMap({ 'User Role': 'Admin', Username: 'testuser1' }, ADD_USER_STEPS)
  const actions = [{ type: 'select', selector: '__index:2', value: 'Admin' }]
  const result = filterActionsForCurrentStep('Select Admin in User Role dropdown', actions, map)

  assert.equal(result.rejected.length, 0)
  assert.deepEqual(result.actions, actions)
})

test('allRejected is flagged so the caller can rebuild the step action', () => {
  const map = buildTestDataMap({ 'User Role': 'Admin', Username: 'testuser1' }, ADD_USER_STEPS)
  const result = filterActionsForCurrentStep(
    'Enter testuser1 in Username field',
    [{ type: 'type', selector: '[name="employeeName"]', value: 'Admin' }],
    map
  )

  assert.equal(result.actions.length, 0)
  assert.equal(result.allRejected, true)
})
