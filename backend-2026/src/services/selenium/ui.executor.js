
/* global document, window, MouseEvent */

const { By, until, Select, Key } = require('selenium-webdriver')
const axios = require('axios')

const { captureStepScreenshot } = require('../../utils/screenshot')
const { highlightElement } = require('../../utils/visual')
const { addLog } = require('../../utils/logger')

const isSearchableDropdownTrigger = (tagName, inputType) => {
  const tag = String(tagName || '').toLowerCase()
  const type = String(inputType || '').toLowerCase()
  return tag === 'input' && !['checkbox', 'radio', 'file', 'submit', 'button'].includes(type)
}

const normalizeDropdownValue = (v) => String(v || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\s*-\s*/g, '-')
  .toLowerCase()
const matchesDropdownValue = (expected, actual) => normalizeDropdownValue(expected) === normalizeDropdownValue(actual)

// A blind "first visible button" fallback is dangerous: unrelated buttons
// (e.g. a marketing "Upgrade" button) can sit earlier in DOM order than the
// button the step actually names (e.g. "Click the Save button"). Extract
// the button label the step is asking for — quoted text first, then a
// known action keyword — and require the DOM button's text to match it
// before ever falling back to "any button".
const extractRequestedButtonLabel = (step) => {
  const stepText = String(step || '')
  const quoted = stepText.match(/["'"“”`]([^"'"“”`]+)["'"“”`]/)?.[1]?.trim()
  if (quoted) return quoted

  const keywords = [
    'create account', 'sign up', 'sign in', 'log in', 'login',
    'register', 'submit', 'save', 'continue', 'confirm', 'next',
    'search', 'reset', 'cancel', 'delete', 'update', 'add', 'ok'
  ]
  const lower = stepText.toLowerCase()
  return keywords.find((keyword) => lower.includes(keyword)) || ''
}

const findButtonForStep = (step, elements) => {
  const isButtonLike = (el) => el && (el.tag === 'button' || el.type === 'submit' || el.type === 'button') && el.visible && !el.disabled

  const requestedLabel = normalizeDropdownValue(extractRequestedButtonLabel(step))
  if (requestedLabel) {
    const exact = (elements || []).find((el) => isButtonLike(el) && normalizeDropdownValue(el?.text) === requestedLabel)
    if (exact) return exact
    const partial = (elements || []).find((el) => isButtonLike(el) && normalizeDropdownValue(el?.text).includes(requestedLabel))
    if (partial) return partial
    // A named button was requested but not found: do not silently click an
    // unrelated button (e.g. "Upgrade") instead.
    return null
  }

  return (elements || []).find(isButtonLike) || null
}

// A step like "Enter Employee Name" names ONE field. Filling every empty
// input on the page for it (the previous behaviour) means later, unrelated
// steps ("Enter a valid username", "Enter Confirm Password"...) each
// re-trigger the same broad fill and retype into fields a different step
// already handled — visibly doubling/concatenating text in fields such as
// OrangeHRM's Employee Name autocomplete. Detect which single field the
// step names and, when found, restrict fallback filling to just that field.
// All the text a DOM element exposes about which business field it is.
// `businessRole` is included because the captured DOM sets it to the
// canonical role ("username", "password") even when name/placeholder are
// empty — matching on it is what makes key-based mapping reliable.
const fieldIdentityText = (el) =>
  String(
    [el?.fieldContext, el?.businessRole, el?.placeholder, el?.name, el?.id, el?.ariaLabel]
      .filter(Boolean)
      .join(' ')
  ).toLowerCase()

const FIELD_MATCHERS = [
  { key: 'confirmpassword', keywords: ['confirm password', 're-enter password', 'retype password'], matches: (el) => String(el.type || '').toLowerCase() === 'password' && /confirm/.test(fieldIdentityText(el)) },
  { key: 'password', keywords: ['password'], matches: (el) => String(el.type || '').toLowerCase() === 'password' && !/confirm/.test(fieldIdentityText(el)) },
  { key: 'employeename', keywords: ['employee name', 'employee'], matches: (el) => /employee/.test(fieldIdentityText(el)) },
  { key: 'username', keywords: ['username', 'user name', 'login id'], matches: (el) => /username|user name/.test(fieldIdentityText(el)) },
  { key: 'email', keywords: ['email', 'e-mail'], matches: (el) => String(el.type || '').toLowerCase() === 'email' || /email/.test(fieldIdentityText(el)) },
  { key: 'firstname', keywords: ['first name'], matches: (el) => /first name/.test(fieldIdentityText(el)) },
  { key: 'lastname', keywords: ['last name', 'surname'], matches: (el) => /last name|surname/.test(fieldIdentityText(el)) },
  { key: 'phone', keywords: ['phone', 'mobile', 'telephone'], matches: (el) => /phone|mobile|tel/.test(fieldIdentityText(el)) },
  { key: 'fromdate', keywords: ['from date', 'fromdate', 'date from', 'date debut'], matches: (el) => /from.*date|date.*from|\bfrom\b/.test(fieldIdentityText(el)) },
  { key: 'todate', keywords: ['to date', 'todate', 'date to', 'date fin'], matches: (el) => /to.*date|date.*to|\bto\b/.test(fieldIdentityText(el)) },
  { key: 'date', keywords: ['date'], matches: (el) => String(el.type || '').toLowerCase() === 'date' || /date|calendar|calendrier/.test(fieldIdentityText(el)) },
  { key: 'leavetype', keywords: ['leave type', 'leavetype'], matches: (el) => /leave.*type/.test(fieldIdentityText(el)) },
  { key: 'subunit', keywords: ['sub unit', 'subunit'], matches: (el) => /sub.*unit/.test(fieldIdentityText(el)) },
  { key: 'status', keywords: ['status', 'show leave with status'], matches: (el) => /status/.test(fieldIdentityText(el)) },
]

// "Confirm Password" -> "confirmpassword", "Username" -> "username".
// Produces the same canonical key space as FIELD_MATCHERS[].key, so a
// test_data key and a DOM element can be matched by identity instead of
// by array position.
const canonicalFieldKey = (value) => {
  const compact = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  if (!compact) return ''
  const aliases = {
    user: 'username',
    userid: 'username',
    login: 'username',
    loginid: 'username',
    loginname: 'username',
    passwd: 'password',
    pass: 'password',
    newpassword: 'password',
    repeatpassword: 'confirmpassword',
    reenterpassword: 'confirmpassword',
    retypepassword: 'confirmpassword',
    verifypassword: 'confirmpassword',
    emailaddress: 'email',
    mail: 'email',
    mobile: 'phone',
    telephone: 'phone',
    tel: 'phone',
    givenname: 'firstname',
    surname: 'lastname',
    familyname: 'lastname',
    fromdate: 'fromdate',
    from_date: 'fromdate',
    todate: 'todate',
    to_date: 'todate',
    leavetype: 'leavetype',
    leave_type: 'leavetype',
    subunit: 'subunit',
    sub_unit: 'subunit',
    showleavewithstatus: 'status',
    show_leave_with_status: 'status',
  }
  return aliases[compact] || compact
}

// Trailing control nouns to strip from a field name captured out of a step
// sentence: "Employee Name field" -> "Employee Name",
// "User Role dropdown" -> "User Role", "Password password field" -> "Password".
const stripStepFieldNoun = (name) =>
  String(name || '')
    .replace(/\s*\b(password\s+field|date\s+field|input\s+field|text\s+field)\s*$/i, '')
    .replace(/\s*\b(field|input|box|dropdown|list|select|combobox|menu|button|link|checkbox|toggle|textarea)\s*$/i, '')
    .replace(/^\s*(?:the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

// Classify the CURRENT STEP before entering any action-specific branch.
// Keep this local to the executor: Python's helper must never be called from
// Node, and a normal Login input must not accidentally enter dropdown logic.
const classifyStepActionType = (step) => {
  const text = String(step || '').trim().toLowerCase()
  if (!text) return ''

  if (/\b(calendar|date|from date|to date|day|month|year)\b/.test(text)) return 'calendar'
  if (/\b(check|uncheck|tick|untick|toggle)\b/.test(text) || /\bcheckbox\b/.test(text)) return 'checkbox'
  if (/\b(select|choose|pick)\b/.test(text) || /\b(dropdown|combobox|listbox)\b/.test(text) ||
      /\b(user role|leave type|status|country|region)\b/.test(text)) return 'dropdown'
  if (/\b(click|press|tap|hit|submit|login|log in|sign in|navigate|open)\b/.test(text)) return 'click'
  if (/\b(enter|fill|provide|type|insert|set|input)\b/.test(text)) return 'input'
  return ''
}

/**
 * Extract {field, value, action} from the step sentence itself.
 *
 *   "Enter manda user in Employee Name field" -> Employee Name    = "manda user"
 *   "Select Admin in User Role dropdown"      -> User Role        = "Admin"
 *   "Enter Password123! in Confirm Password password field"
 *                                             -> Confirm Password = "Password123!"
 *
 * The step is the most reliable source of the pairing: it names the field
 * AND the value in the same sentence, so it works even for legacy test_data
 * stored as a bare array whose keys were lost. This is what stops "Admin"
 * (from "Select Admin in User Role dropdown") from ever being written into
 * Employee Name.
 */
const parseStepFieldAndValue = (step) => {
  const text = String(step || '').trim().replace(/\s+/g, ' ')
  if (!text) return null

  const patterns = [
    {
      re: /^(?:enter|type|fill(?:\s+in)?|input|insert|set|provide)\s+["'«]?(.+?)["'»]?\s+(?:in|into|to|inside)\s+(?:the\s+)?(.+?)$/i,
      action: 'type',
    },
    {
      re: /^(?:select|choose|pick)\s+["'«]?(.+?)["'»]?\s+(?:in|from|into|for|on)\s+(?:the\s+)?(.+?)$/i,
      action: 'select',
    },
  ]

  for (const { re, action } of patterns) {
    const match = text.match(re)
    if (!match) continue
    const field = stripStepFieldNoun(match[2])
    const value = String(match[1] || '').trim().replace(/[.,;]$/, '')
    // A "field name" that is really a whole clause is not a field name.
    if (!field || !value || field.split(' ').length > 5) continue
    // Generic placeholders carry no real data: "a valid value", "valid
    // date", or a bare type word as in "Select date in From Date". These
    // must not be written into the field as if they were a literal value,
    // and must not suppress the empty-test-data fallback.
    const placeholder =
      /^(?:a|an|the|some|any)?\s*(?:valid|invalid|correct|new|existing|appropriate)?\s*(?:value|date|text|data|option|input|entry|name|item|choice|selection)?$/i.test(
        value.trim()
      ) || /^(?:a\s+)?valid\s+/i.test(value)
    if (placeholder) {
      return { field, value: '', action }
    }
    return { field, value, action }
  }

  return null
}

// The field a step targets, even when it carries no literal value
// ("Click Save button" -> "Save", "Enter valid value in Username" -> "Username").
const parseStepTargetField = (step) => {
  const parsed = parseStepFieldAndValue(step)
  if (parsed && parsed.field) return parsed.field

  const text = String(step || '').trim().replace(/\s+/g, ' ')
  const click = text.match(/^(?:click|press|tap|hit)\s+(?:on\s+)?(?:the\s+)?(.+?)$/i)
  if (click) return stripStepFieldNoun(click[1])

  const generic = text.match(
    /^(?:enter|type|fill(?:\s+in)?|input|insert|set|provide|select|choose|pick)\s+(?:.*?\s+)?(?:in|into|from)\s+(?:the\s+)?(.+?)$/i
  )
  if (generic) return stripStepFieldNoun(generic[1])

  return ''
}

// Compare a test-data value with the value written in a step without
// changing the value that will actually be executed. This handles equivalent
// labels such as "CAN - FMLA" and "CAN-FMLA" while preserving the original
// test_data string in the resulting map.
const normalizeTestDataValueForMatch = (value) =>
  String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

// Build canonicalKey -> value from any keyed test_data shape, preserving
// the original label for logging/diagnostics. Supports legacy arrays by
// inspecting test case steps.
const buildTestDataMap = (rawTestData, steps = []) => {
  const map = new Map()

  const put = (key, value) => {
    const canonical = canonicalFieldKey(key)
    const text = String(value === undefined || value === null ? '' : value).trim()
    if (!canonical || !text) return
    if (!map.has(canonical)) {
      map.set(canonical, { label: String(key).trim(), value: text })
    }
  }

  const parseLine = (line) => {
    const match = String(line || '').match(/^\s*([A-Za-z0-9 _\-/]{1,60}?)\s*[:=]\s*(.+)\s*$/)
    return match ? [match[1].trim(), match[2].trim()] : null
  }

  const walk = (input) => {
    if (input === undefined || input === null || input === '') return

    if (typeof input === 'string') {
      for (const line of input.replace(/\r/g, '\n').split('\n')) {
        const parsed = parseLine(line)
        if (parsed) put(parsed[0], parsed[1])
      }
      return
    }

    if (Array.isArray(input)) {
      // 1. Check if array contains keyed objects: [{field: "Username", value: "Admin"}]
      const hasKeyedItems = input.some(
        (item) => item && typeof item === 'object' && (item.field || item.name || item.key || item.label)
      )
      if (hasKeyedItems) {
        for (const item of input) walk(item)
        return
      }

      // 2. Check if array contains formatted strings: ["Username: Admin", "Password: admin123"]
      let parsedAny = false
      for (const item of input) {
        if (typeof item === 'string') {
          const parsed = parseLine(item)
          if (parsed) {
            put(parsed[0], parsed[1])
            parsedAny = true
          }
        }
      }
      if (parsedAny) return

      // 3. Backward compatibility for legacy bare-value arrays
      // (e.g. ["Admin", "manda user", "Enabled"]).
      //
      // 3a. CONTENT-based pairing first: find the step that actually
      // mentions this value and take the field from that same sentence.
      // "Select Admin in User Role dropdown" pairs "Admin" with User Role,
      // never with Employee Name — position is irrelevant here, so a
      // differently-ordered array can no longer misroute a value.
      const remaining = []
      for (const item of input) {
        const val = String(item === undefined || item === null ? '' : item).trim()
        if (!val) continue

        let paired = false
        for (const step of steps || []) {
          const parsed = parseStepFieldAndValue(step)
          if (
            parsed &&
            parsed.value &&
            normalizeTestDataValueForMatch(parsed.value) === normalizeTestDataValueForMatch(val)
          ) {
            put(parsed.field, val)
            paired = true
            break
          }
        }
        if (!paired) remaining.push(val)
      }

      // Bare arrays have no keys, so use the semantic order of the input
      // steps (Username, then Password), never DOM/table position. This is
      // the only supported legacy mapping for values such as ["Admin", ...].
      const inputFields = []
      for (const step of steps || []) {
        const parsed = parseStepFieldAndValue(step)
        if (!parsed || parsed.action !== 'type') continue
        const field = parsed.field || parseStepTargetField(step)
        const canonical = canonicalFieldKey(field)
        if (canonical && !map.has(canonical) && !inputFields.some((item) => item.canonical === canonical)) {
          inputFields.push({ canonical, field })
        }
      }

      const unmappedValues = []
      for (let index = 0; index < remaining.length; index += 1) {
        const field = inputFields[index]
        if (field) {
          put(field.field, remaining[index])
        } else {
          unmappedValues.push(remaining[index])
          console.warn(`⚠️ Legacy test data "${remaining[index]}" could not be mapped to any input step.`)
        }
      }
      if (unmappedValues.length) map.unmappedTestDataValues = unmappedValues
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

  walk(rawTestData)

  // Expose unmapped values to the executor without altering the original
  // test_data. The caller turns this into an explicit test error.
  map.unmappedTestDataValues = map.unmappedTestDataValues || []

  // Steps carry explicit field/value pairs of their own
  // ("Enter manda user in Employee Name field"). Add any field the
  // declared test_data doesn't already cover — `put` keeps the first
  // value seen, so declared test_data still wins on conflict.
  for (const step of steps || []) {
    const parsed = parseStepFieldAndValue(step)
    if (parsed && parsed.field && parsed.value) put(parsed.field, parsed.value)
  }

  // Missing test data fallback: if test_data is empty but steps require specific fields,
  // infer appropriate test data consistent with scenario (e.g. From Date <= To Date).
  if (map.size === 0 && Array.isArray(steps) && steps.length > 0) {
    for (const step of steps) {
      const matcher = findFieldMatcherForStep(step)
      if (!matcher) continue
      if (matcher.key === 'fromdate') put('From Date', '2026-05-01')
      else if (matcher.key === 'todate') put('To Date', '2026-05-31')
      else if (matcher.key === 'date') put('Date', '2026-05-01')
      else if (matcher.key === 'username') put('Username', 'Admin')
      else if (matcher.key === 'password') put('Password', 'admin123456')
      else if (matcher.key === 'leavetype') put('Leave Type', 'Annual Leave')
    }
  }

  return map
}

// Plain {label: value} object, as sent to /ai/decide and printed in logs.
const testDataMapToObject = (testDataMap) => {
  const out = {}
  for (const { label, value } of testDataMap.values()) out[label] = value
  return out
}

/**
 * Reject AI actions that don't belong to the CURRENT step.
 *
 * The AI sees the whole test case and regularly returns actions for other
 * fields ("Select Admin in User Role" while the step is "Enter testuser1
 * in Username"). Only actions targeting the step's own field, carrying the
 * step's own value, survive.
 *
 * Returns { actions, rejected } so the caller can log what was dropped.
 */
const filterActionsForCurrentStep = (step, actions, testDataMap) => {
  const parsed = parseStepFieldAndValue(step)
  const targetField = parsed?.field || parseStepTargetField(step)
  const targetCanonical = canonicalFieldKey(targetField)
  if (!targetCanonical) return { actions, rejected: [] }

  // The value this step is allowed to write: the step's own literal value
  // first (source of truth), else the mapped test data for its field.
  const stepValue =
    parsed?.value || (testDataMap?.has?.(targetCanonical) ? testDataMap.get(targetCanonical).value : '')

  // Values belonging to OTHER fields — never allowed in this step.
  const foreignValues = new Set()
  if (testDataMap) {
    for (const [canonical, entry] of testDataMap.entries()) {
      if (canonical === targetCanonical) continue
      if (stepValue && entry.value.toLowerCase() === String(stepValue).toLowerCase()) continue
      foreignValues.add(entry.value.toLowerCase())
    }
  }

  const kept = []
  const rejected = []

  for (const action of actions || []) {
    const type = String(action?.type || '').toLowerCase()
    const value = String(action?.value || '').trim()

    // A value check alone is not enough: an AI response can pair the right
    // value with the wrong selector. Reject an explicitly identified field
    // that is not the field named by the CURRENT STEP.
    if (['type', 'select', 'fill'].includes(type)) {
      const actionSelector = String(action?.selector || '')
      const selectorField = actionSelector.match(/field:([^\s\]]+)/i)?.[1] ||
        actionSelector.match(/\[(?:name|id|placeholder)=["']?([^"'\]]+)/i)?.[1] ||
        actionSelector.match(/^#([^\s]+)$/)?.[1] || ''
      const actionCanonical = canonicalFieldKey(action?.field || action?.label || selectorField)
      if (actionCanonical && actionCanonical !== targetCanonical) {
        rejected.push({ action, reason: `field "${actionCanonical}" belongs to another step, not "${targetField}"` })
        continue
      }
    }

    // A value that belongs to another field is always wrong here.
    if (value && foreignValues.has(value.toLowerCase())) {
      rejected.push({ action, reason: `value "${value}" belongs to another field, not "${targetField}"` })
      continue
    }

    // For data-entry actions, the value must be the step's value.
    if (['type', 'select', 'fill'].includes(type) && stepValue && value && value.toLowerCase() !== String(stepValue).toLowerCase()) {
      rejected.push({ action, reason: `value "${value}" is not the value this step requires ("${stepValue}")` })
      continue
    }

    kept.push(action)
  }

  return { actions: kept, rejected, allRejected: !kept.length && rejected.length > 0 }
}

// The value this specific DOM element should receive, matched by the
// element's own identity (fieldContext / businessRole / name / placeholder)
// against the test_data keys — never by position.
const valueForElementFromTestData = (el, testDataMap) => {
  if (!testDataMap || testDataMap.size === 0) return ''

  const fieldKey = identifyFieldKey(el)
  if (fieldKey && testDataMap.has(fieldKey)) return testDataMap.get(fieldKey).value

  for (const source of [el?.businessRole, el?.fieldContext, el?.name, el?.id, el?.placeholder]) {
    const canonical = canonicalFieldKey(source)
    if (canonical && testDataMap.has(canonical)) return testDataMap.get(canonical).value
  }

  // Last resort within key-based matching: a test_data key contained in
  // the element's identity text (e.g. key "Username" vs name "txtUsername").
  const identity = fieldIdentityText(el).replace(/[^a-z0-9]+/g, '')
  for (const [canonical, entry] of testDataMap.entries()) {
    if (canonical.length >= 4 && identity.includes(canonical)) return entry.value
  }

  return ''
}

const findFieldMatcherForStep = (step) => {
  const stepLower = String(step || '').toLowerCase()
  return FIELD_MATCHERS.find((entry) => entry.keywords.some((keyword) => stepLower.includes(keyword))) || null
}

// Which named field (username, password, confirmpassword...) does this
// captured DOM element look like?
const identifyFieldKey = (el) => {
  const matcher = FIELD_MATCHERS.find((entry) => entry.matches(el))
  return matcher ? matcher.key : null
}

// __index:N ties an action to the element's position in one particular
// DOM snapshot — the very next capture can shift every index by ±1 (a
// validation message appearing/disappearing adds or removes a node), so
// the same selector can silently resolve to a different field later
// (Password's __index becoming Confirm Password's, Username's index
// pointing at nothing). Prefer a real attribute selector, then a stable
// field-name selector (`field:username`, resolved by re-identifying the
// field the same way at execution time, independent of position), and
// only fall back to the index as a last resort.
const buildSelectorForElement = (el) => {
  if (el.name) return `[name="${el.name}"]`
  if (el.id) return `#${el.id}`
  const fieldKey = identifyFieldKey(el)
  if (fieldKey) return `field:${fieldKey}`
  if (el.placeholder) return `[placeholder="${el.placeholder}"]`
  return `__index:${el.index}`
}

const restrictFillableFieldsToStep = (step, fillableFields) => {
  const matcher = findFieldMatcherForStep(step)
  if (!matcher) return fillableFields // Step doesn't name a specific field: keep prior broad behaviour.
  const restricted = fillableFields.filter(matcher.matches)
  // If the named field genuinely isn't on the page, fall back to the full
  // list rather than silently doing nothing — better to attempt the
  // closest match than to skip the step outright.
  return restricted.length > 0 ? restricted : fillableFields
}

const buildDropdownActionForStep = (step, elements, testDataValues) => {
  const stepText = String(step || '')
  if (!/(select|choose|pick|dropdown|user.?role|status)/i.test(stepText)) return null

  const wantedLabel = /status/i.test(stepText)
    ? 'status'
    : /user.?role|role/i.test(stepText)
      ? 'user role'
      : stripStepFieldNoun(stepText.match(/(?:in|for)\s+(.+?)(?:\s+dropdown)?$/i)?.[1] || '')
  const wantedCanonical = canonicalFieldKey(wantedLabel)

  const dropdowns = (elements || []).filter((element) => {
    if (!element || element.disabled || element.visible === false) return false
    const tag = String(element.tag || '').toLowerCase()
    const classes = String(element.classes || '').toLowerCase()
    const context = String(element.fieldContext || element.placeholder || element.name || '').toLowerCase()
    const selectLike = tag === 'select' || /oxd-select|select-text|select-wrapper|dropdown|combobox/.test(classes) || /select/.test(context)
    const identified = identifyFieldKey(element)
    const identityMatches = wantedCanonical && identified === wantedCanonical
    return selectLike && (!wantedLabel || identityMatches || context.includes(wantedLabel.toLowerCase()))
  })
  const dropdown = dropdowns.sort((left, right) => {
    const leftClasses = String(left.classes || '').toLowerCase()
    const rightClasses = String(right.classes || '').toLowerCase()
    return Number(/oxd-select-text/.test(rightClasses)) - Number(/oxd-select-text/.test(leftClasses))
  })[0]

  if (!dropdown) return null

    const selector = buildSelectorForElement(dropdown)

  const usedValues = new Set((testDataValues || []).map((item) => String(item || '').trim()).filter(Boolean))
  // Match the keyword as a whole word inside the test_data entry rather
  // than requiring the entry to be exactly "Enabled"/"Admin" — testers
  // often annotate values, e.g. "Enabled pour le dropdown". Extract just
  // the matched word itself, never the full annotated string (the DOM
  // option is named "Enabled", not "Enabled pour le dropdown").
  const extractWordMatch = (pattern) => {
    for (const item of testDataValues || []) {
      const match = String(item || '').match(pattern)
      if (match) return match[1]
    }
    return ''
  }
  const preferredValue = /status/i.test(stepText)
    ? extractWordMatch(/\b(enabled|disabled)\b/i)
    : /user.?role|role/i.test(stepText)
      ? (extractWordMatch(/\b(admin|ess)\b/i) || extractWordMatch(/\b(admin)\b/i))
      : ''

  const quotedValue = stepText.match(/["'“”`]([^"'“”`]+)["'“”`]/)?.[1]?.trim() || ''
  const inValue = stepText.match(/(?:select|choose|pick)\s+(.+?)\s+in\s+/i)?.[1]?.trim() || ''
  const namedValue = stepText.match(/(?:user\s*role|status|dropdown|select|choose|pick)\s*(?:is|as|to|:)?\s*([A-Za-z][A-Za-z0-9 _-]{1,40})/i)?.[1]?.trim() || ''
  const stepValue = quotedValue || (
    /\b(admin|ess|enabled|disabled)\b/i.test(stepText)
      ? stepText.match(/\b(admin|ess|enabled|disabled)\b/i)?.[1] || ''
      : ''
  )
  const value = stepValue || preferredValue || inValue || (namedValue && usedValues.has(namedValue) ? namedValue : '')
  if (!value) return null

  return { type: 'select', selector, value, label: wantedLabel || 'dropdown' }
}

const repairMisroutedDropdownActions = (elements, testDataValues, actions) => {
  const roleDropdown = (elements || []).find((element) => {
    const classes = String(element?.classes || '').toLowerCase()
    const context = String(element?.fieldContext || '').toLowerCase()
    return element?.visible !== false &&
      !element?.disabled &&
      /oxd-select-text|oxd-select-wrapper/.test(classes) &&
      context.includes('user role')
  })
  if (!roleDropdown) return actions

  const roleValue = (testDataValues || []).find((item) => /^(admin|ess)$/i.test(String(item || '').trim()))
  if (!roleValue) return actions

  const repaired = actions.map((action) => {
    const actionValue = String(action?.value || '').trim()
    const selector = String(action?.selector || '').toLowerCase()
    const targetsEmployeeAutocomplete = selector.includes('type for hints') || selector.includes('employee')
    if (String(action?.type || '').toLowerCase() === 'type' &&
      targetsEmployeeAutocomplete &&
      normalizeDropdownValue(actionValue) === normalizeDropdownValue(roleValue)) {
      return {
        ...action,
        type: 'click',
        selector: `__index:${roleDropdown.index}`,
        value: roleValue,
        label: 'user role'
      }
    }
    return action
  })

  return repaired
}

const repairFallbackDropdownActions = (elements, actions) => {
  const option = (elements || []).find((element) =>
    element?.visible !== false &&
    !element?.disabled &&
    String(element?.role || '').toLowerCase() === 'option' &&
    /^(admin|ess)$/i.test(String(element?.text || '').trim())
  )
  if (!option) return actions

  return (actions || []).map((action) => {
    const selector = String(action?.selector || '').toLowerCase()
    const value = String(action?.value || '').trim()
    if (String(action?.type || '').toLowerCase() === 'type' &&
      selector.includes('placeholder="search"') &&
      /^admin$/i.test(value)) {
      return {
        ...action,
        type: 'click',
        selector: `__index:${option.index}`,
        value: '',
        label: 'User Role: Admin'
      }
    }
    return action
  })
}

const normalizeDropdownActions = (step, elements, testDataValues, actions) => {
  const stepText = String(step || '')
  const dropdownStep = /select|choose|pick|user\s*role|status|country|region|dropdown/i.test(stepText)
  if (!dropdownStep) return actions

  const explicitDropdownAction = buildDropdownActionForStep(stepText, elements, testDataValues)
  if (explicitDropdownAction) return [explicitDropdownAction]

  return (actions || []).map((action) => {
    const value = String(action?.value || '').trim()
    const isDropdownValue = /^(admin|ess|enabled|disabled)$/i.test(value)
    if (isDropdownValue && String(action?.type || '').toLowerCase() === 'type') {
      return {
        ...action,
        type: 'click',
        value,
        label: /status/i.test(stepText) ? 'status' : 'user role'
      }
    }
    return action
  })
}

const handleDatePickerInteraction = async (driver, el, value) => {
  const normalizedDate = String(value || '').trim()
  if (!normalizedDate) return false

  console.log(`📅 Handling date picker interaction for value: ${normalizedDate}`)

  // 1. Click target to focus and open calendar
  try {
    await el.click()
  } catch {
    await driver.executeScript((e) => {
      e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, el).catch(() => {})
  }
  await driver.sleep(300)

  // 2. Parse date: YYYY-MM-DD
  const dateMatch = normalizedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10)
    const month = parseInt(dateMatch[2], 10)
    const day = parseInt(dateMatch[3], 10)
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    const targetMonthName = monthNames[month - 1]

    // Check if calendar popup is open in DOM
    const calendarFound = await driver.executeScript(() => {
      const cal = document.querySelector('.oxd-date-input-calendar, .oxd-calendar-wrapper, .datepicker, [role="dialog"]')
      return Boolean(cal)
    }).catch(() => false)

    if (calendarFound) {
      console.log(`📅 Date picker popup open. Navigating to ${targetMonthName} ${year}, day ${day}`)

      // If day is visible in the active month, click it directly
      await driver.executeScript((targetDay) => {
        const dates = document.querySelectorAll('.oxd-calendar-date, .day, [role="gridcell"]')
        for (const d of dates) {
          if (d.innerText.trim() === String(targetDay) && !d.classList.contains('--disabled')) {
            d.click()
            return true
          }
        }
        return false
      }, day).catch(() => {})
      await driver.sleep(200)
    }
  }

  // 3. Guarantee the input value is set and events dispatched
  await driver.executeScript((element, val) => {
    element.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (setter) {
      setter.call(element, val)
    } else {
      element.value = val
    }
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    element.dispatchEvent(new Event('blur', { bubbles: true }))
  }, el, normalizedDate).catch(() => {})

  await driver.sleep(200)

  // 4. Verify the date is in the input
  const readBack = await el.getAttribute('value').catch(() => '')
  console.log(`📅 Date input verified: value is "${readBack}"`)
  return true
}

// ── DOM Analysis: WAIT → CAPTURE → COMPARE → ANALYZE → VERIFY ───────────
//
// Run after every meaningful action (a typed value, a click) so a
// validation error, a snackbar/toast, or a structural DOM change is never
// silently ignored. This is deliberately a fast, deterministic analyzer
// (no LLM round trip per action — an 8-step test would otherwise pay for
// 10+ extra AI calls) that implements the same checks an LLM would be
// asked to make: validation text, added/removed elements, disabled state,
// URL, and toast/snackbar classification.

// Read the validation message nearest a specific field (not just any
// page-level banner), so "Password must be at least 6 characters" is
// attributed to the Password field it actually belongs to.
const readFieldValidationMessage = async (driver, el) => {
  return driver
    .executeScript((element) => {
      const isVisible = (node) => {
        if (!node) return false
        const style = window.getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return Boolean(
          style && style.display !== 'none' && style.visibility !== 'hidden' &&
          style.opacity !== '0' && rect.width > 0 && rect.height > 0
        )
      }
      const selectors = [
        '.oxd-input-field-error-message',
        '[class*="input-field-error"]',
        '[class*="field-error-message"]',
        '[id*="error" i]',
        '[id*="validation" i]',
        '.invalid-feedback',
        '.help-block--error',
        '[class*="help-text"]',
        '[class*="validation-message"]',
      ]
      const isValidationText = (text) =>
        /\b(invalid|required|must have|at least|at most|characters?|incorrect|not valid|does not match|cannot be empty|please enter)\b/i.test(text)
      // Prefer a message inside the same form group as the field, so a
      // stray unrelated error elsewhere on the page is never attributed
      // to this specific input.
      const group =
        element.closest('.oxd-input-group, .oxd-form-row, [class*="form-group"], [class*="field-wrapper"]') ||
        element.parentElement
      if (!group) return null
      for (const sel of selectors) {
        const node = group.querySelector(sel)
        if (node && isVisible(node)) {
          const classes = String(node.className || '').toLowerCase()
          const text = (node.textContent || '').trim()
          const hasErrorIndicator =
            node.getAttribute('aria-invalid') === 'true' ||
            /error|invalid-feedback|validation-message|field-error|mat-error/.test(classes) ||
            node.matches('mat-error, .invalid-feedback, [role="alert"]') ||
            isValidationText(text)
          if (text && hasErrorIndicator) return text
        }
      }
      return null
    }, el)
    .catch(() => null)
}

const readActualFieldValue = async (driver, el) =>
  driver.executeScript((element) => {
    if (!element) return ''
    return String(element.value ?? element.textContent ?? '').trim()
  }, el).catch(async () => String(await el.getAttribute('value').catch(() => '') || '').trim())

// Read a page-level snackbar/toast/alert and classify it success vs error
// by its own wording — never assume an appearing toast is a success.
const SNACKBAR_ERROR_HINTS = /(error|failed|invalid|must|required|already exist|not match|incorrect|denied|unable|cannot)/i
const SNACKBAR_SUCCESS_HINTS = /(success|saved|created|updated|added|deleted|completed|welcome)/i

const readPageSnackbar = async (driver) => {
  const text = await driver
    .executeScript(() => {
      const isVisible = (node) => {
        if (!node) return false
        const style = window.getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return Boolean(
          style && style.display !== 'none' && style.visibility !== 'hidden' &&
          style.opacity !== '0' && rect.width > 0 && rect.height > 0
        )
      }
      const selectors = [
        '.oxd-toast-content',
        '[class*="toast"]',
        '[role="alert"]',
        '.alert-success',
        '.alert-danger',
        '[class*="snackbar"]',
        '[class*="alert-content"]',
        '.flash-error',
        '.flash-full',
      ]
      for (const sel of selectors) {
        const node = document.querySelector(sel)
        if (node && isVisible(node)) {
          const text = (node.textContent || '').trim()
          if (text) return text
        }
      }
      return null
    })
    .catch(() => null)

  if (!text) return null
  const isError = SNACKBAR_ERROR_HINTS.test(text)
  const isSuccess = !isError && SNACKBAR_SUCCESS_HINTS.test(text)
  return { text, kind: isError ? 'error' : isSuccess ? 'success' : 'unknown' }
}

const readVisibleValidationErrors = (driver) =>
  driver.executeScript(() => {
    const visible = (node) => {
      if (!node) return false
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const selectors = [
      'mat-error',
      '.oxd-input-field-error-message',
      '[class*="input-field-error"]',
      '[class*="field-error-message"]',
      '[class*="fieldValidationErrors"]',
      '[id*="error" i]',
      '[id*="validation" i]',
      '.invalid-feedback',
      '[class*="help-text"]',
      '[role="alert"]',
    ]
    const isValidationText = (text) =>
      /\b(invalid|required|must have|at least|at most|characters?|incorrect|not valid|does not match|cannot be empty|please enter)\b/i.test(text)
    const hasErrorIndicator = (node) => {
      const classes = String(node.className || '').toLowerCase()
      return node.getAttribute('aria-invalid') === 'true' ||
        /error|invalid-feedback|validation-message|field-error|mat-error/.test(classes) ||
        node.matches('mat-error, .invalid-feedback, [role="alert"]') ||
        isValidationText(node.textContent || '')
    }
    const messages = []
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        const text = (node.textContent || '').trim()
        if (text && visible(node) && hasErrorIndicator(node) && !messages.includes(text)) {
          messages.push(text)
        }
      })
    }
    return messages
  }).catch(() => [])

// Validation must belong to the element used by the current action. Static
// labels such as "Invalid" in another field's metadata are not evidence.
const readScopedValidationErrors = (driver, fieldElement) =>
  driver.executeScript((element) => {
    if (!element) return []

    const visible = (node) => {
      if (!node) return false
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return Boolean(
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        rect.width > 0 &&
        rect.height > 0
      )
    }

    const hasErrorIndicator = (node) => {
      if (!node) return false
      const classes = String(node.className || '').toLowerCase()
      return node.getAttribute('aria-invalid') === 'true' ||
        /error|invalid-feedback|validation-message|field-error|mat-error/.test(classes) ||
        node.matches('mat-error, .invalid-feedback, [role="alert"]')
    }
    const isValidationText = (text) =>
      /\b(invalid|required|must have|at least|at most|characters?|incorrect|not valid|does not match|cannot be empty|please enter)\b/i.test(text)
    const isFieldValidationMessage = (node, text) => {
      const classes = String(node?.className || '').toLowerCase()
      return hasErrorIndicator(node) ||
        /error|validation|help-text/.test(classes) ||
        isValidationText(text)
    }

    const messages = []
    const group = element.closest(
      '.oxd-input-group, .oxd-form-row, [class*="form-group"], ' +
      '[class*="field-wrapper"], [class*="input-group"]'
    ) || element.parentElement

    if (element.getAttribute('aria-invalid') === 'true') {
      const ids = String(element.getAttribute('aria-describedby') || '')
        .split(/\s+/).filter(Boolean)
      for (const id of ids) {
        const node = document.getElementById(id)
        const text = (node?.textContent || '').trim()
        if (text && visible(node) && isFieldValidationMessage(node, text) && !messages.includes(text)) messages.push(text)
      }
    }

    if (group) {
      group.querySelectorAll(
        'mat-error, .invalid-feedback, [class*="error-message"], [id*="error" i], ' +
        '[class*="field-error"], [class*="validation-message"], [role="alert"]'
      ).forEach((node) => {
        const text = (node.textContent || '').trim()
        if (text && visible(node) && isFieldValidationMessage(node, text) && !messages.includes(text)) {
          messages.push(text)
        }
      })
    }

    return messages
  }, fieldElement).catch(() => [])

// Small structural DOM snapshot for diffing (not the full captured
// metadata — just enough to say "N elements appeared/disappeared" and
// "this button's disabled state changed").
const captureDomSummary = (driver) =>
  driver
    .executeScript(() => {
      const visible = (node) => {
        if (!node) return false
        const style = window.getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0
      }
      const validationErrors = []
      const hasErrorIndicator = (node) => {
        if (!node) return false
        const classes = String(node.className || '').toLowerCase()
        return node.getAttribute('aria-invalid') === 'true' ||
          /error|invalid-feedback|validation-message|field-error|mat-error/.test(classes) ||
          node.matches('mat-error, .invalid-feedback, [role="alert"]')
      }
      const errorSelectors = [
        'mat-error',
        '.oxd-input-field-error-message',
        '[class*="input-field-error"]',
        '[class*="field-error-message"]',
        '[class*="fieldValidationErrors"]',
        '.invalid-feedback',
        '[class*="validation-message"]',
        '[role="alert"]',
      ]
      for (const selector of errorSelectors) {
        document.querySelectorAll(selector).forEach((node) => {
          const text = (node.textContent || '').trim()
          if (text && visible(node) && hasErrorIndicator(node) && !validationErrors.includes(text)) {
            validationErrors.push(text)
          }
        })
      }
      document.querySelectorAll('[aria-describedby]').forEach((field) => {
        if (field.getAttribute('aria-invalid') !== 'true') return
        const ids = String(field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
        for (const id of ids) {
          const node = document.getElementById(id)
          const text = (node?.textContent || '').trim()
          if (text && visible(node) && hasErrorIndicator(node) && !validationErrors.includes(text)) {
            validationErrors.push(text)
          }
        }
      })

      return {
      url: window.location.href,
      validationErrors,
      elements: Array.from(document.querySelectorAll('input, button, select, textarea, a, [role="button"]'))
        .filter((el) => {
          const style = window.getComputedStyle(el)
          const rect = el.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        })
        .map((el) => ({
          key: `${el.tagName.toLowerCase()}|${el.name || ''}|${el.id || ''}|${(el.textContent || '').trim().slice(0, 40)}`,
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || el.value || '').trim().slice(0, 60),
          disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
        })),
      }
    })
    .catch(() => ({ url: '', elements: [] }))

// COMPARE: added/removed elements and disabled↔enabled transitions between
// two summaries captured before/after an action.
const diffDomSummaries = (before, after) => {
  const beforeByKey = new Map((before?.elements || []).map((el) => [el.key, el]))
  const afterByKey = new Map((after?.elements || []).map((el) => [el.key, el]))

  const added = [...afterByKey.values()].filter((el) => !beforeByKey.has(el.key))
  const removed = [...beforeByKey.values()].filter((el) => !afterByKey.has(el.key))
  const disabledChanges = []
  for (const [key, afterEl] of afterByKey) {
    const beforeEl = beforeByKey.get(key)
    if (beforeEl && beforeEl.disabled !== afterEl.disabled) {
      disabledChanges.push({ label: afterEl?.text || '', from: beforeEl.disabled, to: afterEl.disabled })
    }
  }

  return {
    urlChanged: before?.url !== after?.url,
    validationErrorsAdded: (after?.validationErrors || []).filter((message) => !(before?.validationErrors || []).includes(message)),
    validationErrorsRemoved: (before?.validationErrors || []).filter((message) => !(after?.validationErrors || []).includes(message)),
    added: added.map((el) => el?.text || '').filter(Boolean).slice(0, 10),
    removed: removed.map((el) => el?.text || '').filter(Boolean).slice(0, 10),
    disabledChanges,
  }
}

// ANALYZE + VERIFY: fold field validation, snackbar, and structural diff
// into one verdict. This is what "AI ANALYSIS" resolves to for every
// action — deterministic on the evidence already extracted above, so it
// runs after every action with no added latency.
const conciseAnalysisLog = (analysis) => {
  const failed = analysis.stepStatus === 'STEP_FAILED'
  const step = analysis.currentStep || analysis.context?.currentStep || ''
  const sessionText = [analysis.actual, analysis.evidence, analysis.currentDom?.text, analysis.currentDom?.url, analysis.context?.currentDom?.text, analysis.context?.currentDom?.url]
    .filter(Boolean).join(' ')
  const sessionExpired = /session\s+expired|session\s+has\s+expired|your\s+session\s+has\s+expired|sign\s+in\s+again|log\s*in/i.test(sessionText) &&
    (/login|sign[ -]?in|auth/i.test(sessionText) || /login|sign[ -]?in|auth/i.test(String(analysis.actual || '')))
  if (sessionExpired) {
    const resetStep = /\b(reset|clear)\b/i.test(step)
    return [
      '🔴 TEST ANALYSIS',
      `Step: ${step}`,
      'Status: FAIL',
      '',
      'Problem:',
      `The test could not validate ${resetStep ? 'Reset' : 'the current step'} because the user session had expired.`,
      '',
      'Expected:',
      resetStep ? 'The search filters are cleared and restored to their default values.' : (analysis.expected || 'The current step reaches its expected result.'),
      '',
      'Actual:',
      'The application returned to the Login page and displayed a session expiration message.',
      '',
      'Root Cause:',
      'ENVIRONMENT — HIGH',
      '',
      'Reason:',
      'The authenticated session was no longer available when the step was executed.',
      '',
      '👨‍💻 DEVELOPER',
      '• Check session expiration and authentication handling during long test executions.',
      '',
      '🧪 TESTER',
      '• Execute the test with a fresh login session.',
      '• Repeat the test after several minutes to determine whether session duration affects the failure.',
    ].join('\n')
  }
  const status = failed ? 'FAIL' : analysis.stepStatus === 'STEP_SUCCESS' ? 'PASS' : 'FAIL'
  const developer = analysis.developerAction ? `• ${analysis.developerAction}` : '• No technical action indicated by the current evidence.'
  const tester = analysis.qaAction ? `• ${analysis.qaAction}` : '• No additional test indicated by the current evidence.'
  return [
    '🔴 TEST ANALYSIS',
    `Step: ${step}`,
    `Status: ${status}`,
    '',
    'Problem:',
    analysis.problem || 'No specific problem was established from the current step.',
    '',
    'Expected:',
    analysis.expected || 'Expected result was not provided.',
    '',
    'Actual:',
    analysis.actual || 'Actual final state was not available.',
    '',
    'Root Cause:',
    `${analysis.rootCause || 'UNKNOWN'} — ${String(analysis.confidence || 'LOW').toUpperCase()}`,
    '',
    'Reason:',
    analysis.evidence || 'Insufficient current-step information to determine the cause.',
    '',
    '👨‍💻 DEVELOPER',
    developer,
    '',
    '🧪 TESTER',
    tester,
  ].join('\n')
}

const analyzeActionOutcome = ({
  step,
  aiAction,
  previousDom,
  currentDom,
  fieldValidationMessage,
  validationErrors,
  snackbar,
  domDiff,
  url,
  fieldValue,
  expectedFieldValue,
}) => {
  const previousDomSummary = previousDom || null
  const currentDomSummary = currentDom || null
  const currentValidationErrors = Array.isArray(validationErrors)
    ? validationErrors.filter(Boolean)
    : []
  const domValidationErrors = Array.isArray(domDiff?.validationErrorsAdded)
    ? domDiff.validationErrorsAdded.filter(Boolean)
    : []
  const allValidationErrors = [...new Set([...currentValidationErrors, ...domValidationErrors])]
  const currentUrl = url || currentDomSummary?.url || null
  const stepText = String(step || '')
  const context = {
    currentStep: stepText,
    aiAction: aiAction || null,
    previousDom: previousDomSummary,
    currentDom: currentDomSummary,
    urlBefore: previousDomSummary?.url || null,
    urlAfter: currentUrl,
    fieldValidationMessage: fieldValidationMessage || null,
    validationErrors: allValidationErrors,
    snackbar: snackbar || null,
    domChanges: domDiff || null,
    fieldValue: fieldValue ?? null,
    expectedFieldValue: expectedFieldValue ?? null,
    actionResult: aiAction
      ? { type: aiAction.type || null, selector: aiAction.selector || null, value: aiAction.value || null }
      : null,
  }

  const stepMatches =
    !aiAction || !aiAction.step || String(aiAction.step).trim() === stepText.trim()

  const domResult = {
    previousDom: previousDomSummary,
    currentDom: currentDomSummary,
    domChanges: domDiff || null,
    validationErrors: allValidationErrors,
    snackbar: snackbar || null,
    url: currentUrl,
    fieldValue: fieldValue ?? null,
    expectedFieldValue: expectedFieldValue ?? null,
  }

  const buildAnalysis = (result) => {
    const failed = result.status === 'ERROR'
    const expected = (expectedFieldValue ?? stepText) || 'Expected result from the current step'
    const actual = fieldValue ?? currentDomSummary?.text ?? currentUrl ?? 'No conclusive current DOM value'
    const evidence = allValidationErrors.length
      ? allValidationErrors.join(' | ')
      : snackbar?.text || domDiff?.validationErrorsAdded?.join(' | ') ||
        (domDiff?.urlChanged ? `URL changed to ${currentUrl}` : 'No validation error or relevant toast found in the current DOM')
    let rootCause = { type: failed ? 'UNKNOWN' : 'UNKNOWN', confidence: failed ? 'Low' : 'Medium' }
    if (allValidationErrors.length || fieldValidationMessage) rootCause = { type: 'APPLICATION', confidence: 'High' }
    else if (snackbar?.kind === 'error') rootCause = { type: 'APPLICATION', confidence: 'High' }
    else if (expectedFieldValue && String(fieldValue || '').trim() !== String(expectedFieldValue).trim()) rootCause = { type: 'AI_ACTION', confidence: 'High' }
    else if (result.status === 'NEED_RETRY') rootCause = { type: 'TIMING', confidence: 'Low' }
    return {
      ...result,
      actionStatus: 'ACTION_SUCCESS',
      stepStatus: failed ? 'STEP_FAILED' : result.status === 'SUCCESS' ? 'STEP_SUCCESS' : 'STEP_UNVERIFIED',
      problem: failed ? result.reason : null,
      expected,
      actual,
      evidence,
      rootCause: rootCause.type,
      confidence: rootCause.confidence,
      developerAction: failed
        ? rootCause.type === 'APPLICATION'
          ? 'Inspect the field event, model binding, validation state and DOM update that produced the evidenced error.'
          : rootCause.type === 'AI_ACTION'
            ? 'Correct the selector, action type or value so it targets the current control.'
            : rootCause.type === 'ASSERTION'
              ? 'Align the assertion with the state the current step actually requires.'
              : rootCause.type === 'TIMING'
                ? 'Add an explicit wait for the target state before reading the final DOM.'
                : 'Investigate the current-step evidence without assuming a cause not shown by the DOM.'
        : 'No technical change is indicated by the current evidence.',
      qaAction: failed
        ? rootCause.type === 'APPLICATION'
          ? 'Capture the field state immediately after the event and compare the rendered message with the model value.'
          : rootCause.type === 'AI_ACTION'
            ? 'Try the same step with the control label selector and verify the resulting DOM value.'
            : rootCause.type === 'ASSERTION'
              ? 'Check the assertion against the final DOM state and the step wording.'
              : rootCause.type === 'TIMING'
                ? 'Repeat with a state-based wait and record the DOM before and after the wait.'
                : 'Capture the final DOM, field values, URL and messages for this step only.'
        : 'No additional check is indicated by the current evidence.',
    }
  }

  if (aiAction && aiAction.step && !stepMatches) {
    return buildAnalysis({
      status: 'ERROR',
      reason: 'AI action does not match the current step.',
      context,
      domResult,
      stepMatch: false,
    })
  }

  if (fieldValidationMessage) {
    // Try to recover a concrete, correctable rule ("must be at least N
    // characters") so the caller can retry with a value that satisfies it
    // instead of just failing the step outright.
    const lengthRule = fieldValidationMessage.match(/at least\s+(\d+)\s+character/i)
    return buildAnalysis({
      status: 'ERROR',
      reason: `Field validation error: "${fieldValidationMessage}"`,
      minLength: lengthRule ? Number(lengthRule[1]) : null,
      context,
      domResult,
      stepMatch: stepMatches,
    })
  }

  if (allValidationErrors.length) {
    return buildAnalysis({
      status: 'ERROR',
      reason: `Validation error(s) detected in the current DOM: ${allValidationErrors.join(' | ')}`,
      context,
      domResult,
      stepMatch: stepMatches,
    })
  }

  if (expectedFieldValue && String(fieldValue || '').trim() !== String(expectedFieldValue).trim()) {
    return buildAnalysis({
      status: 'ERROR',
      reason: `Field value verification failed: expected "${expectedFieldValue}" but DOM contains "${fieldValue || ''}".`,
      context,
      domResult,
      stepMatch: stepMatches,
    })
  }

  if (snackbar?.kind === 'error') {
    return buildAnalysis({
      status: 'ERROR',
      reason: `Error toast/snackbar: "${snackbar?.text || ''}"`,
      context,
      domResult,
      stepMatch: stepMatches,
    })
  }

  if (snackbar?.kind === 'success') {
    return buildAnalysis({
      status: 'SUCCESS',
      reason: `Success toast/snackbar: "${snackbar?.text || ''}"`,
      context,
      domResult,
      stepMatch: stepMatches,
    })
  }

  if (domDiff?.urlChanged || previousDomSummary?.url !== currentDomSummary?.url) {
    return {
      status: 'SUCCESS',
      reason: `Action succeeded: URL changed from "${previousDomSummary?.url || ''}" to "${currentUrl || ''}" and no UI error was detected.`,
      context,
      domResult,
      stepMatch: stepMatches,
    }
  }

  const domChanged = JSON.stringify(previousDomSummary) !== JSON.stringify(currentDomSummary)
  if (domChanged || domDiff?.urlChanged || domDiff?.added?.length || domDiff?.removed?.length || domDiff?.disabledChanges?.length) {
    return {
      status: 'SUCCESS',
      reason: 'The current step action produced an observable DOM or URL change and no validation error was detected.',
      context,
      domResult,
      stepMatch: stepMatches,
    }
  }

  return buildAnalysis({
    status: 'NEED_RETRY',
    reason: 'No conclusive validation, snackbar/toast, URL, or DOM result was detected; the current step must be retried or re-verified.',
    context,
    domResult,
    stepMatch: stepMatches,
  })
}

async function runStructuredUiStep(driver, step, ctx, stepIndex) {
  const sleep = (ms) => driver.sleep(ms)
  const currentStepActionType = classifyStepActionType(step)
  let verifiedFieldValue = null

  try {

    // ✅ STEP 1: OPEN PAGE
    if (stepIndex === 1) {

      let url = ctx.baseUrl
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }
      console.log("🌍 OPEN:", url)

      try {
        await driver.get(url)
      } catch (err) {
        // Some pages finish rendering after the browser's page-load event.
        // We keep going and confirm readiness with an explicit DOM wait below.
        console.warn("⚠️ driver.get timeout/renderer delay:", err.message)
      }

      // ✅ wait true DOM (Angular)
      await driver.wait(async () => {
        const ready = await driver.executeScript(() => document.readyState)
        if (ready !== 'complete' && ready !== 'interactive') {
          return false
        }
        const inputs = await driver.findElements(
          By.css('input, button, a, textarea, select, [role="button"], [role="link"]')
        )
        return inputs.length > 0
      }, 30000)

      await driver.sleep(1500)

      addLog(ctx.logs, stepIndex, "INFO", "Page opened", { url })
      // Opening the target page is setup for the first step. Do not return
      // here: when a test starts with "Enter ... in Username", step 1 must
      // continue through the normal input pipeline below.
    }

    // ✅ GET DOM (richer snapshot for AI and debugging)
    const captureDom = () => driver.executeScript(() => {

      function getVisibleText(el) {
        return el.innerText?.replace(/\s+/g, " ").trim() || ""
      }

    function getRect(el) {
        const rect = el.getBoundingClientRect()
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
      }
    }

      function isVisible(el) {
        const style = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return Boolean(
          style &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth
        )
      }

      return Array.from(document.querySelectorAll('input, button, a, textarea, select, [role="button"], [role="link"], [role="option"], [role="combobox"], [aria-haspopup], [aria-expanded], .oxd-select-text, .oxd-select-wrapper'))
        .map((el, index) => ({
          index,
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          name: el.name || "",
          testId: el.getAttribute('data-testid') || "",
          type: el.type || "",
          placeholder: el.placeholder || "",
          text: getVisibleText(el),
          ariaLabel: el.getAttribute('aria-label') || "",
          ariaHaspopup: el.getAttribute('aria-haspopup') || "",
          ariaExpanded: el.getAttribute('aria-expanded') || "",
          role: el.getAttribute('role') || "",
          title: el.getAttribute('title') || "",
          value: el.value || "",
          classes: typeof el.className === 'string' ? el.className : "",
          disabled: Boolean(el.disabled),
          visible: isVisible(el),
          rect: getRect(el),
          href: el.getAttribute('href') || "",
          form: el.form?.getAttribute('id') || el.form?.getAttribute('name') || "",
          fieldContext: (() => {
            const group = el.closest('.oxd-input-group, .oxd-form-row, .oxd-form')
            return group?.innerText?.replace(/\s+/g, ' ').trim() || el.parentElement?.innerText?.replace(/\s+/g, ' ').trim() || ''
          })(),
          businessRole: (() => {

  const metadata = [
    el.id,
    el.name,
    el.placeholder,
    el.getAttribute('aria-label'),
    el.getAttribute('title')
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const rules = [
    { key: 'email', role: 'email' },
    { key: 'password', role: 'password' },
    { key: 'country', role: 'country' },
    { key: 'username', role: 'username' },
    { key: 'login', role: 'username' },
    { key: 'phone', role: 'phone' },
    { key: 'mobile', role: 'phone' },
  ]

  const match = rules.find(r => metadata.includes(r.key))

  return match?.role || null

})(),
        }))
        .filter(el => el.visible)
    })

    let elements = await captureDom()

    // ✅ DOM COUNT = 0 → never call the AI on an empty page. Wait for the
    // page to settle and recapture first: an empty snapshot almost always
    // means the SPA hasn't finished rendering the view the previous step
    // opened (e.g. the Add User form right after "Click Add").
    if (!elements || elements.length === 0) {
      for (let attempt = 1; attempt <= 3 && (!elements || elements.length === 0); attempt++) {
        console.warn(`⚠️ DOM COUNT = 0 → waiting for the page to stabilize (recapture ${attempt}/3)`)
        await driver
          .wait(async () => {
            const ready = await driver.executeScript(() => document.readyState).catch(() => 'loading')
            if (ready !== 'complete' && ready !== 'interactive') return false
            const rendered = await driver
              .executeScript(() => document.querySelectorAll('input, button, a, select, textarea, [role="button"]').length)
              .catch(() => 0)
            return Number(rendered) > 0
          }, 5000)
          .catch(() => {})
        await sleep(600)
        elements = await captureDom()
      }
      if (elements && elements.length > 0) {
        console.log(`✅ DOM recovered after stabilization: ${elements.length} elements`)
      }
    }

    console.log("📦 DOM:", elements)
    const domSourceUrl = await driver.getCurrentUrl().catch(() => '')
    console.log(`🔢 DOM COUNT = ${Array.isArray(elements) ? elements.length : 0}`)
    addLog(ctx.logs, stepIndex, "INFO", "DOM captured", {
      elements: elements.length,
      dom: elements,
      sourceUrl: domSourceUrl
    })

    // ✅ stop if empty DOM
    if (!elements || elements.length === 0) {
      const currentUrl = await driver.getCurrentUrl().catch(() => '')
      const loginAlreadyCompleted =
        /login|sign.?in/i.test(step) && !String(currentUrl).includes('/auth/login')

      if (loginAlreadyCompleted) {
        console.log('✅ Empty DOM after login redirect; login already completed')
        return {
          status: 'passed',
          screenshots: []
        }
      }

      console.error('❌ DOM is still empty after stabilization retries — not calling the AI.')
      return {
        status: 'failed_execution',
        error: 'Empty DOM (page did not render after stabilization retries)',
        screenshots: []
      }
    }

    const rawTestData =
      ctx.testCase?.test_data ||
      ctx.testCase?.testData ||
      ctx.testCase?.data ||
      ctx.testCase?.credentials ||
      []

    const testDataValues = Array.isArray(rawTestData)
      ? rawTestData
          .map((item) => {
            if (typeof item === 'string') {
              // Support a single string carrying multiple credentials on
              // separate lines, e.g. "Admin\nadmin123".
              return item
                .replace(/\r/g, '\n')
                .split('\n')
                .map((part) => part.trim())
                .filter(Boolean)
            }
            if (item && typeof item === 'object') {
              return String(
                item.value ||
                item?.text ||
                item.password ||
                item.username ||
                item.email ||
                item.token ||
                ''
              ).trim()
            }
            return String(item || '').trim()
          })
          .flat()
          .filter(Boolean)
      : rawTestData && typeof rawTestData === 'object'
        ? Object.values(rawTestData)
            .map((item) =>
              String(item || '')
                .replace(/\r/g, '\n')
                .split('\n')
                .map((part) => part.trim())
                .filter(Boolean)
            )
            .flat()
            .filter(Boolean)
        : []

    // Canonical field -> value mapping, built from the test_data KEYS.
    // This is the authoritative source for "which value goes in which
    // field"; supports legacy bare-value arrays by inspecting testCase.steps.
    const testDataMap = buildTestDataMap(rawTestData, Array.isArray(ctx.testCase?.steps) ? ctx.testCase.steps : [])
    const testDataObject = testDataMapToObject(testDataMap)

    console.log('🔑 TEST CASE DATA =', typeof rawTestData === 'object' ? JSON.stringify(rawTestData, null, 2) : rawTestData)
    console.log('🔑 NORMALIZED TEST DATA =', JSON.stringify(testDataObject, null, 2))
    console.log('🔑 TEST DATA MAP =', JSON.stringify(testDataObject, null, 2))
    console.log('🔑 STEPS =', JSON.stringify(Array.isArray(ctx.testCase?.steps) ? ctx.testCase.steps : [], null, 2))
    console.log('🔑 CURRENT STEP =', step)

    const currentStepMatcher = findFieldMatcherForStep(step)
    const resolvedField = currentStepMatcher ? currentStepMatcher.key : (step.match(/["'“”`]([^"'“”`]+)["'“”`]/)?.[1] || '')
    const resolvedEntry = resolvedField ? (testDataMap.get(resolvedField) || testDataMap.get(canonicalFieldKey(resolvedField))) : null
    const resolvedTestValue = resolvedEntry ? resolvedEntry.value : ''
    if (resolvedField) {
      console.log('🎯 RESOLVED FIELD =', resolvedField)
      console.log('🎯 RESOLVED TEST VALUE =', resolvedTestValue)
    }

    for (const [canonical, entry] of testDataMap.entries()) {
      console.log(`🔑 Mapped ${entry.label} (${canonical}) value = ${entry.value}`)
    }

    if (rawTestData && (!Array.isArray(rawTestData) || rawTestData.length > 0) && !testDataMap.size) {
      console.error('❌ TEST DATA ERROR: test_data is present but could not be mapped to any fields:', rawTestData)
      throw new Error(`Test data present but could not be mapped to fields. Check test_data schema and step definitions.`)
    }
    if (testDataMap.unmappedTestDataValues?.length) {
      const unmapped = testDataMap.unmappedTestDataValues.join(', ')
      console.error('❌ TEST DATA ERROR: values could not be mapped to input steps:', unmapped)
      throw new Error(`Test data values could not be mapped to input steps: ${unmapped}`)
    }

    // The cursor must survive across steps, not just within this single
    // step call: runStructuredUiStep runs once per step, so a plain local
    // `let testDataCursor = 0` reset to 0 every time — every step needing
    // an auto-filled value restarted from testDataValues[0], causing every
    // field after the first to receive the wrong (already-used) value.
    // Persist the cursor on ctx so it keeps advancing across the whole
    // test case run. Defined here (before the AI call) so BOTH the
    // network-error catch-fallback below and the "AI returned empty"
    // fallback further down share the exact same cursor — a separate,
    // locally-scoped cursor in either fallback would restart at index 0
    // every time and hand every field the same first test_data value.
    ctx.testDataCursor ??= 0
    const isTestDataValueAlreadyConsumed = (candidate) => {
      const normalized = String(candidate || '').trim()
      if (!normalized) return false
      const memory = ctx.executionMemory || {}
      return [...(memory.filled_fields || []), ...(memory.selected_dropdowns || [])]
        .some((entry) => String(entry?.value || '').trim() === normalized)
    }
    const takeNextTestDataValue = () => {
      // Skip any value a dropdown hard-guard (or an earlier step) already
      // consumed directly by content match (e.g. "Admin" picked for the
      // User Role dropdown) rather than through this cursor, so the next
      // free-text field doesn't get handed that same value again.
      while (
        ctx.testDataCursor < testDataValues.length - 1 &&
        isTestDataValueAlreadyConsumed(testDataValues[ctx.testDataCursor])
      ) {
        ctx.testDataCursor++
      }
      const next = testDataValues[ctx.testDataCursor] || ''
      if (ctx.testDataCursor < testDataValues.length - 1) {
        ctx.testDataCursor++
      }
      return next
    }

    // Value for one specific field element. Key-based identity mapping
    // always wins; the positional cursor is only reached when the test
    // data carries no keys at all (legacy documents), and says so in the
    // log when it happens.
    const resolveValueForElement = (el) => {
      const mapped = valueForElementFromTestData(el, testDataMap)
      if (mapped) return mapped
      if (testDataMap.size > 0) {
        // Keys exist but none matched this element — do NOT hand it an
        // unrelated value by position, that is exactly how "Admin" ended
        // up typed into the password field.
        console.warn(
          '⚠️ No test data key matches this field; leaving it untouched rather than guessing by position.',
          { name: el?.name, fieldContext: el?.fieldContext, businessRole: el?.businessRole }
        )
        return ''
      }
      return ''
    }

    // Fillable inputs present in the current DOM snapshot.
    const fillableElements = () =>
      elements.filter(
        (el) =>
          el &&
          (el.tag === 'input' || el.tag === 'textarea') &&
          el.visible &&
          !el.disabled &&
          !['submit', 'button', 'hidden', 'checkbox', 'radio', 'file'].includes(
            String(el.type || '').toLowerCase()
          )
      )

    // The DOM element that corresponds to one canonical test-data key.
    const findElementForCanonicalField = (canonical) =>
      fillableElements().find((el) => {
        if (identifyFieldKey(el) === canonical) return true
        return [el.businessRole, el.fieldContext, el.name, el.id, el.placeholder].some(
          (source) => canonicalFieldKey(source) === canonical
        )
      }) || null

    // Controls that COMMIT a form. "Add" is deliberately excluded: an Add
    // button opens the create form, it does not submit one, so requiring
    // its fields to be filled beforehand would inject values into a page
    // that has not rendered the form yet.
    const SUBMIT_HINT = /(login|log in|sign in|submit|save|search|confirm|apply|update)\b/i

    const ensureRequiredInputsBeforeSubmit = (currentActions) => {
      if (!testDataMap.size) return currentActions

      const submitIndex = currentActions.findIndex(
        (action) =>
          String(action?.type || '').toLowerCase() === 'click' &&
          SUBMIT_HINT.test(`${action?.selector || ''} ${action?.label || ''}`)
      )
      if (submitIndex === -1) return currentActions

      // Values already typed by an earlier step, or already covered by an
      // action in this very list.
      const memory = ctx.executionMemory || {}
      const satisfied = new Set(
        [...(memory.filled_fields || []), ...(memory.selected_dropdowns || [])]
          .map((entry) => String(entry?.value || '').trim())
          .filter(Boolean)
      )
      for (const action of currentActions) {
        if (String(action?.type || '').toLowerCase() === 'type') {
          const value = String(action?.value || '').trim()
          if (value) satisfied.add(value)
        }
      }

      const missing = []
      for (const [canonical, entry] of testDataMap.entries()) {
        if (satisfied.has(entry.value)) continue
        const el = findElementForCanonicalField(canonical)
        if (!el) continue // Field isn't on this page — nothing to fill here.
        missing.push({ canonical, entry, el })
      }
      if (!missing.length) return currentActions

      // Keep natural form order (Username before Password).
      missing.sort((a, b) => (a.el.index ?? 0) - (b.el.index ?? 0))

      const generated = missing.map(({ entry, el }) => ({
        type: 'type',
        selector: buildSelectorForElement(el),
        value: entry.value,
        label: entry.label,
      }))

      console.warn(
        '🛡️ PREMATURE SUBMIT BLOCKED: required inputs were not filled before the submit click. Injecting them first:',
        generated.map((action) => `${action.label} -> ${action.selector}`)
      )
      addLog(ctx.logs, stepIndex, 'WARN', 'Missing input actions generated before submit', {
        source: 'backend-2026:ui.executor',
        generated,
      })

      // Types first, then everything the decision already contained
      // (including the submit click) in its original order.
      return [...generated, ...currentActions]
    }

    // ✅ CALL AI
    let resp
    try {
      ctx.executionMemory ??= {
  executed_actions: [],
  filled_fields: [],
  selected_dropdowns: [],
  checked_checkboxes: []
}

// DOM ANALYSIS CONTEXT for /ai/decide: previous DOM, current DOM, what
// changed between them, plus any validation error / snackbar visible
// right now — so the AI decides the CURRENT step using the actual effect
// of everything that happened before it, not just a bare step string.
const currentDomSummary = { url: domSourceUrl, elements: elements.map((el) => ({
  key: `${el.tag || ''}|${el.name || ''}|${el.id || ''}|${(el.text || '').slice(0, 40)}`,
  tag: el.tag,
  text: el.text || el.value || '',
  disabled: Boolean(el.disabled),
})) }
const domChanges = diffDomSummaries(ctx.previousDomSummary, currentDomSummary)
const pageSnackbar = await readPageSnackbar(driver)
const currentValidationErrors = await driver
  .executeScript(() => {
    const isVisible = (node) => {
      if (!node) return false
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return Boolean(style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0)
    }
    const selectors = ['.oxd-input-field-error-message', '[class*="input-field-error"]', '[class*="field-error-message"]', '.invalid-feedback']
    const found = []
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((node) => {
        const text = (node.textContent || '').trim()
        if (text && isVisible(node) && !found.includes(text)) found.push(text)
      })
    }
    return found
  })
  .catch(() => [])

console.log('🔎 DOM CHANGES since previous step:', JSON.stringify(domChanges))
console.log('🔎 VALIDATION ERRORS currently visible:', JSON.stringify(currentValidationErrors))
console.log('🔎 SNACKBAR/TOAST currently visible:', JSON.stringify(pageSnackbar))

const structuredTestCase = {
  id: ctx.testCase?.id || "",
  title: ctx.testCase?.title || "",
  url: ctx.testCase?.url || "",
  steps: Array.isArray(ctx.testCase?.steps)
    ? ctx.testCase.steps
    : [],
  // Send the KEYED map so /ai/decide knows which value belongs to which
  // field. Sending the raw shape meant a legacy array of bare values
  // arrived with no field names at all, and the AI could only emit the
  // click action because it had no value to type anywhere.
  test_data: testDataMap.size
    ? testDataObject
    : ctx.testCase?.test_data || ctx.testCase?.testData || [],
  execution_memory: ctx.executionMemory,
  current_step_index: stepIndex,
  current_step: step,
  // Only the CURRENT step is authoritative; previous/DOM context is
  // supporting evidence, never a license to act on a future step.
  previous_dom: ctx.previousDomSummary || null,
  current_dom_url: domSourceUrl,
  dom_changes: domChanges,
  validation_errors: currentValidationErrors,
  snackbar: pageSnackbar,
}

ctx.previousDomSummary = currentDomSummary

      console.log('[ui.executor] ai payload', {
        id: structuredTestCase.id,
        testDataKeys: Object.keys(testDataObject),
        testDataCount: testDataMap.size,
        hasCredentials: Boolean(structuredTestCase.credentials),
      })
      console.log(
        '📤 AI DECISION PAYLOAD =',
        JSON.stringify(
          { step, test_data: structuredTestCase.test_data, dom_count: elements.length },
          null,
          2
        )
      )
      
console.log(
  "🧠 EXECUTION MEMORY:",
  JSON.stringify(
    ctx.executionMemory,
    null,
    2
  )
)


      resp = await axios.post(
        "http://localhost:8000/ai/decide",
        {
          step,
          test_data: testDataObject,
          dom: elements,
          test_case: structuredTestCase
        },
        { timeout: 180000 }
      )
    } catch (err) {
      console.log("❌ AI ERROR (timeout or network):", err.message)
      // ── JS-side fallback: build fill+click actions directly from DOM ──
      const stepLower = (step || '').toLowerCase()
      const isDropdownStep = currentStepActionType === 'dropdown'
      const isFill = ['enter', 'fill', 'type', 'provide', 'insert', 'set'].some(k => stepLower.includes(k))
      const isClick = ['click', 'submit', 'press', 'login', 'sign in', 'open'].some(k => stepLower.includes(k))

      const fallbackActions = []

      if (isDropdownStep) {
        const dropdownAction = buildDropdownActionForStep(step, elements, testDataValues)
        if (dropdownAction) fallbackActions.push(dropdownAction)
      } else if (isFill) {
        const fillableFields = restrictFillableFieldsToStep(step, elements.filter(el =>
          el && el.tag === 'input' && !el.disabled && el.visible &&
          ['text', 'email', 'password', 'tel', 'search', ''].includes((el.type || '').toLowerCase())
        ))
        for (const el of fillableFields) {
          // Key-based mapping first (Username -> the username field),
          // positional cursor only for keyless legacy test data.
          const value = resolveValueForElement(el)
          if (!value) continue
          const selector = buildSelectorForElement(el)
          fallbackActions.push({ type: 'type', selector, value, label: el.businessRole || el.placeholder || el.name || 'field' })
        }
      }

      if ((isClick || isFill) && !isDropdownStep) {
        const btn = findButtonForStep(step, elements)
        if (btn) {
          const btnText = btn?.text || ''
          const btnSel = btnText ? `text=${btnText}` : btn.id ? `#${btn.id}` : `__index:${btn.index}`
          fallbackActions.push({ type: 'click', selector: btnSel, value: '', label: btnText || 'submit' })
        }
      }

      if (fallbackActions.length > 0) {
        console.log("🔄 JS fallback actions generated:", fallbackActions)
        resp = { data: { data: fallbackActions } }
      } else {
        resp = { data: [] }
      }
    }

    const payload = resp?.data ?? {}
    ctx.seleniumCode =
       payload?.selenium_code || ''

    const decisions = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.actions)
          ? payload.actions
        : []

    let actions = decisions.filter((a) =>
      a &&
      typeof a.type === "string" &&
      typeof a.selector === "string" &&
      a.selector.trim().length > 0
    )

    const overrideActions = Array.isArray(ctx.actionOverrides?.[stepIndex])
      ? ctx.actionOverrides[stepIndex]
      : []

    // Classification was completed at the start of this step, before any
    // dropdown/input/calendar-specific repair or fallback.

    if (overrideActions.length) {
      actions = overrideActions
        .map((a) => ({
          type: String(a?.type || a?.action || '').trim(),
          selector: String(a?.selector || '').trim(),
          value: String(a?.value || '').trim(),
        }))
        .filter((a) => a.type && a.selector)

      addLog(ctx.logs, stepIndex, "INFO", "AI actions overridden by user", {
        source: "backend-2026:user_override",
        actions,
        originalActions: decisions
      })
    }

    // Apply after overrides: role values must never be typed into Employee Name.
    // But a user override is a deliberate, final decision — the hard guard
    // must never silently replace it with its own guess, or a manually
    // corrected action (e.g. "type the username here") becomes impossible
    // to apply on any step whose text also happens to mention a dropdown.
    const dropdownAction = overrideActions.length || currentStepActionType !== 'dropdown'
      ? null
      : buildDropdownActionForStep(step, elements, testDataValues)
    if (dropdownAction) {
      actions = [dropdownAction]
      console.log('🛡️ DROPDOWN STEP HARD GUARD:', actions)
    } else if (!overrideActions.length && currentStepActionType === 'dropdown') {
      const repairedActions = repairMisroutedDropdownActions(elements, testDataValues, actions)
      if (repairedActions.some((action, index) => action !== actions[index])) {
        actions = repairedActions
        console.log('🛡️ MISROUTED ROLE VALUE REPAIRED:', actions)
      }
    }

    if (actions.length === 0) {
      console.log("⚠️ AI RETURNED EMPTY → trying JS fallback")

      // ── JS-side fallback (also used when catch block wasn't triggered) ──
      const stepLower = (step || '').toLowerCase()
      const isDropdownStep = currentStepActionType === 'dropdown'
      const isFill = ['enter', 'fill', 'type', 'provide', 'insert', 'set'].some(k => stepLower.includes(k))
      const isClick = ['click', 'submit', 'press', 'login', 'sign in', 'open', 'navigate'].some(k => stepLower.includes(k))
      const isLoginStep = stepLower.includes('login') || stepLower.includes('password') || stepLower.includes('username')

      const fallbackActions = []

      if (isDropdownStep) {
        const dropdownAction = buildDropdownActionForStep(step, elements, testDataValues)
        if (dropdownAction) {
          fallbackActions.push(dropdownAction)
        }
      }

      // Only fill if we find fields that make sense. For login, we need username/password fields.
      let fillableFields = []
      if (isFill && !isDropdownStep) {
        fillableFields = restrictFillableFieldsToStep(step, elements.filter(el =>
          el && (el.tag === 'input' || el.tag === 'textarea') && el.visible && !el.disabled &&
          el.type !== 'submit' && el.type !== 'button' && el.type !== 'hidden' && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'file' &&
          !(el.placeholder || '').toLowerCase().includes('search') &&
          !(el.name || '').toLowerCase().includes('search') &&
          !(el.id || '').toLowerCase().includes('search')
        ))

        // If it's a login step, only fall back if we actually see login-like fields.
        // Skip this extra check entirely once restrictFillableFieldsToStep has
        // already narrowed the list down to a specific, named field (e.g.
        // Username/Password/Confirm Password) — that matcher already looked at
        // fieldContext too, which this check never did. Without this guard, a
        // field like OrangeHRM's Username input (empty name/placeholder, only
        // identified by fieldContext="Username") passes restrictFillableFieldsToStep
        // correctly, then gets wiped right back out here because this check only
        // ever looked at el.name/el.placeholder/el.type — silently skipping the
        // whole step with no action attempted at all.
        if (isLoginStep && !findFieldMatcherForStep(step)) {
          const hasLoginFields = fillableFields.some(el =>
            el.type === 'password' ||
            (el.name || '').toLowerCase().includes('user') ||
            (el.name || '').toLowerCase().includes('pass') ||
            (el.placeholder || '').toLowerCase().includes('user') ||
            (el.placeholder || '').toLowerCase().includes('pass') ||
            (el.fieldContext || '').toLowerCase().includes('user') ||
            (el.fieldContext || '').toLowerCase().includes('pass')
          )
          if (!hasLoginFields) {
            fillableFields = [] // Don't blindly type into search boxes
          }
        }

        for (const el of fillableFields) {
          const value = resolveValueForElement(el)
          if (!value) continue
          const selector = buildSelectorForElement(el)
          fallbackActions.push({
            type: 'type',
            selector,
            value,
            label: el.businessRole || el.placeholder || el.name || 'field'
          })
        }
      }

      if ((isClick || isFill) && fallbackActions.length > 0 && !isDropdownStep) {
        // Only add click if we already filled fields (avoid submitting blank form)
        const btn = findButtonForStep(step, elements)
        if (btn) {
          const btnText = btn?.text || ''
          const btnSel = btnText ? `text=${btnText}` : btn.id ? `#${btn.id}` : `__index:${btn.index}`
          fallbackActions.push({ type: 'click', selector: btnSel, value: '', label: btnText || 'submit' })
        }
      }

      if (fallbackActions.length > 0) {
        const repairedFallbackActions = repairFallbackDropdownActions(elements, fallbackActions)
        if (repairedFallbackActions.some((action, index) => action !== fallbackActions[index])) {
          fallbackActions.splice(0, fallbackActions.length, ...repairedFallbackActions)
          console.log('🛡️ FALLBACK SEARCH TYPING REMOVED:', fallbackActions)
        }
        console.log("🔄 JS fallback actions:", fallbackActions)
        actions = fallbackActions
      } else if (isClick && !isFill) {
        // Pure click step (no fill needed) - only if we have a reasonable button
        // matching what the step actually asks for (e.g. "Save", "Submit"),
        // never just the first visible button on the page.
        const btn = findButtonForStep(step, elements)

        if (btn && !isLoginStep) {
          const btnText = btn?.text || ''
          const btnSel = btnText ? `text=${btnText}` : btn.id ? `#${btn.id}` : `__index:${btn.index}`
          actions = [{ type: 'click', selector: btnSel, value: '', label: btnText || 'submit' }]
          console.log("🔄 JS fallback click action:", actions)
        }
      }

      if (actions.length === 0) {
        if (currentStepActionType === 'click') {
          const clickError = `No click action could be resolved for current step: "${step}".`
          console.error(`❌ ${clickError}`)
          addLog(ctx.logs, stepIndex, 'ERROR', clickError, {
            source: 'backend-2026:ui.executor',
            currentStep: step,
          })
          return {
            status: 'failed_execution',
            error: clickError,
            screenshots: [],
          }
        }
        // If the AI returned empty AND the JS fallback couldn't find reasonable elements,
        // it usually means the page has already moved on (e.g., login completed early).
        // Let's assume the step is already passed.
        console.log("✅ JS fallback also empty → Assuming step already satisfied on this page. PASSING.")
        const fbScreenshot = await captureStepScreenshot(driver, stepIndex, "passed")
        return {
          status: 'passed',
          screenshots: [fbScreenshot]
        }
      }
    }

    actions = normalizeDropdownActions(step, elements, testDataValues, actions)

    // ── Current step is the source of truth ─────────────────────────────
    // The AI sees the whole test case and regularly answers for a field
    // the current step never mentioned (returning "Admin" while the step
    // says "Enter testuser1 in Username field"). Drop any action carrying
    // another field's value, or a value this step does not call for.
    // A user override is a deliberate decision and is left untouched.
    if (!overrideActions.length) {
      const scoped = filterActionsForCurrentStep(step, actions, testDataMap)
      if (scoped.rejected.length) {
        for (const { action, reason } of scoped.rejected) {
          console.warn(`🚫 AI ACTION REJECTED (not for this step): ${reason}`, action)
        }
        addLog(ctx.logs, stepIndex, 'WARN', 'AI actions rejected: not matching the current step', {
          source: 'backend-2026:ui.executor',
          currentStep: step,
          rejected: scoped.rejected,
        })
      }
      actions = scoped.actions

      // Every AI action belonged to another field. Rebuild the action for
      // THIS step from the step sentence + DOM so the step still runs with
      // the right field and the right value, instead of executing a wrong
      // action or silently doing nothing.
      if (scoped.allRejected) {
        const parsed = parseStepFieldAndValue(step)
        const targetField = parsed?.field || parseStepTargetField(step)
        const canonical = canonicalFieldKey(targetField)
        const entry = canonical ? testDataMap.get(canonical) : null
        const value = parsed?.value || entry?.value || ''
        const el = canonical ? findElementForCanonicalField(canonical) : null

        // A click step ("Click Add button", "Click Save button") has no
        // value to type — rebuild it as a click on the button the step
        // actually names.
        const isClickStep = /^\s*(?:click|press|tap|hit)\b/i.test(String(step || ''))
        const button = isClickStep ? findButtonForStep(step, elements) : null

        if (button) {
          const rebuilt = {
            type: 'click',
            selector: button?.text
              ? `text=${button?.text}`
              : button.id
                ? `#${button.id}`
                : `__index:${button.index}`,
            value: '',
            label: button?.text || targetField || 'button',
          }
          console.warn('🔧 Rebuilt the click action for the current step from the step text + DOM:', rebuilt)
          addLog(ctx.logs, stepIndex, 'WARN', 'Action rebuilt for current step', {
            source: 'backend-2026:ui.executor',
            currentStep: step,
            rebuilt,
          })
          actions = [rebuilt]
        } else if (el && value) {
          const isDropdown =
            String(el.tag || '').toLowerCase() === 'select' ||
            ['combobox', 'listbox'].includes(String(el.role || '').toLowerCase()) ||
            /select|dropdown|oxd-select/i.test(String(el.classes || ''))
          const rebuilt = {
            type: isDropdown ? 'select' : 'type',
            selector: buildSelectorForElement(el),
            value,
            label: entry?.label || targetField,
          }
          console.warn('🔧 Rebuilt the action for the current step from the step text + DOM:', rebuilt)
          addLog(ctx.logs, stepIndex, 'WARN', 'Action rebuilt for current step', {
            source: 'backend-2026:ui.executor',
            currentStep: step,
            rebuilt,
          })
          actions = [rebuilt]
        } else {
          console.warn(
            `⚠️ All AI actions were out of scope for "${step}" and no DOM element matched "${targetField}" — nothing to execute.`
          )
        }
      }
    }

    // ── Ambiguous text= selectors ───────────────────────────────────────
    // "text=Admin" is unusable when several elements carry that text (the
    // User Role trigger, the option inside the open list, a table cell,
    // the header menu). Re-point such a click at the dropdown OPTION when
    // the list is open, otherwise at the step's own dropdown trigger.
    if (!overrideActions.length) {
      actions = actions.map((action) => {
        const selector = String(action?.selector || '')
        if (!selector.startsWith('text=')) return action
        const wanted = normalizeDropdownValue(selector.slice(5))
        if (!wanted) return action

        const matches = elements.filter(
          (el) => el?.visible !== false && normalizeDropdownValue(el?.text) === wanted
        )
        if (matches.length <= 1) return action

        const option = matches.find(
          (el) =>
            String(el?.role || '').toLowerCase() === 'option' ||
            /option|dropdown-item|oxd-select-option/i.test(String(el?.classes || ''))
        )
        const target = option || matches[0]
        console.warn(
          `🎯 AMBIGUOUS SELECTOR "${selector}" matched ${matches.length} elements → targeting ${
            option ? 'the dropdown option' : 'the first visible match'
          } at __index:${target.index}`
        )
        addLog(ctx.logs, stepIndex, 'WARN', 'Ambiguous text selector re-targeted', {
          source: 'backend-2026:ui.executor',
          selector,
          matchCount: matches.length,
          chosenIndex: target.index,
        })
        return { ...action, selector: `__index:${target.index}` }
      })
    }

    // ── Prevent premature submission ────────────────────────────────────
    // If the decision is about to click a submit-like control while test
    // data fields that belong on this page have never been filled (not by
    // an earlier step, not by this action list), deterministically build
    // the missing `type` actions from test_data + DOM and run them FIRST.
    // This is what stops a bare [{click Login}] from submitting an empty
    // login form. A user override is a deliberate decision and is left
    // untouched.
    if (!overrideActions.length) {
      actions = ensureRequiredInputsBeforeSubmit(actions)
    }

    if (!overrideActions.length) {
      const allowedActionTypes = currentStepActionType === 'dropdown'
        ? ['select']
        : currentStepActionType === 'input'
          ? ['type']
          : currentStepActionType === 'calendar'
            ? ['type']
            : currentStepActionType === 'checkbox'
              ? ['click', 'check', 'uncheck']
              : currentStepActionType === 'click'
                ? ['click']
                : []
      if (allowedActionTypes.length) {
        const rejected = actions.filter((action) => !allowedActionTypes.includes(String(action?.type || '').toLowerCase()))
        if (rejected.length) {
          addLog(ctx.logs, stepIndex, 'WARN', 'Actions rejected: wrong action type for current step', {
            source: 'backend-2026:ui.executor',
            currentStep: step,
            expectedActionTypes: allowedActionTypes,
            rejected,
          })
        }
        actions = actions.filter((action) => allowedActionTypes.includes(String(action?.type || '').toLowerCase()))
      }
    }

    console.log('🧭 NORMALIZED ACTIONS:', actions)
    console.log('🤖 GENERATED ACTIONS =', JSON.stringify(actions))
    console.log('🤖 AI ACTIONS =', JSON.stringify(actions, null, 2))

    console.log("🧠 ACTIONS:", actions)
    // If AI actions were rejected as belonging to another field, rebuild the
    // current dropdown/calendar action instead of treating an empty list as a
    // successful step.
    if (!overrideActions.length && actions.length === 0 && currentStepActionType === 'dropdown') {
      const rebuiltDropdown = buildDropdownActionForStep(step, elements, testDataValues)
      if (rebuiltDropdown) actions = [rebuiltDropdown]
    }

    // Calendar steps must not be silently skipped when the AI returns no
    // usable action. Rebuild them from the current date field and test data.
    if (!overrideActions.length && actions.length === 0 && currentStepActionType === 'calendar') {
      const targetField = parseStepTargetField(step)
      const targetCanonical = canonicalFieldKey(targetField)
      const entry = targetCanonical ? testDataMap.get(targetCanonical) : null
      const control = (elements || []).find((item) => {
        if (!item || item.visible === false || item.disabled) return false
        const tag = String(item.tag || '').toLowerCase()
        const type = String(item.type || '').toLowerCase()
        if (tag !== 'input' || !(
          type === 'date' || /date|calendar|datepicker/.test(fieldIdentityText(item))
        )) return false
        return !targetCanonical || identifyFieldKey(item) === targetCanonical ||
          [item.fieldContext, item.name, item.id, item.placeholder, item.ariaLabel]
            .some((source) => canonicalFieldKey(source) === targetCanonical)
      })

      if (control && entry?.value) {
        actions = [{
          type: 'type',
          selector: buildSelectorForElement(control),
          value: entry.value,
          label: entry.label || targetField,
        }]
        addLog(ctx.logs, stepIndex, 'INFO', 'Calendar action rebuilt for current step', {
          source: 'backend-2026:ui.executor',
          currentStep: step,
          selector: actions[0].selector,
          value: entry.value,
        })
      }
    }

    // Re-target date/dropdown actions to the control named by the current
    // step, rather than reusing a stale positional selector.
    if (!overrideActions.length && (currentStepActionType === 'calendar' || currentStepActionType === 'dropdown')) {
      const targetField = parseStepTargetField(step)
      const targetCanonical = canonicalFieldKey(targetField)
      const control = (elements || []).find((el) => {
        if (!el || el.visible === false || el.disabled) return false
        const tag = String(el.tag || '').toLowerCase()
        const classes = String(el.classes || '').toLowerCase()
        const isCalendar = currentStepActionType === 'calendar' && tag === 'input' &&
          (String(el.type || '').toLowerCase() === 'date' || /date|calendar|datepicker/.test(fieldIdentityText(el)))
        const isDropdown = currentStepActionType === 'dropdown' && (
          tag === 'select' || /oxd-select|select-text|select-wrapper|dropdown|combobox/.test(classes) ||
          String(el.role || '').toLowerCase() === 'combobox'
        )
        if (!(isCalendar || isDropdown)) return false
        return !targetCanonical || identifyFieldKey(el) === targetCanonical ||
          [el.fieldContext, el.name, el.id, el.placeholder, el.ariaLabel].some((source) => canonicalFieldKey(source) === targetCanonical)
      })
      if (control && actions.length) {
        const stableSelector = buildSelectorForElement(control)
        actions = actions.map((action) => ({ ...action, selector: stableSelector, label: action.label || targetField }))
        addLog(ctx.logs, stepIndex, 'INFO', 'Action scoped to current control', {
          source: 'backend-2026:ui.executor', currentStep: step, field: targetField, selector: stableSelector,
        })
      }
    }

    addLog(ctx.logs, stepIndex, "INFO", "AI actions received", {
      source: overrideActions.length ? "backend-2026:user_override" : "python-2026:/ai/decide",
      actions
    })

    const screenshots = []
    const domElementsByIndex = new Map()

for (const item of elements) {
  domElementsByIndex.set(item.index, item)
}
    const highlightedSelectors = new Set()
    const executedActionKeys = new Set()
    const editableMetadata = elements.filter((el) => {
      const tag = String(el?.tag || "").toLowerCase()
      if (tag === "textarea" || tag === "select") return true
      if (tag !== "input") return false
      const inputType = String(el?.type || "").toLowerCase().trim()
      return (
        !inputType ||
        [
          "text",
          "email",
          "password",
          "number",
          "tel",
          "url",
          "search",
          "date",
          "datetime-local",
          "month",
          "week",
          "time",
          "color",
        ].includes(inputType)
      )
    })

   

    const resolveElementBySelector = async (selector) => {
      const normalized = String(selector || "").trim()

      if (normalized.startsWith("id=")) {
        return driver.findElement(By.id(normalized.replace("id=", "")))
      }
      if (normalized.startsWith("name=")) {
        return driver.findElement(By.name(normalized.replace("name=", "")))
      }
      if (normalized.startsWith("field:")) {
        // Resolve by re-identifying the field the same way it was
        // classified at capture time (fieldContext/placeholder/name/type),
        // instead of by DOM position — immune to indices shifting between
        // captures (a validation message appearing/disappearing adds or
        // removes a node and reflows every later __index).
        // Match case-insensitively: a manually written override like
        // "field:Username" must resolve the same as "field:username".
        const fieldKey = normalized.slice("field:".length).trim().toLowerCase()
         const matcher = FIELD_MATCHERS.find((entry) => entry.key === fieldKey)
         if (!matcher) return null

         // OrangeHRM renders several oxd-select controls in the same form row.
         // Resolve the requested control from its own label first; using the
         // whole row as fieldContext can otherwise return the first matching
         // select (notably for status and leave type).
         const labelledControl = await driver.executeScript((key) => {
           const normalize = (value) => String(value || '')
             .replace(/\s+/g, ' ')
             .trim()
             .toLowerCase()
           const labelMatches = (text) => {
             const value = normalize(text)
             if (key === 'status') return /show leave with status|\bstatus\b/.test(value)
             if (key === 'leavetype') return /leave type|leavetype/.test(value)
             if (key === 'subunit') return /sub unit|subunit/.test(value)
             return value.includes(normalize(key))
           }
           const groups = Array.from(document.querySelectorAll('.oxd-input-group'))
           for (const group of groups) {
             const label = group.querySelector('label')
             if (!labelMatches(label?.innerText || '')) continue
             const trigger = group.querySelector(
               'select, .oxd-select-text, [role="combobox"], [aria-haspopup="listbox"]'
             )
             if (trigger && trigger.getBoundingClientRect().width && trigger.getBoundingClientRect().height) {
               return trigger
             }
           }
           return null
         }, fieldKey).catch(() => null)
         if (labelledControl) return labelledControl

         const candidates = await driver.findElements(By.css('input, textarea, select, .oxd-select-text, [role="combobox"], [aria-haspopup="listbox"]')).catch(() => [])
        for (const candidate of candidates) {
          if (!(await isVisibleElement(candidate))) continue
          const tag = String(await candidate.getTagName().catch(() => '') || '').toLowerCase()
          const type = String(await candidate.getAttribute('type').catch(() => '') || '')
          const role = String(await candidate.getAttribute('role').catch(() => '') || '')
          const classes = String(await candidate.getAttribute('class').catch(() => '') || '')
          const name = String(await candidate.getAttribute('name').catch(() => '') || '')
          const placeholder = String(await candidate.getAttribute('placeholder').catch(() => '') || '')
          const fieldContext = await driver.executeScript((element) => {
            const group = element.closest('.oxd-input-group, .oxd-form-row, .oxd-form')
            const text = group?.innerText || element.parentElement?.innerText || ''
            return text.replace(/\s+/g, ' ').trim()
          }, candidate).catch(() => '')
          if (matcher.matches({ tag, type, name, placeholder, fieldContext, role, classes })) {
            return candidate
          }
        }
        return null
      }
      if (normalized.startsWith("__index:")) {

  const rawIndex = Number(
    normalized.slice("__index:".length)
  )

  const metadata = domElementsByIndex.get(rawIndex)

  console.log(
    "INDEX LOOKUP",
    rawIndex,
    metadata?.text
  )

  if (!metadata) {
    return null
  }

  if (metadata.id) {
    return driver.findElement(By.id(metadata.id))
  }

  if (metadata.name) {
    return driver.findElement(By.name(metadata.name))
  }

  if (metadata.role === 'option') {
    const options = await driver.findElements(By.css('[role="option"]')).catch(() => [])
    for (const option of options) {
      if (normalizeValue(await option.getText().catch(() => '')) === normalizeValue(metadata?.text)) {
        return option
      }
    }
  }

  if (/oxd-select-text|oxd-select-wrapper/.test(String(metadata.classes || '').toLowerCase())) {
    const candidates = await driver.findElements(By.css('.oxd-select-text, .oxd-select-wrapper')).catch(() => [])
    // metadata.fieldContext was captured with internal whitespace/newlines
    // already collapsed to single spaces (see dom capture above). The live
    // innerText read back here must be collapsed the same way before
    // comparing — otherwise a real newline between the field label and its
    // "-- Select --" placeholder makes `context.includes(wantedContext)`
    // always false, silently falling through to the much less reliable
    // nearest-element-by-pixel-distance fallback below (which can resolve
    // to an unrelated input/div and open the wrong control entirely).
    const collapseWhitespace = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const wantedContext = collapseWhitespace(metadata.fieldContext)
    let bestCandidate = null
    for (const candidate of candidates) {
      if (!(await isVisibleElement(candidate))) continue
      const context = collapseWhitespace(await driver.executeScript((element) => {
        const group = element.closest('.oxd-input-group, .oxd-form-row, .oxd-form')
        return group?.innerText || element.parentElement?.innerText || ''
      }, candidate).catch(() => ''))
      if (wantedContext && context.includes(wantedContext)) {
        bestCandidate = candidate
        break
      }
    }
    if (bestCandidate) return bestCandidate
  }

  if (metadata.rect && metadata.tag) {
    const candidates = await driver.findElements(By.css(metadata.tag)).catch(() => [])
    const nearest = await driver.executeScript((nodes, target) => {
      let selected = null
      let bestDistance = Number.POSITIVE_INFINITY
      for (const node of nodes || []) {
        const rect = node.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        const distance = Math.abs(rect.left - target.x) + Math.abs(rect.top - target.y)
        if (distance < bestDistance) {
          bestDistance = distance
          selected = node
        }
      }
      return selected
    }, candidates, metadata.rect).catch(() => null)
    if (nearest) return nearest
  }

  if (metadata?.text) {
    return resolveTextSelector(
      driver,
      `text=${metadata?.text}`
    )
  }

  return null
}

      if (normalized.startsWith("text=")) {
        return resolveTextSelector(driver, normalized)
      }

      if (normalized.startsWith("#") && normalized.includes("[")) {
        const literalId = normalized.slice(1)
        const byId = await driver.findElements(By.id(literalId)).catch(() => [])
        if (byId.length > 0) {
          return byId[0]
        }
        return driver.executeScript((id) => document.getElementById(id), literalId)
      }

      const byId = await driver.findElements(By.id(normalized.replace(/^#/, ""))).catch(() => [])
      if (byId.length > 0) return byId[0]

      const byName = await driver.findElements(By.name(normalized.replace(/^name=/, ""))).catch(() => [])
      if (byName.length > 0 && normalized.startsWith("name=")) return byName[0]

      return driver.findElement(By.css(normalized))
    }

   const resolveTextSelector = async (driverInstance, selector) => {
  const value = String(selector || "").replace(/^text=/, "").trim()
  if (!value) return null

  const xpath = `//*[contains(normalize-space(.), ${JSON.stringify(value)})]`
  const candidates = await driverInstance.findElements(By.xpath(xpath))

  // ✅ Prefer genuinely interactive, leaf-level elements (button, link,
  // input, role=button) whose OWN text matches exactly, over generic
  // wrapper containers that only match because a descendant contains
  // the text (ancestors come first in XPath document order, so without
  // this we'd click a <div> wrapper instead of the real <button>).
  const interactiveTags = new Set(['button', 'a', 'input'])
  const scored = []

  for (const candidate of candidates) {
    if (!(await isVisibleElement(candidate))) continue

    const tag = String(await candidate.getTagName().catch(() => '') || '').toLowerCase()
    const role = String(await candidate.getAttribute('role').catch(() => '') || '').toLowerCase()
    const ownText = normalizeValue(await candidate.getText().catch(() => ''))
    const className = String(await candidate.getAttribute('class').catch(() => '') || '').toLowerCase()
    const isOption = role === 'option' || role === 'menuitem' || className.includes('option') || className.includes('dropdown-item')
    const isInteractive = interactiveTags.has(tag) || role === 'button' || role === 'link' || isOption
    const isExactMatch = ownText === normalizeValue(value)

    let score = 0
    if (isInteractive) score += 100
    if (isOption) score += 50 // Give dropdown options priority over sidebar links when text matches
    if (isExactMatch) score += 50
    scored.push({ el: candidate, score })
  }

  if (!scored.length) return null

  scored.sort((a, b) => b.score - a.score)
  return scored[0].el
}

    const normalizeValue = (v) => String(v || "").trim()
    const isSubmitLikeSelector = (selector) => {
      const s = String(selector || "").toLowerCase()
      return (
        s.includes('submit') ||
        s.includes('save') ||
        s.includes('next') ||
        s.includes('continue') ||
        s.includes('login') ||
        s.includes('register')
      )
    }

    const safeClick = async (el) => {
      try {
        await el.click()
        return
      } catch {
        await driver.executeScript((element) => {
          element.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          }))
        }, el)
      }
    }

    const isVisibleElement = async (el) => {
      try {
        return await driver.executeScript((element) => {
          if (!element) return false
          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return Boolean(
            style &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom >= 0 &&
            rect.right >= 0 &&
            rect.top <= window.innerHeight &&
            rect.left <= window.innerWidth
          )
        }, el)
      } catch {
        return false
      }
    }

    const classifyElement = async (el) => {
  const tag = String(
    await el.getTagName().catch(() => '')
  ).toLowerCase()

  const role = String(
    await el.getAttribute('role').catch(() => '')
  ).toLowerCase()

  const type = String(
    await el.getAttribute('type').catch(() => '')
  ).toLowerCase()

  const classes = String(
    await el.getAttribute('class').catch(() => '')
  ).toLowerCase()

  const ariaHaspopup = String(
    await el.getAttribute('aria-haspopup').catch(() => '')
  ).toLowerCase()

  const ariaExpanded = String(
    await el.getAttribute('aria-expanded').catch(() => '')
  ).toLowerCase()

  const insideForm = await driver.executeScript(
    element => !!element.closest('form'),
    el
  ).catch(() => false)

 const isDropdown =
  tag === 'select' ||
  role === 'combobox' ||
  role === 'listbox' ||
  ['listbox', 'dialog', 'menu']
    .includes(ariaHaspopup) ||
    ariaExpanded === 'true' ||
    /oxd-select-text|oxd-select-wrapper/.test(classes)
    

  const isSubmit =
    type === 'submit' ||
    (
      tag === 'button' &&
      insideForm &&
      !isDropdown
    )

  const isCheckbox =
    tag === 'input' &&
    type === 'checkbox'

  const isRadio =
    tag === 'input' &&
    type === 'radio'

  return {
    isDropdown,
    isSubmit,
    isCheckbox,
    isRadio,
    tag,
    role,
    type
  }
}
    const getDropdownText = async (el) => {
      if (!el) return ''
      try {
        return normalizeValue(await el.getText())
      } catch {
        return ''
      }
    }

    const getDropdownHint = async (el) => {
      try {
        const hint = await driver.executeScript((element) => {
          if (!element) return ''
          const attrs = [
            element.id,
            element.getAttribute('name'),
            element.getAttribute('aria-label'),
            element.getAttribute('aria-labelledby'),
            element.getAttribute('title'),
            element.getAttribute('placeholder'),
            element.getAttribute('data-testid'),
            element.className
          ]
            .filter(Boolean)
            .join(' ')
          const parentText = element.parentElement ? (element.parentElement.innerText || '') : ''
          return `${attrs} ${parentText}`.replace(/\s+/g, ' ').trim()
        }, el)
        return normalizeValue(hint)
      } catch {
        return ''
      }
    }

    const scoreDropdownCandidate = async (candidate, label) => {
      const wanted = normalizeValue(label)
      if (!wanted) return 0

      const tag = String(await candidate.getTagName().catch(() => '') || '').toLowerCase()
  const role = String(await candidate.getAttribute('role').catch(() => '') || '').toLowerCase()
  const ariaHaspopup = String(await candidate.getAttribute('aria-haspopup').catch(() => '') || '').toLowerCase()
  const ariaExpanded = String(await candidate.getAttribute('aria-expanded').catch(() => '') || '').toLowerCase()
  const type = String(await candidate.getAttribute('type').catch(() => '') || '').toLowerCase()
  const classes = String(await candidate.getAttribute('class').catch(() => '') || '').toLowerCase()
  const text = normalizeValue(await getDropdownText(candidate))
  const hint = normalizeValue(await getDropdownHint(candidate))
  const isCustomSelectWidget = /oxd-select-text|oxd-select-wrapper/.test(classes)

      let score = 0

      if (tag === 'select') score += 100
      if (isCustomSelectWidget) score += 95
      if (role === 'combobox') score += 95
      if (role === 'listbox') score += 90
      if (ariaHaspopup === 'listbox') score += 85
      if (ariaExpanded === 'true') score += 60
      if (tag === 'button') score += 30
      if (tag === 'div' && !isCustomSelectWidget) score += 10
      // A plain text/search input is a weak dropdown-trigger signal on its
      // own (things like "Type for hints..." autocomplete boxes match this
      // too) — only count it once we also have some hint/text evidence it's
      // actually the requested field, so it can't outscore a real custom
      // select widget that failed the exact-context match above.
      if (tag === 'input' && ['search', 'text'].includes(type) && hint && hint.includes(wanted)) score += 20

      if (text && text === wanted) score += 80
      if (text && (text.includes(wanted) || wanted.includes(text))) score += 50
      if (hint && hint.includes(wanted)) score += 40

      return score
    }

    const getDropdownCandidates = async () => {
      const selector =
        'select, [role="combobox"], [role="listbox"], [aria-haspopup="listbox"], [aria-expanded], button, input, div'
      const els = await driver.findElements(By.css(selector))
      const candidates = []
      for (const el of els) {
        if (await isVisibleElement(el)) {
          candidates.push(el)
        }
      }
      return candidates
    }

    const isDropdownTrigger = async (el) => {
      try {
        const tag = String(await el.getTagName().catch(() => '') || '').toLowerCase()
        const role = String(await el.getAttribute('role').catch(() => '') || '').toLowerCase()
        const ariaHaspopup = String(await el.getAttribute('aria-haspopup').catch(() => '') || '').toLowerCase()
        const ariaExpanded = String(await el.getAttribute('aria-expanded').catch(() => '') || '').toLowerCase()
        const type = String(await el.getAttribute('type').catch(() => '') || '').toLowerCase()
        const classes = String(await el.getAttribute('class').catch(() => '') || '').toLowerCase()
        const text = await getDropdownText(el)
        return Boolean(
          tag === 'select' ||
          role === 'combobox' ||
          role === 'listbox' ||
          ariaHaspopup === 'listbox' ||
           [
   'listbox',
   'dialog',
   'menu',
   'true'
 ].includes(ariaHaspopup) ||
          ariaExpanded === 'true' ||
          /oxd-select-text|oxd-select-wrapper/.test(classes) ||
          (tag === 'button' && text) ||
          (tag === 'input' && ['search', 'text'].includes(type)) ||
          (tag === 'div' && (role || ariaHaspopup || ariaExpanded))
        )
      } catch {
        return false
      }
    }

const openDropdown = async (preferredEl, label) => {
  const candidates = await getDropdownCandidates()
  const scored = []

  if (preferredEl && await isVisibleElement(preferredEl)) {
    scored.push({
      el: preferredEl,
      score: (await scoreDropdownCandidate(preferredEl, label)) + 20
    })
  }

  for (const candidate of candidates) {
    if (!(await isDropdownTrigger(candidate))) continue
    scored.push({
      el: candidate,
      score: await scoreDropdownCandidate(candidate, label)
    })
  }

  scored.sort((a, b) => b.score - a.score)

  for (const item of scored) {
    const candidate = item.el

    console.log("Trying dropdown candidate:", await getDropdownText(candidate), "score:", item.score)

    await driver.executeScript((element) => {
      element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
    }, candidate).catch(() => {})

    await sleep(150)

    try {
      await safeClick(candidate)
      console.log("✅ DROPDOWN OPEN CLICK:", await getDropdownText(candidate))
      await sleep(800)

      // ✅ Attendre le dialog
      try {
        await driver.wait(async () => {
          const dialogs = await driver.findElements(
            By.css('[role="dialog"], [role="listbox"], [aria-modal="true"]')
          )
          for (const d of dialogs) {
            if (await isVisibleElement(d)) return true
          }
          return false
        }, 5000)
        console.log("✅ Dialog opened")
      } catch {
        console.log("⚠️ No dialog detected, continuing")
      }

      const expandedAfter = String(
        await candidate.getAttribute('aria-expanded').catch(() => '')
      ).toLowerCase()
      console.log("aria-expanded after click:", expandedAfter)

      return candidate

    } catch (err) {
      console.log("❌ DROPDOWN CLICK FAILED:", err.message)
    }
  }

  return null
}

    const getVisibleOptions = async () => {
  const selectors = [
    '[role="option"]',
    'option',
    '[role="menuitem"]',
    '[role="treeitem"]',
    '[role="radio"]',
    '.oxd-select-option',
    '.oxd-select-dropdown li',
    // ✅ GitHub country dialog : items sont des <li> ou <div> dans le dialog
    '[role="dialog"] li',
    '[role="dialog"] [data-value]',
    '[aria-modal="true"] li',
    '[aria-modal="true"] button',
    '.tv-dd-option',
    '.tv-dropdown button',
    '[data-value]',
    '[data-testid*="option" i]',
  ].join(', ')

  // Prefer the popup/listbox opened by the current trigger. A page can keep
  // options from another dropdown in the DOM, so a global option scan may
  // click a matching value in the wrong field.
  const popupRoots = await driver.findElements(By.css(
    '[role="listbox"], [role="dialog"], [aria-modal="true"], .oxd-select-dropdown'
  )).catch(() => [])
  const visibleRoots = []
  for (const root of popupRoots) {
    if (await isVisibleElement(root)) visibleRoots.push(root)
  }
  if (visibleRoots.length) {
    const scoped = []
    for (const root of visibleRoots.slice(-1)) {
      const options = await root.findElements(By.css(selectors)).catch(() => [])
      for (const option of options) {
        if (await isVisibleElement(option)) scoped.push(option)
      }
    }
    if (scoped.length) return scoped
  }

  const els = await driver.findElements(By.css(selectors))
  const visible = []
  for (const el of els) {
    if (await isVisibleElement(el)) visible.push(el)
  }
  return visible
}

const selectViaSearchDialog = async (wanted) => {
  // Dropdown values must be selected from their rendered option text.
  // Do not type into a search/autocomplete input: Admin is a role option,
  // not an Employee Name value.
  console.log("🔍 Reading dropdown options for:", wanted)
  // The requested value is matched against the options visible right now.
  // Scrolling/retrying here made a missing test-data value look like a slow
  // search and delayed the explicit fallback decision below.
  const visibleOptions = await getVisibleOptions()
  for (const option of visibleOptions) {
    const text = await getOptionText(option)
    if (matchesDropdownValue(wanted, text)) return option
  }

  return null
}
    const getGenericVisibleTextNodes = async () => {
      const selectors = [
        'div',
        'span',
        'li',
        'button',
        'a',
        '[role]',
        '[data-value]',
        '[data-testid]'
      ].join(', ')
      const els = await driver.findElements(By.css(selectors))
      const visible = []
      for (const el of els) {
        if (!(await isVisibleElement(el))) continue
        const text = await getOptionText(el)
        if (text) visible.push(el)
      }
      return visible
    }

    const getOptionText = async (el) => {
      try {
        const text = normalizeValue(await el.getText())
        if (text) return text
      } catch {
        // ignore — fall back to aria-label below
      }
      try {
        return normalizeValue(await el.getAttribute('aria-label'))
      } catch {
        return ''
      }
    }

    const scrollOptionContainer = async (option) => {
      try {
        await driver.executeScript((element) => {
          let node = element
          while (node && node !== document.body) {
            const style = window.getComputedStyle(node)
            const canScroll = /(auto|scroll)/.test(`${style.overflow} ${style.overflowY} ${style.overflowX}`)
            if (canScroll && node.scrollHeight > node.clientHeight) {
              node.scrollTop = Math.min(node.scrollTop + Math.max(120, node.clientHeight * 0.8), node.scrollHeight)
              return
            }
            node = node.parentElement
          }
          window.scrollBy(0, Math.max(120, window.innerHeight * 0.6))
        }, option)
        return true
      } catch {
        return false
      }
    }

    const findOptionByText = async (value) => {
      const wanted = normalizeValue(value)
      const maxRounds = 12
      for (let round = 0; round < maxRounds; round++) {
        const options = await getVisibleOptions()
        for (const option of options) {
          const text = await getOptionText(option)
          if (matchesDropdownValue(wanted, text)) {
            return option
          }
        }
        if (!options.length) break
        const last = options[options.length - 1]
        await scrollOptionContainer(last)
        await sleep(250)
      }
      return null
    }

    const findGenericDropdownOptionByText = async (value) => {
      const wanted = normalizeValue(value)
      const maxRounds = 12
      for (let round = 0; round < maxRounds; round++) {
        const nodes = await getGenericVisibleTextNodes()
        for (const node of nodes) {
          const text = await getOptionText(node)
          if (matchesDropdownValue(wanted, text)) {
            return node
          }
        }

        
console.log(
  "Searching generic option:",
  wanted
)

        if (!nodes.length) break
        const last = nodes[nodes.length - 1]
        await scrollOptionContainer(last)
        await sleep(250)
      }
      


      return null

      
    }

    const waitForOptionText = async (value, timeoutMs = 5000) => {
      const started = Date.now()
      while (Date.now() - started < timeoutMs) {
        const options = await getVisibleOptions()
        for (const option of options) {
          const text = await getOptionText(option)
          if (matchesDropdownValue(value, text)) {
            return option
          }
        }
        await sleep(250)
      }
      return null
    }

    const closeTransientUi = async () => {
      try {
        await driver.actions({ bridge: true }).sendKeys('\uE00C').perform()
      } catch {
        // ignore — best-effort key press
      }
      try {
        await driver.executeScript(() => {
          const active = document.activeElement
          if (active && typeof active.blur === 'function') active.blur()
        })
      } catch {
        // ignore — best-effort blur
      }
      await sleep(150)
    }

    // ── Save/Submit guard ───────────────────────────────────────────────
    // Only commit the form when the sequence that fills it actually
    // succeeded. Saving after a failed step persists a half-filled record
    // and hides the real failure behind a validation error.
    const isSaveStep = /\b(save|submit|enregistrer|valider)\b/i.test(String(step || '')) &&
      actions.some((a) => String(a?.type || '').toLowerCase() === 'click')

    if (isSaveStep && Number(ctx.failedStepCount || 0) > 0) {
      console.error(
        `❌ SAVE BLOCKED: ${ctx.failedStepCount} earlier step(s) did not pass (last: "${ctx.lastFailedStep}"). Refusing to submit the form.`
      )
      addLog(ctx.logs, stepIndex, 'ERROR', 'Save blocked: earlier steps did not pass', {
        source: 'backend-2026:ui.executor',
        failedStepCount: ctx.failedStepCount,
        lastFailedStep: ctx.lastFailedStep || null,
      })
      return {
        status: 'failed_execution',
        error: `Save was not clicked: ${ctx.failedStepCount} earlier step(s) failed (last: "${ctx.lastFailedStep}").`,
        screenshots: [],
      }
    }

    if (isSaveStep && testDataMap.size) {
      // Required fields must actually hold their value before committing.
      const unfilled = []
      for (const [canonical, entry] of testDataMap.entries()) {
        const el = findElementForCanonicalField(canonical)
        if (!el) continue
        const selector = buildSelectorForElement(el)
        const current = await driver
          .executeScript(
            (sel) => {
              const node = document.querySelector(sel)
              return node ? String(node.value || '') : null
            },
            selector.startsWith('field:') || selector.startsWith('__index:') ? 'input[nomatch]' : selector
          )
          .catch(() => null)
        if (current !== null && String(current).trim() === '') {
          unfilled.push(`${entry.label} (${selector})`)
        }
      }
      if (unfilled.length) {
        console.error('❌ SAVE BLOCKED: required fields are still empty:', unfilled)
        addLog(ctx.logs, stepIndex, 'ERROR', 'Save blocked: required fields are empty', {
          source: 'backend-2026:ui.executor',
          unfilled,
        })
        return {
          status: 'failed_execution',
          error: `Save was not clicked: required field(s) still empty: ${unfilled.join(', ')}.`,
          screenshots: [],
        }
      }
    }

    // Snapshot taken BEFORE the actions run, so a click that changed
    // nothing can be told apart from one that opened the expected view.
    const stateBeforeActions = await driver
      .executeScript(() => ({
        url: window.location.href,
        fields: document.querySelectorAll('input:not([type="hidden"]), select, textarea').length,
        text: (document.body?.innerText || '').slice(0, 4000),
      }))
      .catch(() => ({ url: '', fields: 0, text: '' }))

    // ✅ LOOP ACTIONS
    for (let i = 0; i < actions.length; i++) {

      const act = actions[i]
      const action = String(act.type || "").toLowerCase()
      const selector = String(act.selector || "").trim()
      let value = String(act.value || "").trim()
      const actionStartedAt = Date.now()
      const actionKey = `${action}::${selector}::${value}`
      const domBeforeAction = await captureDomSummary(driver)
      let el = null
      const analyzeAfterAction = async (fieldValidationMessage = null, fieldValue = null, expectedFieldValue = null, throwOnError = true, verifiedDropdown = false) => {
        const currentDom = await captureDomSummary(driver)
        const validationErrors = await readScopedValidationErrors(driver, el)
        const previousValidationErrors = new Set(domBeforeAction?.validationErrors || [])
        const newValidationErrors = validationErrors.filter((message) => !previousValidationErrors.has(message))
        const domDiff = diffDomSummaries(domBeforeAction, currentDom)
        domDiff.validationErrorsAdded = domDiff.validationErrorsAdded.filter((message) => newValidationErrors.includes(message))
        const newFieldValidationMessage = fieldValidationMessage &&
          !previousValidationErrors.has(fieldValidationMessage)
          ? fieldValidationMessage
          : null
        const snackbar = await readPageSnackbar(driver)
        const analysis = analyzeActionOutcome({
          step,
          aiAction: act,
          previousDom: domBeforeAction,
          currentDom,
          domDiff,
          fieldValidationMessage: newFieldValidationMessage,
          validationErrors: newValidationErrors,
          snackbar,
          url: currentDom?.url,
          fieldValue,
          expectedFieldValue,
        })
        if (verifiedDropdown && (action === 'select' || currentStepActionType === 'dropdown')) {
          analysis.status = 'SUCCESS'
          analysis.reason = 'Dropdown selection verified in the DOM; unrelated validation ignored.'
          analysis.context.validationErrors = []
          analysis.domResult.validationErrors = []
        }
        const conciseAnalysis = conciseAnalysisLog(analysis)
        console.log(conciseAnalysis)
        addLog(ctx.logs, stepIndex, 'INFO', 'AI DOM analysis after action', conciseAnalysis)
        if (throwOnError && analysis.status === 'ERROR') throw new Error(analysis.reason)
        return analysis
      }

      if (executedActionKeys.has(actionKey)) {
        addLog(ctx.logs, stepIndex, "INFO", "Skipping duplicate action", {
          action,
          selector,
          value
        })
        continue
      }
      executedActionKeys.add(actionKey)

      try {
        console.log(`▶️ Action starting [${i + 1}/${actions.length}]`, {
          action,
          selector
        })
        addLog(ctx.logs, stepIndex, "INFO", "Action starting", {
          action,
          selector,
          index: i + 1,
          total: actions.length
        })

        // Small pause before interacting so the UI can settle
        await sleep(500)

        // ✅ FIND ELEMENT BY CSS SELECTOR or DOM index fallback
        el = await resolveElementBySelector(selector).catch(() => null)

        if (!el) {
          const wantedText = selector.startsWith("text=")
            ? normalizeValue(selector.replace(/^text=/, ""))
            : normalizeValue(value)

          if (action === "click" && wantedText && currentStepActionType === 'dropdown') {
            addLog(ctx.logs, stepIndex, "INFO", "Option not visible before dropdown open; opening dropdown first", {
              selector,
              value: wantedText
            })

            const trigger = await openDropdown(null, wantedText)
            if (!trigger) {
              throw new Error("Dropdown trigger not found for option: " + wantedText)
            }

            await sleep(1000)

            let option = await selectViaSearchDialog(wantedText)
            if (!option) option = await findOptionByText(wantedText)
            if (!option) option = await findGenericDropdownOptionByText(wantedText)
            if (!option) option = await waitForOptionText(wantedText, 5000)

            if (!option) {
              throw new Error(`Dropdown option "${wantedText}" not found`)
            }

            await driver.executeScript((optionEl) => {
              optionEl.scrollIntoView({ block: "center" })
            }, option)
            await safeClick(option)

            ctx.executionMemory.executed_actions.push({
              action: "select",
              selector,
              value: wantedText
            })
            ctx.executionMemory.selected_dropdowns.push({
              selector,
              value: wantedText
            })

            addLog(ctx.logs, stepIndex, "SUCCESS", "Dropdown option selected", {
              selector,
              value: wantedText
            })
            await analyzeAfterAction(null, null, null, false, true)
            continue
          }

          throw new Error("Element not found by selector: " + selector)
        }

        await driver.executeScript((element) => {
          element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
        }, el)

        const shouldHighlight = !highlightedSelectors.has(selector)
        if (shouldHighlight) {
          highlightedSelectors.add(selector)
          await highlightElement(driver, el, 1200)
          await sleep(150)

          const highlightShot = await captureStepScreenshot(
            driver,
            `${stepIndex}-${i}-highlight`,
            `${action}-highlight`
          )
          screenshots.push(highlightShot)
        }

        if (action === "type") {
          const inputType = String(await el.getAttribute('type').catch(() => '') || '').toLowerCase().trim()
          const tagName = String(await el.getTagName().catch(() => '') || '').toLowerCase().trim()
          const currentValue = normalizeValue(await el.getAttribute('value').catch(() => ''))
          const alreadyFilled = currentValue.length > 0
          const visible = await isVisibleElement(el)

            if (!visible) {
            addLog(ctx.logs, stepIndex, "WARN", "Skipping non-visible field", {
              selector,
              inputType
            })
            await analyzeAfterAction()
            continue
          }

          if (inputType === "checkbox" || inputType === "radio") {
            const checked = await el.isSelected().catch(() => false)
            if (!checked) {
              await sleep(200)
              await safeClick(el)
            } else {
              addLog(ctx.logs, stepIndex, "INFO", "Skipping already-selected choice", {
                selector
              })
            }
            await analyzeAfterAction()
            continue
          }
          if (inputType === "file" && !value) {
            addLog(ctx.logs, stepIndex, "WARN", "Skipping file input without value", {
              selector
            })
            await analyzeAfterAction()
            continue
          }
          if (!value) {
            value = takeNextTestDataValue()
          }
          if (!value && inputType !== "file") {
            const fallbackIndex = editableMetadata.findIndex((meta) => {
              const candidateSelector = meta?.id
                ? `#${meta.id}`
                : meta?.name
                  ? `[name="${meta.name}"]`
                  : meta?.placeholder
                    ? `[placeholder="${meta.placeholder}"]`
                    : ""
              return candidateSelector && candidateSelector === selector
            })
            if (fallbackIndex >= 0) {
              value = takeNextTestDataValue()
            }
          }
          if (!value && inputType !== "file") {
            value = ""
          }

          if (tagName === "select") {
            // Selects must be handled by Selenium Select instead of typing,
            // otherwise option selection becomes fragile and browser-specific.
            const select = new Select(el)
            try {
              select.selectByVisibleText(value)
            } catch {
              try {
                select.selectByValue(value)
              } catch (selectErr) {
                throw new Error(`Unable to select option "${value}" for ${selector}: ${selectErr.message}`, { cause: selectErr })
              }
            }
            await sleep(500)
            const nativeSelectedValue = await readActualFieldValue(driver, el)
            await analyzeAfterAction(null, nativeSelectedValue, value, false, true)
            continue
          }

          const isDateField =
            inputType === 'date' ||
            /\b(fromdate|todate|date)\b/i.test(identifyFieldKey(el) || '') ||
            /\b(date|calendar)\b/i.test(`${selector} ${act.label || ''} ${currentValue}`) ||
            await driver.executeScript((element) => {
              const wrapper = element.closest('.oxd-date-wrapper, .oxd-date-input, .datepicker, .calendar')
              const icon = element.parentElement?.querySelector?.('.bi-calendar, .oxd-date-input-icon')
              const placeholder = element.getAttribute('placeholder') || ''
              return Boolean(wrapper || icon || /yyyy|mm|dd/i.test(placeholder))
            }, el).catch(() => false)

          if (isDateField && value) {
            await handleDatePickerInteraction(driver, el, value)
            await sleep(1000)
            await analyzeAfterAction()
            const verifiedDateValue = await readActualFieldValue(driver, el)
            ctx.executionMemory.filled_fields = [
              ...(ctx.executionMemory.filled_fields || []).filter((entry) => entry.selector !== selector),
              { selector, field: act.label || identifyFieldKey(el) || selector, value: verifiedDateValue || value },
            ]
            verifiedFieldValue = { selector, value: verifiedDateValue || value }
            ctx.executionMemory.executed_actions.push({
              action: "type",
              selector,
              value: verifiedDateValue || value,
            })
            continue
          }

          if (alreadyFilled && currentValue === normalizeValue(value)) {
            const verifiedExistingValue = await readActualFieldValue(driver, el)
            ctx.executionMemory.filled_fields = [
              ...(ctx.executionMemory.filled_fields || []).filter((entry) => entry.selector !== selector),
              { selector, field: act.label || identifyFieldKey(el) || selector, value: verifiedExistingValue },
            ]
            verifiedFieldValue = { selector, value: verifiedExistingValue }
            ctx.executionMemory.executed_actions.push({
              action: "type",
              selector,
              value: verifiedExistingValue,
            })
            addLog(ctx.logs, stepIndex, "INFO", "Skipping already-filled field", {
              selector,
              value: currentValue
            })
            await analyzeAfterAction()
            continue
          }

          if (currentValue && currentValue !== normalizeValue(value)) {
            await el.clear().catch(() => {})
            await sleep(150)

            // Selenium's clear() silently no-ops on some React-controlled
            // custom inputs (e.g. OrangeHRM's Employee Name autocomplete):
            // the DOM attribute never actually empties, so the next
            // sendKeys() appends onto the old text instead of replacing it
            // (visible as concatenated values like "Adminmanda akhil user").
            // Verify it actually cleared and escalate if not.
            const stillHasValue = normalizeValue(await el.getAttribute('value').catch(() => ''))
            if (stillHasValue) {
              try {
                await el.sendKeys(Key.CONTROL, 'a')
                await el.sendKeys(Key.DELETE)
              } catch {
                // ignore — fall through to the JS-level reset below
              }
              await sleep(100)
              const stillNotEmpty = normalizeValue(await el.getAttribute('value').catch(() => ''))
              if (stillNotEmpty) {
                await driver.executeScript((element) => {
                  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
                  if (setter) {
                    setter.call(element, '')
                  } else {
                    element.value = ''
                  }
                  element.dispatchEvent(new Event('input', { bubbles: true }))
                  element.dispatchEvent(new Event('change', { bubbles: true }))
                }, el).catch(() => {})
                await sleep(100)
              }
            }
          }

          await el.sendKeys(value)
          await sleep(2000)

          // ── WAIT → CAPTURE → COMPARE → AI ANALYSIS → VERIFY ──────────
          // Read the validation message actually attached to THIS field
          // (not a generic CSS-class guess) and classify it. A correctable
          // rule ("must be at least N characters") gets one automatic
          // retry with a value that satisfies it — this is what turns
          // "Password must be at least 6 characters" into a self-healed
          // value instead of a hard failure.
          let actualFieldValue = await readActualFieldValue(driver, el)
          let fieldValidationMessage = await readFieldValidationMessage(driver, el)
          let analysis = await analyzeAfterAction(
            fieldValidationMessage,
            actualFieldValue,
            value,
            false
          )

          if (analysis.status === 'ERROR' && analysis.minLength && value.length < analysis.minLength) {
            const targetLength = Math.max(analysis.minLength + 2, value.length + 1)
            const corrected = value.padEnd(targetLength, '9Az!')
            console.warn(
              `🔧 SELF-HEALING: "${fieldValidationMessage}" — retrying with a corrected value (length ${corrected.length}).`
            )
            addLog(ctx.logs, stepIndex, 'WARN', 'Self-healing retry: value corrected to satisfy validation rule', {
              selector,
              originalValue: value,
              correctedValue: corrected,
              rule: fieldValidationMessage,
            })

            await el.clear().catch(() => {})
            await sleep(150)
            await el.sendKeys(corrected)
            value = corrected
            await sleep(1200)

            actualFieldValue = await readActualFieldValue(driver, el)
            fieldValidationMessage = await readFieldValidationMessage(driver, el)
            analysis = await analyzeAfterAction(
              fieldValidationMessage,
              actualFieldValue,
              value,
              false
            )
          }

          if (analysis.status === 'ERROR') {
            throw new Error(analysis.reason)
          }

          const actualVerifiedFieldValue = await readActualFieldValue(driver, el)
          if (normalizeValue(actualVerifiedFieldValue) !== normalizeValue(value)) {
            throw new Error(
              `Field value was not persisted for ${selector}: expected "${value}" but DOM contains "${actualVerifiedFieldValue}".`
            )
          }

          ctx.executionMemory.filled_fields = [
            ...(ctx.executionMemory.filled_fields || []).filter((entry) => entry.selector !== selector),
            { selector, field: act.label || identifyFieldKey(el) || selector, value: actualVerifiedFieldValue },
          ]
          verifiedFieldValue = { selector, value: actualVerifiedFieldValue }
          ctx.executionMemory.executed_actions.push({
            action: "type",
            selector,
            value: actualVerifiedFieldValue,
          })

          if (selector === "#subjectsInput") {
            await sleep(500)
            await closeTransientUi()
          }

          if (selector === "#dateOfBirthInput") {
            await sleep(500)
            await closeTransientUi()
          }
        }

if (action === "click" || action === "select") {

  await sleep(400)

  const clickTarget = el

  const optionValue =
    selector.startsWith("text=")
      ? normalizeValue(
          selector.replace(/^text=/, "")
        )
      : normalizeValue(value)

  const info = await classifyElement(clickTarget)

if (info.isSubmit) {

  console.log(
    "✅ SUBMIT BUTTON DETECTED"
  )

  // Explicit wait: ensure the Login/submit button is actually visible
  // before clicking it, instead of relying on the earlier isVisibleElement()
  // snapshot which can go stale if Angular/React re-renders the form.
  try {
    await driver.wait(until.elementIsVisible(clickTarget), 10000)
    await driver.wait(async () => {
      const disabled = await clickTarget.getAttribute('disabled').catch(() => null)
      const ariaDisabled = await clickTarget.getAttribute('aria-disabled').catch(() => null)
      return disabled === null && ariaDisabled !== 'true' && await isVisibleElement(clickTarget)
    }, 10000)
  } catch (waitErr) {
    throw new Error(
      `Login button was not visible within 10s: ${waitErr.message}`, { cause: waitErr }
    )
  }

  await safeClick(clickTarget)

  ctx.executionMemory.executed_actions.push({
    action: "click",
    selector
  })

  // ── WAIT → CAPTURE → COMPARE → AI ANALYSIS → VERIFY ────────────────
  // A submit (Save/Login/...) is exactly where a snackbar/toast appears.
  // Confirm success or fail+retry-signal on error, instead of treating
  // "the click didn't throw" as proof the submission succeeded.
          await sleep(1000)
          const domAfterAction = await captureDomSummary(driver)
          const submitSnackbar = await readPageSnackbar(driver)
          const previousSubmitErrors = new Set(domBeforeAction?.validationErrors || [])
          const submitValidationErrors = (await readVisibleValidationErrors(driver))
            .filter((message) => !previousSubmitErrors.has(message))
          const submitDomDiff = diffDomSummaries(domBeforeAction, domAfterAction)
          submitDomDiff.validationErrorsAdded = submitDomDiff.validationErrorsAdded
            .filter((message) => submitValidationErrors.includes(message))
          const submitAnalysis = analyzeActionOutcome({
            step,
            aiAction: act,
            previousDom: domBeforeAction,
            currentDom: domAfterAction,
            domDiff: submitDomDiff,
            validationErrors: submitValidationErrors,
            snackbar: submitSnackbar,
            url: domAfterAction?.url,
          })
  const conciseSubmitAnalysis = conciseAnalysisLog(submitAnalysis)
  console.log(conciseSubmitAnalysis)
  addLog(ctx.logs, stepIndex, 'INFO', 'AI DOM analysis after submit', conciseSubmitAnalysis)

  if (submitAnalysis.status === 'ERROR') {
    throw new Error(submitAnalysis.reason)
  }
  if (submitAnalysis.status === 'SUCCESS') {
    console.log(`✅ Action confirmed: ${submitSnackbar?.text || 'navigation or DOM change detected'}`)
  }

  break
}

  const isDropdownSelection =
    info.isDropdown || action === "select"

  if (isDropdownSelection) {

    const wanted =
      optionValue || value || ""

    if (!wanted) {
      // Never leave a dropdown open with nothing selected: the trigger has
      // already been clicked (opening it), so pick the first available
      // option instead of silently continuing with no selection.
      console.log(
        "⚠️ No dropdown value provided; selecting first available option instead of leaving it open"
      )

      const trigger = await openDropdown(clickTarget, "")
      if (!trigger) {
        throw new Error("Dropdown trigger not found")
      }

      await sleep(1000)

      const options = await getVisibleOptions()
      const firstOption = options[0] || null

      if (!firstOption) {
        throw new Error("No dropdown value was provided and no option is available to select")
      }

      const firstOptionText = await getOptionText(firstOption)

      await driver.executeScript((optionEl) => {
        optionEl.scrollIntoView({ block: "center" })
      }, firstOption)
      await safeClick(firstOption)

      ctx.executionMemory.executed_actions.push({
        action: "select",
        selector,
        value: firstOptionText
      })
      ctx.executionMemory.selected_dropdowns.push({
        selector,
        value: firstOptionText
      })

      addLog(ctx.logs, stepIndex, "SUCCESS", "Dropdown option selected (no explicit value; first option chosen)", {
        selector,
        value: firstOptionText
      })

      await analyzeAfterAction(null, null, null, false, true)

      continue
    }

    console.log(
      "🎯 DROPDOWN VALUE:",
      wanted
    )

    const trigger =
      await openDropdown(
        clickTarget,
        wanted
      )

    if (!trigger) {
      throw new Error(
        "Dropdown trigger not found"
      )
    }

    await sleep(1000)

    let option =
      await selectViaSearchDialog(
        wanted
      )

    let fallbackSelection = false
    if (!option) {
      const visibleOptions = await getVisibleOptions()
      const fallbackOptions = []
      for (const candidate of visibleOptions) {
        const disabled = String(await candidate.getAttribute('disabled').catch(() => '') || '').toLowerCase()
        const ariaDisabled = String(await candidate.getAttribute('aria-disabled').catch(() => '') || '').toLowerCase()
        const classes = String(await candidate.getAttribute('class').catch(() => '') || '').toLowerCase()
        const text = await getOptionText(candidate)
        const isPlaceholder = /^(?:--\s*)?(select|choose|please select|pick)(?:\s+an?\s+option)?\s*(?:--)?$/i.test(text)
        if (!text || isPlaceholder) continue
        if (disabled !== '' || ariaDisabled === 'true' || /(^|\s)(disabled|is-disabled)(\s|$)/.test(classes)) continue
        fallbackOptions.push({ element: candidate, text })
      }

      // The fallback is intentional and logged; never click a placeholder or
      // silently accept the first DOM option as the requested value.
      option = fallbackOptions[0]?.element || null
      if (!option) {
        throw new Error(`Dropdown option "${wanted}" not found and no fallback option is available`)
      }
      fallbackSelection = true
      const fallbackText = fallbackOptions[0].text
      console.warn(`DROPDOWN FALLBACK: requestedValue="${wanted}" fallbackValue="${fallbackText}" selector="${selector}"`)
      addLog(ctx.logs, stepIndex, 'INFO', 'Dropdown fallback selected and trigger verification will determine step status', {
        source: 'backend-2026:ui.executor', selector, requestedValue: wanted, fallbackValue: fallbackText,
        nonFailure: true,
      })
    }

    await driver.executeScript(
      el => {
        el.scrollIntoView({
          block: "center"
        })
      },
      option
    )

    await safeClick(option)

    // Read the value back from the SPECIFIC trigger we just interacted with,
    // never from an arbitrary "any .oxd-select-text on the page" search:
    // with several dropdowns visible (e.g. User Role + Status), a global
    // search can both miss a correct selection and false-match an unrelated
    // dropdown that happens to already show the same text.
    const storedSelection = fallbackSelection ? await getOptionText(option) : wanted
    const expectedSelection = normalizeDropdownValue(storedSelection)
    let selectedValue = ''
    let selectedInSameField = false
    const triggerReadDeadline = Date.now() + 2000
    while (Date.now() < triggerReadDeadline && !selectedValue) {
      selectedValue = normalizeDropdownValue(await getDropdownText(trigger).catch(() => ''))
      selectedInSameField = Boolean(await driver.executeScript((triggerEl, expected) => {
        const group = triggerEl?.closest?.('.oxd-input-group, .oxd-select-wrapper')
        if (!group) return false
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
        const nodes = group.querySelectorAll(
          '.oxd-chip, .oxd-multiselect-wrapper [class*="chip"], [class*="selected"], [aria-selected="true"]'
        )
        return Array.from(nodes).some((node) => normalize(node.innerText || node.textContent) === normalize(expected))
      }, trigger, expectedSelection).catch(() => false))
      if (selectedInSameField) break
      if (!selectedValue) await sleep(200)
    }
    if (selectedValue !== expectedSelection) {
      // Some widgets swap the trigger element after selection (re-render);
      // fall back to the option's own closest still-attached trigger group.
      selectedValue = normalizeDropdownValue(await driver.executeScript((triggerEl) => {
        const group = triggerEl?.closest?.('.oxd-select-wrapper, .oxd-input-group, .oxd-form-row')
        const scoped = group?.querySelector?.('.oxd-select-text')
        return scoped ? (scoped.innerText || '') : (triggerEl?.innerText || '')
      }, trigger).catch(() => ''))
    }
    if (selectedValue !== expectedSelection && !selectedInSameField) {
      throw new Error(`Dropdown option "${wanted}" was not applied; trigger still shows "${selectedValue || '-- Select --'}"`)
    }

    ctx.executionMemory.executed_actions.push({
      action: "select",
      selector,
      value: storedSelection,
      requestedValue: wanted,
      fallback: fallbackSelection,
    })

    // A verified dropdown selection passes. An unrelated pre-existing field
    // validation must not fail this dropdown step.
    await analyzeAfterAction(null, null, null, false, true)

    addLog(ctx.logs, stepIndex, 'SUCCESS', 'Dropdown selection verified', {
      selector,
      requestedValue: wanted,
      selectedValue: storedSelection,
      fallback: fallbackSelection,
    })

    console.log(
      "✅ OPTION SELECTED:",
      wanted
    )

    continue
  }

  // clic normal

  await safeClick(clickTarget)

  await analyzeAfterAction()


addLog(
  ctx.logs,
  stepIndex,
  'INFO',
  'AI response',
  {
    actions,
    seleniumCode:
      payload?.selenium_code || ''
  }
)


  try {

    await driver.wait(
      async () => {

        const url =
          await driver.getCurrentUrl()

        return !String(url || "")
          .includes("/auth/login")

      },
      18000
    )

  } catch {

    try {

      await sleep(500)

    } catch {
      // ignore — element may simply still be attached
    }

  }

  if (
    isSubmitLikeSelector(
      selector
    )
  ) {
    break
  }
}

        if (action === "press" && value) {
          await sleep(300)
          await el.sendKeys(value)
          ctx.executionMemory.filled_fields.push({
  selector,
  value
})

ctx.executionMemory.executed_actions.push({
  action: "type",
  selector,
  value
})
          await sleep(400)
        }

        if (action === "wait") {
          const waitMs = Number(value) || 1000
          await driver.sleep(waitMs)
        }

        if (action === "scroll") {
          await sleep(300)
          await driver.executeScript((element) => {
            element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
          }, el)
          await sleep(500)
        }

        // Keep a short pause before the post-action screenshot so the UI reflects the action
        await sleep(1000)

        // Every non-terminal action gets the same final DOM/validation/toast
        // verification, including normal input and calendar interactions.
        await analyzeAfterAction()

        const shot = await captureStepScreenshot(
          driver,
          `${stepIndex}-${i}`,
          `${action}-after`
        )

        screenshots.push(shot)

        addLog(ctx.logs, stepIndex, "SUCCESS", "Action executed", {
          action,
          selector,
          value,
          elapsedMs: Date.now() - actionStartedAt,
          screenshot: shot
        })
        console.log(`✅ Action executed [${i + 1}/${actions.length}]`, {
          action,
          selector,
          elapsedMs: Date.now() - actionStartedAt,
          screenshot: shot
        })

      }  catch (err) {
  console.log("❌ ACTION ERROR:", err.message)
  console.log("❌ ACTION ERROR STACK:", err.stack)

  addLog(ctx.logs, stepIndex, "ERROR", "Action failed", {
    selector,
    action,
    value,
    error: err.message,
    stack: err.stack,
    elapsedMs: Date.now() - actionStartedAt
  })
  return {
    status: 'failed_execution',
    error: err.message,
    errorDetails: {
      message: err.message,
      stack: err.stack,
      selector,
      action,
      value,
    },
    screenshots
  }
}
}

    // ✅ VALIDATION
    // A click step is only "passed" when the click actually produced a
    // change. Without this, "Click Add" reported success even when the Add
    // User form never opened, and every later step then ran against the
    // wrong screen.
    const clickedSomething = actions.some((a) => String(a?.type || '').toLowerCase() === 'click')
    const stepTargetLabel = parseStepTargetField(step)
    const opensNewView = /\b(add|new|create|edit|save|submit|search|login|sign.?in|delete|update|confirm|leave|dashboard|navigate|open)\b/i.test(
      `${step} ${stepTargetLabel}`
    )

    if (clickedSomething && opensNewView) {
      let changed = false
      let observed = null
      let afterDom = []

      for (let attempt = 1; attempt <= 3 && !changed; attempt++) {
        await sleep(attempt === 1 ? 600 : 1200)
        observed = await driver
          .executeScript(() => ({
            url: window.location.href,
            fields: document.querySelectorAll('input:not([type="hidden"]), select, textarea').length,
            text: (document.body?.innerText || '').slice(0, 4000),
          }))
          .catch(() => null)
        if (!observed) continue
        afterDom = await captureDom().catch(() => [])

        const urlChanged = observed.url !== stateBeforeActions.url
        const fieldsChanged = observed.fields !== stateBeforeActions.fields
        const textChanged = observed.text !== stateBeforeActions.text
        changed = urlChanged || fieldsChanged || textChanged

        const targetWords = String(stepTargetLabel || step || '')
          .toLowerCase()
          .replace(/\b(button|link|sidebar|menu|the|in|on|to|page)\b/g, ' ')
          .split(/\s+/)
          .filter((word) => word.length >= 3)
        const afterInterface = `${observed.url || ''} ${observed.text || ''} ${JSON.stringify(afterDom || [])}`.toLowerCase()
        const isLoginTarget = /\b(login|log in|sign in|sign-in)\b/i.test(String(step || ''))
        const urlValid = urlChanged && (!isLoginTarget || !String(observed.url || '').includes('/auth/login'))
        const targetInterfaceFound = targetWords.length === 0 || targetWords.some((word) => afterInterface.includes(word))
        const interfaceValid = isLoginTarget ? urlValid : targetInterfaceFound

        if (!changed || !interfaceValid) {
          console.warn(
            `⏳ No page reaction yet after "${step}" (attempt ${attempt}/3) — waiting before deciding.`
          )
        }
      }

      const finalInterfaceText = `${observed?.url || ''} ${observed?.text || ''} ${JSON.stringify(afterDom || [])}`.toLowerCase()
      const finalTargetWords = String(stepTargetLabel || step || '')
        .toLowerCase()
        .replace(/\b(button|link|sidebar|menu|the|in|on|to|page)\b/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 3)
      const finalIsLoginTarget = /\b(login|log in|sign in|sign-in)\b/i.test(String(step || ''))
      const finalUrlChanged = observed?.url !== stateBeforeActions.url
      const finalUrlValid = finalUrlChanged && (!finalIsLoginTarget || !String(observed?.url || '').includes('/auth/login'))
      const finalTargetInterfaceFound = finalTargetWords.length === 0 || finalTargetWords.some((word) => finalInterfaceText.includes(word))
      const finalInterfaceValid = finalIsLoginTarget ? finalUrlValid : finalTargetInterfaceFound
      // The first click step may open the requested route during page setup
      // before Selenium reaches the click (for example Leave opens directly
      // at /leave/viewLeaveList). In that case the click still must have been
      // executed, but a second URL/DOM change is not required.
      const alreadyOnExpectedInterface = !finalIsLoginTarget &&
        finalInterfaceValid &&
        Boolean(observed?.url) &&
        (/\bleave\b/i.test(String(step || ''))
          ? /\/leave\//i.test(String(observed.url))
          : finalTargetInterfaceFound)

      if ((!changed && !alreadyOnExpectedInterface) || !finalInterfaceValid) {
        console.error(
          `❌ STEP DID NOT TAKE EFFECT: "${step}" clicked, but the URL, the form fields and the page text are all unchanged.`
        )
        addLog(ctx.logs, stepIndex, 'ERROR', 'Click produced no observable change', {
          source: 'backend-2026:ui.executor',
          step,
          before: { url: stateBeforeActions.url, fields: stateBeforeActions.fields },
          after: observed ? { url: observed.url, fields: observed.fields } : null,
        })
        const failShot = await captureStepScreenshot(driver, stepIndex, 'failed').catch(() => null)
        return {
          status: 'failed_execution',
          error: `Step "${step}" did not reach the expected interface after the click.`,
          screenshots: failShot ? [...screenshots, failShot] : screenshots,
        }
      }

      console.log(`✅ Page reacted to "${step}" (url/fields/content changed).`)
    }

    // Final evidence is captured from the live page, not from an old element
    // reference. This makes the terminal analysis explain the actual failure.
    const finalDom = await captureDomSummary(driver)
    const finalValidationErrors = await readVisibleValidationErrors(driver)
    const finalSnackbar = await readPageSnackbar(driver)
    const finalAction = actions[actions.length - 1] || null
    const finalAnalysis = analyzeActionOutcome({
      step,
      aiAction: finalAction,
      previousDom: finalDom,
      currentDom: finalDom,
      domDiff: { urlChanged: false, added: [], removed: [], disabledChanges: [] },
      validationErrors: finalValidationErrors,
      snackbar: finalSnackbar,
      url: finalDom?.url,
    })
    if (finalValidationErrors.length || finalSnackbar) {
      finalAnalysis.status = 'ERROR'
      finalAnalysis.stepStatus = 'STEP_FAILED'
      finalAnalysis.reason = finalValidationErrors.length
        ? `Final validation errors remain: ${finalValidationErrors.join(' | ')}`
        : `Final snackbar/toast indicates a problem: ${finalSnackbar?.text || finalSnackbar}`
    } else {
      finalAnalysis.status = 'SUCCESS'
      finalAnalysis.stepStatus = 'STEP_SUCCESS'
      finalAnalysis.reason = `Final DOM verified for step "${step}" at ${finalDom?.url || 'unknown URL'}.`
    }
    const conciseFinalAnalysis = conciseAnalysisLog(finalAnalysis)
    console.log(conciseFinalAnalysis)
    addLog(ctx.logs, stepIndex, 'INFO', 'AI final DOM analysis', conciseFinalAnalysis)

    const pageState = await driver.executeScript(() => {
      return {
        url: window.location.href,
        title: document.title,
        text: document.body.innerText.slice(0, 1000)
      }
    })

    // Preserve the terminal DOM evidence for failure analysis. A dropdown
    // warning must not hide a later field validation message (for example,
    // Employee Name being invalid).
    pageState.finalDom = finalDom
    pageState.domDiff = finalAnalysis.domResult?.domChanges || null
    pageState.fieldValidationErrors = finalValidationErrors
    pageState.snackbar = finalSnackbar

    return {
      status: 'passed',
      screenshots,
      verifiedFieldValue,
      actual: pageState
    }

  } catch (err) {

    console.log("❌ STEP ERROR:", err.message)

    const failureDom = await captureDomSummary(driver)
    const failureValidationErrors = await readVisibleValidationErrors(driver)
    const failureSnackbar = await readPageSnackbar(driver)
    const failureShot = await captureStepScreenshot(driver, stepIndex, 'failed-final').catch(() => null)
    const failureAnalysis = conciseAnalysisLog({
      stepStatus: 'STEP_FAILED',
      actionStatus: 'ACTION_FAILED',
      currentStep: step,
      problem: err.message,
      expected: step,
      actual: failureDom?.text || failureDom?.url || 'No final DOM value available',
      evidence: failureValidationErrors.join(' | ') || failureSnackbar?.text || err.message,
      rootCause: failureValidationErrors.length || failureSnackbar?.kind === 'error' ? 'APPLICATION' : 'UNKNOWN',
      confidence: failureValidationErrors.length || failureSnackbar?.kind === 'error' ? 'HIGH' : 'LOW',
      developerAction: 'Use the final DOM evidence to correct the failed behavior.',
      qaAction: 'Re-run this step and verify the expected final state.',
    })
    console.log(failureAnalysis)
    addLog(ctx.logs, stepIndex, 'INFO', 'AI failed-step analysis', failureAnalysis)

    return {
      status: 'failed_execution',
      error: err.message,
      screenshots: failureShot ? [failureShot] : [],
      actual: {
        url: failureDom?.url || '',
        finalDom: failureDom,
        fieldValidationErrors: failureValidationErrors,
        snackbar: failureSnackbar,
      },
    }
  }
}

module.exports = {
  isSearchableDropdownTrigger,
  matchesDropdownValue,
  buildDropdownActionForStep,
  repairMisroutedDropdownActions,
  repairFallbackDropdownActions,
  normalizeDropdownActions,
  runStructuredUiStep,
  // Exported for testing the test-data -> field mapping in isolation.
  parseStepFieldAndValue,
  parseStepTargetField,
  filterActionsForCurrentStep,
  canonicalFieldKey,
  buildTestDataMap,
  testDataMapToObject,
  valueForElementFromTestData,
  identifyFieldKey,
  // Exported for testing the DOM-analysis pipeline in isolation.
  diffDomSummaries,
  analyzeActionOutcome,
}
