const assert = require('node:assert/strict')
const test = require('node:test')

const controller = require('../src/controllers/ollama.controller')
const TestSuite = require('../src/models/testsuite')
const ollamaService = require('../src/services/ollama.service')
const { responseSpy } = require('./helpers/http-response')

function request(overrides = {}) {
  return {
    params: { id: 'suite-1' },
    body: {},
    file: null,
    ...overrides,
  }
}

test('ollama controller maps successful service results', async (t) => {
  const health = t.mock.method(ollamaService, 'fastApiHealth', async () => ({ status: 'ok' }))
  const chat = t.mock.method(ollamaService, 'fastApiChat', async () => ({ answer: 'hello' }))
  const getPlan = t.mock.method(ollamaService, 'getTestsuitePlan', async () => ({ id: 'suite-1' }))
  const getPlans = t.mock.method(ollamaService, 'getTestsuiteTestPlans', async () => [{ id: 'TP-1' }])
  const getDocument = t.mock.method(ollamaService, 'getSpecDocument', async () => ({
    absolutePath: 'D:\\tmp\\spec.docx', fileName: 'spec.docx',
  }))
  const generatePlan = t.mock.method(ollamaService, 'generatePlan', async () => ({ testPlans: [] }))
  const generateCases = t.mock.method(ollamaService, 'generateTestCases', async () => ({ testCases: [] }))
  const cancel = t.mock.method(ollamaService, 'cancelGeneration', async () => ({ cancelled: true }))

  let response = responseSpy()
  await controller.health(request(), response)
  assert.deepEqual(response.body, { status: 'ok' })
  assert.equal(health.mock.callCount(), 1)

  response = responseSpy()
  await controller.chat(request({ body: { message: 'hello' } }), response)
  assert.deepEqual(chat.mock.calls[0].arguments, ['hello'])
  assert.deepEqual(response.body, { answer: 'hello' })

  response = responseSpy()
  await controller.getPlan(request(), response)
  assert.deepEqual(getPlan.mock.calls[0].arguments, ['suite-1'])

  response = responseSpy()
  await controller.getTestPlans(request(), response)
  assert.deepEqual(getPlans.mock.calls[0].arguments, ['suite-1'])

  response = responseSpy()
  await controller.getSpecDocument(request(), response)
  assert.deepEqual(getDocument.mock.calls[0].arguments, ['suite-1'])
  assert.deepEqual(response.downloaded, { absolutePath: 'D:\\tmp\\spec.docx', fileName: 'spec.docx' })

  const planRequest = request({ body: { testSuiteId: 'suite-1' }, file: { buffer: Buffer.from('doc') } })
  response = responseSpy()
  await controller.generatePlan(planRequest, response)
  assert.deepEqual(generatePlan.mock.calls[0].arguments[0], {
    req: planRequest, body: planRequest.body, file: planRequest.file,
  })

  const caseRequest = request({ body: { testSuiteId: 'suite-1', planId: 'TP-1' } })
  response = responseSpy()
  await controller.generateTestCases(caseRequest, response)
  assert.deepEqual(generateCases.mock.calls[0].arguments[0], { req: caseRequest, body: caseRequest.body })

  response = responseSpy()
  await controller.cancelGeneration(request({ body: { request_id: 'req-1' } }), response)
  assert.deepEqual(cancel.mock.calls[0].arguments, [{ request_id: 'req-1' }])
  assert.deepEqual(response.body, { cancelled: true })
})

