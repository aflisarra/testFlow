const VALID_HASH = 'a'.repeat(64)

function specItem(overrides = {}) {
  return {
    id: 'ITEM-00001',
    source_chunk_id: 'CHUNK-001',
    heading_path: ['Requirements', 'Accounts'],
    text: 'The user can sign in.',
    role: 'REQUIREMENT',
    role_method: 'regex',
    role_score: 0.95,
    module: 'UNTAGGED',
    module_ids: [],
    primary_module_id: null,
    module_method: 'none',
    module_score: null,
    module_margin: null,
    module_disposition: 'unassigned',
    reviewed: false,
    review_state: 'resolved',
    requirement_id: 'REQ-00001',
    ...overrides,
  }
}

function moduleCard(overrides = {}) {
  return {
    id: 'MOD-001',
    name: 'Accounts',
    description: 'Account access and identity.',
    kind: 'functional',
    source_item_ids: ['ITEM-00001'],
    ...overrides,
  }
}

function assignment(overrides = {}) {
  return {
    item_id: 'ITEM-00001',
    module_ids: ['MOD-001'],
    primary_module_id: 'MOD-001',
    module_method: 'hybrid',
    module_score: 0.91,
    module_margin: 0.24,
    module_disposition: 'assigned',
    ...overrides,
  }
}

module.exports = { VALID_HASH, assignment, moduleCard, specItem }
