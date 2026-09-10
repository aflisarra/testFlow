const test = require('node:test')
const assert = require('node:assert/strict')

const { diffDomSummaries, analyzeActionOutcome } = require('../src/services/selenium/ui.executor')

// ── analyzeActionOutcome: the deterministic "AI ANALYSIS" verdict ────────

test('a field validation error is classified as an error, with a correctable min-length rule extracted', () => {
  const result = analyzeActionOutcome({
    step: 'Enter Pass1 in Password field',
    fieldValidationMessage: 'Password must be at least 6 characters',
  })
  assert.equal(result.status, 'ERROR')
  assert.equal(result.minLength, 6)
  assert.match(result.reason, /Password must be at least 6 characters/)
})

test('a success snackbar is classified as success', () => {
  const result = analyzeActionOutcome({
    step: 'Click Save button',
    snackbar: { text: 'Successfully Saved', kind: 'success' },
  })
  assert.equal(result.status, 'SUCCESS')
})

test('an error snackbar is classified as error even with no field validation message', () => {
  const result = analyzeActionOutcome({
    step: 'Click Save button',
    snackbar: { text: 'Unable to save: Username already exists', kind: 'error' },
  })
  assert.equal(result.status, 'ERROR')
  assert.match(result.reason, /already exists/)
})

test('no evidence of error or success requests a retry, not a false pass', () => {
  const result = analyzeActionOutcome({ step: 'Click Add button' })
  assert.equal(result.status, 'NEED_RETRY')
})

test('field validation takes priority over a stray success-looking snackbar', () => {
  const result = analyzeActionOutcome({
    step: 'Enter Pass1 in Password field',
    fieldValidationMessage: 'Password must be at least 6 characters',
    snackbar: { text: 'Welcome back', kind: 'success' },
  })
  assert.equal(result.status, 'ERROR')
})

test('analysis returns structured DOM and step-match metadata', () => {
  const result = analyzeActionOutcome({
    step: 'Click Save button',
    aiAction: { type: 'click', selector: 'text=Save' },
    previousDom: { url: 'https://x/form' },
    currentDom: { url: 'https://x/form', elements: [{ key: 'button||save', text: 'Save' }] },
    domDiff: { urlChanged: false, added: [], removed: [], disabledChanges: [] },
    validationErrors: [],
    snackbar: null,
    url: 'https://x/form',
  })
  assert.equal(result.stepMatch, true)
  assert.equal(result.domResult.url, 'https://x/form')
  assert.deepEqual(result.domResult.previousDom, { url: 'https://x/form' })
})

test('analysis verifies the actual field value before success', () => {
  const success = analyzeActionOutcome({
    step: 'Enter valid value in Username',
    aiAction: { type: 'type', selector: '#username', value: 'Admin' },
    previousDom: { url: 'https://x/login', elements: [{ key: 'input|username', text: '' }] },
    currentDom: { url: 'https://x/login', elements: [{ key: 'input|username', text: 'Admin' }] },
    domDiff: { urlChanged: false, added: [], removed: [], disabledChanges: [] },
    fieldValue: 'Admin',
    expectedFieldValue: 'Admin',
  })
  assert.equal(success.status, 'SUCCESS')

  const failure = analyzeActionOutcome({
    step: 'Enter valid value in Username',
    aiAction: { type: 'type', selector: '#username', value: 'Admin' },
    fieldValue: '',
    expectedFieldValue: 'Admin',
  })
  assert.equal(failure.status, 'ERROR')
  assert.match(failure.reason, /verification failed/i)
})

test('navigation after click succeeds without a snackbar or stale element', () => {
  const result = analyzeActionOutcome({
    step: 'Click Login',
    aiAction: { type: 'click', selector: 'text=Login' },
    previousDom: { url: 'https://x/auth/login', elements: [{ key: 'button||login', text: 'Login' }] },
    currentDom: { url: 'https://x/dashboard/index', elements: [{ key: 'h1|||Dashboard', text: 'Dashboard' }] },
    domDiff: { urlChanged: true, added: ['Dashboard'], removed: ['Login'], disabledChanges: [] },
    validationErrors: [],
    snackbar: null,
    url: 'https://x/dashboard/index',
  })
  assert.equal(result.status, 'SUCCESS')
  assert.match(result.reason, /URL changed/i)
})

// ── diffDomSummaries: added/removed/disabled-state DOM comparison ───────

test('diffDomSummaries reports a URL change', () => {
  const before = { url: 'https://x/auth/login', elements: [] }
  const after = { url: 'https://x/admin/viewSystemUsers', elements: [] }
  assert.equal(diffDomSummaries(before, after).urlChanged, true)
})

test('diffDomSummaries reports elements that appeared (e.g. the Add User form)', () => {
  const before = { url: 'https://x', elements: [{ key: 'button||add', text: 'Add', disabled: false }] }
  const after = {
    url: 'https://x',
    elements: [
      { key: 'button||add', text: 'Add', disabled: false },
      { key: 'input|username||', text: '', disabled: false },
      { key: 'input|password||', text: '', disabled: false },
    ],
  }
  const diff = diffDomSummaries(before, after)
  assert.equal(diff.added.length, 0) // text is empty, filtered by .filter(Boolean)
  assert.equal(diff.removed.length, 0)
})

test('diffDomSummaries reports a disabled -> enabled transition (e.g. Save unlocking)', () => {
  const before = { url: 'https://x', elements: [{ key: 'button||save', text: 'Save', disabled: true }] }
  const after = { url: 'https://x', elements: [{ key: 'button||save', text: 'Save', disabled: false }] }
  const diff = diffDomSummaries(before, after)
  assert.equal(diff.disabledChanges.length, 1)
  assert.equal(diff.disabledChanges[0].from, true)
  assert.equal(diff.disabledChanges[0].to, false)
})

test('diffDomSummaries with no previous summary does not throw', () => {
  const diff = diffDomSummaries(null, { url: 'https://x', elements: [] })
  assert.equal(diff.urlChanged, true)
  assert.deepEqual(diff.added, [])
  assert.deepEqual(diff.removed, [])
})

test('diffDomSummaries exposes validation messages added after the action', () => {
  const diff = diffDomSummaries(
    { url: 'https://x', validationErrors: [], elements: [] },
    { url: 'https://x', validationErrors: ['Leave type is required'], elements: [] },
  )
  assert.deepEqual(diff.validationErrorsAdded, ['Leave type is required'])
})

test('DOM validation added after the action has priority over generic success evidence', () => {
  const result = analyzeActionOutcome({
    step: 'Click Save',
    previousDom: { url: 'https://x', validationErrors: [], elements: [] },
    currentDom: { url: 'https://x', validationErrors: ['Leave type is required'], elements: [] },
    domDiff: {
      urlChanged: false,
      validationErrorsAdded: ['Leave type is required'],
      added: [],
      removed: [],
      disabledChanges: [],
    },
    snackbar: { text: 'Saved', kind: 'success' },
  })
  assert.equal(result.status, 'ERROR')
  assert.match(result.reason, /Leave type is required/)
})
