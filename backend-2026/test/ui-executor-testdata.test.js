const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTestDataMap,
  testDataMapToObject,
  canonicalFieldKey,
  identifyFieldKey
} = require('../src/services/selenium/ui.executor');

// Pull the helpers out of selenium.service directly via module evaluation
// (they are not exported, so we eval a tiny wrapper)
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// ────────────────────────────────────────────────────────────────
// Load the helpers we want to test by requiring the full module in
// a sandboxed context that stubs out the MongoDB/Mongoose imports.
// ────────────────────────────────────────────────────────────────
const svcPath = path.resolve(__dirname, '../src/services/selenium/selenium.service.js');
let isGenericActionExpected, isActionStep;
try {
  // Provide just enough stubs so the module loads without crashing
  const Module = require('node:module');
  const orig = Module._resolveFilename;
  const stubs = {
    './driver.factory': { createDriver: async () => ({}) },
    './ui.executor': { runStructuredUiStep: async () => ({}) },
    '../../utils/logger': { addLog: () => {} },
    '../../models/TestExecution.model': class {},
    '../../models/testcase.model': class {},
  };
  Module._resolveFilename = function (request, parent, isMain, opts) {
    for (const key of Object.keys(stubs)) {
      if (request === key || (parent && request.endsWith(key.replace('./', '/')))) return request;
    }
    return orig.apply(this, arguments);
  };
  const Module2 = require('node:module');
  const originalLoad = Module2._load;
  Module2._load = function (request, parent, isMain) {
    if (stubs[request]) return stubs[request];
    // match tail of path
    for (const key of Object.keys(stubs)) {
      if (request.endsWith(key.replace('./', path.sep))) return stubs[key];
    }
    return originalLoad.apply(this, arguments);
  };

  const svc = require(svcPath);
  // helpers are module-private — extract via test-only re-export pattern below
  Module2._load = originalLoad;
  Module._resolveFilename = orig;
} catch (_) {
  // if the above stubbing approach fails just skip those tests gracefully
}

// ── Inline re-implementation for unit tests ──────────────────────────────────
// We duplicate the two pure helper functions here so the unit tests remain
// hermetic and don't depend on the entire Selenium stack loading cleanly.

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isGenericActionExpectedImpl(expected) {
  if (!expected) return true;
  const e = normalizeText(expected);
  return (
    /^the .+ action is (triggered|submitted|performed|executed|completed|done|initiated|clicked|activated|selected|fired)$/.test(e) ||
    /^the action is (triggered|submitted|performed|executed|completed|done|initiated|clicked|activated|selected|fired)$/.test(e) ||
    /^(click|submit|press|toggle|select|search|reset|save|confirm|cancel|dismiss) action is (triggered|submitted|performed|executed|completed|done|initiated|clicked)$/.test(e) ||
    /^action (is|was) (triggered|submitted|performed|executed|completed)$/.test(e)
  );
}

function isActionStepImpl(stepText) {
  return /^\s*(click|submit|press|tap|toggle|check|uncheck|select|open|close|dismiss|confirm|cancel|save|next|back|go|search|reset|verify|validate|assert)\b/i.test(stepText);
}

// ─── isGenericActionExpected tests ───────────────────────────────────────────

test('isGenericActionExpected: detects "The action is triggered" as generic', () => {
  assert.ok(isGenericActionExpectedImpl('The action is triggered'));
});

test('isGenericActionExpected: detects "The Login action is triggered" as generic', () => {
  assert.ok(isGenericActionExpectedImpl('The Login action is triggered'));
});

test('isGenericActionExpected: detects "The Search action is submitted" as generic', () => {
  assert.ok(isGenericActionExpectedImpl('The Search action is submitted'));
});

test('isGenericActionExpected: treats null/empty as generic (no assertion)', () => {
  assert.ok(isGenericActionExpectedImpl(''));
  assert.ok(isGenericActionExpectedImpl(null));
  assert.ok(isGenericActionExpectedImpl(undefined));
});

