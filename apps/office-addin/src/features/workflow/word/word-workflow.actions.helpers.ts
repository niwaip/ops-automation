import type {
  TemplateCompareResponse,
  TemplateFieldCandidate,
  TemplateUnderstandResponse,
} from '../../../api/carbone-api';
import type { AnalysisExecutorKind } from '../../parameter-identify/services/index';
import type { WordSectionDisplayLanguage } from '../../../host/office/word/chapter';
import {
  findLatestMatchingWordUnderstandingCacheEntry,
  isWordCompareCacheCompatible,
  type SampleUploadStateLike,
  type WordCompareCacheEntry,
  type WordSectionGenerationResult,
  type WordUnderstandingCacheEntry,
} from './word-workflow.cache';

type RecognitionSnapshotLike = {
  suggestions: any[];
  sectionGenerationResults: WordSectionGenerationResult[];
  collapsedSections?: Record<string, boolean>;
};

type HostAdapterLike = {
  extractDocument: () => Promise<unknown>;
};

export async function probeWordCompareCache(args: {
  hostAdapter: HostAdapterLike;
  sampleUploadState: SampleUploadStateLike;
  selectedTemplateType: string;
  effectiveCompareHeadingLanguages: WordSectionDisplayLanguage[];
  buildWordCompareCacheKey: (
    templateDocumentIr: Record<string, any>,
    sampleUploadState: SampleUploadStateLike,
    templateType: string,
    headingLanguages: string[]
  ) => string;
  loadWordCompareCache: () => Record<string, WordCompareCacheEntry>;
}): Promise<{
  documentIr: Record<string, any>;
  compareCacheKey: string;
  hasStoredCompareEntry: boolean;
  cachedCompareEntry?: WordCompareCacheEntry;
}> {
  const templateDocumentIr = await args.hostAdapter.extractDocument();
  const documentIr = templateDocumentIr as Record<string, any>;
  const compareCacheKey = args.buildWordCompareCacheKey(
    documentIr,
    args.sampleUploadState,
    args.selectedTemplateType,
    args.effectiveCompareHeadingLanguages
  );
  const cachedCompareEntry = args.loadWordCompareCache()[compareCacheKey];

  return isWordCompareCacheCompatible(cachedCompareEntry)
    ? { documentIr, compareCacheKey, hasStoredCompareEntry: true, cachedCompareEntry }
    : { documentIr, compareCacheKey, hasStoredCompareEntry: Boolean(cachedCompareEntry) };
}

export async function detectWordWorkflowUnderstandingCache(args: {
  hostAdapter: HostAdapterLike;
  sampleUploadState: SampleUploadStateLike;
  workflowSourceLanguage: string;
  workflowTargetLanguages: string[];
}): Promise<WordUnderstandingCacheEntry | null> {
  const templateDocumentIr = await args.hostAdapter.extractDocument();
  return findLatestMatchingWordUnderstandingCacheEntry({
    templateDocumentIr: templateDocumentIr as Record<string, any>,
    sampleUploadState: args.sampleUploadState,
    sourceLanguage: args.workflowSourceLanguage,
    targetLanguages: args.workflowTargetLanguages,
  });
}

export function persistWordCompareCacheResult(args: {
  nextResult: TemplateCompareResponse;
  compareDocumentIr: Record<string, any> | null;
  sampleUploadState: SampleUploadStateLike;
  selectedTemplateType: string;
  effectiveCompareHeadingLanguages: WordSectionDisplayLanguage[];
  sectionGenerationResults: WordSectionGenerationResult[];
  suggestions: any[];
  collapsedRecognitionSections: Record<string, boolean>;
  buildWordCompareCacheKey: (
    templateDocumentIr: Record<string, any>,
    sampleUploadState: SampleUploadStateLike,
    templateType: string,
    headingLanguages: string[]
  ) => string;
  saveWordCompareCacheEntry: (entry: {
    cacheKey: string;
    result: TemplateCompareResponse & { recognitionSnapshot?: RecognitionSnapshotLike };
    updatedAt: number;
  }) => void;
  setCompareCacheStatus: (status: 'hit' | 'miss' | null) => void;
  setCompareCacheUpdatedAt: (updatedAt: number | null) => void;
}): void {
  if (!args.compareDocumentIr) {
    return;
  }

  const cacheKey = args.buildWordCompareCacheKey(
    args.compareDocumentIr,
    args.sampleUploadState,
    args.selectedTemplateType,
    args.effectiveCompareHeadingLanguages
  );
  const updatedAt = Date.now();
  const recognitionSnapshot =
    args.sectionGenerationResults.length > 0 || args.suggestions.length > 0
      ? {
          suggestions: args.suggestions,
          sectionGenerationResults: args.sectionGenerationResults,
          collapsedSections: args.collapsedRecognitionSections,
        }
      : undefined;

  args.saveWordCompareCacheEntry({
    cacheKey,
    result: {
      ...args.nextResult,
      cacheStatus: {
        compareHit: false,
      },
      recognitionSnapshot,
    },
    updatedAt,
  });
  args.setCompareCacheStatus('miss');
  args.setCompareCacheUpdatedAt(updatedAt);
}

