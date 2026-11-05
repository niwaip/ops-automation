import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTransportAuth } from './transport-auth';
import { createProtectedFetch } from './network-policy';

test('legacy headers and anonymous connections remain compatible', () => {
  assert.deepEqual(resolveTransportAuth(), { headers: {} });
  assert.deepEqual(resolveTransportAuth({ header: 'Authorization', value: 'Bearer fixture' }), { headers: { Authorization: 'Bearer fixture' } });
  assert.deepEqual(resolveTransportAuth({ location: 'header', header: 'X-API-Key', value: 'fixture' }), { headers: { 'X-API-Key': 'fixture' } });
});

test('query credentials are separated from headers and validate their parameter name', () => {
  assert.deepEqual(resolveTransportAuth({ location: 'query', parameter: 'key', value: 'fixture/+ =?&' }), {
    headers: {}, query: { parameter: 'key', value: 'fixture/+ =?&' },
  });
  for (const parameter of ['', 'key=value', 'key&other', 'x\r\n', 'a'.repeat(65)]) {
    assert.throws(() => resolveTransportAuth({ location: 'query', parameter, value: 'fixture' }));
  }
  assert.throws(() => resolveTransportAuth({ location: 'query', parameter: 'key', header: 'Authorization', value: 'fixture' }));
  assert.throws(() => resolveTransportAuth({ location: 'query', parameter: 'key', value: 'fixture\r\nInjected: yes' }));
});

test('query auth does not permit SDK URL substitution, arbitrary queries, or userinfo', async () => {
  const network = createProtectedFetch('https://example.com/mcp', [], { parameter: 'key', value: 'fixture' });
  try {
    for (const endpoint of ['https://another.example/mcp', 'https://example.com/other', 'https://example.com/mcp?key=changed',
      'https://example.com/mcp?other=value', 'https://user:pass@example.com/mcp', 'https://example.com/mcp#part']) {
      await assert.rejects(network.fetch(endpoint), /MCP_TARGET_CHANGED/);
    }
  } finally { await network.close(); }
});
