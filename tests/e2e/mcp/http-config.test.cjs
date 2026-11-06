const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { configFrom } = require(path.resolve(__dirname, '../../../apps/backend/governance/workbench/dist/integrations/mcp/mcp.types.js'));
const config = endpoint => configFrom({ endpoint, authType: 'none' }, false);

test('personal connections accept public HTTP and custom MCP ports', () => {
  assert.equal(config('http://example.com:9000/mcp').endpoint, 'http://example.com:9000/mcp');
  assert.equal(config('https://example.com/mcp').transport, 'streamable_http');
});

test('localhost maps to the Docker host only for exact approved endpoints', () => {
  const previousHost = process.env.MCP_LOCAL_HOST, previousTargets = process.env.MCP_TRUSTED_ENDPOINTS;
  process.env.MCP_LOCAL_HOST = 'host.docker.internal';
  process.env.MCP_TRUSTED_ENDPOINTS = 'http://host.docker.internal:9000/,http://host.docker.internal:9000/mcp';
  try {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      assert.equal(config(`http://${host}:9000/mcp`).endpoint, 'http://host.docker.internal:9000/mcp');
    }
    assert.equal(config('http://localhost:9000').endpoint, 'http://host.docker.internal:9000/');
    assert.throws(() => config('http://localhost:9000/admin'));
    assert.throws(() => config('http://localhost:9001/mcp'));
    assert.throws(() => config('http://localhost:9000/mcp?key=fixture'));
  } finally {
    for (const [key, value] of [['MCP_LOCAL_HOST', previousHost], ['MCP_TRUSTED_ENDPOINTS', previousTargets]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
