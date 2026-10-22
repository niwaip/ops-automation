import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, upload, stream, get, findOutput, save } from '../contract-review-work/client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runDir = path.join(__dirname, `run-${new Date().toISOString().replaceAll(':', '-')}`);
fs.mkdirSync(runDir, { recursive: true });

const cases = [
  {
    id: 'T01_DEV_DOCX',
    name: '软件研发合同 (DOCX) - 乙方立场审查',
    file: 'software-dev-contract.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    message: '请审查附件中的软件开发合同，我方为受托方（乙方），请按乙方立场进行合规审查并生成报告。',
    expectedType: 'software_development',
    expectedPosition: 'seller',
  },
  {
    id: 'T02_DEV_PDF',
    name: '软件研发合同 (PDF) - 乙方立场审查',
    file: 'software-dev-contract.pdf',
    mimeType: 'application/pdf',
    message: '请审查这份PDF格式的软件开发合同，我们是开发方乙方，请重点审查违约金与工期风险。',
    expectedType: 'software_development',
    expectedPosition: 'seller',
  },
  {
    id: 'T03_PROC_DOCX',
    name: '设备采购合同 (DOCX) - 买方立场审查',
    file: 'procurement-contract.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    message: '请审查附件中的设备采购合同，我方为买方，生成审查报告。',
    expectedType: 'procurement',
    expectedPosition: 'buyer',
  },
  {
    id: 'T04_PROC_PDF',
    name: '设备采购合同 (PDF) - 卖方立场审查',
    file: 'procurement-contract.pdf',
    mimeType: 'application/pdf',
    message: '请审查附件中的设备采购供应协议PDF文件，我方为供货方（卖方乙方）。',
    expectedType: 'procurement',
    expectedPosition: 'seller',
  },
];

