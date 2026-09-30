export type StandardContractType =
  | 'nda'
  | 'software_development'
  | 'procurement'
  | 'employment'
  | 'lease'
  | 'general';

export type ContractType =
  | StandardContractType
  | 'software_dev' // backward-compat legacy alias
  | 'labor'; // backward-compat legacy alias

export type ReviewRiskLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';

export type PartyPosition = 'buyer' | 'seller' | 'neutral';
export type PartyPositionInput = PartyPosition | 'party_a' | 'party_b' | 'both';

export interface BuiltinContractReviewInput {
  fileBase64?: string;
  fileName?: string;
  text?: string;
  contractType?: string;
  myPosition?: PartyPositionInput;
  customCheckpoints?: CustomCheckpointDto[];
  customChecklistRules?: CustomCheckpointDto[]; // Standard manifest parameter name
  downloadUrl?: string;
  fileUrl?: string;
  url?: string;
  taskContext?: any;
  idempotencyKey?: string;
  prompt?: string;
  reviewPrompt?: string;
  skipLlmReview?: boolean;
  positionSource?: 'default' | 'inferred' | 'user_confirmed';
}

export interface CustomCheckpointDto {
  id: string;
  title: string;
  severity: ReviewRiskLevel;
  rule: string;
  category?: string;
  elementId?: string;
  elementCode?: string;
  recommendedRevision?: string;
}

import type { DocumentBlock, DocxCommentItem } from '../contract-compare/contract-compare.types';
import type { ClauseLegalFinding, ExtractedLegalFacts } from '../contract-elements';

export type { DocumentBlock, DocxCommentItem, ClauseLegalFinding, ExtractedLegalFacts };

export interface FormIntegrityCheckResult {
  status: 'PASS' | 'WARNING' | 'ERROR';
  unfilledVariables: string[];
  unfilledBlanksCount: number;
  missingEntities: string[];
  formatIssues: string[];
  summary: string;
}

export interface ClauseReviewItem {
  clauseIndex: number;
  clauseNumber: string;
  title: string;
  originalContent: string;
  riskLevel: ReviewRiskLevel;
  riskSummary: string;
  legalAdvice: string;
  recommendedRevision?: string;
  matchedCheckpoints: string[];
  elementId?: string;
  elementCode?: string;
  chapterNumber?: string;
  chapterTitle?: string;
  blocks?: DocumentBlock[];
  comments?: DocxCommentItem[];
  formIntegrity?: FormIntegrityCheckResult;
  llmReviewed?: boolean;
  facts?: ExtractedLegalFacts;
  findings?: ClauseLegalFinding[];
}

export interface ReviewChapterGroup {
  chapterIndex: number;
  chapterNumber: string;
  chapterTitle: string;
  clauses: ClauseReviewItem[];
  highRiskCount: number;
  mediumRiskCount: number;
  passCount: number;
}

export interface MissingClauseAlert {
  id: string;
  title: string;
  category: string;
  severity: ReviewRiskLevel;
  reason: string;
  recommendedClause: string;
  elementId?: string;
  elementCode?: string;
}

export interface ContractReviewMetrics {
  totalClauses: number;
  healthScore: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  missingClausesCount: number;
  passCount: number;
  unfilledVariablesCount?: number;
  unfilledBlanksTotal?: number;
  llmReviewedCount?: number;
  isTruncated?: boolean;
  warnings?: string[];
}

export interface ReviewRuleSetSnapshot {
  ruleSetId: string;
  ruleSetVersion: string;
  ruleSetDigest?: string;
  ruleSetName?: string;
}

export interface ReviewDraftPayload {
  executionId?: string;
  artifactId?: string;
  ruleSetId?: string;
  ruleSetVersion?: string;
  ruleSetDigest?: string;
  summaryText: string;
  stagedComments: any[];
  findingStates: Record<string, any>;
  approvalOpinions?: any[];
  sourceDocumentVersion?: string;
  action?: 'finish' | 'stage';
  stats?: {
    totalFindings: number;
    viewedCount: number;
    stagedCommentsCount: number;
    totalCommentsCount: number;
  };
}

