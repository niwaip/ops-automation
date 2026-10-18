import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ContractAstParserService } from '../contract-compare/contract-ast-parser.service';
import type { ContractClauseNode } from '../contract-compare/contract-compare.types';
import {
ReviewElementEvaluatorService,
ReviewFactExtractorService,
type ClauseLegalFinding,
type ExtractedLegalFacts,
type ReviewSeverity,
} from '../contract-elements';
import {
ContractChecklistMatrixService,
type CheckpointRule,
} from './contract-checklist-matrix.service';
import { ContractFormIntegrityScannerService } from './contract-form-integrity-scanner.service';
import {
ContractLlmReviewService,
type ClauseLlmReviewResult,
} from './contract-llm-review.service';
import type {
  ClauseReviewItem,
  ContractParseOutput,
  ContractReviewMetrics,
  ContractType,
  CustomCheckpointDto,
  DocxCommentItem,
  ParsedClauseItem,
  PartyPosition,
  PartyPositionInput,
  ReviewChapterGroup
} from './contract-review.types';
import { ContractTypeClassifierService } from './contract-type-classifier.service';

export interface LegalEntityProfile {
  legalEntityName?: string;
  aliases?: string[];
  creditCode?: string;
  defaultContractRole?: PartyPosition;
}

export const DEFAULT_ENTERPRISE_LEGAL_ENTITY: LegalEntityProfile = {
  legalEntityName: '富士通（中国）信息系统有限公司',
  aliases: ['富士通', '富士通（中国）', '富士通信息', 'Fujitsu', 'Fujitsu China', '富士通株式会社'],
  defaultContractRole: 'seller',
};

export interface ReviewEngineInput {
  fileBase64?: string;
  fileName?: string;
  text?: string;
  contractType?: string;
  myPosition?: PartyPositionInput;
  positionSource?: 'default' | 'inferred' | 'user_confirmed';
  customCheckpoints?: CustomCheckpointDto[];
  customChecklistRules?: CustomCheckpointDto[];
  prompt?: string;
  reviewPrompt?: string;
  skipLlmReview?: boolean;
  sourceAttachmentId?: string;
  sourceDocumentHash?: string;
  sourceDocumentVersion?: string;
  legalEntityName?: string;
  aliases?: string[];
  creditCode?: string;
  defaultContractRole?: string;
  legalEntityProfile?: LegalEntityProfile;
}

export interface ReviewEngineResult {
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  metrics: ContractReviewMetrics;
  clauses: ClauseReviewItem[];
  chapters: ReviewChapterGroup[];
  missingClauses: ReturnType<ContractChecklistMatrixService['detectMissingClauses']>;
  comments?: DocxCommentItem[];
}

@Injectable()
export class ContractReviewEngineService {
  constructor(
    private readonly astParser: ContractAstParserService,
    private readonly classifier: ContractTypeClassifierService,
    private readonly checklistMatrix: ContractChecklistMatrixService,
    private readonly formScanner: ContractFormIntegrityScannerService = new ContractFormIntegrityScannerService(),
    private readonly llmReview: ContractLlmReviewService = new ContractLlmReviewService(),
    private readonly factExtractor: ReviewFactExtractorService = new ReviewFactExtractorService(),
    private readonly elementEvaluator: ReviewElementEvaluatorService = new ReviewElementEvaluatorService()
  ) {}

