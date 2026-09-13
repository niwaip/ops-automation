import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';
import type {
  AlignedClausePair,
  ClauseAiInsight,
  ContractCompareInput,
  ContractCompareMetrics,
  ContractCompareOutput,
  RiskLevel,
} from './contract-compare.types';
import { ContractAstParserService } from './contract-ast-parser.service';
import { SectionAlignerService } from './section-aligner.service';
import { CharDiffEngineService } from './char-diff-engine.service';
import { ContractHtmlRendererService } from './contract-html-renderer.service';
import { fixFilenameEncoding } from '../filename-encoding.util';
import { ReviewElementEvaluatorService } from '../contract-elements';
import { resolveCompareDocumentPayloads } from '../document-payload-resolver.helper';

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
export class ContractCompareService {
  private readonly logger = new Logger(ContractCompareService.name);

  constructor(
    private readonly astParser: ContractAstParserService,
    private readonly sectionAligner: SectionAlignerService,
    private readonly charDiffEngine: CharDiffEngineService,
    private readonly htmlRenderer: ContractHtmlRendererService,
    private readonly elementEvaluator: ReviewElementEvaluatorService = new ReviewElementEvaluatorService()
  ) {
    if (!fs.existsSync(RENDERS_DIR)) {
      try {
        fs.mkdirSync(RENDERS_DIR, { recursive: true });
      } catch (err) {
        this.logger.warn(`Could not create renders dir at ${RENDERS_DIR}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Main execution: compare two contracts and generate a side-by-side interactive HTML report
   */
  public async compareContracts(input: ContractCompareInput): Promise<ContractCompareOutput> {
    await resolveCompareDocumentPayloads(input, undefined, undefined, this.logger);

    const fileNameA = fixFilenameEncoding(input.fileNameA || '基准合同_A');
    const fileNameB = fixFilenameEncoding(input.fileNameB || '比对合同_B');

    // 1. Parse both contracts to AST Clause trees
    const parseDoc = async (base64?: string, fileName?: string, text?: string) => {
      if (typeof (this.astParser as any).parseToAstDetailed === 'function') {
        return (this.astParser as any).parseToAstDetailed({ base64, fileName, text });
      }
      const clauses = (await this.astParser.parseToAst({ base64, fileName, text })) || [];
      return { clauses, metadata: { isTruncated: false } };
    };

    const [sourceResult, targetResult] = await Promise.all([
      parseDoc(input.fileBase64A, fileNameA, input.textA),
      parseDoc(input.fileBase64B, fileNameB, input.textB),
    ]);

    const sourceClauses = sourceResult.clauses;
    const targetClauses = targetResult.clauses;

    if (sourceClauses.length === 0) {
      throw new BadRequestException(
        `基准文档 (${fileNameA}) 未能提取出有效条款，比对中止。请核对文档内容或格式是否完整。`
      );
    }
    if (targetClauses.length === 0) {
      throw new BadRequestException(
        `比对文档 (${fileNameB}) 未能提取出有效条款，比对中止。请核对文档内容或格式是否完整。`
      );
    }

    // 2. Deterministic Section Alignment
    const alignedPairs = this.sectionAligner.alignSections(sourceClauses, targetClauses);

    // 3. Fine-grained Character/Token Diff & Risk Enrichment
    const granularity = input.diffGranularity || 'char';

    const customRules = input.customChecklistRules || input.customCheckpoints;

    for (const pair of alignedPairs) {
      if (pair.status === 'MODIFIED' && pair.sourceClause && pair.targetClause) {
        const diffRes = this.charDiffEngine.computeDiff(
          pair.sourceClause.content,
          pair.targetClause.content,
          granularity
        );
        pair.diffTokens = diffRes.tokens;
        pair.sourceHtml = diffRes.sourceHtml.replace(/\n/g, '<br>');
        pair.targetHtml = diffRes.targetHtml.replace(/\n/g, '<br>');
        pair.similarity = diffRes.similarity;

        if (input.enableRiskAnalysis !== false) {
          pair.aiInsight = this.enrichLegalRisk(pair, customRules, input.myPosition);
        }
      } else if (pair.status === 'ADDED' && pair.targetClause) {
        const safe = this.charDiffEngine.escapeHtml(pair.targetClause.content).replace(/\n/g, '<br>');
        pair.targetHtml = `<ins class="diff-ins">${safe}</ins>`;
        pair.similarity = 0.0;
        if (input.enableRiskAnalysis !== false) {
          pair.aiInsight = this.enrichLegalRisk(pair, customRules, input.myPosition);
        }
      } else if (pair.status === 'DELETED' && pair.sourceClause) {
        const safe = this.charDiffEngine.escapeHtml(pair.sourceClause.content).replace(/\n/g, '<br>');
        pair.sourceHtml = `<del class="diff-del">${safe}</del>`;
        pair.similarity = 0.0;
        if (input.enableRiskAnalysis !== false) {
          pair.aiInsight = this.enrichLegalRisk(pair, customRules, input.myPosition);
        }
      } else if (pair.sourceClause && pair.targetClause) {
        const safe = this.charDiffEngine.escapeHtml(pair.sourceClause.content).replace(/\n/g, '<br>');
        pair.sourceHtml = safe;
        pair.targetHtml = safe;
        pair.similarity = 1.0;
      }
    }

    // 4. Compute Metrics
    const isTruncated = Boolean(sourceResult.metadata?.isTruncated || targetResult.metadata?.isTruncated);
    const combinedWarnings = [
      ...(sourceResult.metadata?.warnings || []),
      ...(targetResult.metadata?.warnings || []),
    ];

    const metrics: ContractCompareMetrics = {
      totalClauses: alignedPairs.length,
      unchangedCount: alignedPairs.filter((p) => p.status === 'UNCHANGED').length,
      modifiedCount: alignedPairs.filter((p) => p.status === 'MODIFIED').length,
      addedCount: alignedPairs.filter((p) => p.status === 'ADDED').length,
      deletedCount: alignedPairs.filter((p) => p.status === 'DELETED').length,
      highRiskCount: alignedPairs.filter((p) => p.aiInsight?.riskLevel === 'HIGH').length,
      mediumRiskCount: alignedPairs.filter((p) => p.aiInsight?.riskLevel === 'MEDIUM').length,
      sourceClauseCount: sourceClauses.length,
      targetClauseCount: targetClauses.length,
      isTruncated,
      warnings: combinedWarnings.length > 0 ? combinedWarnings : undefined,
    };

    // 5. Render Interactive HTML Report
    const htmlReport = this.htmlRenderer.renderHtmlReport({
      fileNameA,
      fileNameB,
      metrics,
      alignedPairs,
    });

    // 6. Persist HTML Report as an ArtifactRef
    const artifact = await this.saveHtmlArtifact(htmlReport, input.idempotencyKey, fileNameA, fileNameB);

    const highRiskPairs = alignedPairs.filter((p) => p.aiInsight?.riskLevel === 'HIGH');
    const mediumRiskPairs = alignedPairs.filter((p) => p.aiInsight?.riskLevel === 'MEDIUM');

    const highRiskHighlights = highRiskPairs.map((p) => {
      const title = p.targetClause?.title || p.sourceClause?.title || p.targetClause?.clauseNumber || '核心条款';
      return `- 🔴 **${title}**：${p.aiInsight?.summary}${p.aiInsight?.legalAdvice ? ` *（建议：${p.aiInsight.legalAdvice}）*` : ''}`;
    });

    const summaryLines = [
      `### 📋 合同智能比对与红线审查完成`,
      ``,
    ];

    if (isTruncated) {
      summaryLines.push(
        `> ⚠️ **部分审查警示**：比对文档因篇幅限制已执行截断，仅覆盖已提取前序章节，请留意后续未覆盖风险。`,
        ``
      );
    }

    summaryLines.push(
      `#### 📊 比对结果概览`,
      `- **条款变更统计**：对齐后共比对 **${metrics.totalClauses}** 项条款（基准版 ${sourceClauses.length} 条 / 修订版 ${targetClauses.length} 条 ｜ 文本修改 **${metrics.modifiedCount}** 项，新增 **${metrics.addedCount}** 项，删除 **${metrics.deletedCount}** 项，未变更 **${metrics.unchangedCount}** 项）`,
      `- **审查风险评级**：${metrics.highRiskCount > 0 ? `⚠️ **${metrics.highRiskCount} 项高风险变更，建议重点复核**${mediumRiskPairs.length > 0 ? `，${mediumRiskPairs.length} 项中风险条款` : ''}` : '✅ 未发现高风险变更'}`,
    );

    if (highRiskHighlights.length > 0) {
      summaryLines.push(
        ``,
        `#### 🚨 核心高风险提示（重点关注）`,
        ...highRiskHighlights
      );
    }

    summaryLines.push(
      ``,
      `🔗 **[👉 点击在新窗口打开全屏比对报告](${artifact.url})**`,
      `*(下方产物卡片已支持一键展开/收起 560px 内嵌预览、全屏演示与 HTML 报告下载)*`,
      ``,
      '```html',
      htmlReport,
      '```'
    );

    const summary = summaryLines.join('\n');

    return {
      summary,
      metrics,
      alignedClauses: alignedPairs,
      htmlReport,
      artifact,
      artifacts: [artifact],
    };
  }

  /**
   * Domain rule-based legal risk and semantic change extraction via unified evaluator
   */
  private enrichLegalRisk(
    pair: AlignedClausePair,
    customRules?: any[],
    myPosition?: string
  ): ClauseAiInsight {
    return this.elementEvaluator.evaluateDiff(pair, customRules, myPosition);
  }

  /**
   * Save HTML report into storage renders directory
   */
  private async saveHtmlArtifact(
    htmlContent: string,
    idempotencyKey?: string,
    fileNameA = 'docA',
    fileNameB = 'docB'
  ): Promise<ArtifactRef> {
    const buffer = Buffer.from(htmlContent, 'utf8');
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

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

    return {
      type: 'document',
      id: fileId,
      name: `合同比对报告_${fileNameA}_vs_${fileNameB}.html`,
      url: downloadUrl,
      mimeType: 'text/html; charset=utf-8',
      sizeBytes: buffer.length,
      metadata: {
        format: 'html',
        sha256,
        category: 'contract-diff-report',
      },
    };
  }
}
