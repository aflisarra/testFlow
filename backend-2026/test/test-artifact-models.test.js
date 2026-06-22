const assert = require('node:assert/strict')
const test = require('node:test')
const mongoose = require('mongoose')

const TestCase = require('../src/models/testcase.model')
const TestPlan = require('../src/models/testplan.model')

test('TestPlan stores professional metadata with normalized values', async () => {
  const plan = new TestPlan({
    testSuiteId: new mongoose.Types.ObjectId(),
    id: 'TP-1',
    title: 'Authentication',
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
  })

  await plan.validate()

  assert.equal(plan.priority, 'high')
  assert.equal(plan.requirements[0].id, 'REQ-1')
  assert.equal(plan.requirements[0].description, 'Users can sign in')
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
