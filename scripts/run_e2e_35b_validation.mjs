#!/usr/bin/env node
/**
 * End-to-End Verification Suite using 35B Model (qwen36-35b-a3b)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { login, uploadFile, runChatCase } from './run_benchmark_35b.mjs';

const WORKSPACE_DIR = path.resolve('data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace');
const SAMPLE_DIR = path.resolve('docs/artifacts/reviews/personal-industry-e2e-2026-10-14-files');

async function main() {
  console.log('🚀 [35B E2E Validation] Logging into platform...');
  const token = await login();
  console.log(`✓ Logged in successfully. Token: ${token.slice(0, 20)}...`);

  const results = [];

  // =========================================================================
  // Case 1: M03 / MFG-02 - Markdown 行动清单 (严格否定 HTML/PPTX)
  // =========================================================================
  console.log('\n======================================================');
  console.log('>>> [CASE 1] M03: 制造业夜班交接 (严格约束: 产出 Markdown, 禁 HTML/PPT)');
  const fileM03 = path.join(SAMPLE_DIR, '制造业_设备交接记录.txt');
  let uploadM03 = null;
  if (fs.existsSync(fileM03)) {
    uploadM03 = await uploadFile(token, fileM03);
    console.log(`✓ Uploaded: ${uploadM03.fileName} (${uploadM03.fileSize} bytes)`);
  }

  const promptM03 = '请根据上传的设备交接记录，整理一份结构清晰的夜班交接行动清单，保存为“制造业_M03夜班交接.md”，明确设备状态、工艺温度、异常排查与巡检要求。无需HTML/PPT，不要生成其他多余文件。';
  const resM03 = await runChatCase({
    token,
    prompt: promptM03,
    files: uploadM03 ? [uploadM03] : [],
    timeoutMs: 180000,
  });

  const m03Target = path.join(WORKSPACE_DIR, '制造业_M03夜班交接.md');
  const m03ForbiddenHtml = path.join(WORKSPACE_DIR, 'presentation.html');
  const m03ForbiddenPptx1 = path.join(WORKSPACE_DIR, '制造业_M03夜班交接.pptx');
  const m03ForbiddenPptx2 = path.join(WORKSPACE_DIR, 'presentation.pptx');

  const m03MdExists = fs.existsSync(m03Target) && fs.statSync(m03Target).size > 100;
  const m03HtmlNotGenerated = !fs.existsSync(m03ForbiddenHtml);
  const m03PptxNotGenerated = !fs.existsSync(m03ForbiddenPptx1) && !fs.existsSync(m03ForbiddenPptx2);
  const m03Success = resM03.exitCode === 0 && m03MdExists && m03HtmlNotGenerated && m03PptxNotGenerated;

  results.push({
    id: 'CASE-1-M03',
    title: '制造业夜班交接.md (禁 HTML/PPT)',
    passed: m03Success,
    durationMs: resM03.durationMs,
    usage: resM03.usage,
    checks: {
      mdExists: m03MdExists,
      mdSize: m03MdExists ? fs.statSync(m03Target).size : 0,
      htmlBlocked: m03HtmlNotGenerated,
      pptxBlocked: m03PptxNotGenerated,
    },
  });
  console.log(`[CASE 1 Result] Passed: ${m03Success}, checks:`, results[0].checks);

  // =========================================================================
  // Case 2: RET-02 - 零售门店闭店交接清单 (Word docx 交付)
  // =========================================================================
  console.log('\n======================================================');
  console.log('>>> [CASE 2] RET-02: 零售门店闭店交接清单 (Word .docx 交付)');
  const fileRet02 = path.join(SAMPLE_DIR, '零售业_退换货记录.csv');
  let uploadRet02 = null;
  if (fs.existsSync(fileRet02)) {
    uploadRet02 = await uploadFile(token, fileRet02);
    console.log(`✓ Uploaded: ${uploadRet02.fileName} (${uploadRet02.fileSize} bytes)`);
  }

  const promptRet02 = '请根据上传的退换货记录，结合门店闭店标准，制作一份结构规范的Word闭店交接清单“零售门店闭店交接清单.docx”，覆盖收银、冷藏食品温度、货架补货、退换货暂存、设备断电、钥匙交接及异常记录，不要生成PPT或网页。';
  const resRet02 = await runChatCase({
    token,
    prompt: promptRet02,
    files: uploadRet02 ? [uploadRet02] : [],
    timeoutMs: 180000,
  });

  const ret02Target = path.join(WORKSPACE_DIR, '零售门店闭店交接清单.docx');
  const ret02DocxExists = fs.existsSync(ret02Target) && fs.statSync(ret02Target).size > 1000;
  const ret02Success = resRet02.exitCode === 0 && ret02DocxExists;

  results.push({
    id: 'CASE-2-RET02',
    title: '零售门店闭店交接清单.docx',
    passed: ret02Success,
    durationMs: resRet02.durationMs,
    usage: resRet02.usage,
    checks: {
      docxExists: ret02DocxExists,
      docxSize: ret02DocxExists ? fs.statSync(ret02Target).size : 0,
    },
  });
  console.log(`[CASE 2 Result] Passed: ${ret02Success}, checks:`, results[1].checks);

  // =========================================================================
  // Case 3: M08 - 原生 PPTX 演示文稿 (严格要求原生 .pptx, 禁 HTML)
  // =========================================================================
  console.log('\n======================================================');
  console.log('>>> [CASE 3] M08: 原生 PPTX 演示文稿 (原生 python-pptx 落盘, 禁 HTML)');
  const promptM08 = '根据设备交接记录制作5页班组培训演示文稿，交付原生PowerPoint文件“设备操作培训.pptx”，包含开机检查、常见故障和停机交接，不要HTML。';
  const resM08 = await runChatCase({
    token,
    prompt: promptM08,
    files: uploadM03 ? [uploadM03] : [],
    timeoutMs: 180000,
  });

  const m08Target = path.join(WORKSPACE_DIR, '设备操作培训.pptx');
  const m08ForbiddenHtml = path.join(WORKSPACE_DIR, 'presentation.html');
  const m08PptxExists = fs.existsSync(m08Target) && fs.statSync(m08Target).size > 1000;
  const m08HtmlBlocked = !fs.existsSync(m08ForbiddenHtml);
  const m08Success = resM08.exitCode === 0 && m08PptxExists && m08HtmlBlocked;

  results.push({
    id: 'CASE-3-M08',
    title: '设备操作培训.pptx (原生 PPTX, 禁 HTML)',
    passed: m08Success,
    durationMs: resM08.durationMs,
    usage: resM08.usage,
    checks: {
      pptxExists: m08PptxExists,
      pptxSize: m08PptxExists ? fs.statSync(m08Target).size : 0,
      htmlBlocked: m08HtmlBlocked,
    },
  });
  console.log(`[CASE 3 Result] Passed: ${m08Success}, checks:`, results[2].checks);

  // =========================================================================
  // Case 4: O02 - 跨部门行动清单.md (Fast-Path 直达验证)
  // =========================================================================
  console.log('\n======================================================');
  console.log('>>> [CASE 4] O02: 跨部门行动清单.md (轻量直达 Fast-Path)');
  const promptO02 = '把销售、仓储和生产三个部门的会议记录整理成“跨部门行动清单.md”，列出事项、负责人和截止时间，只依据附件事实，不生成PPT，不创建提醒。';
  const resO02 = await runChatCase({
    token,
    prompt: promptO02,
    files: [],
    timeoutMs: 120000,
  });

  const o02Target = path.join(WORKSPACE_DIR, '跨部门行动清单.md');
  const o02MdExists = fs.existsSync(o02Target) && fs.statSync(o02Target).size > 100;
  const o02Success = resO02.exitCode === 0 && o02MdExists;

  results.push({
    id: 'CASE-4-O02',
    title: '跨部门行动清单.md (Fast-Path 直达)',
    passed: o02Success,
    durationMs: resO02.durationMs,
    usage: resO02.usage,
    checks: {
      mdExists: o02MdExists,
      mdSize: o02MdExists ? fs.statSync(o02Target).size : 0,
    },
  });
  console.log(`[CASE 4 Result] Passed: ${o02Success}, checks:`, results[3].checks);

  // =========================================================================
  // Case 5: R05 - 只读核对防越权 (不生成文件，不调用写工具)
  // =========================================================================
  console.log('\n======================================================');
  console.log('>>> [CASE 5] R05: 收银与退款核对 (纯聊天只读回答，防工具越权)');
  const promptR05 = '核对收银汇总与退款记录，列出金额差异及缺失单据，只在聊天中给出核对结果，不修改任何记录、不生成文件。';
  const resR05 = await runChatCase({
    token,
    prompt: promptR05,
    files: uploadRet02 ? [uploadRet02] : [],
    timeoutMs: 120000,
  });

  const r05MutatingToolCalled = (resR05.tools || []).some(t =>
    ['patch_file', 'write_markdown', 'create_reminders'].includes(t.tool || t.name)
  );
  const r05Success = resR05.exitCode === 0 && !r05MutatingToolCalled && resR05.text.length > 50;

  results.push({
    id: 'CASE-5-R05',
    title: '收银与退款核对 (只读防越权)',
    passed: r05Success,
    durationMs: resR05.durationMs,
    usage: resR05.usage,
    checks: {
      textLength: resR05.text.length,
      mutatingToolsBlocked: !r05MutatingToolCalled,
    },
  });
  console.log(`[CASE 5 Result] Passed: ${r05Success}, checks:`, results[4].checks);

  // =========================================================================
  // Summary Report
  // =========================================================================
  console.log('\n======================================================');
  console.log('📊 [35B E2E Validation Summary]');
  console.table(results.map(r => ({
    id: r.id,
    title: r.title,
    passed: r.passed ? '✅ PASS' : '❌ FAIL',
    duration: `${(r.durationMs / 1000).toFixed(1)}s`,
    tokens: r.usage?.total_tokens || 0,
  })));

  const outPath = path.resolve('docs/artifacts/reviews/e2e-35b-validation-report.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`✓ Report saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error during E2E validation:', err);
  process.exit(1);
});
