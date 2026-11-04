import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from './bridge.mjs';

test('preserves retry identity and uses authenticated task endpoints', async () => {
  const calls = [];
  const bridge = createBridge({ baseUrl: 'https://ops.example/api', token: 'secret', fetchImpl: async (...args) => {
    calls.push(args); return { ok: true, json: async () => ({ status: 'accepted', request_id: 'r1' }) };
  } });
  const command = { type: 'task.submit', instruction: '巡检', idempotencyKey: 'device-12345678' };
  assert.equal((await bridge(command)).data.status, 'accepted');
  await bridge(command);
  assert.equal(calls[0][1].body, calls[1][1].body);
  assert.equal(calls[0][0], 'https://ops.example/api/im-channels/xiaozhi/tasks');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer secret');
  assert.equal(calls[0][1].redirect, 'error');
});

test('rejects insecure remote API and malformed commands before sending', async () => {
  assert.throws(() => createBridge({ baseUrl: 'http://ops.example/api', token: 'secret' }));
  let calls = 0;
  const bridge = createBridge({ baseUrl: 'http://localhost:3000/api', token: 'secret', fetchImpl: async () => { calls++; } });
  await assert.rejects(bridge({ type: 'task.submit', instruction: '巡检' }));
  await assert.rejects(bridge({ type: 'task.get', request_id: '../../users' }));
  await assert.rejects(bridge({ type: 'approval.allow' }));
  assert.equal(calls, 0);
});

test('does not expose response body or report failed requests as accepted', async () => {
  const bridge = createBridge({ baseUrl: 'https://ops.example/api', token: 'secret', fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(bridge({ type: 'task.list' }), /HTTP 401/);
});
