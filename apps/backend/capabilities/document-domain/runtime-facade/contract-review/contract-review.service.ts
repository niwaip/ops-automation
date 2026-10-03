import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fixFilenameEncoding } from '../filename-encoding.util';
import { resolveReviewDocumentPayload, WORKSPACE_ROOT } from '../document-payload-resolver.helper';
import type {
  BuiltinContractReviewInput,
  ContractParseOutput,
  ContractRenderReportInput,
  ContractReviewOutput,
} from './contract-review.types';
import { ContractReviewEngineService } from './contract-review-engine.service';
import { ContractReviewHtmlRendererService } from './contract-review-html-renderer.service';

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

  async parseContract(input: BuiltinContractReviewInput): Promise<ContractParseOutput> {
    await resolveReviewDocumentPayload(input, undefined, undefined, this.logger);

    const fileName = fixFilenameEncoding(input.fileName || '审查合同文档.docx');
    this.logger.log(`Parsing contract structure for "${fileName}", position=${input.myPosition || 'auto'}`);

    const effectiveCustomRules = input.customChecklistRules || input.customCheckpoints;

    return this.reviewEngine.parseContractDocument({
      fileBase64: input.fileBase64,
      fileName,
      text: input.text,
      contractType: input.contractType,
      myPosition: input.myPosition,
      customCheckpoints: effectiveCustomRules,
      customChecklistRules: effectiveCustomRules,
      prompt: input.prompt,
      reviewPrompt: input.reviewPrompt,
      sourceAttachmentId: input.sourceAttachmentId,
      sourceDocumentHash: input.sourceDocumentHash,
      sourceDocumentVersion: input.sourceDocumentVersion,
    });
  }

  async renderReport(
    input: ContractRenderReportInput,
    idempotencyKey?: string
  ): Promise<ContractReviewOutput> {
    const fileName = fixFilenameEncoding(input.fileName || '审查合同文档.docx');
    const {
      contractType,
      contractTypeName,
      myPosition,
      clauses,
      chapters,
      missingClauses,
      comments,
      canComment,
      commentApiUrl,
    } = input;

    const effectiveMetrics = input.metrics || {
      healthScore: 100,
      totalClauses: (clauses || []).length,
      highRiskCount: (clauses || []).filter((c) => c.riskLevel === 'HIGH').length,
      mediumRiskCount: (clauses || []).filter((c) => c.riskLevel === 'MEDIUM').length,
      lowRiskCount: (clauses || []).filter((c) => c.riskLevel === 'LOW').length,
      passCount: (clauses || []).filter((c) => c.riskLevel === 'PASS').length,
      missingClausesCount: (missingClauses || []).length,
      isTruncated: false,
      warnings: [],
    };

    const effectiveComments =
      comments && comments.length > 0 ? comments : (clauses || []).flatMap((c) => c.comments || []);

    const effectiveIdempotencyKey = idempotencyKey || input.idempotencyKey;
    const fileId = effectiveIdempotencyKey
      ? crypto.createHash('sha256').update(effectiveIdempotencyKey).digest('hex').substring(0, 32)
      : uuidv4();

    // 1. Render Interactive HTML Report
    const htmlReport = this.htmlRenderer.renderHtmlReport({
      fileName,
      contractType,
      contractTypeName,
      myPosition,
      positionSource: input.positionSource,
      metrics: effectiveMetrics,
      clauses,
      chapters,
      missingClauses,
      comments: effectiveComments.length > 0 ? effectiveComments : undefined,
      canComment,
      commentApiUrl,
      ruleSetInfo: input.ruleSetInfo,
      executionId: input.executionId,
      artifactId: fileId,
      sourceDocumentVersion: input.sourceDocumentVersion,
      sourceAttachmentId: input.sourceAttachmentId,
      sourceDocumentHash: input.sourceDocumentHash,
    });

    // 2. Save HTML Artifact
    const artifact = await this.saveHtmlArtifact(htmlReport, effectiveIdempotencyKey, fileName, fileId);

    // 3. Build Structured Executive Markdown Summary
    const highRiskClauses = clauses.filter((c) => c.riskLevel === 'HIGH');
    const highRiskHighlights = highRiskClauses.slice(0, 3).map((c) => {
      return `- 🔴 **${c.title || c.clauseNumber}**：${c.riskSummary}${c.legalAdvice ? ` *（建议：${c.legalAdvice}）*` : ''}`;
    });

    const missingHighlights = (missingClauses || []).map((m) => {
      return `- ⚡ **${m.title}** [必备缺失]：${m.reason}`;
    });

    const posLabel =
      myPosition === 'buyer'
        ? '买方/披露方'
        : myPosition === 'seller'
        ? '卖方/接收方'
        : '中立对等';
    const posNotice =
      input.positionSource === 'default'
        ? '⚠️ 系统默认防御立场，建议人工核实确认'
        : input.positionSource === 'inferred'
        ? '正文语义推断'
        : '用户指定确认';

    const summaryLines = [
      `### ⚖️ 合同智能合规审查与风险诊断完成`,
      ``,
      `#### 📊 合规审查概览`,
      `- **合同类型识别**：**${contractTypeName}**`,
      `- **审查立场**：**${posLabel}**（${posNotice}）`,
      `- **综合合规评分**：**${effectiveMetrics.healthScore} 分 / 100 分**（${effectiveMetrics.healthScore >= 85 ? '合规良好' : effectiveMetrics.healthScore >= 65 ? '⚠️ 存在中度法律风险' : '🚨 存在重大高危漏洞'}）`,
      `- **条款风控统计**：共 **${effectiveMetrics.totalClauses}** 项条款（🔴 高危 **${effectiveMetrics.highRiskCount}** 项，⚡ 缺失必备 **${effectiveMetrics.missingClausesCount}** 项，🟡 中风险 **${effectiveMetrics.mediumRiskCount}** 项，🟢 合规通过 **${effectiveMetrics.passCount}** 项）`,
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
    );

    // summary 只存摘要文字 + 报告链接，不含 HTML 源码，避免 result_json 膨胀
    const summary = summaryLines.join('\n');

    // chatSummary 同步保持结构化摘要，不内嵌 HTML 源码，避免 chatSummary/result_json/execution_events 膨胀
    const chatSummary = summary;

    return {
      summary,
      chatSummary,
      contractType,
      contractTypeName,
      myPosition,
      positionSource: input.positionSource,
      metrics: effectiveMetrics,
      clauses,
      chapters,
      missingClauses,
      comments: effectiveComments.length > 0 ? effectiveComments : undefined,
      htmlReport,
      ruleSetInfo: input.ruleSetInfo,
      sourceDocumentVersion: input.sourceDocumentVersion,
      sourceAttachmentId: input.sourceAttachmentId,
      sourceDocumentHash: input.sourceDocumentHash,
      artifact,
      artifacts: [artifact],
    };
  }

  async reviewContract(input: BuiltinContractReviewInput): Promise<ContractReviewOutput> {
    const parsedDoc = await this.parseContract(input);
    const engineResult = await this.reviewEngine.executeSemanticReviewFromParsed(parsedDoc, {
      skipLlmReview: input.skipLlmReview,
    });

    const allComments =
      engineResult.comments || parsedDoc.comments || engineResult.clauses.flatMap((c) => c.comments || []);

    return this.renderReport(
      {
        fileName: parsedDoc.fileName,
        contractType: engineResult.contractType,
        contractTypeName: engineResult.contractTypeName,
        myPosition: engineResult.myPosition,
        positionSource: parsedDoc.positionSource,
        metrics: engineResult.metrics,
        clauses: engineResult.clauses,
        chapters: engineResult.chapters,
        missingClauses: engineResult.missingClauses,
        comments: allComments.length > 0 ? allComments : undefined,
        ruleSetInfo: parsedDoc.ruleSetInfo,
        sourceDocumentVersion: parsedDoc.sourceDocumentVersion,
        sourceAttachmentId: parsedDoc.sourceAttachmentId || input.sourceAttachmentId,
        sourceDocumentHash: parsedDoc.sourceDocumentHash || input.sourceDocumentHash,
        idempotencyKey: input.idempotencyKey,
      },
      input.idempotencyKey
    );
  }

  private async saveHtmlArtifact(
    htmlContent: string,
    idempotencyKey?: string,
    fileName = 'contract',
    forcedFileId?: string
  ): Promise<NonNullable<ContractReviewOutput['artifact']>> {
    const buffer = Buffer.from(htmlContent, 'utf8');
    const fileId =
      forcedFileId ||
      (idempotencyKey
        ? crypto.createHash('sha256').update(idempotencyKey).digest('hex').substring(0, 32)
        : uuidv4());

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
