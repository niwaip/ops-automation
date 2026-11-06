// Verify the running development services without calling a third-party MCP or using its credentials.
const { PrismaClient } = require('/workspace/apps/backend/platform/src/generated/prisma');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const db = new PrismaClient();
const report = { testedAt: new Date().toISOString(), checks: {}, thirdPartyMcpCalled: false };
let connectionId;

async function main() {
  const admin = await db.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
  assert.ok(admin);
  async function api(path, method = 'GET', body) {
    return fetch(`http://localhost:3001/mcp-integrations/${path}`, { method,
      headers: { 'Content-Type': 'application/json', 'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET, 'x-user-id': admin.id, 'x-user-role': 'admin' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  report.checks.runnerHealthy = (await fetch('http://mcp-client-runner:3015/health')).ok;
  report.checks.unauthenticatedAccessRejected = (await fetch('http://localhost:3001/mcp-integrations/connections')).status === 401;
  const frontend = await fetch('http://user-web:5174/@fs/workspace/apps/frontend/shared/chat-web/components/McpConnectionsPanel.tsx');
  const source = await frontend.text();
  report.checks.frontendServesQueryConfiguration = frontend.ok && source.includes('API Key 位置') && source.includes('API Key 参数名');
  const config = { name: `Query auth deployment check ${randomUUID()}`, scope: 'personal',
    endpoint: 'https://mcp.amap.com/mcp', authType: 'api_key', authLocation: 'query', queryParameter: 'key' };
  const created = await api('connections', 'POST', config);
  assert.equal(created.status, 201);
  connectionId = (await created.json()).id;
  const listed = await api('connections');
  assert.equal(listed.status, 200);
  const row = (await listed.json()).find(item => item.id === connectionId);
  report.checks.runningPlatformSavesQueryConfiguration = row?.config.authLocation === 'query' && row.config.queryParameter === 'key';
  report.checks.endpointContainsNoCredential = row?.config.endpoint === config.endpoint;
  report.checks.requiresSeparateUserCredential = row?.configured === false;
  report.checks.rawUrlCredentialRejected = (await api('connections', 'POST', { ...config, endpoint: config.endpoint + '?key=fixture' })).status === 400;
  assert.ok(Object.values(report.checks).every(Boolean));
  report.passed = true;
}

main().catch(() => { report.passed = false; process.exitCode = 1; }).finally(async () => {
  try {
    if (connectionId) await db.mcpConnection.delete({ where: { id: connectionId } });
    report.temporaryConnectionRemoved = true;
  } catch { report.temporaryConnectionRemoved = false; report.passed = false; process.exitCode = 1; }
  fs.writeFileSync('/workspace/docs/artifacts/reviews/mcp-query-auth-deployment-2026-11-05.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await db.$disconnect();
});
