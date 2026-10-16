import { writeFile } from 'node:fs/promises';
import { corpus, cases } from './corpus.mjs';

const base = process.env.DOC_API_URL || 'http://127.0.0.1:3001';
const run = `GREPE2E${Date.now()}`;
const report = { run, startedAt: new Date().toISOString(), checks: [], searches: [], cleanupErrors: [] };
let token = process.env.DOC_TOKEN;
let ws;
const created = [];
const ids = {};
const check = (name, ok, details) => report.checks.push({ name, passed: Boolean(ok), details });
async function api(path, method = 'GET', body) {
  const form = body instanceof FormData;
  const res = await fetch(`${base}${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(!form && body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status}`);
  return res.json();
}
try {
  if (!token) {
    if (!process.env.DOC_USERNAME || !process.env.DOC_PASSWORD) throw new Error('Set DOC_TOKEN or DOC_USERNAME and DOC_PASSWORD');
    token = (await api('/auth/login', 'POST', { username: process.env.DOC_USERNAME, password: process.env.DOC_PASSWORD })).accessToken;
    if (!token) throw new Error('Login returned no accessToken');
  }
  ws = process.env.DOC_WORKSPACE_ID || (await api('/workspaces/my')).personal.id;
  // Neutral file names force content retrieval rather than title matching.
  for (const [i, doc] of corpus(run).entries()) {
    const form = new FormData();
    form.set('file', new Blob([doc.text], { type: 'text/markdown' }), `${run}-${i}.md`);
    const node = await api(`/workspaces/${ws}/upload`, 'POST', form);
    if (!node.id) throw new Error('Upload returned no node id');
    created.push(node.id);
    ids[doc.key] = node.id;
    await api(`/workspaces/${ws}/nodes/${node.id}/digest`, 'POST', {
      useAi: true, extractMode: 'clean_summary',
      promptInstructions: '保留原文所有专有名词、项目编号、负责人、金额、日期、口令、命令及验收数量，不得编造。',
    });
    const detail = await api(`/workspaces/${ws}/nodes/${node.id}`);
    const digest = detail.digest;
    check(`AI cleaned ${doc.key}`, digest?.cleanedByAi === true);
    const cleaned = digest?.cleanedContent || '';
    check(`cleaned facts ${doc.key}`, doc.facts.every(f => cleaned.toLowerCase().includes(f.toLowerCase())), { missing: doc.facts.filter(f => !cleaned.toLowerCase().includes(f.toLowerCase())) });
  }
  for (const c of cases(run)) {
    const start = performance.now();
    const results = await api(`/workspaces/search-content?${new URLSearchParams({ q: c.q, workspaceId: ws })}`);
    if (!Array.isArray(results)) throw new Error('Search must return an array');
    const found = results.map(r => r.id);
    const rank = c.first ? found.indexOf(ids[c.first]) + 1 : 0;
    const relevant = new Set((c.relevant || []).map(k => ids[k]));
    report.searches.push({ query: c.q, elapsedMs: Math.round(performance.now() - start), rank, reciprocalRank: rank ? 1 / rank : 0, precisionAt3: found.length ? found.slice(0, 3).filter(id => relevant.has(id)).length / Math.min(3, found.length) : null, results });
    if (c.empty) check(`empty: ${c.q}`, results.length === 0);
    else {
      check(`top1: ${c.q}`, found[0] === ids[c.first]);
      check(`evidence: ${c.q}`, results.find(r => r.id === ids[c.first])?.matches?.some(m => Number.isInteger(m.line) && m.line > 0 && m.snippet));
      if (c.only) check(`exact isolation: ${c.q}`, found.length === 1 && found[0] === ids[c.first]);
      if (c.forbidden) check(`noise gate: ${c.q}`, c.forbidden.every(k => !found.includes(ids[k])));
    }
  }
} catch (e) {
  report.error = e.message;
} finally {
  // Delete only node IDs created by this invocation, including after failures.
  for (const id of created.reverse()) {
    try { await api(`/workspaces/${ws}/nodes/${id}`, 'DELETE'); }
    catch (e) { report.cleanupErrors.push({ id, error: e.message }); }
  }
  report.passed = !report.error && !report.cleanupErrors.length && report.checks.length > 0 && report.checks.every(c => c.passed);
  const output = process.env.DOC_REPORT || `/tmp/${run}.json`;
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failed: report.checks.filter(c => !c.passed), error: report.error, report: output }, null, 2));
  process.exitCode = report.passed ? 0 : 1;
}
