const axios = require('axios')

let lastResponse = null
let authHeaders = {}

function resetApiState() {
  lastResponse = null
  authHeaders = {}
}

function isApiStep(step) {
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
  const raw = String(getBaseUrl(ctxOrBaseUrl) || '').trim()
  if (!raw) throw new Error('Missing base URL for API step')
  const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  const root = normalized.replace(/\/+$/, '')
  return `${root}/${String(path || '').replace(/^\/+/, '')}`
}

async function runApiStep(step, ctxOrBaseUrl) {
  const t = String(step).toLowerCase()

  if (
    t.includes('authorization header') ||
    t.includes('basic auth') ||
    t.includes('auth credential') ||
    t.includes('http authorization')
  ) {
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

    if (t.includes('201') && lastResponse.status !== 201)
      throw new Error(`Expected 201 but got ${lastResponse.status}`)

    if (t.includes('200') && lastResponse.status !== 200)
      throw new Error(`Expected 200 but got ${lastResponse.status}`)
  }
}

function getLastResponse() {
  return lastResponse
}

module.exports = { runApiStep, getLastResponse, isApiStep, resetApiState }
