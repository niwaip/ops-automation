const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = '/workspace/docs/artifacts/reviews/personal-skill-llm-integration-20261022';
const userId = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const skillId = 'c60d78fd-b6c3-4e7c-99ba-67f6d61efecd';
const headers = { 'content-type': 'application/json', 'x-user-id': userId,
  'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET };
async function request(route, body) {
  const response = await fetch('http://127.0.0.1:3007/ai/personal-skills' + route,
    { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  assert(response.ok, `HTTP ${response.status}: ${await response.clone().text()}`);
  return response.json();
}
(async () => {
  const before = await request('/' + skillId);
  assert.equal(before.version, 3, 'Refusing duplicate upgrade');
  const started = Date.now();
  let task = await request('/captures', {
    displayName: before.displayName, existingSkillId: skillId, sourceRef: before.sourceRef,
    modelId: 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af', idempotencyKey: 'llm-authoring-scoped-upgrade-20261022',
  });
  let status = '';
  for (let i = 0; i < 200; i++) {
    task = await request('/captures/' + task.captureId);
    if (task.status !== status) { status = task.status; console.log('capture status:', status); }
    if (['ready', 'failed', 'needs_input'].includes(status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fs.writeFileSync(path.join(root, 'live-capture-status.json'), JSON.stringify(task, null, 2));
  assert.equal(task.status, 'ready', JSON.stringify(task));
  assert.equal(task.version, 4);
  const detail = await request('/' + skillId);
  const pkg = `/workspace/data/users/${userId}/knowledge/skills/${detail.slug}`;
  const design = JSON.parse(fs.readFileSync(path.join(pkg, 'references/authoring.json')));
  const plan = JSON.parse(fs.readFileSync(path.join(pkg, 'references/workflow.json')));
  const validation = JSON.parse(fs.readFileSync(path.join(pkg, 'references/validation.json')));
  assert.equal(plan.filters.length, 1); assert.equal(plan.filters[0].op, 'exclude_prefix');
  assert.deepEqual([...plan.filters[0].values].sort(), ['ex', 'ib', 'ip', 'sp', 'sy', 'sz']);
  assert.equal(validation.included_rows, 253); assert.equal(validation.excluded_rows, 21);
  assert.equal(validation.total_scaled_1e20, '163741990000000000000000');
  assert.equal(design.model, 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af');
  const report = { elapsedMs: Date.now() - started, task, detail, plan, design, validation };
  fs.writeFileSync(path.join(root, 'live-authoring-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ready: true, version: detail.version, elapsedMs: report.elapsedMs,
    authoringModel: design.model, attempts: design.usage.length, includedRows: validation.included_rows,
    skillEntryCharacters: detail.skillMdContent.length }));
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
