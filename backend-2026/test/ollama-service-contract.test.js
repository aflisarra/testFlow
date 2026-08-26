const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const axios = require('axios')
const Project = require('../src/models/project.model')
const TestCase = require('../src/models/testcase.model')
const TestPlan = require('../src/models/testplan.model')
const TestSuite = require('../src/models/testsuite')
const service = require('../src/services/ollama.service')
const { queryResult } = require('./helpers/mongoose-query')

function fastApiEnvironment(t) {
  const previousBase = process.env.FASTAPI_BASE_URL
  const previousSecret = process.env.FASTAPI_SECRET
  const previousTimeout = process.env.FASTAPI_TIMEOUT_MS
  const previousLegacyTimeout = process.env.FASTAPI_GENERATION_TIMEOUT_MS
  process.env.FASTAPI_BASE_URL = 'http://fastapi.test/'
  process.env.FASTAPI_SECRET = 'secret'
  delete process.env.FASTAPI_TIMEOUT_MS
  delete process.env.FASTAPI_GENERATION_TIMEOUT_MS
  t.after(() => {
    if (previousBase === undefined) delete process.env.FASTAPI_BASE_URL
    else process.env.FASTAPI_BASE_URL = previousBase
    if (previousSecret === undefined) delete process.env.FASTAPI_SECRET
    else process.env.FASTAPI_SECRET = previousSecret
    if (previousTimeout === undefined) delete process.env.FASTAPI_TIMEOUT_MS
    else process.env.FASTAPI_TIMEOUT_MS = previousTimeout
    if (previousLegacyTimeout === undefined) delete process.env.FASTAPI_GENERATION_TIMEOUT_MS
    else process.env.FASTAPI_GENERATION_TIMEOUT_MS = previousLegacyTimeout
  })
}

test('ollama service pure contracts handle fallbacks and duplicate plan IDs', () => {
  const fallbackError = service.httpError(0, '', 'CODE')
  assert.equal(fallbackError.statusCode, 500)
  assert.equal(fallbackError.message, 'Error')
  assert.equal(fallbackError.code, 'CODE')

  assert.equal(service.parseBoolean(true), true)
  assert.equal(service.parseBoolean(false), false)
  assert.equal(service.parseBoolean(1), false)
  assert.equal(service.parseBoolean(' YES '), true)
  assert.equal(service.parseBoolean('no'), false)

  assert.deepEqual(service.normalizeUniqueTestPlans(null), [])
  const plans = service.normalizeUniqueTestPlans([
    { id: 'TP-1', title: 'First', priority: null },
    { planId: 'TP-1', module_id: 'MOD-2', plan_kind: 'quality', coverage_status: 'needs_review' },
    {},
  ])
  assert.equal(plans[0].id, 'TP-1')
  assert.equal(plans[1].id, 'TP-1-2')
  assert.equal(plans[1].title, 'Test Plan 2')
  assert.equal(plans[1].moduleId, 'MOD-2')
  assert.equal(plans[2].id, 'TP-3')
})

test('getFastApiBaseUrl rejects missing configuration and trims one slash', (t) => {
  const previousBase = process.env.FASTAPI_BASE_URL
  t.after(() => {
    if (previousBase === undefined) delete process.env.FASTAPI_BASE_URL
    else process.env.FASTAPI_BASE_URL = previousBase
  })

  delete process.env.FASTAPI_BASE_URL
  assert.throws(() => service.getFastApiBaseUrl(), (error) => error.statusCode === 500)
  process.env.FASTAPI_BASE_URL = 'http://fastapi.test/'
  assert.equal(service.getFastApiBaseUrl(), 'http://fastapi.test')
})

