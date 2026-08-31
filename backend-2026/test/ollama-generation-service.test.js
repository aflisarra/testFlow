const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const test = require('node:test')

const axios = require('axios')
const Project = require('../src/models/project.model')
const TestCase = require('../src/models/testcase.model')
const TestPlan = require('../src/models/testplan.model')
const TestSuite = require('../src/models/testsuite')
const User = require('../src/models/user.model')
const specIngestionService = require('../src/services/spec-ingestion.service')
const service = require('../src/services/ollama.service')
const { queryResult } = require('./helpers/mongoose-query')
const { VALID_HASH } = require('./helpers/spec-fixtures')

const SOURCE_HASH = 'b'.repeat(64)

function configureFastApi(t) {
  const previousBaseUrl = process.env.FASTAPI_BASE_URL
  const previousSecret = process.env.FASTAPI_SECRET
  const previousTimeout = process.env.FASTAPI_TIMEOUT_MS
  process.env.FASTAPI_BASE_URL = 'http://fastapi.test/'
  process.env.FASTAPI_SECRET = 'shared-secret'
  process.env.FASTAPI_TIMEOUT_MS = '12345'
  t.after(() => {
    if (previousBaseUrl === undefined) delete process.env.FASTAPI_BASE_URL
    else process.env.FASTAPI_BASE_URL = previousBaseUrl
    if (previousSecret === undefined) delete process.env.FASTAPI_SECRET
    else process.env.FASTAPI_SECRET = previousSecret
    if (previousTimeout === undefined) delete process.env.FASTAPI_TIMEOUT_MS
    else process.env.FASTAPI_TIMEOUT_MS = previousTimeout
  })
}

function uploadResponse(overrides = {}) {
  return {
    data: {
      spec_hash: VALID_HASH,
      source_spec_hash: SOURCE_HASH,
      spec_text: 'The user can sign in.',
      ...overrides,
    },
  }
}

function suiteDocument(overrides = {}) {
  return {
    _id: 'suite-1',
    specHash: VALID_HASH,
    sourceSpecHash: SOURCE_HASH,
    ingestionScope: 'scope-1',
    specText: 'The user can sign in.',
    styleConfig: 'Professional',
    projectId: 'project-1',
    testStatus: 'Draft',
    planSteps: [],
    save: async () => undefined,
    ...overrides,
  }
}

test('uploadSpecToFastApi forwards DOCX bytes and validates the durable hashes', async (t) => {
  configureFastApi(t)
  const post = t.mock.method(axios, 'post', async () => uploadResponse())
  const file = { originalname: 'requirements.docx', buffer: Buffer.from('docx-bytes') }

  const result = await service.uploadSpecToFastApi(file, 'scope-1')

  assert.deepEqual(result, {
    specHash: VALID_HASH,
    sourceSpecHash: SOURCE_HASH,
    specText: 'The user can sign in.',
  })
  const [url, form, options] = post.mock.calls[0].arguments
  assert.equal(url, 'http://fastapi.test/upload-spec')
  assert.equal(options.timeout, 12345)
  assert.equal(options.headers['X-Internal-Token'], 'shared-secret')
  const multipart = form.getBuffer().toString('utf8')
  assert.match(multipart, /requirements\.docx/)
  assert.match(multipart, /scope-1/)
  assert.match(multipart, /docx-bytes/)
})

test('uploadSpecToFastApi rejects unsupported, missing, and invalid responses', async (t) => {
  configureFastApi(t)
  const post = t.mock.method(axios, 'post', async () => uploadResponse({ spec_hash: 'bad' }))

  await assert.rejects(
    () => service.uploadSpecToFastApi({ originalname: 'requirements.txt', buffer: Buffer.from('text') }, 'scope'),
    (error) => error.statusCode === 400 && /requires a \.docx/.test(error.message)
  )
  await assert.rejects(
    () => service.uploadSpecToFastApi({ originalname: 'requirements.docx' }, 'scope'),
    /file data is missing/
  )
  await assert.rejects(
    () => service.uploadSpecToFastApi({ originalname: 'requirements.docx', buffer: Buffer.from('doc') }, 'scope'),
    (error) => error.statusCode === 502 && /valid spec_hash/.test(error.message)
  )
  assert.equal(post.mock.callCount(), 1)
})

