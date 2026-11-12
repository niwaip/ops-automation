// Run before/after the browser save check. Reads credentials' identifiers only, never their values.
const { PrismaClient } = require('/workspace/apps/backend/platform/src/generated/prisma');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const db = new PrismaClient();
const prefix = '/workspace/docs/artifacts/reviews/mcp-ai-summary';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const report = { testedAt: new Date().toISOString(), checks: {} };

async function main() {
  const user = await db.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
  const connection = await db.mcpConnection.findFirst({ where: { ownerUserId: user.id, name: 'amap-maps-streamableHTTP', scope: 'personal' } });
  assert.ok(connection);
  const authorization = await db.userMcpAuthorization.findFirst({ where: { userId: user.id, connectionId: connection.id },
    select: { revisionId: true, credentialId: true, status: true } });
  const bindings = await db.mcpToolBinding.findMany({ where: { connectionId: connection.id, revisionId: connection.activeRevisionId },
    select: { id: true, schemaDigest: true, effect: true }, orderBy: { id: 'asc' } });
  const snapshot = { connectionId: connection.id, revisionId: connection.activeRevisionId,
    authorizationFingerprint: hash(authorization), bindingFingerprint: hash(bindings),
    invocationCount: await db.mcpInvocation.count({ where: { connectionId: connection.id } }) };
  if (process.argv[2] === 'before') {
    fs.writeFileSync(prefix + '-before-2026-11-05.json', JSON.stringify(snapshot, null, 2));
    console.log(JSON.stringify({ snapshotSaved: true, tools: bindings.length }));
    return;
  }
  const before = JSON.parse(fs.readFileSync(prefix + '-before-2026-11-05.json', 'utf8'));
  const headers = { 'Content-Type': 'application/json', 'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET, 'x-user-id': user.id, 'x-user-role': 'admin' };
  const base = 'http://localhost:3001/mcp-integrations/';
  const skills = await (await fetch(base + 'skills?mode=personal', { headers })).json();
  const skill = skills.find(skill => skill.connectionId === connection.id);
  const detail = await (await fetch(base + `skills/${skill.id}?mode=personal`, { headers })).json();
  const allConnections = await (await fetch(base + 'connections', { headers })).json();
  assert.equal(skill.descriptionSource, 'curated');
  assert.equal(skill.description, connection.capabilitySummary.description);
  assert.ok(Array.from(skill.description).length <= 160);
  assert.ok(detail.catalogEntry.includes(skill.description));
  assert.ok(!JSON.stringify(skill).includes('inputSchema'));
  assert.ok(allConnections.every(row => !('capabilitySummary' in row)));
  assert.deepEqual(snapshot, before);
  const path = base + `connections/${connection.id}/summary`;
  const body = { revisionId: connection.activeRevisionId, toolsetDigest: connection.capabilitySummary.toolsetDigest, description: '长'.repeat(161) };
  assert.equal((await fetch(path, { method: 'PUT', headers, body: JSON.stringify(body) })).status, 400);
  assert.equal((await fetch(path, { method: 'PUT', headers, body: JSON.stringify({ ...body, description: '旧草稿', toolsetDigest: 'stale' }) })).status, 409);
  assert.equal((await fetch(base + `connections/${connection.id}/summary/generate`, { method: 'POST' })).status, 401);
  assert.equal((await db.mcpConnection.findUnique({ where: { id: connection.id } })).capabilitySummary.description, skill.description);
  try {
    assert.equal((await fetch(path, { method: 'DELETE', headers })).status, 200);
    const automatic = await (await fetch(base + 'skills?mode=personal', { headers })).json();
    assert.equal(automatic.find(s => s.id === skill.id).descriptionSource, 'automatic');
  } finally {
    assert.equal((await fetch(path, { method: 'PUT', headers, body: JSON.stringify({ ...body, description: skill.description }) })).status, 200);
  }
  report.checks = { savedSummaryInCatalogAndPreview: true, withinPromptBudget: true, noSchemaInCatalog: true,
    unfilteredMetadataHidden: true, sameConnectionRevision: true, sameAuthorization: true, sameToolContracts: true,
    noNewMcpInvocation: true, longSummaryRejected: true, staleDraftRejected: true, anonymousGenerationRejected: true, restoreAutomaticWithoutAi: true };
  report.snapshot = snapshot; report.skill = skill; report.catalogEntry = detail.catalogEntry; report.passed = true;
  fs.writeFileSync(prefix + '-deployment-2026-11-05.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, description: skill.description }));
}
main().catch(error => { console.error(JSON.stringify({ passed: false, error: error.name, message: error.message })); process.exitCode = 1; })
  .finally(() => db.$disconnect());