  async parseContractDocument(input: ReviewEngineInput): Promise<ContractParseOutput> {
    const fileName = input.fileName || '未命名合同';

    // 1. Parse AST clauses from base64 or text
    let astClauses: ContractClauseNode[] = [];
    let astComments: DocxCommentItem[] = [];
    let isTruncated = false;
    let warnings: string[] = [];

    if (typeof (this.astParser as any).parseToAstDetailed === 'function') {
      const astResult = await (this.astParser as any).parseToAstDetailed({
        base64: input.fileBase64,
        fileName,
        text: input.text,
      });
      astClauses = astResult.clauses || [];
      astComments = astResult.comments || [];
      isTruncated = Boolean(astResult.metadata?.isTruncated);
      warnings = astResult.metadata?.warnings || [];
    } else {
      astClauses = (await this.astParser.parseToAst({
        base64: input.fileBase64,
        fileName,
        text: input.text,
      })) || [];
    }

    if (!astClauses || astClauses.length === 0) {
      throw new BadRequestException('未能从上传的文档中提取到有效的合同条款，请核对文档格式或内容。');
    }

    const fullText = astClauses.map((c) => c.content).join('\n\n');

    // 2. Classify contract type & determine party position
    const typeInfo = this.classifier.classify(fileName, fullText, input.contractType);
    const { position: resolvedPosition, positionSource } = this.resolvePartyPositionWithSource(
      input.myPosition,
      fullText,
      typeInfo.defaultPosition,
      input.positionSource,
      input.legalEntityProfile ||
        (input.legalEntityName
          ? {
              legalEntityName: input.legalEntityName,
              aliases: input.aliases,
              creditCode: input.creditCode,
              defaultContractRole: input.defaultContractRole as any,
            }
          : undefined)
    );

    const rawPrompt = (input.reviewPrompt || input.prompt || '').trim();
    const promptRules: CustomCheckpointDto[] = [];
    if (rawPrompt) {
      const promptLines = rawPrompt
        .split(/[\n;；。]+/)
        .map((l) => l.trim())
        .filter((l) => l.length >= 2);
      if (promptLines.length > 0) {
        promptLines.forEach((line, idx) => {
          promptRules.push({
            id: `prompt-rule-${idx + 1}`,
            title: line.length > 24 ? line.slice(0, 22) + '...' : line,
            severity: 'HIGH',
            rule: line,
            category: '审查Prompt专项要点',
          });
        });
      } else {
        promptRules.push({
          id: 'prompt-rule-1',
          title: '审查Prompt专项要点',
          severity: 'HIGH',
          rule: rawPrompt,
          category: '审查Prompt专项要点',
        });
      }
    }

    const effectiveCustomRules = [
      ...(input.customChecklistRules || input.customCheckpoints || []),
      ...promptRules,
    ];

    // 3. Load checklist rules filtered by contract type and party position
    const rules = this.checklistMatrix.getRulesForType(
      typeInfo.type,
      resolvedPosition,
      effectiveCustomRules
    );

    let totalUnfilledVariables = 0;
    let totalUnfilledBlanks = 0;

    const parsedClauses: ParsedClauseItem[] = astClauses.map((clause, index) => {
      const clauseTitle = clause.title || clause.clauseNumber || `第 ${index + 1} 条`;
      const clauseText = clause.content || '';

      const formIntegrity = this.formScanner.scanClause(
        clauseText,
        clauseTitle,
        index,
        clause.blocks
      );
      totalUnfilledVariables += formIntegrity.unfilledVariables.length;
      totalUnfilledBlanks += formIntegrity.unfilledBlanksCount;

      const clauseFacts = this.factExtractor.extractClauseFacts(clauseText, clauseTitle);

      const candidateRules = this.checklistMatrix.recallCandidateRulesForClause(
        clauseText,
        clauseTitle,
        rules,
        clauseFacts
      );

      const matchedRules = rules
        .filter((rule) => rule.matcher(clauseText, clauseTitle))
        .map((r) => ({
          ...r,
          id: r.id,
          title: r.title,
          category: r.category,
          severity: r.severity,
          riskSummary: r.riskSummary,
          legalAdvice: r.legalAdvice,
          elementId: r.elementId,
          elementCode: r.elementCode,
          recommendRevision: r.recommendRevision,
          recommendedRevision: r.recommendRevision ? r.recommendRevision(clauseText) : undefined,
        }));

      return {
        clauseIndex: index,
        clauseNumber: clause.clauseNumber || `第 ${index + 1} 条`,
        title: clauseTitle,
        titleJa: clause.titleJa,
        originalContent: clauseText,
        chapterNumber: clause.chapterNumber,
        chapterTitle: clause.chapterTitle,
        blocks: clause.blocks,
        comments: clause.comments,
        formIntegrity,
        facts: clauseFacts,
        matchedRules,
        candidateRules,
      };
    });

    const availableRules = rules.map((r) => ({
      id: r.id,
      elementId: r.elementId,
      elementCode: r.elementCode,
      title: r.title,
      category: r.category,
      severity: r.severity,
      riskSummary: r.riskSummary,
      legalAdvice: r.legalAdvice,
      recommendRevision: r.recommendRevision,
      recommendedRevision: typeof r.recommendRevision === 'function' ? r.recommendRevision('') : undefined,
      criterion: r.title,
    }));

    const missingClauses = this.checklistMatrix.detectMissingClauses(
      typeInfo.type,
      fullText,
      resolvedPosition,
      parsedClauses as any
    );

    const canonicalRulesDigestPayload = rules
      .map((r) => ({
        id: r.id,
        elementCode: r.elementCode,
        category: r.category,
        severity: r.severity,
        title: r.title,
        riskSummary: r.riskSummary,
      }))
      .sort((a, b) => (a.elementCode || a.id).localeCompare(b.elementCode || b.id));

    const ruleSetId = `contract-review/${typeInfo.type}`;
    const ruleSetVersion = '1.0.0';
    const ruleSetDigest =
      'sha256:' +
      crypto.createHash('sha256').update(JSON.stringify(canonicalRulesDigestPayload)).digest('hex');
    const sourceDocumentVersion =
      'sha256:' +
      crypto.createHash('sha256').update(fullText || '', 'utf8').digest('hex');

    const ruleSetInfo = {
      ruleSetId,
      ruleSetVersion,
      ruleSetDigest,
      ruleSetName: `${typeInfo.displayName}标准审查规则库`,
    };

    return {
      contractType: typeInfo.type,
      contractTypeName: typeInfo.displayName,
      myPosition: resolvedPosition,
      positionSource,
      fileName,
      fullText,
      sourceDocumentVersion,
      sourceAttachmentId: (input as any)?.sourceAttachmentId,
      sourceDocumentHash:
        (input as any)?.sourceDocumentHash ||
        (sourceDocumentVersion ? sourceDocumentVersion.replace(/^sha256:/, '') : undefined),
      parsedClauses,
      availableRules,
      missingClauses,
      comments: astComments.length > 0 ? astComments : parsedClauses.flatMap((c) => c.comments || []),
      formIntegrityStats: {
        totalUnfilledVariables,
        totalUnfilledBlanks,
      },
      isTruncated,
      warnings,
      rawPrompt,
      ruleSetInfo,
    };
  }