test('ingestSpecification updates an existing suite with FastAPI identity', async (t) => {
  configureFastApi(t)
  const suite = suiteDocument()
  t.mock.method(TestSuite, 'findById', () => queryResult(suite))
  const update = t.mock.method(TestSuite, 'findByIdAndUpdate', () => queryResult(suite))
  t.mock.method(axios, 'post', async () => uploadResponse())
  t.mock.method(specIngestionService, 'countPendingReview', async () => 3)

  const result = await service.ingestSpecification({
    req: { user: { userId: 'user-1' } },
    body: { nom: 'Updated suite', nametest: 'Login tests', projectId: 'project-1' },
    file: { originalname: 'requirements.docx', buffer: Buffer.from('doc') },
    testSuiteId: 'suite-1',
  })

  const payload = update.mock.calls[0].arguments[1]
  assert.equal(payload.specHash, VALID_HASH)
  assert.equal(payload.sourceSpecHash, SOURCE_HASH)
  assert.equal(payload.ingestionScope, 'scope-1')
  assert.equal(payload.nom, 'Updated suite')
  assert.equal(result.testSuiteId, 'suite-1')
  assert.equal(result.pendingReviewCount, 3)
})

test('ingestSpecification creates a suite only for an authenticated valid project', async (t) => {
  configureFastApi(t)
  t.mock.method(Project, 'findById', () => queryResult({ _id: 'project-1' }))
  const create = t.mock.method(TestSuite, 'create', async (payload) => ({ _id: 'suite-new', ...payload }))
  t.mock.method(axios, 'post', async () => uploadResponse())
  t.mock.method(specIngestionService, 'countPendingReview', async () => 0)
  t.mock.method(crypto, 'randomUUID', () => 'scope-new')

  const result = await service.ingestSpecification({
    req: { user: { id: 'user-1' } },
    body: { name: 'Accounts', projectId: 'project-1' },
    file: { originalname: 'requirements.docx', buffer: Buffer.from('doc') },
  })

  const payload = create.mock.calls[0].arguments[0]
  assert.equal(payload.userId, 'user-1')
  assert.equal(payload.projectId, 'project-1')
  assert.equal(payload.ingestionScope, 'scope-new')
  assert.equal(result.testSuiteId, 'suite-new')
})

test('generatePlan reuses persisted plans without calling FastAPI', async (t) => {
  configureFastApi(t)
  const suite = suiteDocument()
  t.mock.method(TestSuite, 'findById', () => queryResult(suite))
  t.mock.method(TestSuite, 'findByIdAndUpdate', () => queryResult(suite))
  t.mock.method(TestPlan, 'find', () => queryResult([{
    id: 'TP-1', title: 'Accounts', module: 'Accounts', moduleId: 'MOD-001',
    planKind: 'functional', coverageStatus: 'ready', priority: 'high',
    requirements: [{ id: 'REQ-1' }], evidence: [{ itemId: 'ITEM-1' }],
  }]))
  const post = t.mock.method(axios, 'post', async () => assert.fail('FastAPI must not be called'))

  const result = await service.generatePlan({ req: {}, body: { testSuiteId: 'suite-1' }, file: null })

  assert.equal(result.reused, true)
  assert.equal(result.testPlans[0].moduleId, 'MOD-001')
  assert.equal(result.testPlans[0].planKind, 'functional')
  assert.deepEqual(result.testPlans[0].evidence, [{ itemId: 'ITEM-1' }])
  assert.equal(post.mock.callCount(), 0)
})