test('health, chat, and cancellation use bounded FastAPI calls and fallbacks', async (t) => {
  fastApiEnvironment(t)
  const get = t.mock.method(axios, 'get', async () => ({ data: { status: 'ok' } }))
  const post = t.mock.method(axios, 'post', async (url) => (
    url.endsWith('/chat') ? { data: { reply: 'hello' } } : { data: null }
  ))

  assert.deepEqual(await service.fastApiHealth(), { status: 'ok' })
  assert.equal(get.mock.calls[0].arguments[0], 'http://fastapi.test/')
  assert.equal(get.mock.calls[0].arguments[1].timeout, 10_000)
  assert.deepEqual(await service.fastApiChat('hi'), { reply: 'hello' })
  assert.deepEqual(await service.cancelGeneration('invalid'), { message: 'Cancellation requested.' })
  assert.deepEqual(post.mock.calls[1].arguments[1], {})
})

test('getTestsuitePlan validates, sorts, and maps embedded steps', async (t) => {
  const findSuite = t.mock.method(TestSuite, 'findById', () => queryResult(null))

  await assert.rejects(() => service.getTestsuitePlan(''), (error) => error.statusCode === 400)
  await assert.rejects(() => service.getTestsuitePlan('missing'), (error) => error.statusCode === 404)

  findSuite.mock.mockImplementationOnce(() => queryResult({ _id: 'suite-1', planSteps: [] }))
  assert.deepEqual(await service.getTestsuitePlan('suite-1'), { plans: [], steps: [] })

  findSuite.mock.mockImplementationOnce(() => queryResult({
    _id: 'suite-1',
    planSteps: [
      { _id: 'step-2', contenu: 'Second', ordre: 2 },
      { _id: 'step-1', contenu: 'First' },
    ],
  }))
  const result = await service.getTestsuitePlan('suite-1')
  assert.deepEqual(result.steps, ['First', 'Second'])
  assert.equal(result.plans[0].testSuiteId, 'suite-1')
})

test('getTestsuiteTestPlans joins cases and returns legacy defaults', async (t) => {
  const findSuite = t.mock.method(TestSuite, 'findById', () => queryResult(null))
  t.mock.method(TestPlan, 'find', () => queryResult([]))
  t.mock.method(TestCase, 'find', () => queryResult([]))

  await assert.rejects(() => service.getTestsuiteTestPlans(), (error) => error.statusCode === 400)
  await assert.rejects(() => service.getTestsuiteTestPlans('missing'), (error) => error.statusCode === 404)

  findSuite.mock.mockImplementationOnce(() => queryResult({ _id: 'suite-1' }))
  TestPlan.find.mock.mockImplementationOnce(() => queryResult([
    { _id: 'mongo-plan-1', id: 'TP-1', title: 'Accounts' },
    {
      _id: 'mongo-plan-2', id: 'TP-2', title: 'Quality', description: 'NFR', objective: 'Latency',
      scope: 'API', module: 'Quality', priority: 'high', requirements: [{ id: 'NFR-1' }],
    },
  ]))
  TestCase.find.mock.mockImplementationOnce(() => queryResult([
    { id: 'TC-1', planId: 'mongo-plan-1' },
    { id: 'TC-2', planId: 'mongo-plan-1' },
  ]))

  const result = await service.getTestsuiteTestPlans('suite-1')
  assert.equal(result.testPlans[0].casesCount, 2)
  assert.equal(result.testPlans[0].priority, 'medium')
  assert.equal(result.testPlans[1].module, 'Quality')
  assert.equal(result.testCasesByPlan[1].testCases.length, 0)
  assert.equal(result.testStatus, 'Draft')
  assert.equal(result.validationStatus, 'incomplete')
})

test('readSpecTextFromUpload handles text buffers without touching real files', async (t) => {
  const mkdir = t.mock.method(fs, 'mkdir', async () => undefined)
  const writeFile = t.mock.method(fs, 'writeFile', async () => undefined)
  t.mock.method(console, 'log', () => undefined)

  await assert.rejects(() => service.readSpecTextFromUpload(null), (error) => error.statusCode === 400)
  assert.equal(await service.readSpecTextFromUpload({
    originalname: 'requirements.md', buffer: Buffer.from('  Requirement text.  '),
  }), 'Requirement text.')
  assert.equal(mkdir.mock.callCount(), 1)
  assert.equal(writeFile.mock.callCount(), 1)
  assert.match(writeFile.mock.calls[0].arguments[1], /Requirement text/)
  await assert.rejects(
    () => service.readSpecTextFromUpload({ originalname: 'empty.txt', buffer: Buffer.from('  ') }),
    /Unable to read text/
  )
})