async function run() {
  console.log(`=======================================================`);
  console.log(`🚀 开始合同审查 DOCX / PDF 端到端自动化综合测试`);
  console.log(`📁 证据输出目录: ${runDir}`);
  console.log(`=======================================================\n`);

  const summary = [];

  for (const tc of cases) {
    if (process.env.TEST_CASES && !process.env.TEST_CASES.split(',').includes(tc.id)) {
      continue;
    }
    const caseDir = path.join(runDir, tc.id);
    fs.mkdirSync(caseDir, { recursive: true });

    console.log(`-------------------------------------------------------`);
    console.log(`▶ 正在执行测试: [${tc.id}] ${tc.name}`);
    console.log(`📄 待测文件: ${tc.file} (${tc.mimeType})`);

    const filePath = path.join(__dirname, tc.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Test file not found: ${filePath}`);
    }

    const startTime = Date.now();
    try {
      // 1. Login
      const token = await login();

      // 2. Upload file
      const fileBuffer = fs.readFileSync(filePath);
      console.log(`⬆️ 上传文件中... (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
      const uploadDescriptor = await upload(token, fileBuffer, tc.file, tc.mimeType);
      save(path.join(caseDir, 'upload.json'), uploadDescriptor);

      // 3. Send chat stream request
      const sessionId = `test-${tc.id.toLowerCase()}-${Date.now()}`;
      const payload = {
        message: tc.message,
        sessionId,
        modelId: 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af',
        config: {
          mode: 'task',
          thinking: true, // chat turn planning enables thinking; execution adapter sends thinking: false
          webSearch: false,
          workspaceSearch: false,
        },
        files: [uploadDescriptor],
      };

      console.log(`💬 发起会话流调用: "${tc.message}"`);
      const streamRes = await stream(token, payload, caseDir);
      console.log(`📡 会话流响应完毕，HTTP: ${streamRes.httpStatus}, 耗时: ${streamRes.totalMs}ms`);

      if (!streamRes.executionId) {
        throw new Error(`未获取到 executionId，原始流响应可能异常: ${streamRes.error || '无详细错误'}`);
      }
      console.log(`🆔 执行单 ID: ${streamRes.executionId}`);

      // 4. Query execution details & LLM usage ledger
      const execDetail = await get(token, `/api/executions/${streamRes.executionId}`);
      const llmUsage = await get(token, `/api/executions/${streamRes.executionId}/llm-usage`);
      save(path.join(caseDir, 'execution.json'), execDetail);
      save(path.join(caseDir, 'usage.json'), llmUsage);

      const execData = execDetail.data;
      const status = execData?.status;
      const output = findOutput(execData) || findOutput(streamRes.events.map((e) => e.event));
      if (output) save(path.join(caseDir, 'output.json'), output);

      const metrics = output?.metrics || {};
      const clauses = output?.clauses || [];
      const totalTokens = (llmUsage.data || []).reduce((acc, u) => acc + (u.outputTokens || 0), 0);
      const totalCost = (llmUsage.data || []).reduce((acc, u) => acc + Number(u.estimatedCost || 0), 0);

      // Assertions
      const isSucceeded = status === 'succeeded';
      const isNotDegraded = metrics.isDegraded === false && (metrics.degradedClausesCount ?? 0) === 0;
      const allClausesReviewed = clauses.length > 0 && clauses.every((c) => c.llmReviewed === true);
      const hasArtifact = (execData?.artifacts || []).length > 0 || (output?.artifacts || []).length > 0;
      const pass = isSucceeded && isNotDegraded && allClausesReviewed && hasArtifact;

      const record = {
        id: tc.id,
        name: tc.name,
        file: tc.file,
        format: tc.file.endsWith('.pdf') ? 'PDF' : 'DOCX',
        pass,
        executionId: streamRes.executionId,
        status,
        durationMs: Date.now() - startTime,
        clausesCount: clauses.length,
        llmReviewedCount: metrics.llmReviewedCount ?? clauses.filter((c) => c.llmReviewed).length,
        isDegraded: metrics.isDegraded ?? false,
        healthScore: metrics.healthScore,
        riskStats: {
          high: metrics.highRiskCount ?? 0,
          medium: metrics.mediumRiskCount ?? 0,
          low: metrics.lowRiskCount ?? 0,
          pass: metrics.passCount ?? 0,
        },
        tokensEmitted: totalTokens,
        estimatedCostCny: totalCost.toFixed(6),
        artifactUrl: (execData?.artifacts || output?.artifacts || [])[0]?.url,
      };

      summary.push(record);
      console.log(`✅ [${tc.id}] 测试完成: ${pass ? 'PASS (全绿通过)' : 'FAIL (存在不符合项)'}`);
      console.log(`   - 状态: ${status}, 健康分: ${record.healthScore}, 条款审查覆盖: ${record.llmReviewedCount}/${record.clausesCount}`);
      console.log(`   - 降级状态: isDegraded=${record.isDegraded}, 耗时: ${record.durationMs}ms, 输出Tokens: ${record.tokensEmitted}`);
      console.log(`   - 报告产物: ${record.artifactUrl || '无'}\n`);
    } catch (err) {
      console.error(`❌ [${tc.id}] 测试执行出错: ${err.message}\n`, err.stack);
      summary.push({
        id: tc.id,
        name: tc.name,
        file: tc.file,
        pass: false,
        error: err.message,
        durationMs: Date.now() - startTime,
      });
    }
  }

  save(path.join(runDir, 'summary.json'), summary);

  console.log(`=======================================================`);
  console.log(`📊 综合测试执行报告汇总:`);
  console.table(
    summary.map((s) => ({
      ID: s.id,
      文件格式: s.format,
      测试状态: s.pass ? 'PASS ✅' : 'FAIL ❌',
      审查条款数: `${s.llmReviewedCount || 0}/${s.clausesCount || 0}`,
      降级状态: s.isDegraded ? '⚠️ 降级' : '正常 🟢',
      健康评分: s.healthScore ?? '-',
      耗时: `${((s.durationMs || 0) / 1000).toFixed(1)}s`,
      模型Token: s.tokensEmitted ?? '-',
    }))
  );
  console.log(`=======================================================`);
}

run().catch((e) => {
  console.error('Fatal runner error:', e);
  process.exit(1);
});
