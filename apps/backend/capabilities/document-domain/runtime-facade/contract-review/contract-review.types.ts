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

import type { DocumentBlock } from '../contract-compare/contract-compare.types';
import type { ClauseLegalFinding, ExtractedLegalFacts } from '../contract-elements';

export type { DocumentBlock, ClauseLegalFinding, ExtractedLegalFacts };

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
}

export interface ContractReviewOutput {
  summary: string;
  contractType: ContractType;
  contractTypeName: string;
  myPosition: PartyPosition;
  metrics: ContractReviewMetrics;
  clauses: ClauseReviewItem[];
  chapters?: ReviewChapterGroup[];
  missingClauses: MissingClauseAlert[];
  htmlReport: string;
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