  async executeSemanticReviewFromParsed(
    parsedDoc: ContractParseOutput,
    options?: { skipLlmReview?: boolean }
  ): Promise<ReviewEngineResult> {
    const {
      contractType,
      contractTypeName,
      myPosition,
      positionSource,
      parsedClauses,
      missingClauses,
      formIntegrityStats,
      isTruncated,
      warnings,
      rawPrompt,
    } = parsedDoc;

    const totalUnfilledVariables = formIntegrityStats?.totalUnfilledVariables || 0;
    const totalUnfilledBlanks = formIntegrityStats?.totalUnfilledBlanks || 0;

    const reviewedClauses: ClauseReviewItem[] = await this.runWithConcurrency(
      parsedClauses,
      3,
      async (clause, index) => {
        const clauseTitle = clause.title || clause.clauseNumber || `第 ${index + 1} 条`;
        const clauseText = clause.originalContent || '';
        const formIntegrity = clause.formIntegrity;
        const clauseFacts = clause.facts;
        const matchedRules = (clause.matchedRules || []) as any[];

        // Perspective 2: AI & Semantic Legal Analysis
        const shouldSkipLlm =
          options?.skipLlmReview === true || process.env.CONTRACT_REVIEW_SKIP_LLM === 'true';

        const semantic = shouldSkipLlm
          ? this.llmReview.reviewClauseRuleBasedFallback({
              clauseIndex: index,
              clauseNumber: clause.clauseNumber || `第 ${index + 1} 条`,
              clauseTitle,
              clauseText,
              contractType,
              contractTypeName,
              myPosition,
              matchedRules,
              formIntegrity,
              reviewPrompt: rawPrompt || undefined,
            })
          : await this.llmReview.reviewClause({
              clauseIndex: index,
              clauseNumber: clause.clauseNumber || `第 ${index + 1} 条`,
              clauseTitle,
              clauseText,
              contractType,
              contractTypeName,
              myPosition,
              matchedRules,
              formIntegrity,
              reviewPrompt: rawPrompt || undefined,
            });

        // Determine accurate primary elementId & elementCode
        let primaryRule: any = undefined;
        if (semantic.riskLevel === 'HIGH') {
          primaryRule = matchedRules.find((r) => r.severity === 'HIGH') || matchedRules[0];
        } else if (semantic.riskLevel === 'MEDIUM') {
          primaryRule = matchedRules.find((r) => r.severity === 'MEDIUM') || matchedRules[0];
        } else {
          primaryRule = matchedRules[0];
        }

        const findings: ClauseLegalFinding[] = matchedRules.map((r) => {
          const evidence = this.locateEvidenceForRule(clauseText, r, clauseFacts);
          return {
            id: r.id,
            elementId: r.elementId,
            elementCode: r.elementCode,
            category: r.category,
            severity: r.severity as ReviewSeverity,
            title: r.title,
            riskSummary: r.riskSummary,
            legalAdvice: r.legalAdvice,
            recommendedRevision: r.recommendRevision ? r.recommendRevision(clauseText) : undefined,
            evidenceQuote: evidence.evidenceQuote,
            charStart: evidence.charStart,
            charEnd: evidence.charEnd,
            matchedFacts: clauseFacts,
          };
        });

        if (semantic.riskLevel !== 'PASS') {
          const isAlreadyCovered = this.elementEvaluator.isCoveredByExistingFindings(semantic, findings);
          if (!isAlreadyCovered) {
            const llmEvidence = this.locateEvidenceForSemanticRisk(clauseText, semantic);
            findings.unshift({
              id: `semantic-risk-${index}`,
              category: '智能语义风控',
              severity: semantic.riskLevel as ReviewSeverity,
              title: semantic.riskSummary ? semantic.riskSummary.split(/[，。：:；;\n]/)[0].slice(0, 30) : '条款实质性法律风险',
              riskSummary: semantic.riskSummary,
              legalAdvice: semantic.legalAdvice,
              recommendedRevision: semantic.recommendedRevision,
              evidenceQuote: llmEvidence.evidenceQuote,
              charStart: llmEvidence.charStart,
              charEnd: llmEvidence.charEnd,
              matchedFacts: clauseFacts,
            });
          }
        }

        return {
          clauseIndex: index,
          clauseNumber: clause.clauseNumber || `第 ${index + 1} 条`,
          title: clauseTitle,
          titleJa: clause.titleJa,
          originalContent: clauseText,
          riskLevel: semantic.riskLevel,
          riskSummary: semantic.riskSummary,
          legalAdvice: semantic.legalAdvice,
          recommendedRevision: semantic.recommendedRevision,
          matchedCheckpoints: matchedRules.map((r) => `${r.category}：${r.title}`),
          elementId: primaryRule?.elementId,
          elementCode: primaryRule?.elementCode,
          chapterNumber: clause.chapterNumber,
          chapterTitle: clause.chapterTitle,
          blocks: clause.blocks,
          comments: clause.comments,
          formIntegrity,
          llmReviewed: semantic.llmReviewed ?? false,
          facts: clauseFacts,
          findings: findings.length > 0 ? findings : undefined,
        };
      }
    );

    const highRiskCount = reviewedClauses.filter((c) => c.riskLevel === 'HIGH').length;
    const mediumRiskCount = reviewedClauses.filter((c) => c.riskLevel === 'MEDIUM').length;
    const lowRiskCount = reviewedClauses.filter((c) => c.riskLevel === 'LOW').length;
    const passCount = reviewedClauses.filter((c) => c.riskLevel === 'PASS').length;
    const missingCount = missingClauses.length;

    let score = 100;
    score -= highRiskCount * 14;
    score -= missingClauses.filter((m: any) => m.severity === 'HIGH').length * 15;
    score -= mediumRiskCount * 7;
    score -= missingClauses.filter((m: any) => m.severity === 'MEDIUM').length * 6;
    if (totalUnfilledVariables > 0) {
      score -= Math.min(15, totalUnfilledVariables * 3);
    }
    score = Math.max(25, Math.min(100, score));

    const llmReviewedCount = reviewedClauses.filter((c) => c.llmReviewed === true).length;
    const shouldSkipLlm = options?.skipLlmReview === true || process.env.CONTRACT_REVIEW_SKIP_LLM === 'true';

    const effectiveWarnings: string[] = [...(warnings || [])];
    if (positionSource === 'default') {
      effectiveWarnings.push(
        `审查立场提示: 未从用户输入或合同正文中确认签约主体立场，已使用系统默认立场（${myPosition}）执行审查。`
      );
    }
    const degradedCount = reviewedClauses.length - llmReviewedCount;
    const isDegraded = degradedCount > 0 && !shouldSkipLlm;
    if (isDegraded) {
      effectiveWarnings.push(
        `语义模型审查部分降级: 共 ${reviewedClauses.length} 条条款中有 ${degradedCount} 条未完成大模型语义审查，已自动降级为规则矩阵审查兜底。`
      );
    }

    const metrics: ContractReviewMetrics = {
      totalClauses: reviewedClauses.length,
      healthScore: score,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      missingClausesCount: missingCount,
      passCount,
      unfilledVariablesCount: totalUnfilledVariables,
      unfilledBlanksTotal: totalUnfilledBlanks,
      llmReviewedCount,
      degradedClausesCount: degradedCount,
      isDegraded,
      isTruncated,
      warnings: effectiveWarnings.length > 0 ? effectiveWarnings : undefined,
    };

    const chapterMap = new Map<string, ReviewChapterGroup>();
    let chIdx = 1;
    for (const c of reviewedClauses) {
      const isPreamble = c.clauseIndex === 0 || c.clauseNumber === '前言';
      const isAnnex = c.clauseNumber?.includes('附件') || c.title?.includes('附件');
      const chNum = isPreamble
        ? c.chapterNumber && c.chapterNumber !== '正文'
          ? c.chapterNumber
          : '前言'
        : isAnnex
        ? c.chapterNumber || '附件'
        : c.chapterNumber || '正文';
      const chTitle = isPreamble
        ? c.chapterTitle && c.chapterTitle !== '合同正文条款'
          ? c.chapterTitle
          : '合同引言与签约主体'
        : isAnnex
        ? c.chapterTitle || '合同附件与补充协议'
        : c.chapterTitle || '合同正文条款';
      const key = `${chNum}__${chTitle}`;
      if (!chapterMap.has(key)) {
        chapterMap.set(key, {
          chapterIndex: chIdx++,
          chapterNumber: chNum,
          chapterTitle: chTitle,
          clauses: [],
          highRiskCount: 0,
          mediumRiskCount: 0,
          passCount: 0,
        });
      }
      const group = chapterMap.get(key)!;
      group.clauses.push(c);
      if (c.riskLevel === 'HIGH') group.highRiskCount++;
      else if (c.riskLevel === 'MEDIUM') group.mediumRiskCount++;
      else if (c.riskLevel === 'PASS') group.passCount++;
    }
    const chapters: ReviewChapterGroup[] = Array.from(chapterMap.values());

    return {
      contractType,
      contractTypeName,
      myPosition,
      metrics,
      clauses: reviewedClauses,
      chapters,
      missingClauses,
      comments: parsedDoc.comments || reviewedClauses.flatMap((c) => c.comments || []),
    };
  }

