const assert = require('node:assert/strict')
const test = require('node:test')
const mongoose = require('mongoose')

const TestCase = require('../src/models/testcase.model')
const TestPlan = require('../src/models/testplan.model')
const TestSuite = require('../src/models/testsuite')
const { normalizeUniqueTestPlans } = require('../src/services/ollama.service')

test('TestPlan stores professional metadata with normalized values', async () => {
  const plan = new TestPlan({
    testSuiteId: new mongoose.Types.ObjectId(),
    id: 'TP-1',
    title: 'Authentication',
    module: 'Identity',
    moduleId: 'MOD-001',
    planKind: 'functional',
    coverageStatus: 'ready',
    objective: 'Verify login flows',
    scope: 'Login, logout, and sessions',
    priority: 'High',
    requirements: [
      {
        id: 'REQ-1',
        title: 'Login',
        description: 'Users can sign in',
        source: 'Authentication',
        priority: 'High',
      },
    ],
    evidence: [{
      itemId: 'ITEM-00001', externalId: 'AC-00001', role: 'ACCEPTANCE',
      title: 'Login', description: 'Then the dashboard is displayed.', source: 'CHUNK-001',
    }],
  })

  await plan.validate()

  assert.equal(plan.priority, 'high')
  assert.equal(plan.module, 'Identity')
  assert.equal(plan.moduleId, 'MOD-001')
  assert.equal(plan.evidence[0].role, 'ACCEPTANCE')
  assert.equal(plan.requirements[0].id, 'REQ-1')
  assert.equal(plan.requirements[0].description, 'Users can sign in')
})

test('TestSuite separates suite-scoped ingestion from its raw-byte source hash', () => {
  assert.equal(TestSuite.schema.path('specHash').instance, 'String')
  assert.equal(TestSuite.schema.path('specHash').options.index, true)
  assert.equal(TestSuite.schema.path('sourceSpecHash').instance, 'String')
  assert.equal(TestSuite.schema.path('ingestionScope').instance, 'String')

  const [plan] = normalizeUniqueTestPlans([
    {
      id: 'TP-1', title: 'Authentication', module: 'Identity', module_id: 'MOD-001',
      evidence: [{
        item_id: 'ITEM-00001', external_id: 'NFR-00001', role: 'NON_FUNCTIONAL',
        description: 'Login completes within two seconds.',
      }],
    },
  ])

  assert.equal(plan.module, 'Identity')
  assert.equal(plan.moduleId, 'MOD-001')
  assert.equal(plan.evidence[0].externalId, 'NFR-00001')
})

test('TestPlan rejects invalid priority values', async () => {
  const plan = new TestPlan({
    testSuiteId: new mongoose.Types.ObjectId(),
    id: 'TP-2',
    title: 'Payments',
    priority: 'immediate',
  })

  await assert.rejects(() => plan.validate(), /priority/)
})

test('TestCase stores objective, preconditions, test data, severity, type and requirements', async () => {
  const testCase = new TestCase({
    testSuiteId: new mongoose.Types.ObjectId(),
    planId: new mongoose.Types.ObjectId(),
    id: 'TC-1.1',
    title: 'Valid login',
    objective: 'Verify successful sign in',
    preconditions: [' User exists ', ''],
    test_data: { email: 'user@example.com' },
    priority: 'P1',
    severity: 'fatal',
    type: 'Error handling',
    requirements: ['Authentication requirement'],
  })

  await testCase.validate()

  assert.equal(testCase.priority, 'high')
  assert.equal(testCase.severity, 'blocker')
  assert.equal(testCase.type, 'error-handling')
  assert.deepEqual(testCase.preconditions, ['User exists'])
  assert.deepEqual(testCase.test_data, { email: 'user@example.com' })
  assert.equal(testCase.requirements[0].description, 'Authentication requirement')
})

test('TestCase rejects invalid severity and type values', async () => {
  const testCase = new TestCase({
    testSuiteId: new mongoose.Types.ObjectId(),
    planId: new mongoose.Types.ObjectId(),
    id: 'TC-1.2',
    title: 'Invalid metadata',
    severity: 'catastrophic',
    type: 'chaos',
  })

  await assert.rejects(() => testCase.validate(), /severity|type/)
})
