const mongoose = require('mongoose')
const TestCase = require('../models/testcase.model')
const TestExecution = require('../models/TestExecution.model')

const PASSED_STATUSES = new Set(['passed'])
const FAILED_STATUSES = new Set([
  'failed',
  'failed_execution',
  'failed_assertion',
  'aborted',
  'blocked',
  'skipped',
])

function makeError(message, statusCode = 400, details = {}) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.details = details
  return error
}

function stringifyRef(value) {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.id || value.testCaseId || '').trim()
  }
  return String(value).trim()
}

function normalizeDependsOnInput(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .map(stringifyRef)
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
}

function getDependsOnRefs(source = {}) {
  if (Object.prototype.hasOwnProperty.call(source, 'dependsOn')) {
    return normalizeDependsOnInput(source.dependsOn)
  }
  if (Object.prototype.hasOwnProperty.call(source, 'dependencies')) {
    return normalizeDependsOnInput(source.dependencies)
  }
  return null
}

function caseObjectId(testCase) {
  return stringifyRef(testCase?._id || testCase?.testCaseId)
}

function caseBusinessId(testCase) {
  return stringifyRef(testCase?.id || testCase?.testCaseKey)
}

function caseTitle(testCase) {
  return String(testCase?.title || testCase?.testCaseTitle || caseBusinessId(testCase) || caseObjectId(testCase)).trim()
}

function caseKeys(testCase) {
  return [caseObjectId(testCase), caseBusinessId(testCase)].filter(Boolean)
}

function sameCase(testCase, ref) {
  const id = stringifyRef(ref)
  return Boolean(id && caseKeys(testCase).includes(id))
}

function buildCaseIndex(testCases = []) {
  const byKey = new Map()
  for (const testCase of testCases) {
    for (const key of caseKeys(testCase)) {
      byKey.set(key, testCase)
    }
  }
  return byKey
}

function resolveCase(testCases, ref) {
  return buildCaseIndex(testCases).get(stringifyRef(ref)) || null
}

function resolveDependencyCases(testCases, dependencyRefs, currentCase) {
  const byKey = buildCaseIndex(testCases)
  const resolved = []
  for (const ref of normalizeDependsOnInput(dependencyRefs)) {
    const dependency = byKey.get(ref)
    if (!dependency) {
      // AI output can contain a plan reference (for example TP-1) or a
      // stale reference. Treat it as no dependency instead of rejecting the
      // whole test case; only real Test Case references are persisted.
      continue
    }
    if (sameCase(currentCase, ref) || caseObjectId(dependency) === caseObjectId(currentCase)) {
      throw makeError('A test case cannot depend on itself.', 400, {
        testCaseId: caseBusinessId(currentCase) || caseObjectId(currentCase),
      })
    }
    resolved.push(dependency)
  }
  return resolved
}

function dependencyIds(testCase) {
  return normalizeDependsOnInput(testCase?.dependsOn).map((ref) => stringifyRef(ref))
}

function assertNoCircularDependencies(testCases = [], overrides = new Map()) {
  const byMongoId = new Map(testCases.map((testCase) => [caseObjectId(testCase), testCase]).filter(([id]) => id))
  const visiting = new Set()
  const visited = new Set()

  function visit(testCase, path = []) {
    const mongoId = caseObjectId(testCase)
    if (!mongoId) return
    if (visiting.has(mongoId)) {
      const cycle = [...path, caseBusinessId(testCase) || mongoId].filter(Boolean)
      throw makeError('Circular dependency detected. Please verify the dependencies between the selected Test Cases.', 400, {
        cycle,
      })
    }
    if (visited.has(mongoId)) return

    visiting.add(mongoId)
    const deps = overrides.has(mongoId) ? overrides.get(mongoId) : dependencyIds(testCase)
    for (const depId of deps || []) {
      const dep = byMongoId.get(stringifyRef(depId))
      if (dep) visit(dep, [...path, caseBusinessId(testCase) || mongoId])
    }
    visiting.delete(mongoId)
    visited.add(mongoId)
  }

  for (const testCase of testCases) {
    visit(testCase)
  }
}

function buildExecutionOrderFromCases(testCases = [], selectedRefs = [], { includeDependencies = false } = {}) {
  const byKey = buildCaseIndex(testCases)
  const selected = normalizeDependsOnInput(selectedRefs).map((ref) => byKey.get(ref)).filter(Boolean)
  const selectedIds = new Set(selected.map(caseObjectId).filter(Boolean))
  const includedIds = new Set(selectedIds)
  const ordered = []
  const visiting = new Set()
  const visited = new Set()

  function visit(testCase) {
    const mongoId = caseObjectId(testCase)
    if (!mongoId) return
    if (visiting.has(mongoId)) {
      throw makeError('Circular dependency detected. Please verify the dependencies between the selected Test Cases.', 400)
    }
    if (visited.has(mongoId)) return

    visiting.add(mongoId)
    for (const depRef of dependencyIds(testCase)) {
      const dependency = byKey.get(depRef)
      if (!dependency) {
        throw makeError(`Dependency "${depRef}" does not reference a valid test case.`, 400, {
          missingDependency: depRef,
        })
      }
      const depMongoId = caseObjectId(dependency)
      if (includeDependencies || selectedIds.has(depMongoId)) {
        includedIds.add(depMongoId)
        visit(dependency)
      }
    }
    visiting.delete(mongoId)
    visited.add(mongoId)
    if (includedIds.has(mongoId)) ordered.push(testCase)
  }

  for (const testCase of selected) visit(testCase)
  return ordered
}

async function loadSuiteCases(testSuiteId) {
  const id = stringifyRef(testSuiteId)
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Valid testSuiteId is required.', 400)
  }
  return TestCase.find({ testSuiteId: id }).sort({ createdAt: 1 }).lean()
}

