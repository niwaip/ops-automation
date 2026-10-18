import * as path from 'node:path';
import { writeFile } from 'node:fs/promises';
import {
  login,
  getMyWorkspaces,
  saveTextNote,
  getNode,
  getNodes,
  getFilePreview,
  deleteNode,
  checkStorageFile,
  waitForAiRefinement,
  waitForAllNodesToSettle,
  sendRealChatStream,
  sleep,
} from './client.mjs';

const RUN_ID = `REAL_CHAT_E2E_${Date.now().toString(36).toUpperCase()}`;
const report = {
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  endedAt: null,
  passed: false,
  totalChecks: 0,
  passedChecks: 0,
  failedChecks: 0,
  checks: [],
  cleanupRecords: [],
  cleanupErrors: [],
  errors: [],
};

const createdFolders = new Set();
const createdNotes = new Set();

function recordCheck(scenario, checkName, ok, details = null) {
  report.totalChecks++;
  if (ok) report.passedChecks++;
  else report.failedChecks++;
  const result = { scenario, checkName, passed: Boolean(ok), details };
  report.checks.push(result);
  const statusEmoji = ok ? '✅' : '❌';
  console.log(`  ${statusEmoji} [${scenario}] ${checkName}`);
  if (!ok && details) {
    console.warn(`     ↳ Details:`, JSON.stringify(details));
  }
}

