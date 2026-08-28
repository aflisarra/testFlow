const axios = require('axios')

let lastResponse = null
let authHeaders = {}

function resetApiState() {
  lastResponse = null
  authHeaders = {}
}

function isApiStep(step) {
  if (step && typeof step === 'object') {
    const channel = String(step.channel || '').toLowerCase()
    const action = String(step.action || '').toLowerCase()
    return (
      channel === 'api' ||
      (channel === 'assertion' && action === 'assert_status') ||
      ['set_auth', 'http_request', 'assert_status'].includes(action)
    )
  }

  const t = String(step || '').toLowerCase()
  return (
    t.includes('post request') ||
    t.includes('get request') ||
    t.includes('put request') ||
    t.includes('delete request') ||
    t.includes('status code') ||
    t.includes('endpoint') ||
    t.includes('authorization header') ||
    t.includes('basic auth') ||
    t.includes('auth credential') ||
    t.includes('http authorization')
  )
}

function getBaseUrl(ctxOrBaseUrl) {
  if (ctxOrBaseUrl && typeof ctxOrBaseUrl === 'object') {
    return ctxOrBaseUrl.baseUrl
  }
  return ctxOrBaseUrl
}

function getCredentials(ctxOrBaseUrl) {
  const ctx = ctxOrBaseUrl && typeof ctxOrBaseUrl === 'object' ? ctxOrBaseUrl : {}
  const credentials = ctx.credentials || {}

  return {
    email:
      credentials.email ||
      credentials.username ||
      ctx.email ||
      ctx.username ||
      process.env.HTTP_BASIC_AUTH_EMAIL ||
      process.env.HTTP_BASIC_AUTH_USERNAME ||
      process.env.BASIC_AUTH_EMAIL ||
      process.env.BASIC_AUTH_USERNAME ||
      process.env.APP_LOGIN_EMAIL ||
      process.env.SELENIUM_LOGIN_EMAIL ||
      process.env.JIRA_EMAIL ||
      process.env.JIRA_USERNAME ||
      process.env.ATLASSIAN_EMAIL ||
      process.env.ATLASSIAN_USERNAME ||
      '',
    password:
      credentials.apiToken ||
      credentials.token ||
      credentials.basicAuthToken ||
      credentials.basicAuthPassword ||
      credentials.password ||
      ctx.apiToken ||
      ctx.token ||
      ctx.basicAuthToken ||
      ctx.basicAuthPassword ||
      ctx.password ||
      process.env.HTTP_BASIC_AUTH_TOKEN ||
      process.env.HTTP_BASIC_AUTH_PASSWORD ||
      process.env.BASIC_AUTH_TOKEN ||
      process.env.BASIC_AUTH_PASSWORD ||
      process.env.APP_API_TOKEN ||
      process.env.JIRA_API_TOKEN ||
      process.env.JIRA_TOKEN ||
      process.env.ATLASSIAN_API_TOKEN ||
      process.env.ATLASSIAN_TOKEN ||
      process.env.SELENIUM_LOGIN_PASSWORD ||
      ''
  }
}

function buildRequestConfig() {
  return Object.keys(authHeaders).length ? { headers: authHeaders } : undefined
}

