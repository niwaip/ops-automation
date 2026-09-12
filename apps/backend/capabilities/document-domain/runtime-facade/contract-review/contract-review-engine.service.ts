import { Injectable, BadRequestException } from '@nestjs/common';
import type {
  ClauseReviewItem,
  ContractReviewMetrics,
  ContractType,
  CustomCheckpointDto,
  PartyPosition,
  PartyPositionInput,
  ReviewChapterGroup,
  ReviewRiskLevel,
} from './contract-review.types';
import { ContractTypeClassifierService } from './contract-type-classifier.service';
import {
  ContractChecklistMatrixService,
  type CheckpointRule,
} from './contract-checklist-matrix.service';
import {
  ReviewFactExtractorService,
  ReviewElementEvaluatorService,
  type ClauseLegalFinding,
  type ExtractedLegalFacts,
  type ReviewSeverity,
} from '../contract-elements';
import { ContractAstParserService } from '../contract-compare/contract-ast-parser.service';
import { ContractFormIntegrityScannerService } from './contract-form-integrity-scanner.service';
import {
  ContractLlmReviewService,
  type ClauseLlmReviewResult,
} from './contract-llm-review.service';

export interface ReviewEngineInput {
  fileBase64?: string;
  fileName?: string;
  text?: string;
  contractType?: string;
  myPosition?: PartyPositionInput;
  customCheckpoints?: CustomCheckpointDto[];
  customChecklistRules?: CustomCheckpointDto[];
}

export interface ReviewEngineResult {
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  metrics: ContractReviewMetrics;
  clauses: ClauseReviewItem[];
  chapters: ReviewChapterGroup[];
  missingClauses: ReturnType<ContractChecklistMatrixService['detectMissingClauses']>;
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

