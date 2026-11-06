// Requires the temporary, read-only SDK fixture on the platform host's port 9000.
const { PrismaClient } = require('/workspace/apps/backend/platform/src/generated/prisma');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const db = new PrismaClient();
const created = [];
const report = { testedAt: new Date().toISOString(), checks: {}, externalBusinessServiceCalled: false };

async function main() {
  const user = await db.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
  const base = 'http://localhost:3001/mcp-integrations/';
  const headers = { 'Content-Type': 'application/json', 'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET, 'x-user-id': user.id, 'x-user-role': 'admin' };
  async function request(path, method = 'GET', body) {
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.ok(response.ok, `Unexpected API status ${response.status}`);
    return response.json();
  }
  async function create(endpoint) {
    const row = await request('connections', 'POST', { name: 'HTTP verification ' + randomUUID(), scope: 'personal', endpoint, authType: 'none' });
    created.push(row.id); return row;
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await fetch('http://localhost:3001/health').catch(() => null))?.ok) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const connection = await create('http://localhost:9000');
  const listed = await request('connections');
  const saved = listed.find(row => row.id === connection.id);
  assert.equal(saved.config.endpoint, 'http://host.docker.internal:9000/');
  assert.equal(saved.configured, true);
  assert.equal(await db.userMcpAuthorization.count({ where: { connectionId: connection.id } }), 0);
  const discovered = await request(`connections/${connection.id}/discover`, 'POST');
  assert.ok(discovered.tools.some(tool => tool.name === 'fixture_status'));
  const published = await request(`connections/${connection.id}/publish`, 'POST', { tools: [{ name: 'fixture_status', effect: 'read', allowedRoles: ['employee', 'manager', 'admin'] }] });
  const result = await request(`tools/${published.tools[0].id}/invoke`, 'POST', { arguments: {}, mode: 'personal', requestKey: randomUUID() });
  assert.equal(result.status, 'completed');
  const payload = JSON.parse(result.result.content[0].text);
  assert.deepEqual(payload, { fixture: true, transport: 'http' });
  const mcpPath = await create('http://localhost:9000/mcp');
  assert.ok((await request(`connections/${mcpPath.id}/discover`, 'POST')).tools.some(tool => tool.name === 'fixture_status'));
  const remote = await create('http://example.com:9000/mcp');
  assert.ok(remote.id); // Saving only; never probe an unrelated public service.
  const denied = await fetch(base + 'connections', { method: 'POST', headers, body: JSON.stringify({ name: 'Denied local endpoint', scope: 'personal', endpoint: 'http://localhost:9001/mcp', authType: 'none' }) });
  assert.equal(denied.status, 400);
  report.checks = { savesHttp: true, localhostMapsToHost: true, exactScreenshotRootEndpointWorks: true, mcpPathWorks: true,
    discoversTools: true, publishesCurrentContract: true, invokesReadOnlyTool: true, anonymousNeedsNoCredential: true,
    customPublicHttpPortSaves: true, neighboringLocalPortRejected: true };
  report.normalizedEndpoint = saved.config.endpoint;
  report.result = payload;
  report.passed = true;
}
main().catch(error => { report.passed = false; report.error = error.message; process.exitCode = 1; }).finally(async () => {
  try {
    await db.mcpInvocation.deleteMany({ where: { connectionId: { in: created } } });
    await db.mcpConnection.deleteMany({ where: { id: { in: created } } });
    report.temporaryConnectionsRemoved = true;
  } catch { report.temporaryConnectionsRemoved = false; report.passed = false; process.exitCode = 1; }
  fs.writeFileSync('/workspace/docs/artifacts/reviews/mcp-http-deployment-2026-11-06.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await db.$disconnect();
});
