// Read-only verification against the running platform. No external MCP or model call.
const { PrismaClient } = require('/workspace/apps/backend/platform/src/generated/prisma');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const db = new PrismaClient();
const report = { testedAt: new Date().toISOString(), checks: {}, skills: [], externalMcpCalled: false, modelCalled: false };

async function main() {
  const user = await db.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
  assert.ok(user);
  const headers = { 'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET, 'x-user-id': user.id, 'x-user-role': 'admin' };
  const base = 'http://localhost:3001/mcp-integrations/';
  async function api(path) {
    const response = await fetch(base + path, { headers });
    assert.ok(response.ok, `Unexpected status ${response.status}`);
    return response.json();
  }
  for (const mode of ['personal', 'work']) {
    const skills = await api(`skills?mode=${mode}`);
    const index = await api(`tools?mode=${mode}&view=index`);
    assert.ok(index.every(tool => !('inputSchema' in tool) && !('outputSchema' in tool)));
    for (const skill of skills) {
      const path = `skills/${skill.id}`;
      const detail = await api(`${path}?mode=${mode}`);
      assert.ok(!JSON.stringify(detail).includes('inputSchema'));
      assert.ok(detail.catalogEntry.includes(skill.id) && detail.instructions.includes('外部 MCP Skill'));
      const tools = index.filter(tool => tool.connectionId === skill.connectionId);
      assert.deepEqual(detail.tools.map(tool => tool.id).sort(), tools.map(tool => tool.id).sort());
      const tool = detail.tools[0];
      assert.ok(tool);
      const preview = await api(`${path}/tools/${encodeURIComponent(tool.name)}?mode=${mode}`);
      assert.ok(preview.inputSchema && preview.description);
      assert.equal(preview.id, tool.id);
      assert.ok(!('contractToken' in preview));
      assert.equal((await fetch(base + `${path}/tools/${encodeURIComponent(tool.name)}?mode=${mode}`)).status, 401);
      assert.equal((await fetch(base + `${path}/tools/unpublished-test-tool?mode=${mode}`, { headers })).status, 404);
      assert.equal((await fetch(base + `${path}/tools/${encodeURIComponent(tool.name)}?mode=${mode === 'personal' ? 'work' : 'personal'}`, { headers })).status, 404);
      report.skills.push({ name: skill.name, mode, summary: skill.description, catalogEntry: detail.catalogEntry,
        tools: detail.tools.map(tool => ({ name: tool.name, description: tool.description, effect: tool.effect })) });
    }
  }
  assert.ok(report.skills.length > 0);
  report.checks = { runningApiLoaded: true, metadataAndIndexContainNoSchemas: true, allPublishedToolsIndexed: true,
    singleToolPreviewHasNoInvocationReceipt: true, anonymousRejected: true, wrongModeRejected: true, unpublishedToolRejected: true };
  report.passed = true;
}
main().catch(error => { report.passed = false; report.error = error.name; process.exitCode = 1; }).finally(async () => {
  fs.writeFileSync('/workspace/docs/artifacts/reviews/mcp-skill-description-deployment-2026-11-05.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, skills: report.skills.map(s => ({ name: s.name, tools: s.tools.length })), error: report.error }));
  await db.$disconnect();
});
