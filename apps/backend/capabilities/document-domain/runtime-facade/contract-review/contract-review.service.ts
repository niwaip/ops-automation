import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  BuiltinContractReviewInput,
  ContractReviewOutput,
} from './contract-review.types';
import { ContractReviewEngineService } from './contract-review-engine.service';
import { ContractReviewHtmlRendererService } from './contract-review-html-renderer.service';
import { fixFilenameEncoding } from '../filename-encoding.util';

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(current, 'pnpm-lock.yaml')) || fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

const WORKSPACE_ROOT = process.env.PROJECT_ROOT || findWorkspaceRoot(process.cwd());
const BASE_OUTPUT_DIR =
  process.env.STORAGE_RENDER_DIR ||
  process.env.MEDIA_STORAGE_PATH ||
  path.join(WORKSPACE_ROOT, 'apps', 'backend', 'var', 'outputs', 'document-engine', 'renders');

const RENDERS_DIR =
  process.env.NODE_ENV === 'test' ? path.join(process.cwd(), '.tmp', 'renders') : BASE_OUTPUT_DIR;

@Injectable()
export class ContractReviewService {
  private readonly logger = new Logger(ContractReviewService.name);

  constructor(
    private readonly reviewEngine: ContractReviewEngineService,
    private readonly htmlRenderer: ContractReviewHtmlRendererService
  ) {}

  async reviewContract(input: BuiltinContractReviewInput): Promise<ContractReviewOutput> {
    const fileName = fixFilenameEncoding(input.fileName || '审查合同文档.docx');
    this.logger.log(`Starting contract review for "${fileName}", position=${input.myPosition || 'auto'}`);

    const effectiveCustomRules = input.customChecklistRules || input.customCheckpoints;

    // 1. Execute Clause-level Engine Analysis
    const engineResult = await this.reviewEngine.executeReview({
      fileBase64: input.fileBase64,
      fileName,
      text: input.text,
      contractType: input.contractType,
      myPosition: input.myPosition,
      customCheckpoints: effectiveCustomRules,
      customChecklistRules: effectiveCustomRules,
    });

    const {
      contractType,
      contractTypeName,
      myPosition,
      metrics,
      clauses,
      chapters,
      missingClauses,
    } = engineResult;

    // 2. Render Interactive HTML Report
    const htmlReport = this.htmlRenderer.renderHtmlReport({
      fileName,
      contractType,
      contractTypeName,
      myPosition,
      metrics,
      clauses,
      chapters,
      missingClauses,
    });

    // 3. Save HTML Artifact
    const artifact = await this.saveHtmlArtifact(htmlReport, input.idempotencyKey, fileName);

    // 4. Build Structured Executive Markdown Summary
    const highRiskClauses = clauses.filter((c) => c.riskLevel === 'HIGH');
    const highRiskHighlights = highRiskClauses.slice(0, 3).map((c) => {
      return `- 🔴 **${c.title || c.clauseNumber}**：${c.riskSummary}${c.legalAdvice ? ` *（建议：${c.legalAdvice}）*` : ''}`;
    });

    const missingHighlights = missingClauses.map((m) => {
      return `- ⚡ **${m.title}** [必备缺失]：${m.reason}`;
    });

    const summaryLines = [
      `### ⚖️ 合同智能合规审查与风险诊断完成`,
      ``,
      `#### 📊 合规审查概览`,
      `- **合同类型识别**：**${contractTypeName}**`,
      `- **综合合规评分**：**${metrics.healthScore} 分 / 100 分**（${metrics.healthScore >= 85 ? '合规良好' : metrics.healthScore >= 65 ? '⚠️ 存在中度法律风险' : '🚨 存在重大高危漏洞'}）`,
      `- **条款风控统计**：共 **${metrics.totalClauses}** 项条款（🔴 高危 **${metrics.highRiskCount}** 项，⚡ 缺失必备 **${metrics.missingClausesCount}** 项，🟡 中风险 **${metrics.mediumRiskCount}** 项，🟢 合规通过 **${metrics.passCount}** 项）`,
    ];

    if (missingHighlights.length > 0) {
      summaryLines.push(
        ``,
        `#### 🚨 关键必备条款缺失预警（严重风控敞口）`,
        ...missingHighlights
      );
    }

    if (highRiskHighlights.length > 0) {
      summaryLines.push(
        ``,
        `#### 🔍 核心高风险条款诊断`,
        ...highRiskHighlights
      );
    }

    summaryLines.push(
      ``,
      `🔗 **[👉 点击在新窗口打开全屏审查报告](${artifact.url})**`,
      `*(下方产物卡片支持一键展开 560px 在线交互预览、全屏演示与 HTML 离线报告下载)*`,
      ``,
      '```html',
      htmlReport,
      '```'
    );

    const summary = summaryLines.join('\n');

    return {
      summary,
      contractType,
      contractTypeName,
      myPosition,
      metrics,
      clauses,
      chapters,
      missingClauses,
      htmlReport,
      artifact,
      artifacts: [artifact],
    };
  }

  private async saveHtmlArtifact(
    htmlContent: string,
    idempotencyKey?: string,
    fileName = 'contract'
  ): Promise<NonNullable<ContractReviewOutput['artifact']>> {
    const buffer = Buffer.from(htmlContent, 'utf8');
    const fileId = idempotencyKey
      ? crypto.createHash('sha256').update(idempotencyKey).digest('hex').substring(0, 32)
      : uuidv4();

    const diskFileName = `${fileId}.html`;
    const filePath = path.join(RENDERS_DIR, diskFileName);

    if (!fs.existsSync(RENDERS_DIR)) {
      await fs.promises.mkdir(RENDERS_DIR, { recursive: true });
    }

    await fs.promises.writeFile(filePath, buffer);

    const externalBase = (process.env.CARBONE_EXTERNAL_URL || '').replace(/\/+$/, '');
    const downloadUrl = externalBase ? `${externalBase}/renders/${fileId}.html` : `/renders/${fileId}.html`;

    const cleanBaseName = fileName.replace(/\.[^/.]+$/, '');

    return {
      type: 'document',
      id: fileId,
      name: `合同合规审查报告_${cleanBaseName}.html`,
      url: downloadUrl,
      downloadUrl,
      mimeType: 'text/html; charset=utf-8',
      sizeBytes: buffer.length,
      metadata: {
        format: 'html',
        category: 'contract-review-report',
      },
    };
  }
}
