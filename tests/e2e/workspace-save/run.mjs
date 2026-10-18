import * as path from 'node:path';
import { writeFile } from 'node:fs/promises';
import {
  login,
  getMyWorkspaces,
  saveTextNote,
  getNode,
  getNodes,
  getFilePreview,
  searchFiles,
  deleteNode,
  checkStorageFile,
  waitForAiRefinement,
  waitForAllNodesToSettle,
} from './client.mjs';
import { buildCases } from './cases.mjs';

const RUN_ID = `E2E_VERIFY_${Date.now().toString(36).toUpperCase()}`;
const report = {
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  endedAt: null,
  passed: false,
  totalChecks: 0,
  passedChecks: 0,
  failedChecks: 0,
  casesExecuted: [],
  cleanupRecords: [],
  cleanupErrors: [],
  errors: [],
};

const createdFolders = new Set();
const createdNotes = new Set();
const createdNodes = createdNotes;

function recordCheck(caseId, checkName, ok, details = null) {
  report.totalChecks++;
  if (ok) {
    report.passedChecks++;
  } else {
    report.failedChecks++;
  }
  const checkResult = { caseId, checkName, passed: Boolean(ok), details };
  report.casesExecuted.push(checkResult);
  const statusEmoji = ok ? '✅' : '❌';
  console.log(`  ${statusEmoji} [${caseId}] ${checkName}`);
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
  console.log(`📊 端对端验证审计结果 (Verdict: ${report.passed ? 'PASSED ✅' : 'FAILED ❌'})`);
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
  console.log(`🚀 开始执行资料空间端对端严格验证套件 (Run ID: ${RUN_ID})`);
  console.log(`======================================================\n`);

  let token;
  let personalWorkspaceId;
  let rootSavedFolderId = null;
  let rootTasksFolderId = null;

  // 1. 登录与环境就绪检查
  try {
    token = await login('admin', 'admin123');
    recordCheck('setup', '管理凭证获取成功并有效', Boolean(token));

    const wsData = await getMyWorkspaces(token);
    personalWorkspaceId = wsData?.personal?.id;
    recordCheck('setup', '个人工作空间解析成功', Boolean(personalWorkspaceId), {
      personalWorkspaceId,
      workspaceName: wsData?.personal?.name,
    });

    const rootNodes = await getNodes(personalWorkspaceId, null, token);
    for (const node of rootNodes) {
      if (node.name === '沙盒保存内容 (saved)') rootSavedFolderId = node.id;
      if (node.name === '工作任务成果 (tasks)') rootTasksFolderId = node.id;
    }
    recordCheck('setup', '核心归档根目录就绪', Boolean(rootSavedFolderId && rootTasksFolderId), {
      rootSavedFolderId,
      rootTasksFolderId,
    });
  } catch (err) {
    console.error('Setup failed:', err.message);
    report.errors.push(`Setup failed: ${err.message}`);
    await writeFinalReport();
    return;
  }

  const cases = buildCases(RUN_ID);

  // 2. 遍历执行各场景用例
  for (const c of cases) {
    console.log(`\n▶️ 执行场景: ${c.name} (${c.id})`);
    console.log(`   ${c.description}`);

    try {
      if (c.id === 'same-session-idempotency') {
        // --- 场景 7: 同会话幂等性校验 ---
        const firstRes = await saveTextNote(c.firstCall, token);
        if (firstRes?.parentId) createdFolders.add(firstRes.parentId);
        if (firstRes?.id) createdNotes.add(firstRes.id);

        const secondRes = await saveTextNote(c.secondCall, token);
        recordCheck(c.id, '首次保存返回有效节点', Boolean(firstRes?.id && firstRes?.name));
        recordCheck(c.id, '二次保存命中 5 分钟同会话幂等并复用已有节点 ID', firstRes.id === secondRes.id, {
          firstNodeId: firstRes.id,
          secondNodeId: secondRes.id,
        });

        // 验证文件夹内没有产生重复文件节点
        const folderChildren = await getNodes(personalWorkspaceId, firstRes.parentId, token);
        const mdFiles = folderChildren.filter((n) => n.name.endsWith('.md'));
        recordCheck(c.id, '同会话幂等保存未在专属文件夹内产生重复文件', mdFiles.length === 1, {
          mdCount: mdFiles.length,
          files: folderChildren.map((n) => n.name),
        });
        continue;
      }

      if (c.id === 'cross-session-isolation') {
        // --- 场景 8: 跨会话防污染与时间后缀隔离 ---
        const resA = await saveTextNote(c.sessionA, token);
        if (resA?.parentId) createdFolders.add(resA.parentId);
        if (resA?.id) createdNotes.add(resA.id);

        const resB = await saveTextNote(c.sessionB, token);
        if (resB?.parentId) createdFolders.add(resB.parentId);
        if (resB?.id) createdNotes.add(resB.id);

        const folderA = await getNode(personalWorkspaceId, resA.parentId, token);
        const folderB = await getNode(personalWorkspaceId, resB.parentId, token);

        recordCheck(c.id, '两独立会话保存到各自独立专属文件夹', resA.parentId !== resB.parentId, {
          folderAId: resA.parentId,
          folderBId: resB.parentId,
        });
        recordCheck(c.id, '跨会话同名主题自动分配时间戳后缀防碰撞', /_\d{6}$/.test(folderB.name), {
          folderAName: folderA.name,
          folderBName: folderB.name,
        });
        continue;
      }

      // --- 常规用例：调用 saveTextNote 并做严格端对端断言 ---
      const savedNode = await saveTextNote(c.dto, token);
      recordCheck(c.id, '保存接口返回有效文件节点', Boolean(savedNode?.id && savedNode?.parentId), {
        nodeId: savedNode?.id,
        name: savedNode?.name,
      });

      if (!savedNode?.id) continue;
      createdNotes.add(savedNode.id);
      if (savedNode.parentId) createdFolders.add(savedNode.parentId);

      // 核验扩展名规范 (docExtension)
      if (c.expected.docExtension) {
        recordCheck(
          c.id,
          `主文档扩展名为「${c.expected.docExtension}」`,
          savedNode.name.endsWith(c.expected.docExtension),
          { fileName: savedNode.name }
        );
      }

      // 核验父级专属成果文件夹
      const parentFolder = await getNode(personalWorkspaceId, savedNode.parentId, token);
      recordCheck(c.id, '专属成果文件夹已创建', Boolean(parentFolder?.id), {
        folderName: parentFolder?.name,
        folderParentId: parentFolder?.parentId,
      });

      // 核验归档目标分类目录（个人模式 vs 工作模式）
      const expectedRootId =
        c.expected.rootFolderName === '工作任务成果 (tasks)'
          ? rootTasksFolderId
          : rootSavedFolderId;
      recordCheck(
        c.id,
        `归档至预期的核心分类根目录「${c.expected.rootFolderName}」`,
        parentFolder?.parentId === expectedRootId,
        { actualParentId: parentFolder?.parentId, expectedRootId }
      );

      // 核验专属文件夹命名日期前缀规范 (YYYYMMDD_...)
      if (c.expected.folderPrefixRegex) {
        recordCheck(
          c.id,
          '专属文件夹命名遵循 YYYYMMDD_ 前缀规范',
          c.expected.folderPrefixRegex.test(parentFolder?.name || ''),
          { folderName: parentFolder?.name }
        );
      }

      // 核验物理磁盘落盘与文件存在
      const storageCheck = checkStorageFile(savedNode.storagePath);
      recordCheck(c.id, '主文档已物理落盘至存储盘并有实际体积', storageCheck.exists && storageCheck.sizeBytes > 0, {
        storagePath: savedNode.storagePath,
        sizeBytes: storageCheck.sizeBytes,
      });

      // 核验文件纯文本预览与 FrontMatter
      const preview = await getFilePreview(personalWorkspaceId, savedNode.id, token);
      recordCheck(c.id, '文档支持预览且属于文本格式', preview.isText === true && Boolean(preview.content), {
        mimeType: preview.mimeType,
        totalLines: preview.totalLines,
      });

      if (c.expected.frontMatterCheck) {
        const fmPassed = c.expected.frontMatterCheck(preview.content || '');
        recordCheck(c.id, 'YAML FrontMatter 元数据字段准确注入', fmPassed, {
          previewExcerpt: preview.content?.slice(0, 300),
        });
      }

      // 核验复杂 Markdown 表格及章节
      if (c.expected.checkTablePreserved) {
        const hasTable =
          preview.content?.includes('| **线程架构** |') ||
          preview.content?.includes('| 特性对比项 |');
        recordCheck(c.id, '复杂 Markdown 表格结构在正文中完整保留', Boolean(hasTable));
      }

      // 核验原始结构化数据折叠收纳
      if (c.expected.checkRawDataInNote) {
        const hasDetails =
          preview.content?.includes('<details>') &&
          preview.content?.includes('<summary>展开查看原始结构化数据</summary>');
        recordCheck(c.id, '原始结构化数据已作为证据折叠嵌入 Markdown 正文', Boolean(hasDetails));
      }

      // 核验 HTML 伴生资产自动提取与落盘
      if (c.expected.expectedArtifactName) {
        const folderChildren = await getNodes(personalWorkspaceId, savedNode.parentId, token);
        const artifactNode = folderChildren.find((n) => n.name === c.expected.expectedArtifactName);

        recordCheck(c.id, `内联提取出的伴生资产「${c.expected.expectedArtifactName}」作为独立节点入夹`, Boolean(artifactNode), {
          folderChildren: folderChildren.map((n) => ({ name: n.name, type: n.type, mime: n.mimeType })),
        });

        if (artifactNode) {
          recordCheck(c.id, `伴生资产 MIME 类型符合预期 (${c.expected.expectedMimeType || 'text/html'})`, artifactNode.mimeType === (c.expected.expectedMimeType || 'text/html'), {
            mimeType: artifactNode.mimeType,
            fileSize: artifactNode.fileSize,
          });

          // 物理磁盘检查
          const artStorageCheck = checkStorageFile(artifactNode.storagePath);
          recordCheck(c.id, '伴生资产在物理存储介质中完整落盘且包含 HTML 标签', artStorageCheck.exists && artStorageCheck.contentPreview?.includes('<html'), {
            storagePath: artifactNode.storagePath,
            sizeBytes: artStorageCheck.sizeBytes,
          });

          // 预览伴生资产
          const artPreview = await getFilePreview(personalWorkspaceId, artifactNode.id, token);
          recordCheck(c.id, '伴生资产支持直接文本/HTML预览获取', Boolean(artPreview.content && artPreview.content.includes('<html')), {
            fileName: artPreview.fileName,
          });
        }
      }

      // 异步等待 AI 提炼流水线（严格断言，绝不静默跳过）
      if (c.expected.checkAiRefinement || c.expected.checkArtifactCatalogInNote || c.expected.checkHeadingsExtracted) {
        console.log(`   ⏳ 等待后台 AI 综合提炼流水线就绪 (LLM 文件夹命名与重构)...`);
        const { node: refinedNode, success, timeout, elapsedMs } = await waitForAiRefinement(
          personalWorkspaceId,
          savedNode.id,
          token,
          40000
        );

        recordCheck(c.id, 'AI 知识提炼与摘要卡片生成完成', Boolean(success && refinedNode?.digest?.summary), {
          success,
          timeout,
          elapsedMs,
          summaryLength: refinedNode?.digest?.summary?.length,
          headingsCount: refinedNode?.digest?.headings?.length,
        });

        // 校验提炼后模型归属与降级标记
        if (c.expected.postRefinementCheck) {
          const refinedPreview = await getFilePreview(personalWorkspaceId, savedNode.id, token);
          const prPassed = c.expected.postRefinementCheck(refinedNode, refinedPreview);
          recordCheck(c.id, '提炼后准确记录有效生效模型与降级溯源标记', prPassed, {
            requestedModel: c.dto.aiModel,
            digestAiModel: refinedNode?.digest?.aiModel,
            fallbackUsed: refinedNode?.digest?.aiModel === 'default' && c.dto.aiModel !== 'default',
            refinedFrontMatter: refinedPreview.content?.slice(0, 350),
          });
        }

        // 校验目录 headings 结构化提取
        if (c.expected.checkHeadingsExtracted) {
          const headings = refinedNode?.digest?.headings || [];
          recordCheck(c.id, '提炼卡片正确提取出文档多级章节目录 (headings)', headings.length >= 2, {
            headings,
          });
        }

        // 重新获取提炼后的正文并严格校验交付资产表格清单与相对链接（严禁单纯包含文件名误报）
        if (c.expected.checkArtifactCatalogInNote) {
          const refinedPreview = await getFilePreview(personalWorkspaceId, savedNode.id, token);
          const hasCatalogHeading = refinedPreview.content?.includes('## 📁 交付资产与文件清单');
          // 必须包含标准 Markdown 表格行且带有相对跳转链接 [filename](./filename)
          const encodedName = encodeURIComponent(c.expected.expectedArtifactName);
          const hasRelativeLink =
            refinedPreview.content?.includes(`[${c.expected.expectedArtifactName}](./${encodedName})`) ||
            refinedPreview.content?.includes(`[${c.expected.expectedArtifactName}](./${c.expected.expectedArtifactName})`);

          recordCheck(c.id, '提炼后主 Markdown 报告中已自动注入交付资产清单与相对链接', Boolean(hasCatalogHeading && hasRelativeLink), {
            hasCatalogHeading,
            hasRelativeLink,
            previewSnippet: refinedPreview.content?.slice(refinedPreview.content.indexOf('## 📁'), refinedPreview.content.indexOf('## 📁') + 300),
          });
        }
      }
    } catch (err) {
      console.error(`Error in case ${c.id}:`, err.message);
      recordCheck(c.id, '场景执行无异常', false, { error: err.message, stack: err.stack });
    }
  }

  // 3. 跨工作空间检索与文件查询能力核验
  console.log(`\n▶️ 执行场景: 资料空间检索与目录树钻取核验`);
  try {
    const searchRes = await searchFiles(RUN_ID, token);
    recordCheck('workspace-search', '搜索 API 支持按关键词匹配到本次保存的文档', Array.isArray(searchRes) && searchRes.length > 0, {
      matchCount: searchRes?.length,
      sampleMatch: searchRes?.[0]?.name,
    });
  } catch (err) {
    recordCheck('workspace-search', '检索接口调用成功', false, { error: err.message });
  }

  // 4. 等待所有后台任务平稳收敛终态，消除竞态条件
  console.log(`\n⏳ 等待所有后台异步流水线收敛终态，防止清理时发生竞态冲突...`);
  const settleRes = await waitForAllNodesToSettle(personalWorkspaceId, Array.from(createdNotes), token, 45000);
  recordCheck('async-settle', '所有后台 AI 提炼与落盘流水线平稳收敛至终态（无静默超时）', settleRes.settled, {
    elapsedMs: settleRes.elapsedMs,
    unsettledCount: settleRes.pending.length,
    unsettledIds: settleRes.pending,
  });

  // 5. 安全清理测试专属文件夹
  console.log(`\n🧹 清理测试过程中创建的临时专属文件夹与文档节点...`);
  for (const folderId of createdFolders) {
    try {
      await deleteNode(personalWorkspaceId, folderId, token);
      report.cleanupRecords.push({ id: folderId, type: 'folder', status: 'deleted' });
    } catch (cleanErr) {
      report.cleanupErrors.push({ id: folderId, type: 'folder', status: 'failed', error: cleanErr.message });
    }
  }
  console.log(`   已清理 ${report.cleanupRecords.filter((r) => r.status === 'deleted').length} 个测试专属文件夹，清理异常 ${report.cleanupErrors.length} 个`);

  await writeFinalReport();
}

run().catch(async (err) => {
  console.error('Fatal execution error:', err);
  report.errors.push(err.message);
  await writeFinalReport();
});
