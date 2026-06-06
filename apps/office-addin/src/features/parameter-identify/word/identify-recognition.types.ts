import type { TemplateCompareResponse, TemplateFieldCandidate, TemplateUnderstandResponse } from '../../../api/carbone-api';
import type { AISuggestion } from '../../../app/store';
import type { DocumentIR } from '../../../host/adapters/document-ir';
import type { AnalysisExecutorKind } from '../services/index';

export type SampleUploadStateLike = {
  uploaded: boolean;
  fileName?: string;
  fileBase64?: string;
  revision: number;
};

export type CompareCandidateSectionLike = {
  sectionKey: string;
  sectionId?: string;
  sectionTitle: string;
  candidates: TemplateCompareResponse['candidateFields'];
  isAttachment?: boolean;
};

export type WordSectionGenerationResultLike = {
  sectionKey: string;
  sectionTitle: string;
  candidateCount: number;
  suggestionCount: number;
  suggestionIds: string[];
  aiCallSucceeded: boolean;
  usedRetry: boolean;
  retryCount: number;
  excerpt?: string;
  promptDebugSummary?: string;
  promptRequestText?: string;
  rawAiResponse?: string;
  qualityIssues?: string[];
  error?: {
    message?: string;
    reason?: string;
    url?: string;
    status?: number;
  };
};

export type RecognitionResultLike = {
  suggestions: AISuggestion[];
  sectionGenerationResults: WordSectionGenerationResultLike[];
  collapsedSections?: Record<string, boolean>;
};