  async executeReview(input: ReviewEngineInput): Promise<ReviewEngineResult> {
    const fileName = input.fileName || '未命名合同';

    // 1. Parse AST clauses from base64 or text
    const astClauses = await this.astParser.parseToAst({
      base64: input.fileBase64,
      fileName,
      text: input.text,
    });

    if (!astClauses || astClauses.length === 0) {
      throw new BadRequestException('未能从上传的文档中提取到有效的合同条款，请核对文档格式或内容。');
    }

    const fullText = astClauses.map((c) => c.content).join('\n\n');

    // 2. Classify contract type & determine party position
    const typeInfo = this.classifier.classify(fileName, fullText, input.contractType);
    const resolvedPosition: PartyPosition =
      input.myPosition === 'party_a'
        ? 'buyer'
        : input.myPosition === 'party_b'
          ? 'seller'
          : input.myPosition === 'both'
            ? 'neutral'
            : input.myPosition || typeInfo.defaultPosition;

    const effectiveCustomRules = input.customChecklistRules || input.customCheckpoints;

    // 3. Load checklist rules filtered by contract type and party position
    const rules = this.checklistMatrix.getRulesForType(
      typeInfo.type,
      resolvedPosition,
      effectiveCustomRules
    );

    // 4. Evaluate each clause using Dual Perspectives (Perspective 1: Form & Integrity; Perspective 2: AI Semantic)
    let totalUnfilledVariables = 0;
    let totalUnfilledBlanks = 0;

    // Concurrency limit of 3 to balance throughput and model inference capacity
    const reviewedClauses: ClauseReviewItem[] = await this.runWithConcurrency(
      astClauses,
      3,
      async (clause, index) => {
        const clauseTitle = clause.title || clause.clauseNumber || `第 ${index + 1} 条`;
        const clauseText = clause.content || '';

        // Perspective 1: Form & Integrity Inspection
        const formIntegrity = this.formScanner.scanClause(
          clauseText,
          clauseTitle,
          index,
          clause.blocks
        );
        totalUnfilledVariables += formIntegrity.unfilledVariables.length;
        totalUnfilledBlanks += formIntegrity.unfilledBlanksCount;

        // Structured Fact Extraction for this clause
        const clauseFacts = this.factExtractor.extractClauseFacts(clauseText, clauseTitle);

        // Match rules from checklist matrix
        const matchedRules: CheckpointRule[] = [];
        for (const rule of rules) {
          if (rule.matcher(clauseText, clauseTitle)) {
            matchedRules.push(rule);
          }
        }

        // Perspective 2: AI & Semantic Legal Analysis
        const semantic = await this.llmReview.reviewClause({
          clauseIndex: index,
          clauseNumber: clause.clauseNumber || `第 ${index + 1} 条`,
          clauseTitle,
          clauseText,
          contractType: typeInfo.type,
          contractTypeName: typeInfo.displayName,
          myPosition: resolvedPosition,
          matchedRules,
          formIntegrity,
        });

        // Determine accurate primary elementId & elementCode (match with severity & triggering rules)
        let primaryRule: CheckpointRule | undefined;
        if (semantic.riskLevel === 'HIGH') {
          primaryRule = matchedRules.find((r) => r.severity === 'HIGH') || matchedRules[0];
        } else if (semantic.riskLevel === 'MEDIUM') {
          primaryRule = matchedRules.find((r) => r.severity === 'MEDIUM') || matchedRules[0];
        } else {
          primaryRule = matchedRules[0];
        }

        // Assemble structured legal findings (P2 evidence model)
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

        // Ensure issues found by LLM semantic review enter findings even without matched rules
        if (semantic.riskLevel !== 'PASS') {
          // Check if this specific legal issue is already covered by an existing finding using generic token similarity
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
          formIntegrity,
          llmReviewed: semantic.llmReviewed ?? false,
          facts: clauseFacts,
          findings: findings.length > 0 ? findings : undefined,
        };
      }
    );

    // 5. Detect missing essential clauses filtered by party position and AST parsed clauses
    const missingClauses = this.checklistMatrix.detectMissingClauses(
      typeInfo.type,
      fullText,
      resolvedPosition,
      reviewedClauses
    );

    // 6. Compute health score & metrics
    const highRiskCount = reviewedClauses.filter((c) => c.riskLevel === 'HIGH').length;
    const mediumRiskCount = reviewedClauses.filter((c) => c.riskLevel === 'MEDIUM').length;
    const lowRiskCount = reviewedClauses.filter((c) => c.riskLevel === 'LOW').length;
    const passCount = reviewedClauses.filter((c) => c.riskLevel === 'PASS').length;
    const missingCount = missingClauses.length;

    // Base score calculation: 100 max
    let score = 100;
    score -= highRiskCount * 14;
    score -= missingClauses.filter((m) => m.severity === 'HIGH').length * 15;
    score -= mediumRiskCount * 7;
    score -= missingClauses.filter((m) => m.severity === 'MEDIUM').length * 6;
    if (totalUnfilledVariables > 0) {
      score -= Math.min(15, totalUnfilledVariables * 3);
    }
    score = Math.max(25, Math.min(100, score));

    const llmReviewedCount = reviewedClauses.filter((c) => c.llmReviewed === true).length;

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
    };

    // 7. Group into Document-Faithful Chapter / Section Outline
    // INVARIANT: Sequential reading order of clauses (0 -> 1 -> 2 -> ... -> N) must NEVER be scrambled.
    const chapterMap = new Map<string, ReviewChapterGroup>();
    let chIdx = 1;
    for (const c of reviewedClauses) {
      const chNum = c.chapterNumber || (c.clauseIndex === 0 ? '前言' : '正文');
      const chTitle = c.chapterTitle || (c.clauseIndex === 0 ? '合同引言与签约主体' : '合同正文条款');
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
      contractType: typeInfo.type,
      contractTypeName: typeInfo.displayName,
      myPosition: resolvedPosition,
      metrics,
      clauses: reviewedClauses,
      chapters,
      missingClauses,
    };
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
}

