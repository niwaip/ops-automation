import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const sourceFile = process.env.SOURCE_FILE || '/Users/chain/Desktop/工数实绩明细_20261020134124.xlsx';
const outputDir = path.join(process.cwd(), 'docs/artifacts/reviews/groupby-query-audit-' + Date.now());
await fs.mkdir(outputDir, { recursive: true });

console.log('=== 开始端到端分组统计用例执行与审计 ===');
console.log('目标附件:', sourceFile);
console.log('输出目录:', outputDir);

// 1. 登录平台
console.log('\n[步骤 1] 登录平台获取鉴权令牌...');
const loginRes = await fetch('http://127.0.0.1:3001/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'test123' }),
});
if (!loginRes.ok) throw new Error(`Login failed with HTTP ${loginRes.status}`);
const { accessToken, user } = await loginRes.json();
console.log(`✓ 登录成功: 用户 ${user.username} (ID: ${user.id})`);

// 2. 上传附件
console.log('\n[步骤 2] 上传待查询工作簿附件...');
const fileBytes = await fs.readFile(sourceFile);
const fileSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const form = new FormData();
form.append('file', new Blob([fileBytes], { type: mimeType }), path.basename(sourceFile));

const uploadRes = await fetch('http://127.0.0.1:3007/ai/chat/upload', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
if (!uploadRes.ok) throw new Error(`Upload failed with HTTP ${uploadRes.status}`);
const uploadData = await uploadRes.json();
console.log(`✓ 附件上传成功: fileId=${uploadData.fileId}, SHA-256=${fileSha256}`);

// 3. 发起端到端流式查询请求
const sessionId = `audit-groupby-case-${Date.now()}`;
const prompt = '按照 部门名称 分组 进行金额的统计';
console.log(`\n[步骤 3] 发起会话流式请求: "${prompt}" (Session: ${sessionId})...`);

const payload = {
  message: prompt,
  sessionId,
  config: { mode: 'chat', thinking: true, webSearch: false, workspaceSearch: false },
  files: [{
    fileId: uploadData.fileId,
    fileName: path.basename(sourceFile),
    size: fileBytes.length,
    mimeType,
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
if (!streamRes.ok) throw new Error(`Stream HTTP ${streamRes.status}`);

const decoder = new TextDecoder();
let rawSSE = '';
const events = [];

for await (const chunk of streamRes.body) {
  rawSSE += decoder.decode(chunk, { stream: true });
}
rawSSE += decoder.decode();

// 解析 SSE
const blocks = rawSSE.replace(/\r\n/g, '\n').split(/\n\n+/);
for (const b of blocks) {
  const line = b.split('\n').find(l => l.startsWith('data:'));
  if (line) {
    const dataStr = line.slice(5).trim();
    if (dataStr && dataStr !== '[DONE]') {
      try {
        events.push(JSON.parse(dataStr));
      } catch (err) {
        events.push({ type: 'parse_error', raw: dataStr });
      }
    }
  }
}

const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
console.log(`✓ 流式交互接收完成 (耗时 ${elapsedSec}s, 收到 ${events.length} 个 SSE 事件)`);
await fs.writeFile(path.join(outputDir, 'events.json'), JSON.stringify(events, null, 2));
await fs.writeFile(path.join(outputDir, 'stream.raw.txt'), rawSSE);

// 4. 获取历史记录与沙箱状态
console.log('\n[步骤 4] 采集服务端会话历史记录...');
const historyRes = await fetch(`http://127.0.0.1:3007/ai/chat/history/${sessionId}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const history = await historyRes.json();
await fs.writeFile(path.join(outputDir, 'history.json'), JSON.stringify(history, null, 2));

// 5. 采集沙箱落地证据
console.log('\n[步骤 5] 提取沙箱持久化执行证据 (Evidence)...');
const evidencePath = path.join(process.cwd(), `data/users/${user.id}/workspace/.dsh/sessions/${sessionId}.evidence.json`);
let sandboxEvidence = null;
try {
  const rawEv = await fs.readFile(evidencePath, 'utf8');
  sandboxEvidence = JSON.parse(rawEv);
  await fs.writeFile(path.join(outputDir, 'evidence.json'), JSON.stringify(sandboxEvidence, null, 2));
  console.log(`✓ 沙箱证据提取成功: 证据凭证 ID=${sandboxEvidence.turn_id}`);
} catch (e) {
  console.warn('⚠️ 未直接找到沙箱证据文件:', evidencePath, e.message);
}

// 6. 审计与质量断言
console.log('\n[步骤 6] 全链路审计分析...');
const messages = Array.isArray(history) ? history : (history.messages || []);
const assistantMsg = messages.find(m => m.role === 'assistant');
const replyContent = assistantMsg ? assistantMsg.content : '';
await fs.writeFile(path.join(outputDir, 'final_reply.md'), replyContent);

console.log('----------------------------------------------------');
console.log('【大模型最终交付用户的内容】:');
console.log(replyContent.slice(0, 1000) + (replyContent.length > 1000 ? '\n...[省略其余内容]' : ''));
console.log('----------------------------------------------------');

const hasDetailTable = replyContent.includes('已检索到符合条件的明细数据') || (replyContent.includes('WBS编号') && replyContent.includes('员工姓名'));
const hasGroupedTable = replyContent.includes('華東MIS') || replyContent.includes('金額合計') || replyContent.includes('各部門金額合計');

const auditReport = {
  sessionId,
  elapsedSec: Number(elapsedSec),
  userPrompt: prompt,
  user: { id: user.id, username: user.username },
  fixtureSha256: fileSha256,
  verification: assistantMsg?.verification || null,
  toolCallsCount: sandboxEvidence?.receipts?.length || 0,
  hasUnexpectedDetailTable: hasDetailTable,
  hasExpectedGroupedTable: hasGroupedTable,
  isCorrect: !hasDetailTable && hasGroupedTable,
};

await fs.writeFile(path.join(outputDir, 'audit_report.json'), JSON.stringify(auditReport, null, 2));
console.log('\n审计摘要:', JSON.stringify(auditReport, null, 2));
console.log(`\n=== 审计完成，全部证据材料已保存至: ${outputDir} ===`);
