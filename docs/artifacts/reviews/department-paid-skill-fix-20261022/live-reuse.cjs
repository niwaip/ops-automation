const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const XLSX = require('xlsx');
const userId = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const sessionId = 'personal-skill-reuse-20261022';
const name = 'skill-validation-20261022.xlsx';
const artifactRoot = '/workspace/docs/artifacts/reviews/department-paid-skill-fix-20261022';
const workspace = `/workspace/data/users/${userId}/workspace`;
const headers = { 'content-type': 'application/json',
  'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET };

(async () => {
  // New filename, header position, column order, departments and totals. All six prefixes are tested.
  const rows = [['复用验收：此表为合成测试数据'], ['WBS编号', '金额(K)', '部门编号'],
    ['billable-a', 10, '验证A'], ['billable-b', 20, '验证A'],
    ['billable-c', 7.5, '验证B'], ['billable-d', 2.5, '验证B'],
    ...['EX', 'Sy', 'sP', 'IP', 'ib', 'SZ'].map((p) => [p + '-excluded', 1000, '验证A'])];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), '新数据');
  const fixture = path.join(workspace, name);
  XLSX.writeFile(book, fixture);
  fs.copyFileSync(fixture, path.join(artifactRoot, name));
  const host = process.env.SESSION_BROKER_HOST || 'session-broker';
  let result;
  let recovered = false;
  const sessionFile = path.join(workspace, '.dsh/sessions', sessionId + '.json');
  if (process.env.REUSE_CAPTURED === '1' && fs.existsSync(sessionFile)) {
    const messages = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    const answer = messages.filter((m) => m.role === 'assistant').pop();
    assert(answer?.content, 'missing persisted reply');
    result = { output: answer.content, success: null, exitCode: null, durationMs: null };
    recovered = true;
  } else {
  const r = await fetch(`http://${host}:3002/user-sandboxes/run-harness`, {
    method: 'POST', headers, signal: AbortSignal.timeout(310000),
    body: JSON.stringify({ userId, sessionId, prompt: '用部门别有偿统计处理这份附件',
      files: [name], history: [], model: 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af',
      webSearch: false, thinking: false, timeoutMs: 300000 }),
  });
  assert([200, 201].includes(r.status), `HTTP ${r.status}`);
  result = await r.json();
  }
  const markers = require('/workspace/apps/backend/intelligence/ai-orchestrator/dist/modules/chat/personal-reminder-bridge.service');
  const metrics = markers.extractDshMarkers(result.output, 'METRICS').map((m) => JSON.parse(m.payload));
  const final = markers.stripDshMarkers(result.output.split('<<<DSH_FINAL_OUTPUT>>>').pop(),
    ['METRICS', 'FINAL_OUTPUT', 'THOUGHT', 'FILE', 'DELTA', 'REMINDER']).trim();
  fs.writeFileSync(path.join(artifactRoot, 'live-reuse-result.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), sessionId, fixture: name, recoveredFromPersistedSession: recovered,
    expected: { '验证A': 30, '验证B': 10, total: 40, includedRows: 4, excludedRows: 6 },
    success: result.success, exitCode: result.exitCode, durationMs: result.durationMs,
    final, metrics,
  }, null, 2));
  if (!recovered) assert.equal(result.exitCode, 0);
  assert(final.includes('验证A') && final.includes('验证B'), 'missing new groups');
  assert(/\b30(?:\.0+)?\b/.test(final) && /\b10(?:\.0+)?\b/.test(final), 'wrong group totals');
  assert(/\b40(?:\.0+)?\b/.test(final), 'wrong total');
  assert(!final.includes('1,637.42') && !final.includes('1637.4199'), 'historical totals leaked');
  console.log(JSON.stringify({ success: true, durationMs: result.durationMs, final }));
})().catch((err) => { console.error(err.message); process.exitCode = 1; });