async function normalizeDependsOnForPersistence({ testSuiteId, currentCase, dependsOn }) {
  const testCases = await loadSuiteCases(testSuiteId)
  const current =
    currentCase && caseObjectId(currentCase)
      ? currentCase
      : resolveCase(testCases, currentCase?._id || currentCase?.id || currentCase)

  if (!current) {
    throw makeError('TestCase not found for dependency validation.', 404)
  }

  const dependencies = resolveDependencyCases(testCases, dependsOn, current)
  const overrides = new Map([[caseObjectId(current), dependencies.map(caseObjectId)]])
  assertNoCircularDependencies(testCases, overrides)
  return dependencies.map((dependency) => new mongoose.Types.ObjectId(caseObjectId(dependency)))
}

async function applyGeneratedDependencies({ testSuiteId, generatedCases = [] }) {
  const dependencyRows = (Array.isArray(generatedCases) ? generatedCases : [])
    .map((testCase) => ({
      id: stringifyRef(testCase?.id),
      dependsOn: getDependsOnRefs(testCase) || [],
    }))
    .filter((row) => row.id)

  if (!dependencyRows.length) return

  const testCases = await loadSuiteCases(testSuiteId)
  const byKey = buildCaseIndex(testCases)
  const overrides = new Map()

  for (const row of dependencyRows) {
    const current = byKey.get(row.id)
    if (!current) continue
    const dependencies = resolveDependencyCases(testCases, row.dependsOn, current)
    overrides.set(caseObjectId(current), dependencies.map(caseObjectId))
  }

  assertNoCircularDependencies(testCases, overrides)

  const ops = []
  for (const row of dependencyRows) {
    const current = byKey.get(row.id)
    if (!current) continue
    ops.push({
      updateOne: {
        filter: { _id: current._id },
        update: {
          $set: {
            dependsOn: (overrides.get(caseObjectId(current)) || []).map((id) => new mongoose.Types.ObjectId(id)),
          },
        },
      },
    })
  }

  if (ops.length) await TestCase.bulkWrite(ops, { ordered: false })
}

async function getLatestExecutionStatuses(testSuiteId, testCases = []) {
  const mongoIds = testCases
    .map(caseObjectId)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id))
  const businessIds = testCases.map(caseBusinessId).filter(Boolean)

  const rows = await TestExecution.find({
    testSuiteId,
    $or: [
      { testCaseId: { $in: mongoIds } },
      { testCaseKey: { $in: businessIds } },
    ],
  })
    .sort({ startedAt: -1, createdAt: -1 })
    .lean()

  const statuses = new Map()
  for (const row of rows) {
    const keys = [stringifyRef(row.testCaseId), stringifyRef(row.testCaseKey)].filter(Boolean)
    for (const key of keys) {
      if (!statuses.has(key)) statuses.set(key, String(row.status || 'not_executed').toLowerCase())
    }
  }
  return statuses
}

async function validateExecutionDependencies({ testSuiteId, selectedCaseIds = [], includeDependencies = false }) {
  const testCases = await loadSuiteCases(testSuiteId)
  assertNoCircularDependencies(testCases)

  const selectedRefs = normalizeDependsOnInput(selectedCaseIds)
  if (!selectedRefs.length) {
    throw makeError('At least one test case is required for dependency validation.', 400)
  }

  const byKey = buildCaseIndex(testCases)
  const selectedCases = selectedRefs.map((ref) => byKey.get(ref)).filter(Boolean)
  if (selectedCases.length !== selectedRefs.length) {
    const missing = selectedRefs.find((ref) => !byKey.get(ref))
    throw makeError(`Test case "${missing}" not found.`, 404)
  }

  const executionOrder = buildExecutionOrderFromCases(testCases, selectedRefs, { includeDependencies })
  const selectedMongoIds = new Set(executionOrder.map(caseObjectId))
  const statuses = await getLatestExecutionStatuses(testSuiteId, testCases)
  const missing = []
  const failed = []

  for (const testCase of executionOrder) {
    for (const depRef of dependencyIds(testCase)) {
      const dependency = byKey.get(depRef)
      if (!dependency) {
        throw makeError(`Dependency "${depRef}" does not reference a valid test case.`, 400)
      }
      const depId = caseObjectId(dependency)
      if (selectedMongoIds.has(depId)) continue

      const status = statuses.get(depId) || statuses.get(caseBusinessId(dependency)) || 'not_executed'
      if (PASSED_STATUSES.has(status)) continue
      const item = {
        id: caseBusinessId(dependency),
        _id: depId,
        title: caseTitle(dependency),
        requiredBy: caseTitle(testCase),
        status,
      }
      if (FAILED_STATUSES.has(status)) failed.push(item)
      else missing.push(item)
    }
  }

  const blocked = missing[0] || failed[0] || null
  return {
    allowed: !blocked,
    message: blocked
      ? failed.length
        ? `Cannot execute "${blocked.requiredBy}". Dependency "${blocked.title}" failed.`
        : `Cannot execute "${blocked.requiredBy}". Required test "${blocked.title}" has not been executed.`
      : '',
    missing,
    failed,
    executionOrder: executionOrder.map((testCase) => ({
      _id: caseObjectId(testCase),
      id: caseBusinessId(testCase),
      title: caseTitle(testCase),
      dependsOn: dependencyIds(testCase),
    })),
  }
}

module.exports = {
  normalizeDependsOnInput,
  getDependsOnRefs,
  normalizeDependsOnForPersistence,
  applyGeneratedDependencies,
  validateExecutionDependencies,
  buildExecutionOrderFromCases,
  assertNoCircularDependencies,
  caseObjectId,
  caseBusinessId,
  caseTitle,
}