  async executeReview(input: ReviewEngineInput): Promise<ReviewEngineResult> {
    const parsedDoc = await this.parseContractDocument(input);
    return this.executeSemanticReviewFromParsed(parsedDoc, {
      skipLlmReview: input.skipLlmReview,
    });
  }

  /**
   * Concurrently processes array items with a maximum concurrency limit
   * while preserving exact original array index ordering.
   */
  private async runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    if (!items || items.length === 0) return [];
    const results: R[] = new Array(items.length);
    let currentIndex = 0;

    const workerCount = Math.min(Math.max(1, limit), items.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (currentIndex < items.length) {
        const idx = currentIndex++;
        results[idx] = await fn(items[idx], idx);
      }
    });

    await Promise.all(workers);
    return results;
  }

  private locateEvidenceForRule(
    clauseText: string,
    rule: CheckpointRule,
    facts: ExtractedLegalFacts
  ): { evidenceQuote: string; charStart?: number; charEnd?: number } {
    return this.elementEvaluator.locateEvidence(clauseText, rule, facts);
  }

  private locateEvidenceForSemanticRisk(
    clauseText: string,
    semantic: ClauseLlmReviewResult
  ): { evidenceQuote: string; charStart?: number; charEnd?: number } {
    return this.elementEvaluator.locateEvidenceForSemanticRisk(clauseText, semantic);
  }

  /**
   * Intelligently resolves the party position by inspecting contract preamble definitions,
   * decoupling Party A / Party B from rigid buyer/seller stereotypes.
   */
  private normalizeRawPosition(raw?: string): PartyPositionInput | undefined {
    if (!raw || typeof raw !== 'string') return undefined;
    const s = raw.trim().toLowerCase();
    if (['buyer', 'seller', 'neutral', 'party_a', 'party_b', 'both', 'auto'].includes(s)) {
      return s as PartyPositionInput;
    }
    // Buyer / client / tenant / employer (pays money / receives service or goods):
    if (
      /(?:买方|采购方|采购人|需方|客户|委托方|委托人|用人单位|雇主|承租方|承租人|買主|発注者|委託者|委託方|借主|賃借人)/i.test(
        s
      )
    ) {
      return 'buyer';
    }
    // Seller / provider / landlord / employee (provides goods/service/property / receives money):
    if (
      /(?:卖方|销售方|供方|供货方|供应商|服务商|开发方|技术方|承揽方|出卖人|受托方|受托人|劳动者|员工|出租方|出租人|売主|受注者|受託者|受託人|受託方|貸主|賃貸人)/i.test(
        s
      )
    ) {
      return 'seller';
    }
    if (/(?:中立|客观|公允|双方|双向|共同)/i.test(s)) {
      return 'neutral';
    }
    if (/(?:甲方|第一方|^甲$|当事者甲)/i.test(s)) {
      return 'party_a';
    }
    if (/(?:乙方|第二方|^乙$|当事者乙)/i.test(s)) {
      return 'party_b';
    }
    return undefined;
  }

  public resolvePartyPosition(
    positionInput?: PartyPositionInput,
    contractText: string = '',
    defaultPosition: PartyPosition = 'buyer'
  ): PartyPosition {
    return this.resolvePartyPositionWithSource(positionInput, contractText, defaultPosition).position;
  }

  public resolvePartyPositionWithSource(
    positionInput?: PartyPositionInput,
    contractText: string = '',
    defaultPosition: PartyPosition = 'buyer',
    explicitSource?: 'default' | 'inferred' | 'user_confirmed',
    entityContext?: LegalEntityProfile
  ): { position: PartyPosition; positionSource: 'default' | 'inferred' | 'user_confirmed' } {
    const rawPos = String(positionInput || '').trim();
    const normalizedPos = this.normalizeRawPosition(rawPos) || (positionInput as PartyPositionInput);

    // =========================================================================
    // 第一优先级：用户显式指定 (User Explicit Confirmation)
    // 1. 若显式声明 explicitSource === 'user_confirmed'
    // 2. 或未带 explicitSource，但用户提供了明确的商业立场或签约主体（非 'auto'）
    // =========================================================================
    if (explicitSource === 'user_confirmed') {
      if (normalizedPos === 'party_a' || normalizedPos === 'party_b') {
        return this.resolvePartyRoleInContract(normalizedPos as 'party_a' | 'party_b', contractText, 'user_confirmed');
      }
      const pos: PartyPosition =
        normalizedPos === 'seller' || normalizedPos === 'buyer' || normalizedPos === 'neutral'
          ? (normalizedPos as PartyPosition)
          : defaultPosition;
      return { position: pos, positionSource: 'user_confirmed' };
    }

    if (!explicitSource && (normalizedPos === 'party_a' || normalizedPos === 'party_b')) {
      return this.resolvePartyRoleInContract(normalizedPos as 'party_a' | 'party_b', contractText, 'user_confirmed');
    }

    if (!explicitSource && (normalizedPos === 'buyer' || normalizedPos === 'seller' || normalizedPos === 'neutral')) {
      return { position: normalizedPos as PartyPosition, positionSource: 'user_confirmed' };
    }

    if ((normalizedPos as string) === 'both') {
      return { position: 'neutral', positionSource: 'user_confirmed' };
    }

    // =========================================================================
    // 第二优先级：系统配置的企业主体关键词匹配 (System Configured Company Matching)
    // 检索合同文本（前言 4000 字符 + 签署落款区 2000 字符）是否命中配置的企业全称或别名
    // =========================================================================
    const effectiveEntity =
      entityContext && entityContext.legalEntityName
        ? entityContext
        : DEFAULT_ENTERPRISE_LEGAL_ENTITY;
    const candidateAliases = [
      effectiveEntity.legalEntityName,
      ...(effectiveEntity.aliases || []),
    ].filter((name): name is string => Boolean(name && name.trim().length > 1));

    const preamble = contractText.slice(0, 4000);
    const tail = contractText.length > 4000 ? contractText.slice(-2000) : '';
    const searchScope = `${preamble}\n${tail}`;

    let matchedPartyFromEntity: 'party_a' | 'party_b' | undefined;
    for (const alias of candidateAliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 乙方匹配：乙方: 富士通 ... 或 富士通 ... (以下称为“乙方”) 或 受託者: 富士通
      const partyBPattern = new RegExp(
        `(?:(?:乙方|乙|第二方|受注者|受託者|借主|当事者乙)[^\\n\\r]{0,30}[：:\\s=][^\\n\\r]{0,30}${escaped})|(?:${escaped}[^\\n\\r]{0,60}(?:以下[简称|称为]*[“"「]?乙方[”"」]?|\\(以下称为“乙方”\\)|（以下「乙」）))`,
        'i'
      );
      // 甲方匹配：甲方: 富士通 ... 或 富士通 ... (以下称为“甲方”) 或 発注者: 富士通
      const partyAPattern = new RegExp(
        `(?:(?:甲方|甲|第一方|発注者|委託者|貸主|当事者甲)[^\\n\\r]{0,30}[：:\\s=][^\\n\\r]{0,30}${escaped})|(?:${escaped}[^\\n\\r]{0,60}(?:以下[简称|称为]*[“"「]?甲方[”"」]?|\\(以下称为“甲方”\\)|（以下「甲」）))`,
        'i'
      );

      if (partyBPattern.test(searchScope)) {
        matchedPartyFromEntity = 'party_b';
        break;
      }
      if (partyAPattern.test(searchScope)) {
        matchedPartyFromEntity = 'party_a';
        break;
      }
    }

    if (matchedPartyFromEntity) {
      return this.resolvePartyRoleInContract(matchedPartyFromEntity, preamble, 'inferred');
    }

    // =========================================================================
    // 第三优先级：自动识别与默认回退 (Automatic Detection & Default Fallback)
    // 3.1 双向对等条款检测
    // 3.2 若入参带有明确指定的系统默认回退值 (explicitSource === 'default')
    // 3.3 系统配置的企业默认商业角色倾向 (defaultContractRole, 如 seller)
    // 3.4 合同类型默认基准角色 (defaultPosition)
    // =========================================================================
    if (/双方互为(?:披露方|透露方|接收方)|双向保密|互为透露方|共同承担保密|各自披露/i.test(preamble)) {
      return { position: 'neutral', positionSource: 'inferred' };
    }

    if (
      explicitSource === 'default' &&
      (normalizedPos === 'seller' || normalizedPos === 'buyer' || normalizedPos === 'neutral')
    ) {
      return { position: normalizedPos as PartyPosition, positionSource: 'default' };
    }

    const entityDefaultRole = entityContext?.defaultContractRole;
    if (
      entityDefaultRole &&
      (entityDefaultRole === 'seller' || entityDefaultRole === 'buyer' || entityDefaultRole === 'neutral')
    ) {
      return { position: entityDefaultRole, positionSource: 'default' };
    }

    return { position: defaultPosition, positionSource: 'default' };
  }

  /**
   * 根据合同前言中对甲方或乙方的实质权利义务定义，精确判定买方(披露方)/卖方(接收方)立场
   */
  private resolvePartyRoleInContract(
    party: 'party_a' | 'party_b',
    preamble: string,
    source: 'user_confirmed' | 'inferred'
  ): { position: PartyPosition; positionSource: 'user_confirmed' | 'inferred' } {
    if (party === 'party_a') {
      if (
        /(?:甲方|甲)\s*[（:：(][^）\n)]*(?:受托|卖方|供货|供方|供应商|出卖|开发|服务|承揽|接收方|劳动者|出租方|出租人|売主|受注者|受託|開発|貸主|賃貸人)[^）\n)]*[）)]?/i.test(
          preamble
        ) ||
        /(?:甲方|甲)(?:为|系|作为|属于|は)(?:受托|卖方|供货|供方|供应商|出卖|开发|服务|承揽|接收方|劳动者|出租方|出租人|売主|受注者|受託|開発|貸主|賃貸人)/i.test(
          preamble
        )
      ) {
        return { position: 'seller', positionSource: source };
      }
      return { position: 'buyer', positionSource: source };
    }

    if (party === 'party_b') {
      if (
        /(?:乙方|乙)\s*[（:：(][^）\n)]*(?:委托|买方|采购|发包|客户|需方|透露方|披露方|用人单位|承租方|承租人|買主|発注|委託|借主|賃借人)[^）\n)]*[）)]?/i.test(
          preamble
        ) ||
        /(?:乙方|乙)(?:为|系|作为|属于|は)(?:委托|买方|采购|发包|客户|需方|透露方|披露方|用人单位|承租方|承租人|買主|発注|委託|借主|賃借人)/i.test(
          preamble
        )
      ) {
        return { position: 'buyer', positionSource: source };
      }
      return { position: 'seller', positionSource: source };
    }

    return { position: 'buyer', positionSource: source };
  }
}

