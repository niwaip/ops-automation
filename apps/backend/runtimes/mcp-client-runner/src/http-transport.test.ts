import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { invokeMcp } from './client';
const { createHttpFixture } = require('../test/http-fixture.cjs');

test('SDK discovers and invokes a read tool over explicitly approved local HTTP', async () => {
  const fixture = createHttpFixture();
  await new Promise<void>(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${fixture.server.address().port}/mcp`;
  const previous = process.env.MCP_TRUSTED_ENDPOINTS;
  process.env.MCP_TRUSTED_ENDPOINTS = endpoint;
  try {
    const catalog: any = await invokeMcp({ endpoint, operation: 'discover', timeoutMs: 5000 });
    const tool = catalog.tools.find((t: any) => t.name === 'fixture_status');
    assert.ok(tool);
    assert.ok(fixture.requests.every((r: any) => !r.authorization && Object.keys(r.query).length === 0));
    const expectedSchemaDigest = createHash('sha256').update(JSON.stringify({ input: tool.inputSchema, output: tool.outputSchema || null })).digest('hex');
    const value: any = await invokeMcp({ endpoint, operation: 'invoke', toolName: tool.name, arguments: {}, expectedSchemaDigest, timeoutMs: 5000 });
    assert.deepEqual(JSON.parse(value.content[0].text), { fixture: true, transport: 'http' });
    assert.equal(fixture.calls, 1);
    fixture.requests.length = 0;
    await invokeMcp({ endpoint, operation: 'discover', auth: { location: 'query', parameter: 'key', value: 'fixture-key' }, timeoutMs: 5000 });
    assert.ok(fixture.requests.length > 0 && fixture.requests.every((r: any) => r.query.key === 'fixture-key' && !r.authorization));
  } finally {
    if (previous === undefined) delete process.env.MCP_TRUSTED_ENDPOINTS; else process.env.MCP_TRUSTED_ENDPOINTS = previous;
    fixture.server.closeAllConnections();
    await new Promise<void>(resolve => fixture.server.close(resolve));
  }
});
