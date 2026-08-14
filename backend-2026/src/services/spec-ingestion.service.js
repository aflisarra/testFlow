const crypto = require('crypto')
const SpecIngestion = require('../models/spec-ingestion.model')
const SpecIngestionItem = require('../models/spec-ingestion-item.model')
const {
  ROLE_LABELS,
  ROLE_METHODS,
  MODULE_METHODS,
  MODULE_DISPOSITIONS,
} = require('../models/spec-ingestion-item.model')

const MODULE_LEASE_TTL_MS = 10 * 60 * 1000

function inputError(message, statusCode = 422) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function text(value, field) {
  const result = String(value || '').trim()
  if (!result) throw inputError(`${field} is required`)
  return result
}

function specHash(value) {
  const hash = text(value, 'spec hash').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(hash)) throw inputError('spec hash must be a sha256 hex digest')
  return hash
}

function numberOr(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function asItem(specHash, raw) {
  const path = raw?.heading_path ?? raw?.headingPath
  const role = String(raw?.role || 'UNTAGGED').trim().toUpperCase()
  const reviewed = Boolean(raw?.reviewed)
  const requestedReviewState = String(raw?.review_state ?? raw?.reviewState ?? '').trim().toLowerCase()
  const reviewState = ['pending', 'resolved', 'dismissed'].includes(requestedReviewState)
    ? requestedReviewState
    : (reviewed || role !== 'UNTAGGED' ? 'resolved' : 'pending')
  return {
    specHash,
    itemId: text(raw?.id ?? raw?.item_id, 'item id'),
    sourceChunkId: text(raw?.source_chunk_id ?? raw?.sourceChunkId, 'source_chunk_id'),
    headingPath: Array.isArray(path) ? path.map(String) : [],
    text: text(raw?.text, 'item text'),
    role,
    roleMethod: String(raw?.role_method ?? raw?.roleMethod ?? 'none').trim(),
    roleScore: numberOr(raw?.role_score ?? raw?.roleScore),
    module: String(raw?.module || 'UNTAGGED').trim() || 'UNTAGGED',
    moduleIds: Array.isArray(raw?.module_ids ?? raw?.moduleIds)
      ? (raw.module_ids ?? raw.moduleIds).map(String).filter(Boolean)
      : [],
    primaryModuleId: raw?.primary_module_id ?? raw?.primaryModuleId ?? null,
    moduleMethod: String(raw?.module_method ?? raw?.moduleMethod ?? 'none').trim(),
    moduleScore: numberOr(raw?.module_score ?? raw?.moduleScore),
    moduleMargin: numberOr(raw?.module_margin ?? raw?.moduleMargin),
    moduleDisposition: String(raw?.module_disposition ?? raw?.moduleDisposition ?? 'unassigned').trim(),
    moduleAlgorithmVersion: raw?.module_algorithm_version ?? raw?.moduleAlgorithmVersion ?? null,
    reviewed,
    reviewedBy: raw?.reviewed_by ?? raw?.reviewedBy ?? null,
    reviewState,
    dismissedAt: raw?.dismissed_at ?? raw?.dismissedAt ?? null,
    dismissedBy: raw?.dismissed_by ?? raw?.dismissedBy ?? null,
    dismissalReason: raw?.dismissal_reason ?? raw?.dismissalReason ?? null,
    // Phase 5a intentionally has no automated suggestion path.
    suggestedRole: null,
    requirementId: raw?.requirement_id ?? raw?.requirementId ?? null,
  }
}

function asModule(raw, itemIds, index = 0) {
  const source = raw?.source_item_ids ?? raw?.sourceItemIds
  const source_item_ids = Array.isArray(source) ? source.map(String).filter((id) => itemIds.has(id)) : []
  const name = text(raw?.name, 'module name')
  if (!source_item_ids.length) throw inputError(`Module ${name} has no valid source item IDs`)
  const id = String(raw?.id || raw?.module_id || `MOD-${String(index + 1).padStart(3, '0')}`).trim()
  const kind = String(raw?.kind || 'functional').trim().toLowerCase()
  if (!['functional', 'quality'].includes(kind)) throw inputError(`Module ${name} has an invalid kind`)
  return { id, name, description: text(raw?.description, 'module description'), kind, source_item_ids }
}

function serialize(item) {
  return {
    id: item.itemId,
    source_chunk_id: item.sourceChunkId,
    heading_path: item.headingPath,
    text: item.text,
    role: item.role,
    role_method: item.roleMethod,
    role_score: item.roleScore,
    module: item.module,
    module_ids: item.moduleIds || [],
    primary_module_id: item.primaryModuleId,
    module_method: item.moduleMethod,
    module_score: item.moduleScore,
    module_margin: item.moduleMargin,
    module_disposition: item.moduleDisposition,
    module_algorithm_version: item.moduleAlgorithmVersion,
    reviewed: item.reviewed,
    reviewed_by: item.reviewedBy,
    review_state: item.reviewState,
    dismissed_at: item.dismissedAt,
    dismissed_by: item.dismissedBy,
    dismissal_reason: item.dismissalReason,
    suggested_role: item.suggestedRole,
    requirement_id: item.requirementId,
  }
}

function pendingReviewFilter(specHash) {
  return {
    specHash,
    role: 'UNTAGGED',
    reviewed: false,
    $or: [
      { reviewState: 'pending' },
      // Legacy documents are pending until the R1 migration is run.
      { reviewState: { $exists: false } },
    ],
  }
}

async function replaceSnapshot(rawSpecHash, rawItems, rawModules) {
  const hash = specHash(rawSpecHash)
  if (!Array.isArray(rawItems) || !Array.isArray(rawModules)) throw inputError('items and modules must be arrays')
  if (rawModules.length > 12) throw inputError('At most 12 modules are allowed')
  const items = rawItems.map((item) => asItem(hash, item))
  const itemIds = new Set(items.map((item) => item.itemId))
  if (itemIds.size !== items.length) throw inputError('item IDs must be unique within a spec')
  if (items.some((item) => !ROLE_LABELS.includes(item.role))) throw inputError('Invalid item role')
  if (items.some((item) => !ROLE_METHODS.includes(item.roleMethod))) throw inputError('Invalid item role method')
  const modules = rawModules.map((module, index) => asModule(module, itemIds, index))

  await SpecIngestion.findOneAndUpdate(
    { specHash: hash },
    { $set: { status: 'writing' }, $setOnInsert: { specHash: hash } },
    { upsert: true, new: true, runValidators: true }
  )
  try {
    if (items.length) {
      const existingItems = await SpecIngestionItem.find({
        specHash: hash,
        itemId: { $in: [...itemIds] },
        $or: [{ reviewed: true }, { reviewState: 'dismissed' }],
      }).lean()
      const existingById = new Map(existingItems.map((item) => [item.itemId, item]))

      // Re-ingesting identical bytes must not erase a human role decision or
      // a dismissal. The deterministic source fields can refresh, but the
      // review outcome remains durable.
      for (const item of items) {
        const existing = existingById.get(item.itemId)
        if (!existing) continue
        if (existing.reviewed && existing.roleMethod === 'human') {
          item.role = existing.role
          item.roleMethod = existing.roleMethod
          item.roleScore = existing.roleScore
          item.reviewed = true
          item.reviewedBy = existing.reviewedBy
          item.reviewState = 'resolved'
          item.requirementId = existing.requirementId
        } else if (existing.reviewState === 'dismissed') {
          item.reviewState = 'dismissed'
          item.dismissedAt = existing.dismissedAt
          item.dismissedBy = existing.dismissedBy
          item.dismissalReason = existing.dismissalReason
        }
      }

      await SpecIngestionItem.bulkWrite(items.map((item) => ({
        updateOne: { filter: { specHash: hash, itemId: item.itemId }, update: { $set: item }, upsert: true },
      })), { ordered: true })
    }
    await SpecIngestionItem.deleteMany(itemIds.size ? { specHash: hash, itemId: { $nin: [...itemIds] } } : { specHash: hash })
    await SpecIngestion.updateOne(
      { specHash: hash },
      { $set: {
        status: 'ready',
        itemCount: items.length,
        modules,
        moduleStatus: modules.length ? 'ready' : 'pending',
        moduleGenerationError: null,
      } },
      { runValidators: true }
    )
  } catch (error) {
    await SpecIngestion.updateOne({ specHash: hash }, { $set: { status: 'failed' } })
    throw error
  }
}

async function readyIngestion(rawSpecHash) {
  return SpecIngestion.findOne({ specHash: specHash(rawSpecHash), status: 'ready' }).lean()
}

async function getSnapshot(specHash) {
  const ingestion = await readyIngestion(specHash)
  if (!ingestion) return null
  const items = await SpecIngestionItem.find({ specHash: ingestion.specHash }).sort({ itemId: 1 }).lean()
  return {
    items: items.map(serialize),
    modules: ingestion.modules || [],
    module_status: ingestion.moduleStatus || ((ingestion.modules || []).length ? 'ready' : 'pending'),
    module_version: Number(ingestion.moduleVersion || 0),
    module_algorithm_version: ingestion.moduleAlgorithmVersion || null,
    module_evidence_fingerprint: ingestion.moduleEvidenceFingerprint || null,
    module_coverage: ingestion.moduleCoverageSummary || {},
  }
}

async function claimModuleGeneration(rawSpecHash, options = {}) {
  const hash = specHash(rawSpecHash)
  const fingerprint = text(options.fingerprint, 'module evidence fingerprint')
  const algorithmVersion = text(options.algorithmVersion, 'module algorithm version')
  const force = Boolean(options.force)
  const existing = await readyIngestion(hash)
  if (!existing) return null

  const reusable = !force
    && ['ready', 'needs_review'].includes(String(existing.moduleStatus || ''))
    && Array.isArray(existing.modules)
    && existing.modules.length > 0
    && existing.moduleEvidenceFingerprint === fingerprint
    && existing.moduleAlgorithmVersion === algorithmVersion

  if (reusable) {
    return {
      claimed: false,
      reused: true,
      in_progress: false,
      module_status: existing.moduleStatus,
      module_version: Number(existing.moduleVersion || 0),
      modules: existing.modules,
      module_coverage: existing.moduleCoverageSummary || {},
    }
  }

  const lease = crypto.randomUUID()
  const staleBefore = new Date(Date.now() - MODULE_LEASE_TTL_MS)
  const claimed = await SpecIngestion.findOneAndUpdate(
    {
      specHash: hash,
      status: 'ready',
      $or: [
        { moduleStatus: { $ne: 'generating' } },
        { moduleGenerationStartedAt: { $lt: staleBefore } },
        { moduleGenerationStartedAt: null },
      ],
    },
    { $set: {
      moduleStatus: 'generating',
      moduleGenerationLease: lease,
      moduleGenerationStartedAt: new Date(),
      moduleGenerationCompletedAt: null,
      moduleGenerationError: null,
    } },
    { new: true, runValidators: true }
  ).lean()

  if (!claimed) {
    return {
      claimed: false,
      reused: false,
      in_progress: true,
      module_status: 'generating',
      module_version: Number(existing.moduleVersion || 0),
    }
  }

  return {
    claimed: true,
    reused: false,
    in_progress: false,
    lease,
    module_status: 'generating',
    module_version: Number(claimed.moduleVersion || 0),
    previous_modules: existing.modules || [],
  }
}

function assignmentUpdate(raw, moduleNamesById, algorithmVersion) {
  const itemId = text(raw?.item_id ?? raw?.itemId, 'item id')
  const moduleIds = Array.isArray(raw?.module_ids ?? raw?.moduleIds)
    ? (raw.module_ids ?? raw.moduleIds).map(String).filter((id) => moduleNamesById.has(id))
    : []
  const primaryModuleId = String(raw?.primary_module_id ?? raw?.primaryModuleId ?? '').trim() || null
  const safePrimaryId = primaryModuleId && moduleNamesById.has(primaryModuleId) ? primaryModuleId : null
  const moduleMethod = String(raw?.module_method ?? raw?.moduleMethod ?? 'none').trim()
  const moduleDisposition = String(raw?.module_disposition ?? raw?.moduleDisposition ?? 'unassigned').trim()
  if (!MODULE_METHODS.includes(moduleMethod)) throw inputError(`Invalid module method for ${itemId}`)
  if (!MODULE_DISPOSITIONS.includes(moduleDisposition)) throw inputError(`Invalid module disposition for ${itemId}`)
  if (moduleDisposition === 'assigned' && (!safePrimaryId || moduleIds.length !== 1)) {
    throw inputError(`Assigned item ${itemId} must have exactly one primary module`)
  }
  if (moduleDisposition === 'cross_cutting' && moduleIds.length < 2) {
    throw inputError(`Cross-cutting item ${itemId} must reference at least two modules`)
  }
  return {
    itemId,
    fields: {
      moduleIds,
      primaryModuleId: safePrimaryId,
      module: safePrimaryId ? moduleNamesById.get(safePrimaryId) : 'UNTAGGED',
      moduleMethod,
      moduleScore: numberOr(raw?.module_score ?? raw?.moduleScore),
      moduleMargin: numberOr(raw?.module_margin ?? raw?.moduleMargin),
      moduleDisposition,
      moduleAlgorithmVersion: algorithmVersion,
    },
  }
}

async function commitModuleGeneration(rawSpecHash, lease, payload = {}) {
  const hash = specHash(rawSpecHash)
  const token = text(lease, 'module generation lease')
  const algorithmVersion = text(payload.algorithm_version ?? payload.algorithmVersion, 'module algorithm version')
  const fingerprint = text(payload.fingerprint, 'module evidence fingerprint')
  const rawModules = payload.modules
  const rawAssignments = payload.assignments
  if (!Array.isArray(rawModules) || !Array.isArray(rawAssignments)) {
    throw inputError('modules and assignments must be arrays')
  }
  if (rawModules.length > 12) throw inputError('At most 12 modules are allowed')

  const ingestion = await SpecIngestion.findOne({
    specHash: hash,
    status: 'ready',
    moduleStatus: 'generating',
    moduleGenerationLease: token,
  }).lean()
  if (!ingestion) throw inputError('Module generation lease is stale or invalid', 409)

  const storedItems = await SpecIngestionItem.find({ specHash: hash }).select('itemId').lean()
  const itemIds = new Set(storedItems.map((item) => item.itemId))
  const modules = rawModules.map((module, index) => asModule(module, itemIds, index))
  if (!modules.length) throw inputError('At least one valid module is required')
  const moduleNamesById = new Map(modules.map((module) => [module.id, module.name]))
  if (moduleNamesById.size !== modules.length) throw inputError('Module IDs must be unique')
  const assignments = rawAssignments.map((assignment) => assignmentUpdate(assignment, moduleNamesById, algorithmVersion))
  if (new Set(assignments.map((assignment) => assignment.itemId)).size !== assignments.length) {
    throw inputError('Module assignment item IDs must be unique')
  }
  if (assignments.some((assignment) => !itemIds.has(assignment.itemId))) {
    throw inputError('Module assignment references an unknown item')
  }
  if (assignments.length !== itemIds.size) {
    throw inputError('Module commit must include an assignment disposition for every item')
  }

  if (assignments.length) {
    await SpecIngestionItem.bulkWrite(assignments.map((assignment) => ({
      updateOne: {
        filter: { specHash: hash, itemId: assignment.itemId },
        update: { $set: assignment.fields },
      },
    })), { ordered: true })
  }

  const coverage = payload.coverage && typeof payload.coverage === 'object' ? payload.coverage : {}
  const requestedStatus = String(payload.module_status ?? payload.moduleStatus ?? 'ready').trim()
  const moduleStatus = requestedStatus === 'needs_review' ? 'needs_review' : 'ready'
  const completed = await SpecIngestion.findOneAndUpdate(
    { specHash: hash, moduleStatus: 'generating', moduleGenerationLease: token },
    {
      $set: {
        modules,
        moduleStatus,
        moduleAlgorithmVersion: algorithmVersion,
        moduleEvidenceFingerprint: fingerprint,
        moduleCoverageSummary: coverage,
        moduleGenerationCompletedAt: new Date(),
        moduleGenerationError: null,
        moduleGenerationLease: null,
      },
      $inc: { moduleVersion: 1 },
    },
    { new: true, runValidators: true }
  ).lean()
  if (!completed) throw inputError('Module generation lease expired before commit', 409)

  return {
    modules: completed.modules || [],
    module_status: completed.moduleStatus,
    module_version: Number(completed.moduleVersion || 0),
    module_coverage: completed.moduleCoverageSummary || {},
  }
}

async function failModuleGeneration(rawSpecHash, lease, errorMessage = '') {
  const hash = specHash(rawSpecHash)
  const token = text(lease, 'module generation lease')
  const message = String(errorMessage || 'Module generation failed').trim().slice(0, 1000)
  const result = await SpecIngestion.findOneAndUpdate(
    { specHash: hash, moduleStatus: 'generating', moduleGenerationLease: token },
    { $set: {
      moduleStatus: 'failed',
      moduleGenerationError: message,
      moduleGenerationCompletedAt: new Date(),
      moduleGenerationLease: null,
    } },
    { new: true, runValidators: true }
  ).lean()
  return result ? { module_status: result.moduleStatus } : null
}

async function getPendingReview(specHash) {
  const ingestion = await readyIngestion(specHash)
  if (!ingestion) return null
  const items = await SpecIngestionItem.find(pendingReviewFilter(ingestion.specHash)).sort({ itemId: 1 }).lean()
  return items.map(serialize)
}

async function countPendingReview(rawSpecHash) {
  const ingestion = await readyIngestion(rawSpecHash)
  if (!ingestion) return null
  return SpecIngestionItem.countDocuments(pendingReviewFilter(ingestion.specHash))
}

async function resolveReview(specHash, itemId, role, reviewer = null) {
  const ingestion = await readyIngestion(specHash)
  if (!ingestion) return null
  const resolvedRole = String(role || '').trim().toUpperCase()
  if (!ROLE_LABELS.includes(resolvedRole) || resolvedRole === 'UNTAGGED') throw inputError('Invalid review role')
  const id = text(itemId, 'item id')
  const item = await SpecIngestionItem.findOneAndUpdate(
    { ...pendingReviewFilter(ingestion.specHash), itemId: id },
    { $set: {
      role: resolvedRole,
      roleMethod: 'human',
      roleScore: null,
      reviewed: true,
      reviewedBy: reviewer ? String(reviewer).trim() || null : null,
      reviewState: 'resolved',
      dismissedAt: null,
      dismissedBy: null,
      dismissalReason: null,
      suggestedRole: null,
      requirementId: resolvedRole === 'REQUIREMENT' ? `REQ-${id.replace(/^ITEM-/, '')}` : null,
    } },
    { new: true, runValidators: true }
  ).lean()
  if (item && ['CONTEXT', 'FEATURE', 'REQUIREMENT', 'ACCEPTANCE', 'NON_FUNCTIONAL'].includes(resolvedRole)) {
    await SpecIngestion.updateOne(
      { specHash: ingestion.specHash, moduleStatus: { $in: ['ready', 'needs_review', 'failed'] } },
      { $set: { moduleStatus: 'stale' } }
    )
  }
  return item ? serialize(item) : null
}

async function dismissReview(specHash, itemId, reviewer = null, reason = null) {
  const ingestion = await readyIngestion(specHash)
  if (!ingestion) return null
  const id = text(itemId, 'item id')
  const item = await SpecIngestionItem.findOneAndUpdate(
    { ...pendingReviewFilter(ingestion.specHash), itemId: id },
    { $set: {
      reviewState: 'dismissed',
      dismissedAt: new Date(),
      dismissedBy: reviewer ? String(reviewer).trim() || null : null,
      dismissalReason: reason ? String(reason).trim() || null : null,
    } },
    { new: true, runValidators: true }
  ).lean()
  return item ? serialize(item) : null
}

module.exports = {
  replaceSnapshot,
  getSnapshot,
  getPendingReview,
  countPendingReview,
  resolveReview,
  dismissReview,
  pendingReviewFilter,
  claimModuleGeneration,
  commitModuleGeneration,
  failModuleGeneration,
}
