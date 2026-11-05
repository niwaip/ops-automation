const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../apps/backend/governance/workbench/dist/integrations/mcp');
const { configFrom } = require(path.join(root, 'mcp.types.js'));
const { redactTransportSecret } = require(path.join(root, 'mcp-secret-redaction.js'));
const base = { endpoint: 'https://mcp.amap.com/mcp', authType: 'api_key' };

test('query authentication stores only the base endpoint and parameter name', () => {
  const config = configFrom({ ...base, authLocation: 'query', queryParameter: 'key' }, false);
  assert.equal(config.endpoint, base.endpoint);
  assert.equal(config.authLocation, 'query');
  assert.equal(config.queryParameter, 'key');
});

test('legacy saved configuration still defaults to header authentication', () => {
  assert.equal(configFrom(base, false).authLocation, 'header');
  assert.equal(configFrom({ ...base, authType: 'bearer' }, false).headerName, 'Authorization');
});

test('raw URL credentials and invalid query authentication are rejected', () => {
  for (const input of [
    { endpoint: base.endpoint + '?key=fixture' }, { endpoint: 'https://user:pass@mcp.amap.com/mcp' },
    { authLocation: 'query' }, { authLocation: 'query', queryParameter: 'key&other' },
    { authLocation: 'query', queryParameter: 'a'.repeat(65) },
    { authLocation: 'query', queryParameter: 'key', authType: 'bearer' },
    { authLocation: 'query', queryParameter: 'key', authType: 'none' }, { authLocation: 'body' },
  ]) assert.throws(() => configFrom({ ...base, ...input }, false));
});

test('credentials are removed from decoded fields, URL encodings and object keys', () => {
  const token = 'fixture/+ =?&"\\';
  const encoded = encodeURIComponent(token);
  const formEncoded = new URLSearchParams({ key: token }).toString().slice(4);
  const lowerEscapes = encoded.replace(/%[0-9A-F]{2}/g, value => value.toLowerCase());
  const result = redactTransportSecret({ [encoded]: [token, encoded, formEncoded, lowerEscapes], url: `https://example.com/mcp?key=${formEncoded}` }, token);
  assert.deepEqual(result, { '[REDACTED]': Array(4).fill('[REDACTED]'), url: 'https://example.com/mcp?key=[REDACTED]' });
  assert.equal(redactTransportSecret('unchanged', ''), 'unchanged');
});
