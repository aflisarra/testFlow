const test = require('node:test')
const assert = require('node:assert/strict')
const { isSearchableDropdownTrigger, matchesDropdownValue, buildDropdownActionForStep, repairMisroutedDropdownActions, repairFallbackDropdownActions, normalizeDropdownActions } = require('../src/services/selenium/ui.executor')

test('recognizes a text input dropdown trigger as searchable', () => {
  assert.equal(isSearchableDropdownTrigger('input', 'text'), true)
  assert.equal(isSearchableDropdownTrigger('input', 'search'), true)
})

test('does not type into non-searchable dropdown controls', () => {
  assert.equal(isSearchableDropdownTrigger('select', ''), false)
  assert.equal(isSearchableDropdownTrigger('input', 'checkbox'), false)
  assert.equal(isSearchableDropdownTrigger('button', ''), false)
})

test('matches dropdown values case-insensitively for OrangeHRM options', () => {
  assert.equal(matchesDropdownValue('admin', 'Admin'), true)
  assert.equal(matchesDropdownValue('admin', 'ESS'), false)
})

test('forces a user-role dropdown step to target the dropdown trigger and not the employee field', () => {
  const elements = [{
    id: '',
    name: '',
    tag: 'div',
    classes: 'oxd-select-text oxd-select-text--active',
    fieldContext: 'User Role -- Select --',
    visible: true,
    disabled: false,
    index: 27,
    placeholder: '',
  }]

  const action = buildDropdownActionForStep('Select User Role', elements, ['Admin'])
  assert.deepEqual(action, { type: 'select', selector: '__index:27', value: 'Admin', label: 'user role' })
})

test('repairs Admin misrouted to the Employee autocomplete input', () => {
  const elements = [{
    index: 27,
    classes: 'oxd-select-text oxd-select-text--active',
    fieldContext: 'User Role -- Select --',
    visible: true,
    disabled: false,
  }]
  const actions = [{
    type: 'type',
    selector: '[placeholder="Type for hints..."]',
    value: 'Admin',
  }]

  assert.deepEqual(repairMisroutedDropdownActions(elements, ['Admin'], actions), [{
    type: 'click',
    selector: '__index:27',
    value: 'Admin',
    label: 'user role',
  }])
})

test('replaces fallback Search typing with a click on the visible Admin option', () => {
  const elements = [{
    index: 12,
    role: 'option',
    text: 'Admin',
    visible: true,
    disabled: false,
  }]
  const actions = [{
    type: 'type',
    selector: '[placeholder="Search"]',
    value: 'Admin',
  }]

  assert.deepEqual(repairFallbackDropdownActions(elements, actions), [{
    type: 'click',
    selector: '__index:12',
    value: '',
    label: 'User Role: Admin',
  }])
})

test('normalizes an AI type action into a User Role dropdown click', () => {
  const elements = [{
    index: 21,
    tag: 'div',
    classes: 'oxd-select-text oxd-select-text--active',
    fieldContext: 'User Role -- Select --',
    visible: true,
    disabled: false,
  }]
  const actions = [{
    type: 'type',
    selector: '[placeholder="Search"]',
    value: 'Admin',
  }]

  assert.deepEqual(normalizeDropdownActions('Enter a User Role Admin', elements, ['Admin'], actions), [{
    type: 'select',
    selector: '__index:21',
    value: 'Admin',
    label: 'user role',
  }])
})

test("extracts Admin from the exact test step and targets User Role", () => {
  const elements = [{
    index: 20,
    tag: 'div',
    classes: 'oxd-select-wrapper',
    fieldContext: 'User Role -- Select --',
    visible: true,
    disabled: false,
  }]

  assert.deepEqual(buildDropdownActionForStep("Enter a User Role 'Admin'", elements, ['manda akhil user']), {
    type: 'select',
    selector: '__index:20',
    value: 'Admin',
    label: 'user role',
  })
})

test('plans an explicit select action for the User Role dropdown', () => {
  const elements = [{
    index: 12,
    role: 'option',
    text: 'Admin',
    classes: 'oxd-select-option',
    fieldContext: 'User Role -- Select -- Admin ESS',
    visible: true,
    disabled: false,
  }, {
    index: 10,
    tag: 'div',
    classes: 'oxd-select-text oxd-select-text--active',
    fieldContext: 'User Role -- Select -- Admin ESS',
    visible: true,
    disabled: false,
  }]

  assert.deepEqual(buildDropdownActionForStep("Enter a User Role 'Admin'", elements, ['Admin']), {
    type: 'select',
    selector: '__index:10',
    value: 'Admin',
    label: 'user role',
  })
})
