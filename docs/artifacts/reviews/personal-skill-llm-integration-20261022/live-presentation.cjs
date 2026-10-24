const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const Redis = require('/workspace/apps/backend/intelligence/ai-orchestrator/node_modules/ioredis');
const XLSX = require('/workspace/apps/backend/intelligence/ai-orchestrator/node_modules/xlsx');
const userId = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const workspace = `/workspace/data/users/${userId}/workspace`;
const root = '/workspace/docs/artifacts/reviews/personal-skill-llm-integration-20261022';
const headers = { 'content-type': 'application/json', 'x-user-id': userId,
  'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET };
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

(async () => {
  const fresh = 'llm-insights-new-input-20261022.xlsx';
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([
    ['新附件与新的业务行'], [], ['金额(K)', 'WBS编号', '部门编号', '有偿无偿'],
    [11.1, 'normal-1', '验证甲', '无偿'], [22.2, 'normal-2', '验证乙', '有偿'],
    ...['EX', 'sy', 'SP', 'ip', 'IB', 'sz'].map((p) => [999, p + '-exclude', '验证甲', '有偿']),
  ]), '新列序');
  XLSX.writeFile(w, path.join(workspace, fresh));
  const tests = [
    { name: 'original', file: '工数实绩明细_20261020134124.xlsx', message: '用部门别有偿统计处理这份附件，并解释排除口径与金额分布', total: '1637.41990', rows: 253, llm: 1 },
    { name: 'fast', file: fresh, message: '用部门别有偿统计处理这份附件，只要表格，无需解读', total: '33.3', rows: 2, llm: 0 },
  ];
  const redis = new Redis({ host: process.env.REDIS_HOST || 'redis', port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD });
  const results = [];
  try {
    for (const test of tests) {
      const sessionId = `llm-skill-insights-${test.name}-20261022`;
      const input = path.join(workspace, test.file), before = hash(input), started = Date.now();
      let uploaded = { fileId: `fixture-${test.name}`, fileName: test.file,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: fs.statSync(input).size, filePath: input, source: 'upload' };
      if (test.name === 'fast') {
        const form = new FormData();
        form.append('file', new Blob([fs.readFileSync(input)], { type: uploaded.mimeType }), test.file);
        const upload = await fetch('http://127.0.0.1:3007/ai/chat/upload', { method: 'POST', body: form,
          headers: { 'x-user-id': userId, 'x-internal-auth': headers['x-internal-auth'] } });
        assert(upload.ok, `upload HTTP ${upload.status}`);
        uploaded = { ...(await upload.json()), source: 'upload' };
      }
      const response = await fetch('http://127.0.0.1:3007/ai/chat/stream', {
        method: 'POST', headers, signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ sessionId, message: test.message, clientMessageId: `${sessionId}-u`, clientAssistantMessageId: `${sessionId}-a`,
          modelId: 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af', config: { mode: 'chat', webSearch: false, thinking: false },
          files: [uploaded],
        }),
      });
      assert(response.ok, `HTTP ${response.status}`);
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let pending = '', firstTableMs = null, events = [];
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          let e; try { e = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (e.data?.isDelta && e.content?.includes(test.total) && firstTableMs === null) firstTableMs = Date.now() - started;
          events.push(e);
        }
      }
      const elapsedMs = Date.now() - started;
      const session = JSON.parse(await redis.get('chat_session:' + sessionId));
      const answer = session.history.filter((h) => h.role === 'assistant').pop();
      const trace = answer.metadata.executionTrace, metrics = trace.metrics;
      assert.equal(metrics.llmInvocations, test.llm); assert.equal(metrics.toolCallsCount, 1);
      assert(answer.content.includes(test.total)); assert.equal(before, hash(input));
      const presentation = metrics.guardDecisions.find((g) => g.guard === 'personal_skill_presentation');
      assert.equal(presentation.action, test.llm ? 'accept' : 'skipped');
      const historyFile = path.join(workspace, '.dsh/sessions', sessionId + '.json');
      const history = JSON.parse(fs.readFileSync(historyFile));
      const verified = history.filter((h) => h.role === 'assistant').pop().verification;
      assert.equal(verified.verified, true);
      const archive = JSON.parse(fs.readFileSync(historyFile.replace(/\.json$/, '.evidence') + '/' + verified.turn_id + '.json'));
      const receipt = archive.receipts.find((r) => r.status === 'success').data;
      assert.equal(receipt.included_rows, test.rows); assert.equal(receipt.skill.version, 4);
      if (test.llm) { assert(firstTableMs !== null, 'verified table was not streamed early'); assert(firstTableMs < elapsedMs); }
      const result = { name: test.name, sessionId, firstTableMs, elapsedMs, final: answer.content, trace,
        sourceUnchanged: true, verified: true, receipt };
      results.push(result);
      fs.writeFileSync(path.join(root, 'live-presentation-results.json'), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ case: test.name, firstTableMs, elapsedMs, modelCalls: metrics.llmInvocations,
        presentation: presentation.action, verified: true, total: receipt.total }));
    }
  } finally { await redis.quit(); }
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
