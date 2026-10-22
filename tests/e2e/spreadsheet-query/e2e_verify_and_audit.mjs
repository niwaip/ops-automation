import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const sourceFile = process.env.SOURCE_FILE || '/Users/chain/Desktop/工数实绩明细_20261020134124.xlsx';
const outputDir = process.env.OUTPUT_DIR || '/Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/spreadsheet-query-audit-20261021';
await fs.mkdir(outputDir, { recursive: true });

console.log('1. Logging in to platform...');
const loginRes = await fetch('http://127.0.0.1:3001/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'test123' }),
});
if (!loginRes.ok) throw new Error(`Login failed with HTTP ${loginRes.status}`);
const { accessToken, user } = await loginRes.json();
console.log(`✓ Logged in as ${user.username} (${user.id})`);

console.log('2. Uploading spreadsheet attachment...');
const fileBytes = await fs.readFile(sourceFile);
const fileSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
const form = new FormData();
form.append('file', new Blob([fileBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), path.basename(sourceFile));

const uploadRes = await fetch('http://127.0.0.1:3007/ai/chat/upload', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
if (!uploadRes.ok) throw new Error(`Upload failed with HTTP ${uploadRes.status}`);
const uploadData = await uploadRes.json();
console.log(`✓ File uploaded: fileId=${uploadData.fileId}, sha256=${fileSha256}`);

console.log('3. Initiating streaming chat request...');
const sessionId = `audit-query-${Date.now()}`;
const prompt = '读取附件，只统计明细，排除标题、表头和报表尾注。按部门编号统计各个部门的有偿和无偿金额(K)的合计。只在聊天中回答，不生成文件。';

const payload = {
  message: prompt,
  sessionId,
  config: { mode: 'chat', thinking: true, webSearch: false, workspaceSearch: false },
  files: [{
    fileId: uploadData.fileId,
    fileName: path.basename(sourceFile),
    size: fileBytes.length,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }],
};

await fs.writeFile(path.join(outputDir, 'request.json'), JSON.stringify(payload, null, 2));

const startedAt = Date.now();
const streamRes = await fetch('http://127.0.0.1:3007/ai/chat/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(300000),
});

if (!streamRes.ok) throw new Error(`Stream request failed with HTTP ${streamRes.status}`);

const events = [];
let rawSse = '';
let ttftMs = null;
const decoder = new TextDecoder();

console.log('4. Consuming SSE stream...');
let lineBuffer = '';
for await (const chunk of streamRes.body) {
  const text = decoder.decode(chunk, { stream: true });
  rawSse += text;
  lineBuffer += text;
  const lines = lineBuffer.split('\n');
  lineBuffer = lines.pop();

  for (const line of lines) {
    if (line.startsWith('data:')) {
      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      const now = Date.now();
      if (ttftMs === null) ttftMs = now - startedAt;
      try {
        const parsed = JSON.parse(dataStr);
        events.push({ elapsedMs: now - startedAt, ...parsed });
        if (parsed.type === 'tool_call') {
          console.log(`⚡ [Tool Call] ${parsed.name || parsed.data?.name || JSON.stringify(parsed)}`);
        } else if (parsed.type === 'status') {
          console.log(`ℹ️ [Status] ${parsed.message || parsed.content || JSON.stringify(parsed)}`);
        } else if (parsed.type === 'done') {
          console.log(`✓ [Done]`);
        }
      } catch (err) {
        events.push({ elapsedMs: now - startedAt, type: 'parse_error', raw: dataStr });
      }
    }
  }
}

const totalDurationMs = Date.now() - startedAt;
console.log(`✓ Stream completed in ${(totalDurationMs / 1000).toFixed(2)}s (TTFT: ${ttftMs}ms)`);

await fs.writeFile(path.join(outputDir, 'stream.sse'), rawSse);
await fs.writeFile(path.join(outputDir, 'events.json'), JSON.stringify(events, null, 2));

console.log('5. Fetching conversation history...');
const histRes = await fetch(`http://127.0.0.1:3007/ai/chat/history/${sessionId}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
let historyData = null;
if (histRes.ok) {
  historyData = await histRes.json();
  await fs.writeFile(path.join(outputDir, 'history.json'), JSON.stringify(historyData, null, 2));
  console.log('✓ History saved.');
} else {
  console.warn(`Failed to fetch history: HTTP ${histRes.status}`);
}

// Extract final answer content
const contentPieces = events.filter(e => (e.type === 'content' || e.type === 'result') && e.content).map(e => e.content);
const finalContent = contentPieces.join('');
await fs.writeFile(path.join(outputDir, 'final_answer.txt'), finalContent);

console.log('\n--- FINAL MODEL ANSWER ---\n' + finalContent + '\n-------------------------\n');
