const SpecIngestion = require('../models/spec-ingestion.model')
const SpecIngestionItem = require('../models/spec-ingestion-item.model')
const { ROLE_LABELS, ROLE_METHODS } = require('../models/spec-ingestion-item.model')

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
  return {
    specHash,
    itemId: text(raw?.id ?? raw?.item_id, 'item id'),
    sourceChunkId: text(raw?.source_chunk_id ?? raw?.sourceChunkId, 'source_chunk_id'),
    headingPath: Array.isArray(path) ? path.map(String) : [],
    text: text(raw?.text, 'item text'),
    role: String(raw?.role || 'UNTAGGED').trim().toUpperCase(),
    roleMethod: String(raw?.role_method ?? raw?.roleMethod ?? 'none').trim(),
    roleScore: numberOr(raw?.role_score ?? raw?.roleScore),
    module: String(raw?.module || 'UNTAGGED').trim() || 'UNTAGGED',
    moduleScore: numberOr(raw?.module_score ?? raw?.moduleScore, 0),
    reviewed: Boolean(raw?.reviewed),
    reviewedBy: raw?.reviewed_by ?? raw?.reviewedBy ?? null,
    // Phase 5a intentionally has no automated suggestion path.
    suggestedRole: null,
    requirementId: raw?.requirement_id ?? raw?.requirementId ?? null,
  }
}

function asModule(raw, itemIds) {
  const source = raw?.source_item_ids ?? raw?.sourceItemIds
  const source_item_ids = Array.isArray(source) ? source.map(String).filter((id) => itemIds.has(id)) : []
  const name = text(raw?.name, 'module name')
  if (!source_item_ids.length) throw inputError(`Module ${name} has no valid source item IDs`)
  return { name, description: text(raw?.description, 'module description'), source_item_ids }
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
    module_score: item.moduleScore,
    reviewed: item.reviewed,
    reviewed_by: item.reviewedBy,
    suggested_role: item.suggestedRole,
    requirement_id: item.requirementId,
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
  const modules = rawModules.map((module) => asModule(module, itemIds))

  await SpecIngestion.findOneAndUpdate(
    { specHash: hash },
    { $set: { status: 'writing' }, $setOnInsert: { specHash: hash } },
    { upsert: true, new: true, runValidators: true }
  )
  try {
    if (items.length) {
      await SpecIngestionItem.bulkWrite(items.map((item) => ({
        updateOne: { filter: { specHash: hash, itemId: item.itemId }, update: { $set: item }, upsert: true },
      })), { ordered: true })
    }
    await SpecIngestionItem.deleteMany(itemIds.size ? { specHash: hash, itemId: { $nin: [...itemIds] } } : { specHash: hash })
    await SpecIngestion.updateOne({ specHash: hash }, { $set: { status: 'ready', itemCount: items.length, modules } }, { runValidators: true })
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
  return { items: items.map(serialize), modules: ingestion.modules || [] }
}

async function getPendingReview(specHash) {
  const ingestion = await readyIngestion(specHash)
  if (!ingestion) return null
  const items = await SpecIngestionItem.find({ specHash: ingestion.specHash, role: 'UNTAGGED', reviewed: false }).sort({ itemId: 1 }).lean()
  return items.map(serialize)
}

async function resolveReview(specHash, itemId, role, reviewer = null) {
  const ingestion = await readyIngestion(specHash)
  if (!ingestion) return null
  const resolvedRole = String(role || '').trim().toUpperCase()
  if (!ROLE_LABELS.includes(resolvedRole) || resolvedRole === 'UNTAGGED') throw inputError('Invalid review role')
  const id = text(itemId, 'item id')
  const item = await SpecIngestionItem.findOneAndUpdate(
    { specHash: ingestion.specHash, itemId: id },
    { $set: {
      role: resolvedRole,
      roleMethod: 'human',
      roleScore: null,
      reviewed: true,
      reviewedBy: reviewer ? String(reviewer).trim() || null : null,
      suggestedRole: null,
      requirementId: resolvedRole === 'REQUIREMENT' ? `REQ-${id.replace(/^ITEM-/, '')}` : null,
    } },
    { new: true, runValidators: true }
  ).lean()
  return item ? serialize(item) : null
}

module.exports = { replaceSnapshot, getSnapshot, getPendingReview, resolveReview }
