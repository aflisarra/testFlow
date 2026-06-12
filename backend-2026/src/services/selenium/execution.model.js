const axios = require('axios')

function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function rawStepText(step) {
  if (typeof step === 'string') return step
  if (step && typeof step === 'object') {
    return text(step.raw || step.text || step.name || step.step || step.description || JSON.stringify(step))
  }
  return text(step)
}

function getFastApiBaseUrl() {
  const raw = text(process.env.FASTAPI_BASE_URL)
  return raw ? raw.replace(/\/+$/, '') : ''
}

function getFastApiHeaders() {
  const secret = text(process.env.FASTAPI_SECRET)
  return secret ? { 'X-Internal-Token': secret } : {}
}

function getTranslatorTimeoutMs() {
  const parsed = Number(process.env.EXECUTION_MODEL_TIMEOUT_MS || process.env.FASTAPI_TRANSLATOR_TIMEOUT_MS || 90000)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90000
}

function target(kind, name, role, extra = {}) {
  return {
    kind,
    name,
    role: role || null,
    url: extra.url || null,
    path: extra.path || null,
    method: extra.method || null
  }
}

function value(source, key, literalText) {
  return {
    source,
    key: key || null,
    text: literalText || null
  }
}

function assertion(kind, expected) {
  return { kind, expected }
}

function inferMethod(raw) {
  const t = lower(raw)
  for (const method of ['post', 'get', 'put', 'patch', 'delete']) {
    if (new RegExp(`\\b${method}\\b`).test(t)) return method.toUpperCase()
  }
  return null
}