async function writeFinalReport() {
  report.endedAt = new Date().toISOString();
  report.passed = report.failedChecks === 0 && report.totalChecks > 0 && report.errors.length === 0 && report.cleanupErrors.length === 0;
  const reportFilePath = path.resolve(process.cwd(), `tests/e2e/workspace-save/report-${RUN_ID}.json`);
  await writeFile(reportFilePath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n======================================================`);
  console.log(`📊 真实会话端对端全链路审计结果 (Verdict: ${report.passed ? 'PASSED ✅' : 'FAILED ❌'})`);
  console.log(`   - 检验项总数: ${report.totalChecks}`);
  console.log(`   - 校验通过数: ${report.passedChecks}`);
  console.log(`   - 校验失败数: ${report.failedChecks}`);
  console.log(`   - 清理异常数: ${report.cleanupErrors.length}`);
  console.log(`   - 审计报告文件: ${reportFilePath}`);
  console.log(`======================================================\n`);
  if (!report.passed) {
    process.exitCode = 1;
  }
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`🚀 开始执行【真实会话与模型生成】端对端主链路验证 (Run ID: ${RUN_ID})`);
  console.log(`======================================================\n`);

  let token;
  let personalWorkspaceId;
  let rootSavedFolderId = null;
  let rootTasksFolderId = null;

  try {
    token = await login('admin', 'admin123');
    recordCheck('setup', '管理凭证就绪', Boolean(token));

    const wsData = await getMyWorkspaces(token);
    personalWorkspaceId = wsData?.personal?.id;
    recordCheck('setup', '个人工作空间就绪', Boolean(personalWorkspaceId));

    const rootNodes = await getNodes(personalWorkspaceId, null, token);
    for (const node of rootNodes) {
      if (node.name === '沙盒保存内容 (saved)') rootSavedFolderId = node.id;
      if (node.name === '工作任务成果 (tasks)') rootTasksFolderId = node.id;
    }
    recordCheck('setup', '沙盒内容与任务成果根目录双就绪', Boolean(rootSavedFolderId && rootTasksFolderId));
  } catch (err) {
    report.errors.push(`Setup failed: ${err.message}`);
    await writeFinalReport();
    return;
  }

  // ==========================================
  // 主链路 1: 真实个人模式对话 -> 纯文本生成 -> 沉淀保存
  // ==========================================
  console.log(`\n▶️ [主链路 1] 真实个人模式对话 -> 纯文本生成 -> 沉淀保存`);
  try {
    const userQuery = '请给出代码评审中提升团队工程质量的3条核心原则';
    console.log(`   🗣️ 用户提问: "${userQuery}"...`);
    const chatRes = await sendRealChatStream(token, {
      message: userQuery,
      mode: 'chat',
    });

    recordCheck('real-personal-pure', '真实大模型流式对话成功响应', Boolean(chatRes.content && chatRes.content.length > 20), {
      contentLength: chatRes.content.length,
      sampleSnippet: chatRes.content.slice(0, 100),
    });

    // 模拟前端 SaveToWorkspaceAction.tsx 逻辑组装 DTO
    const title = `${userQuery.slice(0, 25)} 总结`;
    const dto = {
      title,
      content: chatRes.content,
      tags: ['AI沉淀', '知识候选', '问答沉淀'],
      folderPath: '沙盒保存内容 (saved)',
      type: 'qa_note',
      userQuery,
      sessionId: chatRes.sessionId,
      aiModel: 'default',
    };

    const savedNode = await saveTextNote(dto, token);
    recordCheck('real-personal-pure', '真实对话成果成功持久化至资料空间', Boolean(savedNode?.id && savedNode?.parentId));

    if (savedNode?.id) {
      createdNotes.add(savedNode.id);
      if (savedNode.parentId) createdFolders.add(savedNode.parentId);

      const parentFolder = await getNode(personalWorkspaceId, savedNode.parentId, token);
      recordCheck('real-personal-pure', '成果归档于沙盒保存内容目录树下', parentFolder?.parentId === rootSavedFolderId);

      const preview = await getFilePreview(personalWorkspaceId, savedNode.id, token);
      recordCheck('real-personal-pure', 'FrontMatter 携带用户真实提问背景与会话 ID', preview.content?.includes(userQuery) && preview.content?.includes(chatRes.sessionId));
    }
  } catch (err) {
    recordCheck('real-personal-pure', '主链路 1 执行异常', false, { error: err.message });
  }

  // ==========================================
  // 主链路 2: 真实个人模式对话 -> 提示词要求生成自包含 HTML -> 伴生产物提取入夹
  // ==========================================
  console.log(`\n▶️ [主链路 2] 真实个人模式对话 -> HTML自包含看板生成 -> 伴生资产提取`);
  try {
    const userQuery = '请用单文件自包含 HTML 生成一个服务可用性监控卡片，正文输出：输出文件：service_status.html 并提供 ```html 代码块';
    console.log(`   🗣️ 用户提问: "${userQuery}"...`);
    const chatRes = await sendRealChatStream(token, {
      message: userQuery,
      mode: 'chat',
    });

    const hasHtmlBlock = chatRes.content.includes('```html') || chatRes.content.includes('<html');
    recordCheck('real-personal-html', '真实模型成功生成包含 HTML 代码块的交付内容', Boolean(hasHtmlBlock), {
      contentLength: chatRes.content.length,
    });

    const title = '服务可用性监控看板';
    const dto = {
      title,
      content: chatRes.content,
      tags: ['AI沉淀', '知识候选', '前端原型'],
      folderPath: '沙盒保存内容 (saved)',
      type: 'qa_note',
      userQuery,
      sessionId: chatRes.sessionId,
      aiModel: 'default',
    };

    const savedNode = await saveTextNote(dto, token);
    recordCheck('real-personal-html', '包含 HTML 内容的对话笔记保存成功', Boolean(savedNode?.id && savedNode?.parentId));

    if (savedNode?.id) {
      createdNotes.add(savedNode.id);
      if (savedNode.parentId) createdFolders.add(savedNode.parentId);

      // 伴生产物提取由后台流水线异步归集，轮询等待其创建与落盘
      let folderChildren = [];
      let htmlFile = null;
      for (let i = 0; i < 30; i++) {
        folderChildren = await getNodes(personalWorkspaceId, savedNode.parentId, token);
        htmlFile = folderChildren.find((n) => n.name.endsWith('.html'));
        if (htmlFile) break;
        await sleep(500);
      }

      recordCheck('real-personal-html', '系统自动将真实生成的 HTML 代码块提取为同级独立文件', Boolean(htmlFile), {
        filesInFolder: folderChildren.map((n) => n.name),
      });

      if (htmlFile) {
        const artCheck = checkStorageFile(htmlFile.storagePath);
        recordCheck('real-personal-html', '提取的 HTML 资产在存储介质中完整落盘', artCheck.exists && artCheck.sizeBytes > 0);
      }
    }
  } catch (err) {
    recordCheck('real-personal-html', '主链路 2 执行异常', false, { error: err.message });
  }

  // ==========================================
  // 主链路 3: 真实工作协同模式 -> 任务流执行 -> 成果沉淀
  // ==========================================
  console.log(`\n▶️ [主链路 3] 真实工作协同模式 -> 任务流执行 -> 工作成果沉淀`);
  try {
    const userQuery = '/doc 全文检索系统配置与业务架构文档';
    console.log(`   💼 发起工作模式任务协同: "${userQuery}"...`);
    const taskRes = await sendRealChatStream(token, {
      message: userQuery,
      mode: 'task',
    });

    recordCheck('real-work-task', '工作模式流式任务交互正常完成', Boolean(taskRes.content));
    recordCheck(
      'real-work-task',
      '任务协同真实规划并返回全新 executionId（严格禁止历史 ID 兜底）',
      Boolean(taskRes.executionId && taskRes.executionId !== '06e9ace5-4ca9-4fac-8c84-42adc36eed81'),
      { executionId: taskRes.executionId }
    );

    if (!taskRes.executionId) {
      throw new Error('Task mode failed to produce a valid executionId from real planner!');
    }

    const title = `工作空间探索成果_${RUN_ID}`;
    const dto = {
      title,
      content: taskRes.content,
      tags: ['AI沉淀', '知识候选', '任务结果', '工作空间探索'],
      folderPath: '工作任务成果 (tasks)',
      type: 'task_result',
      executionId: taskRes.executionId,
      userQuery,
      sessionId: taskRes.sessionId,
      skillUsed: 'platform.workspace.explorer',
    };

    const savedNode = await saveTextNote(dto, token);
    recordCheck('real-work-task', '工作任务成果成功归档', Boolean(savedNode?.id && savedNode?.parentId));

    if (savedNode?.id) {
      createdNotes.add(savedNode.id);
      if (savedNode.parentId) createdFolders.add(savedNode.parentId);

      const parentFolder = await getNode(personalWorkspaceId, savedNode.parentId, token);
      recordCheck('real-work-task', '工作任务成果精准归档至「工作任务成果 (tasks)」根目录', parentFolder?.parentId === rootTasksFolderId);

      const preview = await getFilePreview(personalWorkspaceId, savedNode.id, token);
      recordCheck(
        'real-work-task',
        'FrontMatter 正确绑定真实 execution_id 与任务元数据',
        preview.content?.includes(taskRes.executionId) && preview.content?.includes('type: "task_result"')
      );
    }
  } catch (err) {
    recordCheck('real-work-task', '主链路 3 执行异常', false, { error: err.message });
  }

  // 等待后台异步任务收敛
  console.log(`\n⏳ 等待真实会话提炼任务安全收敛...`);
  const settleRes = await waitForAllNodesToSettle(personalWorkspaceId, Array.from(createdNotes), token, 60000);
  recordCheck('async-settle', '所有后台 AI 提炼与落盘流水线平稳收敛至终态（无静默超时）', settleRes.settled, {
    elapsedMs: settleRes.elapsedMs,
    unsettledCount: settleRes.pending.length,
    unsettledIds: settleRes.pending,
  });

  // 清理临时测试数据
  console.log(`\n🧹 清理测试生成的专属成果文件夹...`);
  for (const folderId of createdFolders) {
    try {
      await deleteNode(personalWorkspaceId, folderId, token);
      report.cleanupRecords.push({ id: folderId, type: 'folder', status: 'deleted' });
    } catch (cleanErr) {
      report.cleanupErrors.push({ id: folderId, type: 'folder', status: 'failed', error: cleanErr.message });
    }
  }
  console.log(`   已清理 ${report.cleanupRecords.filter((r) => r.status === 'deleted').length} 个文件夹，异常 ${report.cleanupErrors.length} 个`);

  await writeFinalReport();
}

run().catch(async (err) => {
  console.error('Fatal execution error:', err);
  report.errors.push(err.message);
  await writeFinalReport();
});
