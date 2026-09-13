const request = require('supertest');
const app = require('../src/index');
const test = require('node:test');
const assert = require('assert');

test('POST /api/ai/detect-failure valid payload returns 200', async (t) => {
  const payload = { failed_step: { id: '1', name: 'Login' }, logs: [] };
  const response = await request(app)
    .post('/api/ai/detect-failure')
    .send(payload)
    .set('Accept', 'application/json');
  assert.strictEqual(response.status, 200);
  assert.ok(response.body.success);
  assert.ok(response.body.data);
  assert.ok(response.body.data.title);
  assert.ok(response.body.data.actionText);
});

test('POST /api/ai/detect-failure missing payload returns 400', async (t) => {
  const response = await request(app)
    .post('/api/ai/detect-failure')
    .send({})
    .set('Accept', 'application/json');
  assert.strictEqual(response.status, 400);
  assert.ok(response.body.message);
});

