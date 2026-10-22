// Authenticated personal-mode API evidence collector; never reads the oracle.
// A successful transport leaves NEEDS_REVIEW until independent semantic grading.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [source, evidenceDir] = process.argv.slice(2);
if (!source || !evidenceDir) throw new Error('Usage: node collect.mjs SOURCE EVIDENCE_DIR');
const manifest = JSON.parse(await fs.readFile(path.join(evidenceDir, 'manifest.json'), 'utf8'));
const base = (process.env.QUERY_E2E_BASE_URL || 'http://127.0.0.1:3007').replace(/\/$/, '');
const endpoint = new URL(base);
if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
  throw new Error('Base URL must be HTTP(S) without embedded credentials');
}
if (endpoint.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) {
  throw new Error('Remote E2E endpoints must use HTTPS');
}
const authFile = process.env.QUERY_E2E_AUTH_FILE;
if (!authFile) throw new Error('Set QUERY_E2E_AUTH_FILE to a test login JSON containing accessToken');
const { accessToken } = JSON.parse(await fs.readFile(authFile, 'utf8'));
if (!accessToken) throw new Error('Missing test account accessToken');
const bytes = await fs.readFile(source);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha256 !== manifest.fixture_sha256) throw new Error('Fixture hash differs from manifest');
const selected = new Set((process.env.QUERY_E2E_IDS || '').split(',').filter(Boolean));
if ([...selected].some(id => !manifest.cases.some(c => c.id === id))) throw new Error('Unknown case ID');
const runDir = path.join(evidenceDir, `api-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(runDir, { recursive: false });
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const scrub = text => text.replaceAll(accessToken, 'REDACTED')
  .replace(/([?&](?:token|access_token|signature|x-amz-signature|x-amz-credential)=)[^\s"&<>]+/gi, '$1REDACTED');
const save = (name, data) => fs.writeFile(path.join(runDir, name), scrub(data));
const summaries = [];
for (const c of manifest.cases.filter(c => !selected.size || selected.has(c.id))) {
  const sessionId = `query-${c.id}-${crypto.randomUUID()}`;
  const modelId = process.env.QUERY_E2E_MODEL_ID;
  const body = { message: c.prompt, sessionId, ...(modelId ? { modelId } : {}),
    config: { mode: c.mode, thinking: true, webSearch: false, workspaceSearch: false } };
  const record = { id: c.id, sessionId, fixtureSha256: sha256, requestedModel: modelId || 'default',
    startedAt: new Date().toISOString(), status: 'NEEDS_REVIEW', assertions: c.assertions,
    routeVerdict: 'unknown', resultVerdict: 'unknown', usage: null };
  const started = Date.now();
  let raw = '';
  try {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime }), path.basename(source));
    const upload = await fetch(`${base}/ai/chat/upload`, {
      method: 'POST', headers: { Authorization: headers.Authorization }, body: form,
      signal: AbortSignal.timeout(30000),
    });
    record.uploadHttpStatus = upload.status;
    if (!upload.ok) throw new Error(`Upload HTTP ${upload.status}`);
    const uploaded = await upload.json();
    if (!uploaded.fileId) throw new Error('Upload response missing fileId');
    body.files = [{ fileId: uploaded.fileId, fileName: path.basename(source), size: bytes.length, mimeType: mime }];
    await save(`${c.id}.request.json`, JSON.stringify(body, null, 2));
    const response = await fetch(`${base}/ai/chat/stream`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(300000),
    });
    record.httpStatus = response.status;
    if (!response.ok) throw new Error(`Stream HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Expected SSE');
    const decoder = new TextDecoder();
    for await (const chunk of response.body) raw += decoder.decode(chunk, { stream: true });
    raw += decoder.decode();
    // SSE data fields may span several lines. Preserve raw stream for replay.
    const events = raw.replace(/\r\n/g, '\n').split(/\n\n+/).flatMap(block => {
      const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return [];
      try { return [JSON.parse(data)]; } catch { return [{ type: 'parse_error', data }]; }
    });
    record.eventTypes = events.reduce((counts, event) => {
      counts[event.type] = (counts[event.type] || 0) + 1;
      return counts;
    }, {});
    record.traceIds = [...new Set(events.flatMap(e => [e.traceId, e.data?.traceId]).filter(Boolean))];
    record.done = events.some(e => e.type === 'done');
    if (!record.done || events.some(e => ['error', 'parse_error'].includes(e.type))) record.status = 'TRANSPORT_OR_STREAM_FAILURE';
    await save(`${c.id}.events.json`, JSON.stringify(events, null, 2));
    const history = await fetch(`${base}/ai/chat/history/${sessionId}`, { headers, signal: AbortSignal.timeout(30000) });
    record.historyHttpStatus = history.status;
    await save(`${c.id}.history.json`, await history.text());
    if (!history.ok && record.status === 'NEEDS_REVIEW') record.status = 'HISTORY_EVIDENCE_FAILURE';
  } catch (error) {
    record.status = 'TRANSPORT_OR_STREAM_FAILURE';
    record.error = String(error);
  }
  record.seconds = (Date.now() - started) / 1000;
  await save(`${c.id}.sse.txt`, raw);
  summaries.push(record);
  await save('runs.json', JSON.stringify(summaries, null, 2));
  console.log(`${c.id}: ${record.status} (${record.seconds}s)`);
}
if (crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex') !== sha256) throw new Error('Source changed');
console.log(`Evidence: ${runDir}. Semantic and route grading still required.`);
process.exitCode = summaries.some(r => r.status !== 'NEEDS_REVIEW') ? 1 : 2;