function buildUrl(ctxOrBaseUrl, path) {
  const explicit = String(path || '').trim()
  if (/^https?:\/\//i.test(explicit)) return explicit

  const raw = String(getBaseUrl(ctxOrBaseUrl) || '').trim()
  if (!raw) throw new Error('Missing base URL for API step')
  const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  const root = normalized.replace(/\/+$/, '')
  return `${root}/${explicit.replace(/^\/+/, '')}`
}

function getExpectedStatus(step) {
  const expected = step?.assertion?.expected ?? step?.expectedStatus ?? step?.status
  const numeric = Number(expected)
  return Number.isFinite(numeric) ? numeric : null
}

function legacyPathForMethod(method) {
  const normalized = String(method || '').toUpperCase()
  if (normalized === 'POST') return 'rest/api/3/issue'
  if (normalized === 'GET') return 'rest/api/3/search'
  if (normalized === 'PUT') return 'rest/api/3/issue/1'
  if (normalized === 'DELETE') return 'rest/api/3/issue/1'
  return ''
}

function legacyPayloadForMethod(method) {
  if (String(method || '').toUpperCase() !== 'POST') return undefined
  return {
    fields: {
      project: { key: 'AS' },
      summary: 'Auto Test Ticket',
      issuetype: { name: 'Task' }
    }
  }
}

async function configureBasicAuth(ctxOrBaseUrl) {
  const { email, password } = getCredentials(ctxOrBaseUrl)

  if (!email || !password) {
    throw new Error('Missing Basic Auth credentials. Provide username/email + token/password in the test case, query params, or backend .env (HTTP_BASIC_AUTH_USERNAME and HTTP_BASIC_AUTH_PASSWORD).')
  }

  const token = Buffer.from(`${email}:${password}`).toString('base64')
  authHeaders = {
    ...authHeaders,
    Authorization: `Basic ${token}`,
    Accept: 'application/json'
  }

  return { message: 'Basic Auth header configured' }
}

async function runStructuredApiStep(step, ctxOrBaseUrl) {
  const action = String(step?.action || '').toLowerCase()
  const target = step?.target || {}

  if (action === 'set_auth') {
    return configureBasicAuth(ctxOrBaseUrl)
  }

  if (action === 'assert_status') {
    if (!lastResponse) throw new Error('No API response found')

    const expectedStatus = getExpectedStatus(step)
    if (expectedStatus && lastResponse.status !== expectedStatus) {
      throw new Error(`Expected ${expectedStatus} but got ${lastResponse.status}`)
    }

    return { message: expectedStatus ? `Status code is ${expectedStatus}` : `Status code is ${lastResponse.status}` }
  }

  if (action === 'http_request') {
    const method = String(target.method || step.method || 'GET').trim().toLowerCase()
    const path = target.url || target.path || step.path || legacyPathForMethod(method)
    if (!path) {
      throw new Error(`Missing API path for step: ${step.raw || step.id || action}`)
    }

    const requestConfig = buildRequestConfig() || {}
    lastResponse = await axios.request({
      ...requestConfig,
      method,
      url: buildUrl(ctxOrBaseUrl, path),
      data: step.body || step.payload || step.value?.body || legacyPayloadForMethod(method)
    })

    const expectedStatus = getExpectedStatus(step)
    if (expectedStatus && lastResponse.status !== expectedStatus) {
      throw new Error(`Expected ${expectedStatus} but got ${lastResponse.status}`)
    }

    return lastResponse
  }

  throw new Error(`Unsupported API execution action: ${action || 'unknown'}`)
}

async function runApiStep(step, ctxOrBaseUrl) {
  if (step && typeof step === 'object') {
    return runStructuredApiStep(step, ctxOrBaseUrl)
  }

  const t = String(step).toLowerCase()

  if (
    t.includes('authorization header') ||
    t.includes('basic auth') ||
    t.includes('auth credential') ||
    t.includes('http authorization')
  ) {
    return configureBasicAuth(ctxOrBaseUrl)
  }

  if (t.includes('post request')) {
    lastResponse = await axios.post(
      buildUrl(ctxOrBaseUrl, 'rest/api/3/issue'),
      {
        fields: {
          project: { key: "AS" },
          summary: "Auto Test Ticket",
          issuetype: { name: "Task" }
        }
      },
      buildRequestConfig()
    )
    return lastResponse
  }

  if (t.includes('get request')) {
    lastResponse = await axios.get(
      buildUrl(ctxOrBaseUrl, 'rest/api/3/search'),
      buildRequestConfig()
    )
    return lastResponse
  }

  if (t.includes('put request')) {
    lastResponse = await axios.put(
      buildUrl(ctxOrBaseUrl, 'rest/api/3/issue/1'),
      {},
      buildRequestConfig()
    )
    return lastResponse
  }

  if (t.includes('delete request')) {
    lastResponse = await axios.delete(
      buildUrl(ctxOrBaseUrl, 'rest/api/3/issue/1'),
      buildRequestConfig()
    )
    return lastResponse
  }

  if (t.includes('status code is')) {
    if (!lastResponse) throw new Error('No API response found')

    if (t.includes('201') && lastResponse.status !== 201) {
      throw new Error(`Expected 201 but got ${lastResponse.status}`)
    }

    if (t.includes('200') && lastResponse.status !== 200) {
      throw new Error(`Expected 200 but got ${lastResponse.status}`)
    }
  }
}

function getLastResponse() {
  return lastResponse
}

module.exports = { runApiStep, getLastResponse, isApiStep, resetApiState }
