const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const XLSX = require('/workspace/apps/backend/intelligence/ai-orchestrator/node_modules/xlsx');
const markers = require('/workspace/apps/backend/intelligence/ai-orchestrator/dist/modules/chat/personal-reminder-bridge.service');
const userId = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const workspace = `/workspace/data/users/${userId}/workspace`;
const artifactRoot = '/workspace/docs/artifacts/reviews/department-paid-skill-workflow-fix-20261022';
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

(async () => {
  const synthetic = 'workflow-new-input-20261022.xlsx';
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['全新附件：合成测试'], [], ['有偿无偿', '金额(K)', '部门编号', 'WBS编号'],
    ['无偿', 10.1, '新A', 'normal-1'], ['有偿', 20.2, '新A', 'normal-2'],
    ['有偿', -0.3, '新B', 'normal-3'],
    ...['EX', 'sY', 'sp', 'IP', 'ib', 'SZ'].map((prefix) => ['有偿', 999, '新A', prefix + '-exclude']),
  ]), '换名且换列');
  XLSX.writeFile(book, path.join(workspace, synthetic));
  fs.copyFileSync(path.join(workspace, synthetic), path.join(artifactRoot, synthetic));
  const cases = [
    { name: 'original', file: '工数实绩明细_20261020134124.xlsx', total: '1637.41990', rows: 253, excluded: 21 },
    { name: 'fresh', file: synthetic, total: '30.0', rows: 3, excluded: 6 },
  ];
  const results = [];
  for (const test of cases) {
    const sessionId = `verified-skill-workflow-${test.name}-20261022`;
    const before = hash(path.join(workspace, test.file));
    const response = await fetch(`http://${process.env.SESSION_BROKER_HOST || 'session-broker'}:3002/user-sandboxes/run-harness`, {
      method: 'POST', headers: { 'content-type': 'application/json',
        'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET },
      signal: AbortSignal.timeout(60000), body: JSON.stringify({
        userId, sessionId, prompt: '用部门别有偿统计处理这份附件', files: [test.file], history: [],
        model: 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af', webSearch: false, thinking: false, timeoutMs: 60000,
      }),
    });
    assert([200, 201].includes(response.status), `HTTP ${response.status}`);
    const result = await response.json();
    const metrics = markers.extractDshMarkers(result.output, 'METRICS').map((m) => JSON.parse(m.payload)).pop();
    const historyFile = path.join(workspace, '.dsh/sessions', sessionId + '.json');
    const history = JSON.parse(fs.readFileSync(historyFile));
    const answer = history.filter((m) => m.role === 'assistant').pop();
    assert.equal(result.exitCode, 0); assert.equal(metrics.llmInvocations, 0); assert.equal(metrics.toolCallsCount, 1);
    assert.equal(answer.verification.verified, true);
    const evidenceFile = historyFile.replace(/\.json$/, '.evidence') + '/' + answer.verification.turn_id + '.json';
    const evidence = JSON.parse(fs.readFileSync(evidenceFile));
    const receipt = evidence.receipts.find((r) => r.status === 'success').data;
    assert.equal(receipt.included_rows, test.rows); assert.equal(receipt.excluded_rows, test.excluded);
    assert.equal(Number(receipt.total), Number(test.total)); assert.equal(receipt.skill.version, 2);
    assert.equal(before, hash(path.join(workspace, test.file)));
    fs.writeFileSync(path.join(artifactRoot, `${test.name}-turn-evidence.json`), JSON.stringify(evidence, null, 2));
    results.push({ name: test.name, sessionId, durationMs: result.durationMs, metrics, final: answer.content,
      verified: true, sourceUnchanged: true, receipt });
  }
  fs.writeFileSync(path.join(artifactRoot, 'live-replay-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map((r) => ({ case: r.name, verified: r.verified, durationMs: r.durationMs,
    total: r.receipt.total, rows: r.receipt.included_rows, excluded: r.receipt.excluded_rows,
    toolCalls: r.metrics.toolCallsCount, modelCalls: r.metrics.llmInvocations })), null, 2));
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