function inferPath(raw) {
  const source = text(raw)
  const endpointMatch = source.match(/(?:endpoint|path|url)\s+[`'"]?(\/[^\s`'"]+)/i)
  if (endpointMatch) return endpointMatch[1]

  const pathMatch = source.match(/\b(\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+)/)
  return pathMatch ? pathMatch[1] : null
}

function inferUrl(raw) {
  const match = text(raw).match(/https?:\/\/[^\s`'")\]]+/i)
  return match ? match[0] : null
}

function fallbackStep(raw, index) {
  const stepText = rawStepText(raw)
  const t = lower(stepText)
  const id = `S${index}`

  if (
    t.includes('authorization header') ||
    t.includes('basic auth') ||
    t.includes('auth credential') ||
    t.includes('http authorization')
  ) {
    return {
      id,
      raw: stepText,
      channel: 'api',
      action: 'set_auth',
      target: target('credential', 'basic auth', 'api'),
      value: value('credential', 'email,apiToken'),
      assertion: null,
      requires: ['credentials.email', 'credentials.apiToken']
    }
  }

  if (
    t.includes('post request') ||
    t.includes('get request') ||
    t.includes('put request') ||
    t.includes('patch request') ||
    t.includes('delete request') ||
    t.includes('endpoint')
  ) {
    return {
      id,
      raw: stepText,
      channel: 'api',
      action: 'http_request',
      target: target('endpoint', 'api endpoint', 'api', { method: inferMethod(stepText), path: inferPath(stepText) }),
      value: null,
      assertion: null,
      requires: ['baseUrl']
    }
  }

  const statusMatch = t.match(/status code (?:is|should be|equals?)\s+(\d{3})/)
  if (statusMatch) {
    return {
      id,
      raw: stepText,
      channel: 'assertion',
      action: 'assert_status',
      target: target('response', 'last api response', 'api'),
      value: null,
      assertion: assertion('status_code', Number(statusMatch[1])),
      requires: ['lastResponse']
    }
  }

  if (['open application', 'open app', 'open url', 'go to url', 'navigate to'].some((part) => t.includes(part))) {
    return {
      id,
      raw: stepText,
      channel: 'ui',
      action: 'open_app',
      target: target('url', 'application', null, { url: inferUrl(stepText) }),
      value: value('context', 'baseUrl'),
      assertion: null,
      requires: ['baseUrl']
    }
  }

  if (['go to login', 'open login', 'navigate login', 'login page'].some((part) => t.includes(part))) {
    return {
      id,
      raw: stepText,
      channel: 'ui',
      action: 'open_login',
      target: target('page', 'login', 'page', { url: inferUrl(stepText) }),
      value: value('context', 'baseUrl'),
      assertion: null,
      requires: ['baseUrl']
    }
  }

  if (
    ['leave', 'keep', 'clear', 'empty', 'blank', 'without entering', 'do not enter', "don't enter"].some((part) => t.includes(part)) &&
    ['email', 'username', 'password', 'field'].some((part) => t.includes(part))
  ) {
    const fieldName = t.includes('password') ? 'password' : (t.includes('email') || t.includes('username') ? 'email' : 'field')
    return {
      id,
      raw: stepText,
      channel: 'ui',
      action: 'clear_field',
      target: target('field', fieldName, 'textbox'),
      value: value('literal', null, ''),
      assertion: null,
      requires: []
    }
  }

  if (t.includes('password') && ['email', 'username', 'credential', 'login'].some((part) => t.includes(part))) {
    return {
      id,
      raw: stepText,
      channel: 'ui',
      action: 'type_credentials',
      target: target('credential_form', 'login credentials', 'form'),
      value: value('credential', 'email,password'),
      assertion: null,
      requires: ['credentials.email', 'credentials.password']
    }
  }

  if (['fill', 'enter', 'type'].some((part) => t.includes(part))) {
    const fieldName = t.includes('password') ? 'password' : (t.includes('email') || t.includes('username') ? 'email' : 'field')
    const key = fieldName === 'field' ? null : fieldName
    return {
      id,
      raw: stepText,
      channel: 'ui',
      action: 'type',
      target: target('field', fieldName, 'textbox'),
      value: value(key ? 'credential' : 'literal', key),
      assertion: null,
      requires: key ? [`credentials.${key}`] : []
    }
  }

  if (['click', 'press', 'submit', 'sign in', 'login'].some((part) => t.includes(part))) {
    return {
      id,
      raw: stepText,
      channel: 'ui',
      action: t.includes('submit') || t.includes('sign in') || t.includes('login') ? 'submit' : 'click',
      target: target('button', t.includes('login') || t.includes('sign in') ? 'login' : 'button', 'button'),
      value: null,
      assertion: null,
      requires: []
    }
  }

  if (['verify dashboard', 'assert dashboard', 'check dashboard', 'authenticated', 'redirected'].some((part) => t.includes(part))) {
    return {
      id,
      raw: stepText,
      channel: 'assertion',
      action: 'assert_authenticated',
      target: target('page', 'authenticated area', 'page'),
      value: null,
      assertion: assertion('redirected', 'authenticated area'),
      requires: []
    }
  }

  return {
    id,
    raw: stepText,
    channel: 'unknown',
    action: 'unknown',
    target: target('unknown', '', null),
    value: null,
    assertion: null,
    requires: []
  }
}

function buildFallbackExecutionModel(testCase) {
  const steps = Array.isArray(testCase?.steps) ? testCase.steps : []
  return {
    version: 'execution-model/v1',
    source: {
      test_case_id: text(testCase?.id || testCase?.testCaseId),
      title: text(testCase?.title)
    },
    preconditions: [],
    steps: steps.map((step, index) => fallbackStep(step, index + 1)),
    expected_result: text(testCase?.expected_result || testCase?.expectedResult),
    confidence: 'medium'
  }
}

function parseMaybeJson(value) {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

function normalizeTarget(input, fallback) {
  const source = input && typeof input === 'object' ? input : fallback || {}
  return {
    kind: lower(source.kind || 'unknown') || 'unknown',
    name: text(source.name),
    role: source.role ? text(source.role) : null,
    url: source.url ? text(source.url) : null,
    path: source.path ? text(source.path) : null,
    method: source.method ? text(source.method).toUpperCase() : null
  }
}

function normalizeValue(input, fallback) {
  const source = input && typeof input === 'object' ? input : fallback
  if (!source || typeof source !== 'object') return null
  return {
    source: lower(source.source || 'none') || 'none',
    key: source.key ? text(source.key) : null,
    text: source.text ? text(source.text) : null
  }
}

function normalizeAssertion(input, fallback) {
  const source = input && typeof input === 'object' ? input : fallback
  if (!source || typeof source !== 'object') return null
  return {
    kind: lower(source.kind || 'none') || 'none',
    expected: source.expected ?? null
  }
}

function normalizeExecutionModel(model, testCase) {
  const fallback = buildFallbackExecutionModel(testCase)
  const source = parseMaybeJson(model)
  const raw = source && typeof source === 'object'
    ? (source.executionModel || source.execution_model || source)
    : fallback

  const rawSteps = Array.isArray(raw.steps) ? raw.steps : []
  const originalSteps = Array.isArray(testCase?.steps) ? testCase.steps : []
  const sourceSteps = originalSteps.length ? originalSteps : rawSteps
  const steps = sourceSteps.map((step, index) => {
    const fallbackStepModel = fallback.steps[index] || fallbackStep(step, index + 1)
    const candidate = rawSteps[index] && typeof rawSteps[index] === 'object' ? rawSteps[index] : {}
    const requires = Array.isArray(candidate.requires) ? candidate.requires : fallbackStepModel.requires
    const candidateAction = lower(candidate.action)
    const candidateChannel = lower(candidate.channel)
    
let action = candidateAction

// ✅ ✅ ✅ FIX CRITIQUE
if (
  rawText.includes("open") &&
  (rawText.includes("page") || rawText.includes("form"))
) {
  action = "open_app"
}


    return {
      id: text(candidate.id || fallbackStepModel.id || `S${index + 1}`),
      raw: text(candidate.raw || fallbackStepModel.raw || rawStepText(step)),
      channel: candidateChannel && candidateChannel !== 'unknown' ? candidateChannel : (fallbackStepModel.channel || 'unknown'),
      
ction: action && action !== 'unknown'
  ? action
  : fallbackStepModel.action || 'unknown',

      target: normalizeTarget(candidate.target, fallbackStepModel.target),
      value: normalizeValue(candidate.value, fallbackStepModel.value),
      assertion: normalizeAssertion(candidate.assertion, fallbackStepModel.assertion),
      requires: requires.map((item) => text(item)).filter(Boolean)
    }
  })
  
if (
  rawText.includes("open") &&
  (rawText.includes("page") || rawText.includes("form"))
) {
  action = "open_app"
}


  return {
    version: 'execution-model/v1',
    source: raw.source && typeof raw.source === 'object' ? raw.source : fallback.source,
    preconditions: Array.isArray(raw.preconditions) ? raw.preconditions.map((item) => text(item)).filter(Boolean) : [],
    steps,
    expected_result: text(raw.expected_result || fallback.expected_result),
    confidence: lower(raw.confidence || fallback.confidence || 'medium') || 'medium'
  }
}

async function translateViaFastApi(testCase, ctx) {
  const baseUrl = getFastApiBaseUrl()
  if (!baseUrl) return null

  const response = await axios.post(
    `${baseUrl}/translate-test-case`,
    {
      testCaseId: text(testCase?.id || testCase?.testCaseId),
      title: text(testCase?.title),
      steps: Array.isArray(testCase?.steps) ? testCase.steps.map(rawStepText).filter(Boolean) : [],
      expectedResult: text(testCase?.expected_result || testCase?.expectedResult),
      context: {
        baseUrl: text(ctx?.baseUrl),
        hasCredentials: Boolean(ctx?.credentials?.email || ctx?.credentials?.username || ctx?.credentials?.password || ctx?.credentials?.apiToken),
        expectedUrlContains: text(ctx?.expectedUrlContains)
      }
    },
    { timeout: getTranslatorTimeoutMs(), headers: getFastApiHeaders() }
  )

  return response?.data?.executionModel || response?.data?.execution_model || null
}

async function resolveExecutionModel(testCase, ctx, addLog = () => {}) {
  const embedded = testCase?.executionModel || testCase?.execution_model
  if (embedded) {
    addLog('INFO', 'Using embedded execution_model/v1')
    return normalizeExecutionModel(embedded, testCase)
  }

  try {
    const translated = await translateViaFastApi(testCase, ctx)
    if (translated) {
      addLog('INFO', 'Test case interpreted by FastAPI execution_model/v1 translator')
      return normalizeExecutionModel(translated, testCase)
    }
  } catch (error) {
    addLog('WARN', `FastAPI translator unavailable, using local fallback: ${error?.message || String(error)}`)
  }

  addLog('INFO', 'Using local execution_model/v1 fallback')
  return buildFallbackExecutionModel(testCase)

  console.log("🔥 EXECUTION MODEL:", JSON.stringify(translated, null, 2))
}

function describeExecutionStep(step) {
  const raw = text(step?.raw)
  if (raw) return raw
  const action = text(step?.action || 'unknown')
  const name = text(step?.target?.name)
  return name ? `${action} ${name}` : action
}

module.exports = {
  buildFallbackExecutionModel,
  describeExecutionStep,
  normalizeExecutionModel,
  resolveExecutionModel,
  rawStepText
}