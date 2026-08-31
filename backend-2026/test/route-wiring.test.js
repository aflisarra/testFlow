const assert = require('node:assert/strict')
const test = require('node:test')

const internalRouter = require('../src/routes/spec-ingestion-internal.routes')
const testSuiteRouter = require('../src/routes/testsuite.routes')

function routeLayers(router) {
  return router.stack.filter((layer) => layer.route)
}

function route(router, path, method) {
  return routeLayers(router).find((layer) => (
    layer.route.path === path && layer.route.methods[method]
  ))
}

function handlerNames(layer) {
  return layer.route.stack.map((handler) => handler.handle.name)
}

test('all internal ingestion routes are behind the shared-token middleware', () => {
  assert.equal(internalRouter.stack[0].name, 'requireInternalToken')
  assert.deepEqual(
    routeLayers(internalRouter).map((layer) => [
      layer.route.path,
      Object.keys(layer.route.methods)[0],
      handlerNames(layer)[0],
    ]),
    [
      ['/spec-ingestions/:specHash', 'put', 'replace'],
      ['/spec-ingestions/:specHash/review-queue', 'get', 'pendingReview'],
      ['/spec-ingestions/:specHash/items/:itemId/review', 'patch', 'resolveReview'],
      ['/spec-ingestions/:specHash/module-generation/claim', 'post', 'claimModuleGeneration'],
      ['/spec-ingestions/:specHash/module-generation/:lease', 'put', 'commitModuleGeneration'],
      ['/spec-ingestions/:specHash/module-generation/:lease/fail', 'post', 'failModuleGeneration'],
      ['/spec-ingestions/:specHash', 'get', 'get'],
    ]
  )
})

test('suite review routes use suite access and the Node review controller', () => {
  assert.equal(testSuiteRouter.stack[0].name, 'authenticateUser')
  assert.deepEqual(handlerNames(route(testSuiteRouter, '/:id/role-reviews', 'get')), [
    'requireTestSuiteAccess', 'list',
  ])
  assert.deepEqual(handlerNames(route(testSuiteRouter, '/:id/role-reviews/:itemId', 'patch')), [
    'requireTestSuiteAccess', 'resolve',
  ])
  assert.deepEqual(handlerNames(route(testSuiteRouter, '/:id/role-reviews/:itemId', 'delete')), [
    'requireTestSuiteAccess', 'dismiss',
  ])
  assert.deepEqual(handlerNames(route(testSuiteRouter, '/:id/spec-items', 'get')), [
    'requireTestSuiteAccess', 'listAll',
  ])
})