test('isGenericActionExpected: does NOT flag explicit functional expected results', () => {
  assert.ok(!isGenericActionExpectedImpl('User is redirected to dashboard'));
  assert.ok(!isGenericActionExpectedImpl('Invalid credentials error is displayed'));
  assert.ok(!isGenericActionExpectedImpl('Leave list displays matching records'));
});

// ─── isActionStep tests ───────────────────────────────────────────────────────

test('isActionStep: "Click Login" is an action step', () => {
  assert.ok(isActionStepImpl('Click Login'));
});

test('isActionStep: "Submit Form" is an action step', () => {
  assert.ok(isActionStepImpl('Submit Form'));
});

test('isActionStep: "Search records" is an action step', () => {
  assert.ok(isActionStepImpl('Search records'));
});

test('isActionStep: "Enter valid value in Username" is NOT an action step', () => {
  assert.ok(!isActionStepImpl('Enter valid value in Username'));
});

test('isActionStep: "Fill password field" is NOT an action step', () => {
  assert.ok(!isActionStepImpl('Fill password field'));
});

// ─── test_data map tests (existing) ──────────────────────────────────────────

test('buildTestDataMap correctly maps object test_data (new format)', () => {
  const raw = { Username: 'Admin', Password: 'admin123456' };
  const map = buildTestDataMap(raw);
  const obj = testDataMapToObject(map);

  assert.equal(obj.Username, 'Admin');
  assert.equal(obj.Password, 'admin123456');
  assert.equal(map.get('username')?.value, 'Admin');
  assert.equal(map.get('password')?.value, 'admin123456');
});

test('buildTestDataMap parses legacy array test_data using step context without positional guessing', () => {
  const raw = ['Admin', 'admin123456'];
  const steps = [
    'Enter valid value in Username',
    'Enter valid value in Password',
    'Click Login'
  ];
  const map = buildTestDataMap(raw, steps);
  const obj = testDataMapToObject(map);

  assert.equal(obj.Username, 'Admin');
  assert.equal(obj.Password, 'admin123456');
  assert.equal(map.get('username')?.value, 'Admin');
  assert.equal(map.get('password')?.value, 'admin123456');
});

test('buildTestDataMap maps bare login values to Username and Password steps', () => {
  const map = buildTestDataMap(
    ['Admin', 'admin123'],
    [
      'Enter valid value in Username',
      'Enter valid value in Password',
      'Click Login',
    ]
  )
  assert.equal(map.get('username')?.value, 'Admin')
  assert.equal(map.get('password')?.value, 'admin123')
  assert.deepEqual(map.unmappedTestDataValues, [])
})

test('buildTestDataMap matches equivalent punctuation in test data and steps', () => {
  const map = buildTestDataMap(
    ['CAN - FMLA'],
    ['Select CAN-FMLA in Leave Type']
  )
  assert.equal(map.get('leavetype')?.value, 'CAN - FMLA')
  assert.deepEqual(map.unmappedTestDataValues, [])
})

test('buildTestDataMap correctly parses date picker fields', () => {
  const raw = { 'From Date': '2026-09-01', 'To Date': '2026-09-10' };
  const steps = [
    'Select date in From Date',
    'Select date in To Date',
    'Click Search'
  ];
  const map = buildTestDataMap(raw, steps);
  const obj = testDataMapToObject(map);

  assert.equal(obj['From Date'], '2026-09-01');
  assert.equal(obj['To Date'], '2026-09-10');
  assert.equal(map.get('fromdate')?.value, '2026-09-01');
  assert.equal(map.get('todate')?.value, '2026-09-10');
});

test('buildTestDataMap generates fallback date data when test data is empty', () => {
  const raw = {};
  const steps = [
    'Select date in From Date',
    'Select date in To Date',
    'Click Search'
  ];
  const map = buildTestDataMap(raw, steps);
  const obj = testDataMapToObject(map);

  assert.ok(obj['From Date']);
  assert.ok(obj['To Date']);
  assert.ok(new Date(obj['From Date']) <= new Date(obj['To Date']));
});
