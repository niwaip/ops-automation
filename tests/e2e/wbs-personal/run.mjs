// Real personal-mode API E2E. Credentials stay in memory and are never recorded.
import fs from 'node:fs/promises';
import path from 'node:path';
const [source, evidenceDir] = process.argv.slice(2);
if (!source || !evidenceDir) throw new Error('Usage: node run.mjs SOURCE EVIDENCE_DIR');
const expected = JSON.parse(await fs.readFile(path.join(evidenceDir, 'expected.json'), 'utf8'));
const auth = JSON.parse(await fs.readFile('/tmp/wbs-e2e-login.json', 'utf8'));
if (!auth.accessToken) throw new Error('Missing test account accessToken');
const bytes = await fs.readFile(source);
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` };
const modelId = process.env.WBS_MODEL_ID || undefined;
const requestedIds = new Set((process.env.WBS_CASE_IDS || '').split(',').filter(Boolean));
const summaries = process.env.WBS_RESUME === '1'
  ? JSON.parse(await fs.readFile(path.join(evidenceDir, 'runs.json'), 'utf8')) : [];
for (const c of expected.cases.filter(c => !requestedIds.size || requestedIds.has(c.id))) {
  const sessionId = `wbs-personal-${c.id}-${Date.now()}`;
  const started = Date.now();
  const record = { id: c.id, sessionId, modelId: modelId || 'default', prompt: c.prompt, startedAt: new Date().toISOString() };
  console.log(`START ${c.id} ${sessionId}`);
  let raw = '';
  try {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), path.basename(source));
    const upload = await fetch('http://127.0.0.1:3007/ai/chat/upload', {
      method: 'POST', headers: { Authorization: headers.Authorization }, body: form,
    });
    record.uploadHttpStatus = upload.status;
    if (!upload.ok) throw new Error(`Upload failed HTTP ${upload.status}`);
    const uploaded = await upload.json();
    record.uploadFileId = uploaded.fileId;
    if (!uploaded.fileId) throw new Error(`Upload missing fileId; fields: ${Object.keys(uploaded)}`);
    const res = await fetch('http://127.0.0.1:3007/ai/chat/stream', {
      method: 'POST', headers, signal: AbortSignal.timeout(300000),
      body: JSON.stringify({ message: c.prompt, sessionId, ...(modelId ? { modelId } : {}),
        config: { mode: 'chat', thinking: true, webSearch: false, workspaceSearch: false },
        files: [{ fileId: uploaded.fileId, fileName: path.basename(source), size: bytes.length,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] }),
    });
    record.httpStatus = res.status;
    const decoder = new TextDecoder();
    for await (const chunk of res.body) raw += decoder.decode(chunk, { stream: true });
    raw += decoder.decode();
  } catch (error) { record.transportError = String(error); }
  // Redact signed download URLs before saving evidence.
  raw = raw.replace(/([?&](?:token|access_token|signature)=)[^\s"&<>]+/gi, '$1REDACTED');
  await fs.writeFile(path.join(evidenceDir, `${c.id}.sse.txt`), raw);
  const events = raw.split('\n').filter(l => l.startsWith('data:')).flatMap(l => {
    try { return [JSON.parse(l.slice(5).trim())]; } catch { return []; }
  });
  record.seconds = (Date.now() - started) / 1000;
  record.eventTypes = events.reduce((a,e) => ({ ...a, [e.type]: (a[e.type] || 0) + 1 }), {});
  record.done = events.some(e => e.type === 'done');
  record.errors = events.filter(e => e.type === 'error');
  const finalResult = [...events].reverse().find(e => e.type === 'result' && typeof e.content === 'string');
  const answer = finalResult?.content ?? events.filter(e => ['content','observation'].includes(e.type))
    .map(e => typeof e.content === 'string' ? e.content : JSON.stringify(e.data || {})).join('\n');
  await fs.writeFile(path.join(evidenceDir, `${c.id}.answer.txt`), answer);
  record.traceIds = [...new Set(events.map(e => e.traceId || e.data?.traceId).filter(Boolean))];
  record.status = 'NEEDS_REVIEW'; // A successful stream is not business correctness.
  try {
    const history = await fetch(`http://127.0.0.1:3007/ai/chat/history/${sessionId}`, { headers });
    record.historyHttpStatus = history.status;
    const historyText = (await history.text()).replace(/([?&](?:token|access_token|signature)=)[^\s"&<>]+/gi, '$1REDACTED');
    await fs.writeFile(path.join(evidenceDir, `${c.id}.history.json`), historyText);
  } catch (error) { record.historyError = String(error); }
  const previous = summaries.findIndex(r => r.id === record.id);
  if (previous >= 0) summaries.splice(previous, 1, record);
  else summaries.push(record);
  await fs.writeFile(path.join(evidenceDir, 'runs.json'), JSON.stringify(summaries, null, 2) + '\n');
  console.log(`END ${c.id} ${record.seconds}s done=${record.done} errors=${record.errors.length}`);
}
