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

// Parse a "Key: value" / "Key = value" line into [key, value].
// The test-case edit modal serializes the keyed map back into one line per
// entry, so this is how a user-edited test case round-trips without losing
// which value belongs to which field.
function parseKeyedTestDataLine(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const match = raw.match(/^\s*([A-Za-z][A-Za-z0-9 _\-/]{0,60}?)\s*[:=]\s*(.+)\s*$/)
  if (!match) return null
  const key = match[1].trim()
  const value = match[2].trim()
  if (!key || !value) return null
  return [key, value]
}

/**
 * Build a field -> value map from any supported test_data shape, WITHOUT
 * losing which value belongs to which field.
 *
 * Returns null when the input carries no recoverable keys (e.g. a legacy
 * ["Admin", "admin123456"] array of bare values), so callers can tell
 * "no mapping available" apart from "empty mapping".
 *
 * Supported:
 *   {Username: "Admin", Password: "admin123456"}
 *   [{field: "Username", value: "Admin"}, ...]  / {name|key: ...}
 *   ["Username: Admin", "Password: admin123456"]
 */
function normalizeKeyedTestData(value) {
  const map = {}

  const put = (key, val) => {
    const k = String(key || '').trim()
    if (!k) return
    if (val === undefined || val === null) return
    if (typeof val === 'object') return
    const v = String(val).trim()
    if (!v) return
    map[k] = v
  }

  const walk = (input) => {
    if (input === undefined || input === null || input === '') return

    if (typeof input === 'string') {
      // A single string may carry several "Key: value" lines.
      for (const line of input.replace(/\r/g, '\n').split('\n')) {
        const parsed = parseKeyedTestDataLine(line)
        if (parsed) put(parsed[0], parsed[1])
      }
      return
    }

    if (Array.isArray(input)) {
      for (const item of input) walk(item)
      return
    }

    if (typeof input === 'object') {
      const fieldName = input.field || input.name || input.key || input.label
      if (fieldName && Object.prototype.hasOwnProperty.call(input, 'value')) {
        put(fieldName, input.value)
        return
      }
      for (const [key, item] of Object.entries(input)) {
        if (item && typeof item === 'object') {
          walk(item)
          continue
        }
        put(key, item)
      }
    }
  }

  walk(value)
  return Object.keys(map).length ? map : null
}

function normalizeAutomationTestData(value) {
  // Preserve the field -> value mapping whenever the payload carries one.
  // Flattening a keyed object down to its bare values (the previous
  // behaviour) destroyed which value belonged to which field, which is why
  // {"Username":"Admin","Password":"admin123456"} was persisted as
  // ["Admin","admin123456"] and the executor could only guess by position.
  const keyed = normalizeKeyedTestData(value)
  if (keyed) return keyed

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
  normalizeKeyedTestData,
  parseKeyedTestDataLine,
  hasOwn,
}
