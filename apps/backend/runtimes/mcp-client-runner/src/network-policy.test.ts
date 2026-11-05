import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, validateEndpoint, createProtectedFetch } from './network-policy';

test('reject loopback, private, metadata, mapped IPv4 and unsafe endpoint forms', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
  for (const endpoint of ['https://127.0.0.1/mcp', 'https://[::1]/mcp', 'http://example.com/mcp', 'https://user:secret@example.com/mcp', 'https://example.com/mcp?token=secret', 'https://example.com:8443/mcp']) {
    assert.throws(() => validateEndpoint(endpoint), endpoint);
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

test('operator policy never permits loopback or metadata targets', () => {
  for (const host of ['127.0.0.1', '169.254.169.254', '::1']) assert.throws(() => validateEndpoint(`http://${host.includes(':') ? `[${host}]` : host}/mcp`, [host]));
});