test('generatePlan sends ensure mode and round-trips module diagnostics', async (t) => {
  configureFastApi(t)
  const save = t.mock.fn(async () => undefined)
  const suite = suiteDocument({ save })
  t.mock.method(TestSuite, 'findById', () => queryResult(suite))
  t.mock.method(TestSuite, 'findByIdAndUpdate', () => queryResult(suite))
  t.mock.method(TestPlan, 'find', () => queryResult([]))
  const bulkWrite = t.mock.method(TestPlan, 'bulkWrite', async () => ({ upsertedCount: 1 }))
  const post = t.mock.method(axios, 'post', async () => ({
    data: {
      test_plans: [{
        id: 'TP-1', title: 'Performance', module: 'Quality', module_id: 'MOD-QA',
        plan_kind: 'quality', coverage_status: 'needs_review', priority: 'High',
        evidence: [{
          item_id: 'ITEM-9', external_id: 'NFR-9', role: 'NON_FUNCTIONAL',
          description: 'Respond within two seconds.',
        }],
      }],
      pending_review_count: 2,
      modules: [{ id: 'MOD-QA', name: 'Quality' }],
      module_status: 'needs_review',
      module_version: 4,
      module_coverage: { assigned: 1 },
      skipped_modules: [{ id: 'MOD-2', reason: 'insufficient_traceability' }],
      plan_steps: ['Review evidence'],
    },
  }))

  const result = await service.generatePlan({
    req: { user: { userId: 'user-1', name: 'Alice', picture: 'avatar.png' } },
    body: { testSuiteId: 'suite-1', generationRequestId: 'request-1' },
    file: null,
  })

  const [url, form, options] = post.mock.calls[0].arguments
  assert.equal(url, 'http://fastapi.test/generate-plan')
  assert.equal(options.headers['X-Internal-Token'], 'shared-secret')
  const multipart = form.getBuffer().toString('utf8')
  assert.match(multipart, /name="module_mode"[\s\S]*ensure/)
  assert.match(multipart, /name="generation_request_id"[\s\S]*request-1/)
  assert.equal(result.testPlans[0].moduleId, 'MOD-QA')
  assert.equal(result.testPlans[0].planKind, 'quality')
  assert.equal(result.testPlans[0].evidence[0].role, 'NON_FUNCTIONAL')
  assert.equal(result.moduleStatus, 'needs_review')
  assert.equal(result.moduleVersion, 4)
  assert.deepEqual(result.moduleCoverage, { assigned: 1 })
  assert.equal(result.skippedModules[0].reason, 'insufficient_traceability')
  assert.equal(bulkWrite.mock.callCount(), 1)
  assert.equal(save.mock.callCount(), 2)
})

test('generatePlan maps timeout and module-generation conflict errors', async (t) => {
  configureFastApi(t)
  const suite = suiteDocument()
  t.mock.method(TestSuite, 'findById', () => queryResult(suite))
  const update = t.mock.method(TestSuite, 'findByIdAndUpdate', () => queryResult(suite))
  t.mock.method(TestPlan, 'find', () => queryResult([]))
  const post = t.mock.method(axios, 'post', async () => {
    const error = new Error('request timeout')
    error.code = 'ECONNABORTED'
    throw error
  })

  await assert.rejects(
    () => service.generatePlan({ req: {}, body: { testSuiteId: 'suite-1' }, file: null }),
    (error) => error.statusCode === 504 && /timed out/.test(error.message)
  )

  post.mock.mockImplementationOnce(async () => {
    throw { response: { status: 409, data: { code: 'MODULE_GENERATION_IN_PROGRESS' } } }
  })
  await assert.rejects(
    () => service.generatePlan({ req: {}, body: { testSuiteId: 'suite-1' }, file: null }),
    (error) => error.statusCode === 409 && error.code === 'MODULE_GENERATION_IN_PROGRESS'
  )
  assert.equal(update.mock.callCount(), 2)
})

test('generateTestCases reuses persisted cases before calling FastAPI', async (t) => {
  configureFastApi(t)
  const suite = suiteDocument()
  const plan = { _id: 'mongo-plan-1', id: 'TP-1', title: 'Accounts' }
  t.mock.method(TestSuite, 'findById', () => queryResult(suite))
  t.mock.method(TestPlan, 'findOne', () => queryResult(plan))
  t.mock.method(TestCase, 'find', () => queryResult([{ id: 'TC-1', title: 'Existing case' }]))
  const post = t.mock.method(axios, 'post', async () => assert.fail('FastAPI must not be called'))
  t.mock.method(console, 'log', () => undefined)

  const result = await service.generateTestCases({
    req: {}, body: { testSuiteId: 'suite-1', planId: 'TP-1' },
  })

  assert.equal(result.reused, true)
  assert.equal(result.planTitle, 'Accounts')
  assert.equal(post.mock.callCount(), 0)
})