export function updateWordCompareCandidate(args: {
  current: TemplateCompareResponse | null;
  candidateId: string;
  patch: Partial<TemplateFieldCandidate>;
  rebuildCompareSummary: (
    summary: TemplateCompareResponse['compareSummary'],
    candidateFields: TemplateCompareResponse['candidateFields']
  ) => TemplateCompareResponse['compareSummary'];
  onPersist: (nextResult: TemplateCompareResponse) => void;
}): TemplateCompareResponse | null {
  if (!args.current) {
    return args.current;
  }

  let changed = false;
  const candidateFields = args.current.candidateFields.map((candidate) => {
    if (candidate.candidateId !== args.candidateId) {
      return candidate;
    }
    changed = true;
    return {
      ...candidate,
      ...args.patch,
    };
  });

  if (!changed) {
    return args.current;
  }

  const nextResult = {
    ...args.current,
    candidateFields,
    compareSummary: args.rebuildCompareSummary(args.current.compareSummary, candidateFields),
  };
  args.onPersist(nextResult);
  return nextResult;
}

export function deleteWordCompareCandidate(args: {
  current: TemplateCompareResponse | null;
  candidateId: string;
  rebuildCompareSummary: (
    summary: TemplateCompareResponse['compareSummary'],
    candidateFields: TemplateCompareResponse['candidateFields']
  ) => TemplateCompareResponse['compareSummary'];
  onPersist: (nextResult: TemplateCompareResponse) => void;
}): TemplateCompareResponse | null {
  if (!args.current) {
    return args.current;
  }

  const candidateFields = args.current.candidateFields.filter(
    (candidate) => candidate.candidateId !== args.candidateId
  );
  if (candidateFields.length === args.current.candidateFields.length) {
    return args.current;
  }

  const nextResult = {
    ...args.current,
    candidateFields,
    compareSummary: args.rebuildCompareSummary(args.current.compareSummary, candidateFields),
  };
  args.onPersist(nextResult);
  return nextResult;
}

export async function buildWordWorkflowRequest(
  args: {
    hostAdapter: HostAdapterLike;
    compareResult: TemplateCompareResponse | null;
    effectiveCompareCandidateFields: TemplateFieldCandidate[];
    currentCompareSignature: string;
    sampleUploadState: SampleUploadStateLike;
    understandingResult: TemplateUnderstandResponse | null;
    workflowSourceLanguage: string;
    workflowTargetLanguages: string[];
    selectedTemplateType: string;
    useMultiStage: boolean;
    analysisExecutor: AnalysisExecutorKind;
    analysisThinkingEnabled: boolean;
    buildWordUnderstandingCacheKey: (
      templateDocumentIr: Record<string, any>,
      sampleUploadState: SampleUploadStateLike,
      sourceLanguage: string,
      targetLanguages: string[],
      compareSignature: string
    ) => string;
  },
  options?: {
    includeUnderstanding?: boolean;
    useSelectedCompareCandidates?: boolean;
    prefetchedUnderstanding?: TemplateUnderstandResponse | null;
  }
): Promise<{
  request: {
    templateDocumentIr: unknown;
    sampleDocument?: {
      fileName?: string;
      contentBase64: string;
    };
    candidateFields?: TemplateFieldCandidate[];
    prefetchedUnderstanding?: TemplateUnderstandResponse;
    sourceLanguage: string;
    targetLanguages: string[];
    options: {
      enableTermMatch: true;
      enableLayoutDetection: true;
      templateType: string;
      useMultiStage: boolean;
      analysisExecutor: AnalysisExecutorKind;
      thinking: boolean;
    };
  };
  cacheKey: string;
}> {
  const templateDocumentIr = await args.hostAdapter.extractDocument();
  const candidateFields = options?.useSelectedCompareCandidates
    ? args.compareResult
      ? args.effectiveCompareCandidateFields
      : undefined
    : args.compareResult?.candidateFields;
  const compareSignature = options?.useSelectedCompareCandidates
    ? args.currentCompareSignature
    : args.compareResult
      ? `${args.compareResult.compareId || 'compare'}|all`
      : 'no-compare';

  return {
    request: {
      templateDocumentIr,
      sampleDocument: args.sampleUploadState.fileBase64
        ? {
            fileName: args.sampleUploadState.fileName,
            contentBase64: args.sampleUploadState.fileBase64,
          }
        : undefined,
      candidateFields,
      prefetchedUnderstanding: options?.includeUnderstanding
        ? options?.prefetchedUnderstanding || args.understandingResult || undefined
        : undefined,
      sourceLanguage: args.workflowSourceLanguage,
      targetLanguages: args.workflowTargetLanguages,
      options: {
        enableTermMatch: true,
        enableLayoutDetection: true,
        templateType: args.selectedTemplateType,
        useMultiStage: args.useMultiStage,
        analysisExecutor: args.analysisExecutor,
        thinking: args.analysisThinkingEnabled,
      },
    },
    cacheKey: args.buildWordUnderstandingCacheKey(
      templateDocumentIr as Record<string, any>,
      args.sampleUploadState,
      args.workflowSourceLanguage,
      args.workflowTargetLanguages,
      compareSignature
    ),
  };
}
