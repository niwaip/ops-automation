// Run through start-smart.sh ... exec -T ai-orchestrator node /workspace/tests/e2e/...
// Uses the service's existing internal identity; never logs credentials or signed URLs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'user-id': { type: 'string' }, source: { type: 'string' }, out: { type: 'string' },
  language: { type: 'string', default: '中文' },
} });
if (!values['user-id'] || !values.source || !values.out) throw new Error('--user-id, --source and --out are required');
const base = `http://127.0.0.1:${process.env.PORT || 3007}`;
const secret = process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
if (!secret) throw new Error('Service internal authentication is unavailable');
const headers = { 'x-internal-auth': secret, 'x-user-id': values['user-id'] };
const stamp = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const sessionId = `pdf-readability-e2e-${stamp}`;
const target = `readability-${stamp}.pdf`;
const folder = path.resolve(values.out, sessionId);
fs.mkdirSync(folder, { recursive: true });
const bytes = fs.readFileSync(values.source);
const form = new FormData();
form.append('file', new Blob([bytes], { type: 'application/pdf' }), `source-${stamp}.pdf`);
const started = Date.now();
const upload = await fetch(`${base}/ai/chat/upload`, { method: 'POST', headers, body: form });
if (!upload.ok) throw new Error(`Upload failed: ${upload.status} ${(await upload.text()).slice(0, 400)}`);
const attached = await upload.json();
const prompt = `翻译这个文档，生成${values.language}版PDF，保留主要内容、章节、分栏和图表关系；允许自然分页和页数变化。中文适当放大字号，英语和日语适当减小字号。输出文件名为${target}。`;
const request = { sessionId, message: prompt, files: [attached], config: { mode: 'chat', enableThinking: true, enableWebSearch: false } };
fs.writeFileSync(path.join(folder, 'request.json'), JSON.stringify({ ...request, sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex') }, null, 2));
console.log(JSON.stringify({ phase: 'submitted', sessionId, folder, target }));
const response = await fetch(`${base}/ai/chat/stream`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(request), signal: AbortSignal.timeout(600000) });
if (!response.ok) throw new Error(`Stream failed: ${response.status} ${(await response.text()).slice(0, 400)}`);
const decoder = new TextDecoder();
const events = [];
let pending = '';
for await (const chunk of response.body) {
  pending += decoder.decode(chunk, { stream: true });
  let split;
  while ((split = pending.indexOf('\n\n')) >= 0) {
    const frame = pending.slice(0, split);
    pending = pending.slice(split + 2);
    const data = frame.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
    if (!data || data === '[DONE]') continue;
    events.push(JSON.parse(data.replace(/([?&]token=)[^\s"&]+/g, '$1[REDACTED]')));
  }
}
fs.writeFileSync(path.join(folder, 'events.json'), JSON.stringify(events, null, 2));
const files = events.flatMap(e => e.outboundFiles || e.data?.outboundFiles || []);
const done = events.some(e => e.type === 'done');
const errors = events.filter(e => e.type === 'error');
const root = path.resolve('/workspace/data/users', values['user-id'], 'workspace');
const output = path.join(root, target);
const exists = fs.existsSync(output);
if (exists) fs.copyFileSync(output, path.join(folder, 'translated.pdf'));
fs.copyFileSync(values.source, path.join(folder, 'source.pdf'));
for (const suffix of ['.json', '.evidence.json', '.events', '.evidence']) {
  const source = path.join(root, '.dsh/sessions', sessionId + suffix);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(folder, sessionId + suffix), { recursive: true });
}
const journal = path.join(folder, sessionId + '.events');
const records = fs.existsSync(journal) ? fs.readdirSync(journal).flatMap(f => fs.readFileSync(path.join(journal, f), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)) : [];
const metrics = records.findLast(e => e.event === 'metrics')?.data;
const runId = fs.existsSync(journal) ? path.basename(fs.readdirSync(journal)[0], '.jsonl') : undefined;
if (runId) {
  const jobs = path.join(root, '.dsh/pdf-jobs', runId);
  if (fs.existsSync(jobs)) fs.cpSync(jobs, path.join(folder, 'jobs'), { recursive: true });
}
const accepted = exists && done && !errors.length && records.some(e => e.event === 'guard' && e.data.guard === 'pdf_delivery' && e.data.action === 'accept');
const summary = { accepted, sessionId, runId, elapsedSeconds: (Date.now() - started) / 1000, output, done, errors,
  outboundCount: files.length, metrics };
fs.writeFileSync(path.join(folder, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ accepted, sessionId, runId, elapsedSeconds: summary.elapsedSeconds, folder, output }));
if (!accepted) process.exitCode = 1;