test('generateTestCases sends stable module identity and persists normalized cases', async (t) => {
  configureFastApi(t)
  t.mock.method(console, 'log', () => undefined)
  const save = t.mock.fn(async () => undefined)
  const suite = suiteDocument({ save })
  const plan = {
    _id: 'mongo-plan-1', id: 'TP-1', title: 'Performance', description: 'NFR checks',
    module: 'Quality', moduleId: 'MOD-QA', planKind: 'quality', coverageStatus: 'ready',
    objective: 'Validate latency', priority: 'high', requirements: [],
    evidence: [{ itemId: 'ITEM-9', role: 'NON_FUNCTIONAL' }],
  }
  t.mock.method(TestSuite, 'findById', () => queryResult(suite))
  t.mock.method(TestSuite, 'findByIdAndUpdate', () => queryResult(suite))
  t.mock.method(TestPlan, 'findOne', () => queryResult(plan))
  t.mock.method(TestCase, 'find', () => queryResult([]))
  t.mock.method(Project, 'findById', () => queryResult({ _id: 'project-1', title: 'Portal' }))
  const bulkWrite = t.mock.method(TestCase, 'bulkWrite', async () => ({ upsertedCount: 1 }))
  const post = t.mock.method(axios, 'post', async () => ({
    data: {
      plan_title: 'Performance',
      test_cases: [{
        id: 'TC-1', title: 'Latency check', steps: ['Send request'],
        expected_result: 'Response arrives within two seconds', priority: 'High',
        severity: 'Major', type: 'Performance', requirements: ['NFR-9'],
        test_data: { endpoint: '/health' },
      }],
    },
  }))

  const result = await service.generateTestCases({
    req: { user: { userId: 'user-1', name: 'Alice', picture: 'avatar.png' } },
    body: {
      testSuiteId: 'suite-1', planId: 'TP-1', planTitle: 'Performance',
      generationRequestId: 'request-2', spec_text: 'x'.repeat(1000),
    },
  })

  const [url, payload, options] = post.mock.calls[0].arguments
  assert.equal(url, 'http://fastapi.test/generate-test-cases')
  assert.equal(payload.plan_module, 'Quality')
  assert.equal(payload.plan_module_id, 'MOD-QA')
  assert.equal(payload.spec_hash, VALID_HASH)
  assert.equal(payload.generation_request_id, 'request-2')
  assert.ok(payload.spec_text.length <= 803)
  assert.equal(options.headers['X-Internal-Token'], 'shared-secret')
  assert.equal(result.testCases[0].priority, 'high')
  assert.equal(result.testCases[0].type, 'performance')
  assert.equal(result.testCases[0].createdBy.userId, 'user-1')
  const persisted = bulkWrite.mock.calls[0].arguments[0][0].updateOne.update.$set
  assert.equal(String(persisted.planId), 'mongo-plan-1')
  assert.equal(persisted.createdBy.name, 'Alice')
  assert.equal(save.mock.callCount(), 1)
})