export interface ContractReviewOutput {
  summary: string;
  /** 结构化摘要，与 summary 保持一致，不内嵌 HTML 源码以防数据膨胀 */
  chatSummary?: string;
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  positionSource?: 'default' | 'inferred' | 'user_confirmed';
  metrics: ContractReviewMetrics;
  clauses: ClauseReviewItem[];
  chapters?: ReviewChapterGroup[];
  missingClauses: MissingClauseAlert[];
  comments?: DocxCommentItem[];
  htmlReport: string;
  ruleSetInfo?: ReviewRuleSetSnapshot;
  sourceDocumentVersion?: string;
  artifact?: {
    type?: string;
    id: string;
    name: string;
    url: string;
    downloadUrl: string;
    mimeType: string;
    sizeBytes?: number;
    metadata?: Record<string, any>;
  };
  artifacts?: Array<{
    type?: string;
    id: string;
    name: string;
    url: string;
    downloadUrl: string;
    mimeType: string;
    sizeBytes?: number;
    metadata?: Record<string, any>;
  }>;
}

export interface BuiltinContractReviewInvokeDto {
  executionId?: string;
  stepId?: string;
  capabilityKey?: string;
  definitionVersion?: string;
  idempotencyKey?: string;
  input?: BuiltinContractReviewInput;
}

export interface CandidateRuleItem {
  id: string;
  elementId?: string;
  elementCode?: string;
  title: string;
  category: string;
  severity: ReviewRiskLevel;
  riskSummary: string;
  legalAdvice: string;
  recommendRevision?: (original: string) => string;
  recommendedRevision?: string;
  criterion?: string;
}

export interface ParsedClauseItem {
  clauseIndex: number;
  clauseNumber: string;
  title: string;
  originalContent: string;
  chapterNumber?: string;
  chapterTitle?: string;
  blocks?: DocumentBlock[];
  comments?: DocxCommentItem[];
  formIntegrity: FormIntegrityCheckResult;
  facts: ExtractedLegalFacts;
  matchedRules: Array<{
    id: string;
    title: string;
    category: string;
    severity: string;
    riskSummary: string;
    legalAdvice: string;
    elementId?: string;
    elementCode?: string;
    recommendRevision?: (text: string) => string;
    recommendedRevision?: string;
  }>;
  candidateRules?: CandidateRuleItem[];
}

export interface ContractParseOutput {
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  positionSource?: 'default' | 'inferred' | 'user_confirmed';
  fileName: string;
  fullText: string;
  sourceDocumentVersion?: string;
  parsedClauses: ParsedClauseItem[];
  availableRules?: CandidateRuleItem[];
  missingClauses: MissingClauseAlert[];
  comments?: DocxCommentItem[];
  formIntegrityStats: {
    totalUnfilledVariables: number;
    totalUnfilledBlanks: number;
  };
  isTruncated: boolean;
  warnings: string[];
  rawPrompt?: string;
  ruleSetInfo?: ReviewRuleSetSnapshot;
}

export interface ContractRenderReportInput {
  fileName?: string;
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  positionSource?: 'default' | 'inferred' | 'user_confirmed';
  metrics: ContractReviewMetrics;
  clauses: ClauseReviewItem[];
  chapters?: ReviewChapterGroup[];
  missingClauses: MissingClauseAlert[];
  comments?: DocxCommentItem[];
  canComment?: boolean;
  commentApiUrl?: string;
  idempotencyKey?: string;
  ruleSetInfo?: ReviewRuleSetSnapshot;
  executionId?: string;
  sourceDocumentVersion?: string;
}

export interface BuiltinContractReviewParseDto extends BuiltinContractReviewInvokeDto {}

export interface BuiltinContractReviewRenderDto {
  executionId?: string;
  stepId?: string;
  idempotencyKey?: string;
  input: ContractRenderReportInput;
}

