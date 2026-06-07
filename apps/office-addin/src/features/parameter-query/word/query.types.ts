import type { TemplateCompareResponse, TemplateFieldCandidate } from '../../../api/carbone-api';

export type CompareCacheStatus = 'hit' | 'miss' | null;
export type CompareHeadingLanguage = 'zh' | 'ja' | 'en';
export type WordCompareDisplayLanguage = 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';

export interface CompareSummary {
  candidateCount: number;
  sectionCount: number;
  warnings: string[];
}

export interface CompareResultLike {
  compareId: string;
  compareSummary: CompareSummary;
}

export interface CompareCandidateSectionLike {
  sectionKey: string;
  sectionId?: string;
  sectionTitle: string;
  candidates: TemplateCompareResponse['candidateFields'];
  previewCandidates?: TemplateCompareResponse['candidateFields'];
  hiddenCandidateCount?: number;
  isAttachment?: boolean;
}

export interface WordLoopDisplayPair {
  key: string;
  leftCandidates: TemplateFieldCandidate[];
  rightCandidates: TemplateFieldCandidate[];
  leftLanguage: WordCompareDisplayLanguage;
  rightLanguage: WordCompareDisplayLanguage;
  cellIndex?: number;
}

export interface WordCompareCandidateDisplayGroup {
  key: string;
  type: 'sentence_pair' | 'cell_pair' | 'single_sentence' | 'loop_group';
  candidates?: TemplateFieldCandidate[];
  leftCandidates?: TemplateFieldCandidate[];
  rightCandidates?: TemplateFieldCandidate[];
  leftLanguage?: WordCompareDisplayLanguage;
  rightLanguage?: WordCompareDisplayLanguage;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
  loopPairs?: WordLoopDisplayPair[];
}