test('generatePlan creates and regenerates a new suite from one uploaded document', async (t) => {
  configureFastApi(t)
  t.mock.method(console, 'log', () => undefined)
  t.mock.method(crypto, 'randomUUID', () => 'scope-new')
  t.mock.method(Project, 'findById', () => queryResult({ _id: 'project-1' }))
  t.mock.method(User, 'findById', () => queryResult({
    _id: 'user-1', name: 'Resolved User', picture: 'resolved.png',
  }))
  const save = t.mock.fn(async () => undefined)
  const create = t.mock.method(TestSuite, 'create', async (payload) => ({
    _id: 'suite-new', projectId: 'project-1', planSteps: ['old'], save, ...payload,
  }))
  const planWrite = t.mock.method(TestPlan, 'bulkWrite', async () => ({ upsertedCount: 1 }))
  const post = t.mock.method(axios, 'post', async (url) => {
    if (url.endsWith('/upload-spec')) return uploadResponse()
    return {
      data: {
        testPlans: [{ title: '', description: null, module: '', priority: null }],
        planSteps: [
          { content: 'Second', order: 2 },
          { step: 'First', order: 'invalid' },
          '',
          null,
        ],
      },
    }
  })

  const result = await service.generatePlan({
    req: { user: { userId: 'user-1' } },
    body: {
      userId: 'user-1', projectId: 'project-1', regenerate: 'yes',
      nameTest: 'Generated tests', applicationUrl: 'https://example.test',
      style_configuration: 'Concise', generation_request_id: 'request-new',
    },
    file: { originalname: 'requirements.docx', filename: 'stored.docx', buffer: Buffer.from('doc') },
  })

  assert.equal(post.mock.callCount(), 2)
  const generationForm = post.mock.calls[1].arguments[1].getBuffer().toString('utf8')
  assert.match(generationForm, /name="module_mode"[\s\S]*regenerate/)
  assert.match(generationForm, /name="generation_request_id"[\s\S]*request-new/)
  const suitePayload = create.mock.calls[0].arguments[0]
  assert.equal(suitePayload.specHash, VALID_HASH)
  assert.equal(suitePayload.sourceSpecHash, SOURCE_HASH)
  assert.equal(suitePayload.ingestionScope, 'scope-new')
  assert.equal(suitePayload.specFilePath, 'uploads/specs/stored.docx')
  assert.equal(result.testSuiteId, 'suite-new')
  assert.equal(result.testPlans[0].id, 'TP-1')
  assert.equal(result.testPlans[0].title, 'Test Plan 1')
  assert.equal(result.reused, false)
  assert.equal(planWrite.mock.callCount(), 1)
  assert.equal(save.mock.callCount(), 1)
})

test('generatePlan marks empty generation incomplete and restores generic conflicts', async (t) => {
  configureFastApi(t)
  const suite = suiteDocument()
  t.mock.method(TestSuite, 'findById', () => queryResult(suite))
  const update = t.mock.method(TestSuite, 'findByIdAndUpdate', () => queryResult(suite))
  t.mock.method(TestPlan, 'find', () => queryResult([]))
  const post = t.mock.method(axios, 'post', async () => ({ data: { test_plans: [] } }))

  await assert.rejects(
    () => service.generatePlan({ req: {}, body: { testSuiteId: 'suite-1' }, file: null }),
    (error) => error.statusCode === 502 && /empty test plans/.test(error.message)
  )
  assert.equal(update.mock.calls.at(-1).arguments[1].testStatus, 'Incomplete')

  suite.testStatus = 'Draft'
  post.mock.mockImplementationOnce(async () => {
    throw { response: { status: 409, data: {} } }
  })
  await assert.rejects(
    () => service.generatePlan({ req: {}, body: { testSuiteId: 'suite-1' }, file: null }),
    (error) => error.statusCode === 409 && /cancelled/.test(error.message)
  )
  assert.equal(update.mock.calls.at(-1).arguments[1].testStatus, 'Draft')

  post.mock.mockImplementationOnce(async () => { throw new Error('network down') })
  await assert.rejects(
    () => service.generatePlan({ req: {}, body: { testSuiteId: 'suite-1' }, file: null }),
    /network down/
  )
})

