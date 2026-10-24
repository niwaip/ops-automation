// Run inside ai-orchestrator via docker/start-smart.sh. Uses its internal service credential in memory.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const userId = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const sessionId = 'chat-session-1792662104437-7gysxeoy';
const displayName = '部门别有偿统计';
const outputDir = '/workspace/docs/artifacts/reviews/department-paid-skill-fix-20261022';
const headers = { 'content-type': 'application/json', 'x-user-id': userId,
  'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET };

async function jsonRequest(route) {
  const response = await fetch(`http://127.0.0.1:3007${route}`, { headers });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

(async () => {
  const before = await jsonRequest('/ai/personal-skills');
  let skill = before.find((s) => s.displayName === displayName);
  let events = [];
  const started = Date.now();
  if (!skill || process.env.VERIFY_RETRY === '1') {
    const response = await fetch('http://127.0.0.1:3007/ai/chat/stream', {
      method: 'POST', headers, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ message: '保存为 部门别有偿统计 的skill', sessionId,
        clientMessageId: 'skill-repair-20261022-user', clientAssistantMessageId: 'skill-repair-20261022-assistant',
        modelId: 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af', config: { mode: 'chat', thinking: false } }),
    });
    assert([200, 201].includes(response.status), `save HTTP status ${response.status}`);
    const stream = await response.text();
    fs.writeFileSync(path.join(outputDir, 'live-save.sse'), stream);
    events = stream.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5).trim()));
    assert(!events.some((e) => e.type === 'error'), 'save emitted error');
    const installed = events.find((e) => e.data?.personalSkillCapture?.status === 'ready');
    assert(installed, 'capture was not confirmed ready');
    assert(installed.content.includes(`已保存个人技能「${displayName}」`));
    const after = await jsonRequest('/ai/personal-skills');
    skill = after.find((s) => s.id === installed.data.personalSkillCapture.skillId);
    assert.equal(after.filter((s) => s.displayName === displayName).length, 1);
  }
  assert(skill, 'installed skill missing from catalog');
  const detail = await jsonRequest(`/ai/personal-skills/${skill.id}`);
  const root = `/workspace/data/users/${userId}/knowledge`;
  const packageDir = path.join(root, 'skills', skill.slug);
  const skillMd = fs.readFileSync(path.join(packageDir, 'SKILL.md'), 'utf8');
  const rules = JSON.parse(fs.readFileSync(path.join(packageDir, 'references', 'rules.json'), 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(path.join(root, '.personal-skills-catalog.json'), 'utf8'));
  for (const prefix of ['ex', 'sy', 'sp', 'ip', 'ib', 'sz']) {
    assert(rules.confirmedInstructions.some((rule) => rule.includes(prefix)), `lost exclusion ${prefix}`);
  }
  assert(rules.confirmedInstructions.some((rule) => rule.includes('部门编号') && rule.includes('金额')));
  assert(!rules.confirmedInstructions.some((rule) => rule.startsWith('保存为')));
  assert.equal(skill.hasScript, false);
  assert.deepEqual(skill.deliverables, []);
  fs.writeFileSync(path.join(outputDir, 'live-save-result.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), elapsedMs: Date.now() - started, sessionId,
    skill, detail, rules, skillMd, catalog, eventTypes: events.map((e) => e.type),
  }, null, 2));
  console.log(JSON.stringify({ status: 'ready', skillId: skill.id, slug: skill.slug,
    displayName, version: skill.version, elapsedMs: Date.now() - started }));
})().catch((err) => { console.error(err.message); process.exitCode = 1; });