test('getSpecDocument validates identity, containment, existence, and filename', async (t) => {
  const findSuite = t.mock.method(TestSuite, 'findById', () => queryResult(null))
  const exists = t.mock.method(fsSync, 'existsSync', () => false)

  await assert.rejects(() => service.getSpecDocument(''), (error) => error.statusCode === 400)
  await assert.rejects(() => service.getSpecDocument('missing'), (error) => error.statusCode === 404)

  findSuite.mock.mockImplementationOnce(() => queryResult({ _id: 'suite-1', specFilePath: '' }))
  await assert.rejects(() => service.getSpecDocument('suite-1'), /document not found/)

  findSuite.mock.mockImplementationOnce(() => queryResult({
    _id: 'suite-1', specFilePath: '../outside.docx', specFileName: 'outside.docx',
  }))
  await assert.rejects(() => service.getSpecDocument('suite-1'), (error) => error.statusCode === 400)

  findSuite.mock.mockImplementation(() => queryResult({
    _id: 'suite-1', specFilePath: 'uploads/specs/spec.docx', specFileName: '',
  }))
  await assert.rejects(() => service.getSpecDocument('suite-1'), /file is missing/)

  exists.mock.mockImplementationOnce(() => true)
  const result = await service.getSpecDocument('suite-1')
  assert.equal(result.absolutePath, path.resolve(process.cwd(), 'uploads/specs/spec.docx'))
  assert.equal(result.fileName, 'spec.docx')
})

test('ingestSpecification rejects missing ownership and project state before upload', async (t) => {
  const findSuite = t.mock.method(TestSuite, 'findById', () => queryResult(null))
  const findProject = t.mock.method(Project, 'findById', () => queryResult(null))
  const file = { originalname: 'requirements.docx', buffer: Buffer.from('doc') }

  await assert.rejects(
    () => service.ingestSpecification({ req: {}, body: {}, file: null }),
    (error) => error.statusCode === 400
  )
  await assert.rejects(
    () => service.ingestSpecification({ req: {}, body: {}, file, testSuiteId: 'missing' }),
    (error) => error.statusCode === 404
  )
  await assert.rejects(
    () => service.ingestSpecification({ req: {}, body: {}, file }),
    (error) => error.statusCode === 401
  )
  await assert.rejects(
    () => service.ingestSpecification({ req: { user: { userId: 'user-1' } }, body: {}, file }),
    /projectId is required/
  )
  await assert.rejects(
    () => service.ingestSpecification({
      req: { user: { userId: 'user-1' } }, body: { projectId: 'missing' }, file,
    }),
    (error) => error.statusCode === 404 && error.code === 'PROJECT_NOT_FOUND'
  )
  assert.equal(findSuite.mock.callCount(), 1)
  assert.equal(findProject.mock.callCount(), 1)
})

test('generateTestCases validates suite linkage before generation', async (t) => {
  t.mock.method(console, 'log', () => undefined)
  const findSuite = t.mock.method(TestSuite, 'findById', () => queryResult(null))

  await assert.rejects(
    () => service.generateTestCases({ req: {}, body: {} }),
    /testSuiteId is required/
  )
  await assert.rejects(
    () => service.generateTestCases({ req: {}, body: { testSuiteId: 'suite-1' } }),
    /planId is required/
  )
  await assert.rejects(
    () => service.generateTestCases({ req: {}, body: { testSuiteId: 'missing', planId: 'TP-1' } }),
    (error) => error.statusCode === 404
  )
  findSuite.mock.mockImplementationOnce(() => queryResult({ _id: 'suite-1', specHash: '' }))
  await assert.rejects(
    () => service.generateTestCases({ req: {}, body: { testSuiteId: 'suite-1', planId: 'TP-1' } }),
    (error) => error.code === 'SPEC_NOT_INGESTED'
  )
})
