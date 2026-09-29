import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';

export type DiffType = 'UNCHANGED' | 'MODIFIED' | 'ADDED' | 'DELETED';
export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface DiffToken {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface DocumentBlock {
  id: string;
  type: 'paragraph' | 'bilingual_pair' | 'list_item' | 'table' | 'key_value_grid' | 'heading';
  primaryText?: string;
  secondaryText?: string;
  primaryHtml?: string;
  secondaryHtml?: string;
  primaryLang?: string;
  secondaryLang?: string;
  alignment?: 'left' | 'center' | 'right';
  isBold?: boolean;
  hasUnderline?: boolean;
  prefix?: string;
  tableData?: { headers?: string[]; rows: string[][] };
  metadata?: Array<{ key: string; value: string }>;
  html?: string;
}

export interface DocxCommentItem {
  id: string; // OpenXML w:id
  author: string; // w:author
  date?: string; // w:date ISO timestamp
  initials?: string; // w:initials
  text: string; // comment content
  selectedText?: string; // the contract text highlighted by commentRange
  clauseIndex?: number; // matched clause index
  clauseNumber?: string;
  isResolved?: boolean; // w15:done="1"
}

export interface ContractClauseNode {
  id: string;
  clauseNumber: string;
  title: string;
  content: string;
  level: number;
  subClauses?: ContractClauseNode[];
  chapterNumber?: string;
  chapterTitle?: string;
  blocks?: DocumentBlock[];
  comments?: DocxCommentItem[];
}

export interface ClauseAiInsight {
  summary: string;
  riskLevel: RiskLevel;
  legalAdvice?: string;
  elementId?: string;
  elementCode?: string;
  keyChange?: string;
  shortSummary?: string;
}

export interface AlignedClausePair {
  id: string;
  status: DiffType;
  sourceClause?: ContractClauseNode;
  targetClause?: ContractClauseNode;
  similarity: number; // 0.0 - 1.0
  diffTokens?: DiffToken[];
  sourceHtml?: string;
  targetHtml?: string;
  aiInsight?: ClauseAiInsight;
}

export interface ContractCompareInput {
  fileBase64A?: string;
  fileNameA?: string;
  textA?: string;
  fileBase64B?: string;
  fileNameB?: string;
  textB?: string;
  enableRiskAnalysis?: boolean;
  diffGranularity?: 'char' | 'token';
  myPosition?: string;
  customChecklistRules?: any[];
  customCheckpoints?: any[];
  idempotencyKey?: string;
}

export interface DocumentAstMetadata {
  isTruncated?: boolean;
  pageCount?: number;
  extractedPageCount?: number;
  characterCount?: number;
  warnings?: string[];
  format?: string;
}

export interface ContractAstParseResult {
  clauses: ContractClauseNode[];
  metadata: DocumentAstMetadata;
  comments?: DocxCommentItem[];
}

export interface ContractCompareMetrics {
  totalClauses: number;
  unchangedCount: number;
  modifiedCount: number;
  addedCount: number;
  deletedCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  sourceClauseCount?: number;
  targetClauseCount?: number;
  isTruncated?: boolean;
  warnings?: string[];
}

export interface ContractCompareOutput {
  summary: string;
  metrics: ContractCompareMetrics;
  alignedClauses: AlignedClausePair[];
  artifact: ArtifactRef;
  artifacts: ArtifactRef[];
  htmlReport?: string;
}

export interface BuiltinContractCompareInvokeDto {
  executionId: string;
  stepId: string;
  capabilityKey: string;
  definitionVersion: string;
  idempotencyKey?: string;
  input: ContractCompareInput;
}

export interface ContractDiffOutput {
  fileNameA: string;
  fileNameB: string;
  alignedClauses: AlignedClausePair[];
  metrics: ContractCompareMetrics;
  sourceClauseCount: number;
  targetClauseCount: number;
  isTruncated: boolean;
  warnings?: string[];
}

export interface ContractRenderCompareReportInput {
  fileNameA?: string;
  fileNameB?: string;
  metrics?: ContractCompareMetrics;
  alignedClauses: AlignedClausePair[];
  idempotencyKey?: string;
}

export interface BuiltinContractCompareDiffDto extends BuiltinContractCompareInvokeDto {}

export interface BuiltinContractCompareRenderDto {
  executionId?: string;
  stepId?: string;
  idempotencyKey?: string;
  input: ContractRenderCompareReportInput;
}

