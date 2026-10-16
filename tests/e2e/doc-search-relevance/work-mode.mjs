// Work-mode E2E: real chat stream -> execution -> workspace explorer -> answer.
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.DOC_EVIDENCE_DIR || '/tmp/doc-work-mode-e2e';
await mkdir(out, { recursive: true });
const base = process.env.DOC_API_URL || 'http://127.0.0.1:3001';
const chat = process.env.DOC_CHAT_URL || 'http://127.0.0.1:3007';
const control = process.env.DOC_CONTROL_URL || 'http://127.0.0.1:3003';
let token = process.env.DOC_TOKEN;
if (!token) {
  if (!process.env.DOC_USERNAME || !process.env.DOC_PASSWORD) throw new Error('Set DOC_TOKEN or DOC_USERNAME and DOC_PASSWORD');
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.DOC_USERNAME, password: process.env.DOC_PASSWORD }), signal: AbortSignal.timeout(30000) });
  if (!login.ok) throw new Error(`Login HTTP ${login.status}`);
  token = (await login.json()).accessToken;
  if (!token) throw new Error('No accessToken');
}
const batch = Date.now();
const tests = [
  { id: 'exact', message: '/doc 全文精确检索“AD-Q8VN-6173”，给出命中文档、命中原文及行号，不要拆分关键词。', expected: ['workspace-admin-loop-2026-10-15-fixture.md', 'AD-Q8VN-6173'] },
  { id: 'fields', message: '/doc 检索“星桥管理闭环AD1015”，从原文核对预算、负责人、验收口令、交付截止日、验收规则，逐项给出准确值及行号引用。', expected: ['52931', '测试员丁', 'AD-Q8VN-6173', '四台', '三份'] },
  { id: 'nohit', message: `/doc 全文精确检索“UNSEEN${batch}”，没有命中请明确说明，不要返回其他文件。`, empty: true },
  { id: 'noise', message: `/doc UNSEEN${batch}的安装配置方法，请检索工作空间文件，没有该实体请明确未找到，不要用其他软件教程代替。`, empty: true },
  { id: 'prefix', message: '/doc 全文精确检索“AD-Q8VN-9999”，不要拆分关键词，未命中请明确说明，不要返回其他文档。', empty: true },
  { id: 'install', message: '/doc deepseek harness的安装方法，请检索空间文件，列出最相关文件及命中原文，排除仅包含安装配置通用词的无关文档。', expected: ['DeepSeek', 'Harness', '安装'] },
];
const results = [];
for (const t of tests.filter(t => !process.env.DOC_CASES || process.env.DOC_CASES.split(',').includes(t.id))) {
  console.log(`START ${t.id}`);
  const started = performance.now();
  try {
    const response = await fetch(`${chat}/ai/chat/stream`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: t.message, sessionId: `doc-e2e-${batch}-${t.id}`, config: { mode: 'task', thinking: true, webSearch: false, workspaceSearch: false } }),
      signal: AbortSignal.timeout(240000),
    });
    if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
    const raw = await response.text();
    await writeFile(`${out}/${t.id}.sse`, raw);
    const events = raw.split('\n').filter(l => l.startsWith('data:')).flatMap(l => { try { return [JSON.parse(l.slice(5).trim())]; } catch { return []; } });
    const executionId = events.map(e => e.data?.executionId || e.executionId).find(Boolean);
    let execution;
    if (executionId) {
      const res = await fetch(`${control}/api/executions/${executionId}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
      if (res.ok) { execution = await res.json(); await writeFile(`${out}/${t.id}.execution.json`, JSON.stringify(execution, null, 2)); }
    }
    // Fuzzy candidates and execution routing are observations, not final relevance verdicts.
    const observed = events.filter(e => ['result', 'observation'].includes(e.type));
    const evidence = JSON.stringify(observed);
    const final = events.filter(e => e.type === 'result').at(-1);
    const answer = final?.content || final?.data?.chatSummary || '';
    const checks = {
      completed: Boolean(final) && ['succeeded', 'completed'].includes(final.data?.status),
      noStreamError: !events.some(e => e.type === 'error'),
      finalAnswer: t.empty ? /未找到|未检索到|没有找到|无匹配|未命中|未在[^。\n]{0,100}找到/.test(answer) && !/fileId=/.test(answer) : t.expected.every(s => answer.toLowerCase().includes(s.toLowerCase())) && /第\s*\d+\s*行|L\d+/.test(answer),
    };
    const routeChecks = {
      executionCreated: Boolean(executionId),
      executionSucceeded: execution?.status === 'succeeded',
      explorerUsed: evidence.includes('platform.workspace.explorer'),
    };
    const business = final?.data?.businessData;
    const deliveredToolOutput = JSON.stringify(business?.finalOutputs || []);
    const outputGate = t.empty && business?.finalOutputs ? !/fileId=/.test(deliveredToolOutput) : null;
    results.push({ id: t.id, message: t.message, elapsedMs: Math.round(performance.now() - started), executionId, executionStatus: execution?.status, routeChecks, outputGate, checks, passed: Object.values(checks).every(Boolean) && outputGate !== false });
  } catch (e) { results.push({ id: t.id, passed: false, error: e.message }); }
  await writeFile(`${out}/report.json`, JSON.stringify({ batch, results }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
process.exitCode = results.every(r => r.passed) ? 0 : 1;