test('ollama controller preserves upstream errors for read operations', async (t) => {
  t.mock.method(ollamaService, 'fastApiHealth', async () => {
    throw { response: { status: 503, data: { detail: 'offline' } } }
  })
  t.mock.method(ollamaService, 'fastApiChat', async () => { throw new Error('chat failed') })
  t.mock.method(ollamaService, 'getTestsuitePlan', async () => {
    throw { statusCode: 404, response: { data: { error: 'plan missing' } } }
  })
  t.mock.method(ollamaService, 'getTestsuiteTestPlans', async () => { throw new Error('plans failed') })
  t.mock.method(ollamaService, 'getSpecDocument', async () => {
    throw { response: { status: 410, data: { message: 'document gone' } } }
  })
  t.mock.method(ollamaService, 'cancelGeneration', async () => { throw new Error('cancel failed') })

  let response = responseSpy()
  await controller.health(request(), response)
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.body.error, { detail: 'offline' })

  response = responseSpy()
  await controller.chat(request(), response)
  assert.equal(response.statusCode, 502)
  assert.equal(response.body.error, 'chat failed')

  response = responseSpy()
  await controller.getPlan(request(), response)
  assert.equal(response.statusCode, 404)
  assert.equal(response.body.message, 'plan missing')

  response = responseSpy()
  await controller.getTestPlans(request(), response)
  assert.equal(response.statusCode, 500)
  assert.equal(response.body.message, 'plans failed')

  response = responseSpy()
  await controller.getSpecDocument(request(), response)
  assert.equal(response.statusCode, 410)
  assert.equal(response.body.message, 'document gone')

  response = responseSpy()
  await controller.cancelGeneration(request(), response)
  assert.equal(response.statusCode, 502)
  assert.equal(response.body.message, 'cancel failed')
})

test('generatePlan maps ingestion, conflict, and timeout failures', async (t) => {
  const generate = t.mock.method(ollamaService, 'generatePlan', async () => {
    const error = new Error('Upload the specification again')
    error.statusCode = 409
    error.code = 'SPEC_NOT_INGESTED'
    throw error
  })
  const markIncomplete = t.mock.method(TestSuite, 'findByIdAndUpdate', () => Promise.resolve({}))

  let response = responseSpy()
  await controller.generatePlan(request({ body: { testSuiteId: 'suite-1' } }), response)
  assert.equal(response.statusCode, 409)
  assert.deepEqual(response.body, {
    code: 'SPEC_NOT_INGESTED', message: 'Upload the specification again',
  })
  assert.equal(markIncomplete.mock.callCount(), 0)

  generate.mock.mockImplementationOnce(async () => {
    const error = new Error('Generation in progress')
    error.statusCode = 409
    throw error
  })
  response = responseSpy()
  await controller.generatePlan(request(), response)
  assert.equal(response.statusCode, 409)
  assert.equal(response.body.message, 'Generation in progress')

  generate.mock.mockImplementationOnce(async () => {
    const error = new Error('FastAPI timed out')
    error.statusCode = 504
    throw error
  })
  response = responseSpy()
  await controller.generatePlan(request({ body: { testSuiteId: 'suite-1' } }), response)
  assert.equal(response.statusCode, 504)
  assert.equal(response.body.message, 'FastAPI timed out')
  assert.equal(markIncomplete.mock.callCount(), 1)
})

test('generateTestCases maps ingestion, conflict, and generic failures', async (t) => {
  const generate = t.mock.method(ollamaService, 'generateTestCases', async () => {
    const error = new Error('Specification missing')
    error.statusCode = 409
    error.code = 'SPEC_NOT_INGESTED'
    throw error
  })
  const markIncomplete = t.mock.method(TestSuite, 'findByIdAndUpdate', () => Promise.resolve({}))

  let response = responseSpy()
  await controller.generateTestCases(request({ body: { testSuiteId: 'suite-1' } }), response)
  assert.equal(response.statusCode, 409)
  assert.equal(response.body.code, 'SPEC_NOT_INGESTED')

  generate.mock.mockImplementationOnce(async () => {
    const error = new Error('Generation cancelled')
    error.statusCode = 409
    throw error
  })
  response = responseSpy()
  await controller.generateTestCases(request(), response)
  assert.equal(response.statusCode, 409)
  assert.equal(response.body.message, 'Generation cancelled')

  generate.mock.mockImplementationOnce(async () => {
    const error = new Error('FastAPI unavailable')
    error.statusCode = 502
    throw error
  })
  response = responseSpy()
  await controller.generateTestCases(request({ body: { testSuiteId: 'suite-1' } }), response)
  assert.equal(response.statusCode, 502)
  assert.equal(response.body.message, 'FastAPI unavailable')
  assert.equal(markIncomplete.mock.callCount(), 1)
})
