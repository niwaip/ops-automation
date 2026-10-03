export interface ExtractedCommentItem {
  id: number | string;
  author: string;
  date?: string;
  initials?: string;
  text: string;
  clauseIndex?: number;
  clauseNumber?: string;
  clauseId?: string;
  clauseTitle?: string;
  anchorText?: string;
  parentCommentId?: string;
  status?: 'pending' | 'matched' | 'ambiguous' | 'unresolved';
}

export interface DocxClauseItemContext {
  clauseIndex?: number | string;
  clauseNumber?: string;
  title?: string;
}

export interface DocxCommentExtractionContext {
  clauses?: DocxClauseItemContext[];
  contractTitle?: string;
  sourceAttachmentId?: string;
  sourceDocumentHash?: string;
}

export interface DocxCommentInjectionOptions {
  fallbackTitle?: string;
  clauses?: DocxClauseItemContext[];
  allowUnresolvedFallback?: boolean;
}

export interface DocxCommentInjectionResult {
  buffer: Buffer;
  injectedCount: number;
  unresolvedCount: number;
  injectedComments: Array<{
    id: string;
    originalId?: string;
    paraId?: string;
    targetParagraphIndex: number;
    targetTextSnippet: string;
    clauseTitle?: string;
    isReply?: boolean;
    parentCommentId?: string;
  }>;
  unresolvedComments: ExtractedCommentItem[];
}

export interface ParsedParagraph {
  pIdx: number;
  start: number;
  length: number;
  rawXml: string;
  cleanText: string;
  isHeading: boolean;
  headingTitle?: string;
}

export interface ClauseBoundary {
  clauseIndex?: number;
  clauseNumber?: string;
  clauseTitle?: string;
  startParagraphIndex: number;
  endParagraphIndex: number;
}