export interface CreateWordIdentifyRecognitionControllerOptions {
  sampleUploadState: SampleUploadStateLike;
  compareResult: TemplateCompareResponse | null;
  compareCandidateSections: CompareCandidateSectionLike[];
  effectiveCompareCandidateFields: TemplateFieldCandidate[];
  apiBaseUrl: string;
  languageSignature: string;
  currentCompareSignature: string;
  currentRecognitionCacheSignature: string;
  workflowSourceLanguage: string;
  workflowTargetLanguages: string[];
  selectedCompareSectionKeys: string[];
  selectedRecognitionSections: CompareCandidateSectionLike[];
  detectedSectionMap: Map<string, any>;
  selectedTemplateType: string;
  analysisExecutor: AnalysisExecutorKind;
  analysisThinkingEnabled: boolean;
  useMultiStage: boolean;
  aiOrchestratorBaseUrl?: string;
  aiOrchestratorAuthToken?: string;
  recognitionCacheKey: string | null;
  collapsedRecognitionSections: Record<string, boolean>;
  wordSectionRecognitionBatchSize: number;
  wordSectionRecognitionMaxRounds: number;
  setAnalysisError: (message: string | null, details?: string) => void;
  addDebugLog: (level: 'info' | 'debug' | 'warn' | 'error', message: string, details?: string) => void;
  setIsUnderstanding: (value: boolean) => void;
  setUnderstandingResult: (result: TemplateUnderstandResponse | null) => void;
  setUnderstandingRevision: (revision: number) => void;
  setUnderstandingLanguageSignature: (signature: string) => void;
  setUnderstandingCompareSignature: (signature: string) => void;
  setUnderstandingCacheStatus: (status: 'hit' | 'miss' | null) => void;
  setUnderstandingCacheUpdatedAt: (updatedAt: number | null) => void;
  setIsRecognizing: (value: boolean) => void;
  setRecognitionResult: (result: any) => void;
  setSectionGenerationResults: (results: WordSectionGenerationResultLike[]) => void;
  setSuggestions: (suggestions: AISuggestion[]) => void;
  setCollapsedRecognitionSections: (sections: Record<string, boolean>) => void;
  setRecognitionCacheStatus: (status: 'hit' | 'miss' | null) => void;
  setRecognitionCacheUpdatedAt: (updatedAt: number | null) => void;
  setRecognitionRevision: (revision: number) => void;
  setRecognitionLanguageSignature: (signature: string) => void;
  setRecognitionCompareSignature: (signature: string) => void;
  setRecognitionActivated: (activated: boolean) => void;
  buildWorkflowRequest: (options?: {
    includeUnderstanding?: boolean;
    useSelectedCompareCandidates?: boolean;
    prefetchedUnderstanding?: TemplateUnderstandResponse;
  }) => Promise<{
    request: {
      templateDocumentIr?: unknown;
    };
    cacheKey: string;
  }>;
  loadWordUnderstandingCache: () => Record<string, any>;
  isWordUnderstandingCacheCompatible: (entry: any) => boolean;
  removeWordUnderstandingCacheEntry: (cacheKey: string) => void;
  saveWordUnderstandingCacheEntry: (entry: {
    cacheKey: string;
    result: TemplateUnderstandResponse;
    updatedAt: number;
  }) => void;
  buildUnderstandingDebugText: (result: TemplateUnderstandResponse, summaryText: string) => string;
  buildWordUnderstandingSummaryText: (result: TemplateUnderstandResponse) => string;
  loadWordRecognitionCache: () => Record<string, any>;
  saveWordRecognitionCacheEntry: (entry: {
    cacheKey: string;
    result: RecognitionResultLike;
    updatedAt: number;
  }) => void;
  mergeRecognitionResultWithAppliedCache: (
    nextResult: RecognitionResultLike,
    cachedEntry?: any
  ) => RecognitionResultLike;
  persistCompareCacheRecognitionSnapshot: (result: RecognitionResultLike) => void;
  buildWordSectionExcerpt: (templateDocumentIr: DocumentIR, section: CompareCandidateSectionLike, detectedSection?: any) => string;
  buildWordSectionDocumentIR: (templateDocumentIr: DocumentIR, section: CompareCandidateSectionLike, detectedSection?: any) => DocumentIR;
  buildWordSectionDocumentContent: (templateDocumentIr: DocumentIR, section: CompareCandidateSectionLike, detectedSection?: any) => string;
  buildWordSectionPromptBilingualGroups: (section: CompareCandidateSectionLike) => any[];
  buildWordSectionCandidateList: (templateDocumentIr: DocumentIR, section: CompareCandidateSectionLike) => string;
  buildWordSectionBilingualPairList: (templateDocumentIr: DocumentIR, section: CompareCandidateSectionLike) => string;
  takeWordRecognitionBatch: (args: {
    retryLoopIds: string[];
    unsentLoopIds: string[];
    retryNormalIds: string[];
    unsentNormalIds: string[];
    candidateById: Map<string, TemplateFieldCandidate>;
    acceptedIds: Set<string>;
  }) => TemplateFieldCandidate[];
  buildWordSectionSubset: (section: CompareCandidateSectionLike, candidates: TemplateFieldCandidate[]) => CompareCandidateSectionLike;
  buildWordSectionPromptCandidates: (templateDocumentIr: DocumentIR, section: CompareCandidateSectionLike) => any[];
  filterWordPromptBilingualGroupsByCandidates: (groups: any[], candidates: TemplateFieldCandidate[]) => any[];
  buildAcceptedWordSuggestionSummaries: (suggestions: AISuggestion[]) => any[];
  hydrateWordSectionSuggestions: (
    templateDocumentIr: DocumentIR,
    section: CompareCandidateSectionLike,
    excerpt: string,
    suggestions: AISuggestion[]
  ) => AISuggestion[];
  buildPromptTraceDebugText: (promptRequestText?: string, rawAiResponse?: string) => string;
  selectBestWordSuggestionForCandidate: (suggestions: AISuggestion[], candidateId: string) => AISuggestion | undefined;
  isWordSuggestionHighQuality: (suggestion: AISuggestion | undefined, candidateId: string) => boolean;
  appendUniqueCandidateIds: (targetQueue: string[], candidateIds: string[]) => void;
  isWordLoopCompareCandidate: (candidate: TemplateFieldCandidate) => boolean;
  dedupeWordSectionSuggestions: (suggestions: AISuggestion[]) => AISuggestion[];
}