test('generateTestCases normalizes alternate step details and anonymous authors', async (t) => {
  configureFastApi(t)
  t.mock.method(console, 'log', () => undefined)
  const suite = suiteDocument({ projectId: null })
  const plan = { _id: 'mongo-plan-1', id: 'TP-1', title: '', module: null, moduleId: null }
  t.mock.method(TestSuite, 'findById', () => queryResult(suite))
  t.mock.method(TestSuite, 'findByIdAndUpdate', () => queryResult(suite))
  t.mock.method(TestPlan, 'findOne', () => queryResult(plan))
  t.mock.method(TestCase, 'find', () => queryResult([]))
  const bulkWrite = t.mock.method(TestCase, 'bulkWrite', async () => ({ matchedCount: 1 }))
  t.mock.method(axios, 'post', async () => ({
    data: {
      testCases: [
        {},
        { id: 'TC-2', title: '', step_details: ['String step'] },
        {
          id: 'TC-3', steps: ['Fallback step'],
          stepDetails: [{ raw: 'Raw step', expectedResult: 'Expected', actualResult: 'Actual', status: '' }],
          expectedResult: 'Case expected', testData: '["alpha",2]',
        },
        { id: 'TC-4', stepDetails: [{ text: 'Text step', expected: 'Expected text' }] },
        { id: 'TC-5', stepDetails: [{ name: 'Named step', actual_result: 'Done' }] },
        { id: 'TC-6', steps: ['Fallback'], stepDetails: [42] },
      ],
    },
  }))

  const result = await service.generateTestCases({
    req: {},
    body: { testSuiteId: 'suite-1', plan_id: 'TP-1', plan_description: 'Description' },
  })

  assert.equal(result.planTitle, 'TP-1')
  assert.equal(result.testCases[0].id, 'TC-1')
  assert.equal(result.testCases[0].title, 'Test Case 1')
  assert.equal(result.testCases[0].createdBy, null)
  assert.equal(result.testCases[1].stepDetails[0].step, 'String step')
  assert.equal(result.testCases[2].stepDetails[0].expected_result, 'Expected')
  assert.equal(result.testCases[2].stepDetails[0].actual_result, 'Actual')
  assert.equal(result.testCases[3].stepDetails[0].expected_result, 'Expected text')
  assert.equal(result.testCases[4].stepDetails[0].step, 'Named step')
  assert.equal(result.testCases[5].stepDetails[0].step, 'Fallback')
  assert.equal(bulkWrite.mock.callCount(), 1)
})

test('generateTestCases maps timeout, cancellation, empty, and persistence failures', async (t) => {
  configureFastApi(t)
  t.mock.method(console, 'log', () => undefined)
  t.mock.method(console, 'error', () => undefined)
  const suite = suiteDocument()
  const findPlan = t.mock.method(TestPlan, 'findOne', () => queryResult({
    _id: 'mongo-plan-1', id: 'TP-1', title: 'Accounts',
  }))
  t.mock.method(TestSuite, 'findById', () => queryResult(suite))
  const update = t.mock.method(TestSuite, 'findByIdAndUpdate', () => queryResult(suite))
  t.mock.method(TestCase, 'find', () => queryResult([]))
  t.mock.method(Project, 'findById', () => queryResult(null))
  const post = t.mock.method(axios, 'post', async () => {
    const error = new Error('request timeout')
    error.code = 'ECONNABORTED'
    throw error
  })

  const input = { req: {}, body: { testSuiteId: 'suite-1', planId: 'TP-1' } }
  await assert.rejects(
    () => service.generateTestCases(input),
    (error) => error.statusCode === 504
  )

  post.mock.mockImplementationOnce(async () => { throw { response: { status: 409 }, message: 'cancel' } })
  await assert.rejects(() => service.generateTestCases(input), (error) => error.statusCode === 409)
  assert.equal(update.mock.calls.at(-1).arguments[1].testStatus, 'Draft')

  post.mock.mockImplementationOnce(async () => ({ data: { test_cases: [] } }))
  await assert.rejects(
    () => service.generateTestCases(input),
    (error) => error.statusCode === 502 && /empty test cases/.test(error.message)
  )
  assert.equal(update.mock.calls.at(-1).arguments[1].testStatus, 'Incomplete')

  post.mock.mockImplementationOnce(async () => ({
    data: { test_cases: [{ id: 'TC-1', title: 'Generated' }] },
  }))
  findPlan.mock.mockImplementation(() => queryResult({
    _id: null, id: 'TP-1', title: 'Accounts',
  }))
  await assert.rejects(
    () => service.generateTestCases(input),
    (error) => error.statusCode === 500 && /could not be saved/.test(error.message)
  )
})
