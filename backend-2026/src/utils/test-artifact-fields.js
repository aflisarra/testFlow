const PRIORITY_VALUES = ['low', 'medium', 'high', 'critical']
const SEVERITY_VALUES = ['trivial', 'minor', 'major', 'critical', 'blocker']
const TEST_CASE_TYPE_VALUES = [
  'functional',
  'regression',
  'integration',
  'e2e',
  'api',
  'ui',
  'performance',
  'security',
  'smoke',
  'sanity',
  'usability',
  'positive',
  'negative',
  'boundary',
  'permission',
  'validation',
  'error-handling',
  'exploratory',
]

const PRIORITY_ALIASES = {
  p0: 'critical',
  p1: 'high',
  p2: 'medium',
  p3: 'low',
  urgent: 'critical',
}

const SEVERITY_ALIASES = {
  low: 'minor',
  medium: 'major',
  high: 'critical',
  severe: 'critical',
  fatal: 'blocker',
}

const TEST_CASE_TYPE_ALIASES = {
  endtoend: 'e2e',
  'end-to-end': 'e2e',
  e2e: 'e2e',
  permissions: 'permission',
  error: 'error-handling',
  'error handling': 'error-handling',
  error_handling: 'error-handling',
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
}

function castEnum(value, aliases = {}) {
  const token = normalizeToken(value)
  return aliases[token] || token
}

function validationError(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function validateEnumValue({ value, field, allowed, aliases = {}, fallback }) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback
  }

  const normalized = castEnum(value, aliases)
  if (!allowed.includes(normalized)) {
    throw validationError(`${field} must be one of: ${allowed.join(', ')}`)
  }

  return normalized
}

function castPriority(value) {
  return castEnum(value, PRIORITY_ALIASES)
}

function castSeverity(value) {
  return castEnum(value, SEVERITY_ALIASES)
}

function castTestCaseType(value) {
  return castEnum(value, TEST_CASE_TYPE_ALIASES)
}

function validatePriority(value, fallback = 'medium') {
  return validateEnumValue({
    value,
    field: 'priority',
    allowed: PRIORITY_VALUES,
    aliases: PRIORITY_ALIASES,
    fallback,
  })
}

function validateSeverity(value, fallback = 'major') {
  return validateEnumValue({
    value,
    field: 'severity',
    allowed: SEVERITY_VALUES,
    aliases: SEVERITY_ALIASES,
    fallback,
  })
}

function validateTestCaseType(value, fallback = 'functional') {
  return validateEnumValue({
    value,
    field: 'type',
    allowed: TEST_CASE_TYPE_VALUES,
    aliases: TEST_CASE_TYPE_ALIASES,
    fallback,
  })
}

function normalizeString(value) {
  return String(value || '').trim()
}

function normalizeStringList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list.map((item) => normalizeString(item)).filter(Boolean)
}

function normalizeRequirement(requirement) {
  if (requirement === null || requirement === undefined) return null

  if (typeof requirement === 'string' || typeof requirement === 'number') {
    const description = normalizeString(requirement)
    if (!description) return null
    return {
      id: '',
      title: '',
      description,
      source: '',
      priority: '',
    }
  }

  if (typeof requirement !== 'object') return null

  const id = normalizeString(
    requirement.id ||
      requirement.requirementId ||
      requirement.reqId ||
      requirement.key ||
      requirement.code
  )
  const title = normalizeString(requirement.title || requirement.name || requirement.module)
  const description = normalizeString(
    requirement.description ||
      requirement.text ||
      requirement.requirement ||
      requirement.statement ||
      requirement.content
  )
  const source = normalizeString(requirement.source || requirement.module || requirement.section)
  const priority = normalizeString(requirement.priority)

  if (!id && !title && !description) return null

  return {
    id,
    title,
    description,
    source,
    priority,
  }
}

function normalizeRequirements(value) {
  const list = Array.isArray(value) ? value : value ? [value] : []
  const seen = new Set()
  const normalized = []

  for (const item of list) {
    const requirement = normalizeRequirement(item)
    if (!requirement) continue

    const key = [
      requirement.id,
      requirement.title,
      requirement.description,
      requirement.source,
    ]
      .join('|')
      .toLowerCase()

    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(requirement)
  }

  return normalized
}

function normalizeTestData(value) {
  if (value === undefined || value === null || value === '') return null
  
  // String JSON → parse
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed === 'null') return null
    try { return JSON.parse(trimmed) } catch { return trimmed }
  }
  
  return value // objet, array, number → garde tel quel
}

function normalizeAutomationTestData(value) {
  const flatten = (input) => {
    const items = []
    if (input === undefined || input === null) return items

    if (typeof input === 'string') {
      const text = input.trim()
      if (text) items.push(text)
      return items
    }

    if (typeof input === 'number' || typeof input === 'boolean') {
      items.push(String(input))
      return items
    }

    if (Array.isArray(input)) {
      for (const item of input) items.push(...flatten(item))
      return items
    }

    if (typeof input === 'object') {
      const preferredKeys = [
        'value',
        'text',
        'input',
        'password',
        'username',
        'email',
        'token',
        'firstName',
        'lastName',
        'name',
        'phone',
        'address',
        'date',
        'dob',
        'birthDate',
      ]

      let matched = false
      for (const key of preferredKeys) {
        if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined && input[key] !== null && input[key] !== '') {
          matched = true
          items.push(...flatten(input[key]))
        }
      }

      if (matched) return items

      for (const item of Object.values(input)) {
        items.push(...flatten(item))
      }
      return items
    }

    const text = String(input).trim()
    if (text) items.push(text)
    return items
  }

  return flatten(value).filter(Boolean)
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key)
}

module.exports = {
  PRIORITY_VALUES,
  SEVERITY_VALUES,
  TEST_CASE_TYPE_VALUES,
  castPriority,
  castSeverity,
  castTestCaseType,
  validatePriority,
  validateSeverity,
  validateTestCaseType,
  normalizeString,
  normalizeStringList,
  normalizeRequirements,
  normalizeTestData,
  normalizeAutomationTestData,
  hasOwn,
}
