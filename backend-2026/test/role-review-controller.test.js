const assert = require('node:assert/strict')
const test = require('node:test')

const { toReviewItem, toResolvedReviewItem } = require('../src/controllers/role-review.controller')

test('role-review response exposes heading context and hides a null suggestion', () => {
  const item = toReviewItem({
    id: 'ITEM-00042',
    text: 'The system must support search.',
    heading_path: ['Requirements', 'Search'],
    suggested_role: null,
  })

  assert.deepEqual(item, {
    itemId: 'ITEM-00042',
    text: 'The system must support search.',
    headingPath: ['Requirements', 'Search'],
    nearestHeading: 'Search',
    suggestedRole: null,
  })
})

test('role-review resolution response exposes the durable human outcome', () => {
  const item = toResolvedReviewItem({
    id: 'ITEM-00042', text: 'User details.', heading_path: ['Users'],
    role: 'ACTOR', role_method: 'human', reviewed: true, review_state: 'resolved',
  })

  assert.equal(item.role, 'ACTOR')
  assert.equal(item.roleMethod, 'human')
  assert.equal(item.reviewed, true)
  assert.equal(item.reviewState, 'resolved')
})
