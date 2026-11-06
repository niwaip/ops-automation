import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, validateEndpoint, createProtectedFetch } from './network-policy';

test('reject loopback, private, metadata, mapped IPv4 and unsafe endpoint forms', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
  for (const endpoint of ['https://127.0.0.1/mcp', 'https://[::1]/mcp', 'https://user:secret@example.com/mcp', 'https://example.com/mcp?token=secret', 'https://example.com:8443/mcp']) {
    assert.throws(() => validateEndpoint(endpoint), endpoint);
  }
});

test('public HTTP supports default and explicit MCP ports', () => {
  assert.equal(validateEndpoint('http://example.com/mcp').protocol, 'http:');
  assert.equal(validateEndpoint('http://example.com:9000/mcp').port, '9000');
  assert.throws(() => validateEndpoint('ftp://example.com/mcp'));
});

test('exact operator endpoints permit local HTTP without opening neighboring paths or ports', () => {
  const previous = process.env.MCP_TRUSTED_ENDPOINTS;
  process.env.MCP_TRUSTED_ENDPOINTS = 'http://127.0.0.1:9000/mcp,http://169.254.169.254/mcp';
  try {
    assert.equal(validateEndpoint('http://127.0.0.1:9000/mcp').port, '9000');
    for (const target of ['http://127.0.0.1:9000/admin', 'http://127.0.0.1:9001/mcp', 'http://169.254.169.254/mcp', 'http://0.0.0.0/mcp']) {
      assert.throws(() => validateEndpoint(target), target);
    }
  } finally {
    if (previous === undefined) delete process.env.MCP_TRUSTED_ENDPOINTS; else process.env.MCP_TRUSTED_ENDPOINTS = previous;
  }
});

test('a connection cannot self-authorize private access without operator policy', () => {
  assert.throws(() => createProtectedFetch('http://127.0.0.1/mcp', ['127.0.0.1']));
});

test('transport rejects alternate origins, paths and authentication redirect targets', async () => {
  const network = createProtectedFetch('https://example.com/mcp');
  await assert.rejects(network.fetch('https://another.example/mcp'), /MCP_TARGET_CHANGED/);
  await assert.rejects(network.fetch('https://example.com/admin'), /MCP_TARGET_CHANGED/);
  await network.close();
});

test('legacy host allowlist alone never permits loopback or metadata targets', () => {
  for (const host of ['127.0.0.1', '169.254.169.254', '::1']) assert.throws(() => validateEndpoint(`http://${host.includes(':') ? `[${host}]` : host}/mcp`, [host]));
});
