import { useCallback, useEffect } from 'react';
import type { TemplateCompareResponse } from '../../../api/carbone-api';
import { useAppStore, type AISuggestion } from '../../../app/store';

type SampleUploadStateLike = {
  uploaded: boolean;
  revision: number;
};

type RecognitionSnapshotLike = {
  suggestions: AISuggestion[];
  sectionGenerationResults: any[];
  collapsedSections?: Record<string, boolean>;
};

interface UseWordIdentifyCacheControllerOptions {
  recognitionCacheKey: string | null;
  recognitionCacheStatus: 'hit' | 'miss' | null;
  sectionGenerationResults: any[];
  collapsedRecognitionSections: Record<string, boolean>;
  compareDocumentIr: Record<string, any> | null;
  compareResult: TemplateCompareResponse | null;
  sampleUploadState: SampleUploadStateLike;
  selectedTemplateType: string;
  effectiveCompareHeadingLanguages: string[];
  recognitionActivated: boolean;
  recognitionReady: boolean;
  recognitionStale: boolean;
  recognitionDataFresh: boolean;
  hasCompare: boolean;
  languageSignature: string;
  currentRecognitionCacheSignature: string;
  onApplyComplete?: () => void;
  setSuggestions: (suggestions: AISuggestion[]) => void;
  setSectionGenerationResults: (results: any[]) => void;
  setCollapsedRecognitionSections: (sections: Record<string, boolean>) => void;
  setRecognitionResult: (result: null) => void;
  setRecognitionRevision: (revision: number) => void;
  setRecognitionLanguageSignature: (signature: string) => void;
  setRecognitionCompareSignature: (signature: string) => void;
  setRecognitionActivated: (activated: boolean) => void;
  setRecognitionCacheStatus: (status: 'hit' | 'miss' | null) => void;
  setRecognitionCacheUpdatedAt: (updatedAt: number | null) => void;
  setCompareCacheUpdatedAt: (updatedAt: number | null) => void;
  addDebugLog: (
    level: 'info' | 'debug' | 'warn' | 'error',
    message: string,
    details?: string
  ) => void;
  loadWordRecognitionCache: () => Record<string, any>;
  saveWordRecognitionCacheEntry: (entry: {
    cacheKey: string;
    result: RecognitionSnapshotLike;
    updatedAt: number;
  }) => void;
  removeWordRecognitionCacheEntry: (cacheKey: string) => void;
  isWordRecognitionCacheCompatible: (entry: any) => boolean;
  mergeRecognitionResultWithAppliedCache: (
    nextResult: RecognitionSnapshotLike,
    cachedEntry?: any
  ) => RecognitionSnapshotLike;
  buildWordCompareCacheKey: (
    templateDocumentIr: Record<string, any>,
    sampleUploadState: SampleUploadStateLike,
    templateType: string,
    headingLanguages: string[]
  ) => string;
  saveWordCompareCacheEntry: (entry: {
    cacheKey: string;
    result: TemplateCompareResponse & {
      recognitionSnapshot?: RecognitionSnapshotLike;
    };
    updatedAt: number;
  }) => void;
}

export function useWordIdentifyCacheController(options: UseWordIdentifyCacheControllerOptions) {
  const persistCompareCacheRecognitionSnapshot = useCallback(
    (recognitionSnapshot: RecognitionSnapshotLike) => {
      if (!options.compareDocumentIr || !options.compareResult) {
        return;
      }

      const cacheKey = options.buildWordCompareCacheKey(
        options.compareDocumentIr,
        options.sampleUploadState,
        options.selectedTemplateType,
        options.effectiveCompareHeadingLanguages
      );
      const updatedAt = Date.now();
      options.saveWordCompareCacheEntry({
        cacheKey,
        result: {
          ...options.compareResult,
          cacheStatus: {
            compareHit: false,
          },
          recognitionSnapshot,
        },
        updatedAt,
      });
      options.setCompareCacheUpdatedAt(updatedAt);
    },
    [
      options.buildWordCompareCacheKey,
      options.compareDocumentIr,
      options.compareResult,
      options.effectiveCompareHeadingLanguages,
      options.sampleUploadState,
      options.saveWordCompareCacheEntry,
      options.selectedTemplateType,
      options.setCompareCacheUpdatedAt,
    ]
  );

  const persistAppliedRecognitionCache = useCallback(() => {
    if (!options.recognitionCacheKey) {
      options.onApplyComplete?.();
      return;
    }

    const latestSuggestions = useAppStore.getState().suggestions;
    const cachedEntry = options.loadWordRecognitionCache()[options.recognitionCacheKey];
    const mergedResult = options.mergeRecognitionResultWithAppliedCache(
      {
        suggestions: latestSuggestions,
        sectionGenerationResults: options.sectionGenerationResults,
        collapsedSections: options.collapsedRecognitionSections,
      },
      cachedEntry
    );

    const updatedAt = Date.now();
    options.saveWordRecognitionCacheEntry({
      cacheKey: options.recognitionCacheKey,
      result: mergedResult,
      updatedAt,
    });
    persistCompareCacheRecognitionSnapshot(mergedResult);
    options.setRecognitionCacheUpdatedAt(updatedAt);
    if (options.recognitionCacheStatus == null) {
      options.setRecognitionCacheStatus('miss');
    }
    options.onApplyComplete?.();
  }, [
    options.collapsedRecognitionSections,
    options.loadWordRecognitionCache,
    options.mergeRecognitionResultWithAppliedCache,
    options.onApplyComplete,
    options.recognitionCacheKey,
    options.recognitionCacheStatus,
    options.saveWordRecognitionCacheEntry,
    options.sectionGenerationResults,
    options.setRecognitionCacheStatus,
    options.setRecognitionCacheUpdatedAt,
    persistCompareCacheRecognitionSnapshot,
  ]);

  useEffect(() => {
    if (
      !options.sampleUploadState.uploaded ||
      !options.compareDocumentIr ||
      !options.hasCompare ||
      !options.recognitionCacheKey
    ) {
      return;
    }
    if (options.recognitionReady && !options.recognitionStale) {
      return;
    }

    const cachedEntry = options.loadWordRecognitionCache()[options.recognitionCacheKey];
    if (!options.isWordRecognitionCacheCompatible(cachedEntry)) {
      if (cachedEntry) {
        options.removeWordRecognitionCacheEntry(options.recognitionCacheKey);
      }
      return;
    }

    options.setSectionGenerationResults(cachedEntry.result.sectionGenerationResults);
    options.setSuggestions(cachedEntry.result.suggestions);
    options.setCollapsedRecognitionSections(cachedEntry.result.collapsedSections || {});
    options.setRecognitionResult(null);
    options.setRecognitionRevision(options.sampleUploadState.revision);
    options.setRecognitionLanguageSignature(options.languageSignature);
    options.setRecognitionCompareSignature(options.currentRecognitionCacheSignature);
    options.setRecognitionActivated(true);
    options.setRecognitionCacheStatus('hit');
    options.setRecognitionCacheUpdatedAt(cachedEntry.updatedAt);
    options.addDebugLog(
      'info',
      'Word 参数缓存命中',
      [
        `章节数: ${cachedEntry.result.sectionGenerationResults.length}`,
        `参数数: ${cachedEntry.result.suggestions.length}`,
        `缓存时间: ${new Date(cachedEntry.updatedAt).toLocaleString()}`,
      ].join('\n')
    );
  }, [
    options.addDebugLog,
    options.compareDocumentIr,
    options.currentRecognitionCacheSignature,
    options.hasCompare,
    options.isWordRecognitionCacheCompatible,
    options.languageSignature,
    options.loadWordRecognitionCache,
    options.recognitionCacheKey,
    options.recognitionReady,
    options.recognitionStale,
    options.removeWordRecognitionCacheEntry,
    options.sampleUploadState,
    options.setCollapsedRecognitionSections,
    options.setRecognitionActivated,
    options.setRecognitionCacheStatus,
    options.setRecognitionCacheUpdatedAt,
    options.setRecognitionCompareSignature,
    options.setRecognitionLanguageSignature,
    options.setRecognitionResult,
    options.setRecognitionRevision,
    options.setSuggestions,
    options.setSectionGenerationResults,
  ]);

  useEffect(() => {
    if (
      !options.sampleUploadState.uploaded ||
      !options.compareDocumentIr ||
      !options.recognitionCacheKey ||
      !options.recognitionActivated ||
      options.recognitionStale ||
      !options.recognitionDataFresh
    ) {
      return;
    }

    const latestSuggestions = useAppStore.getState().suggestions;
    if (options.sectionGenerationResults.length === 0 && latestSuggestions.length === 0) {
      return;
    }

    options.saveWordRecognitionCacheEntry({
      cacheKey: options.recognitionCacheKey,
      result: {
        suggestions: latestSuggestions,
        sectionGenerationResults: options.sectionGenerationResults,
        collapsedSections: options.collapsedRecognitionSections,
      },
      updatedAt: Date.now(),
    });
  }, [
    options.collapsedRecognitionSections,
    options.compareDocumentIr,
    options.recognitionActivated,
    options.recognitionCacheKey,
    options.recognitionDataFresh,
    options.recognitionStale,
    options.sampleUploadState,
    options.saveWordRecognitionCacheEntry,
    options.sectionGenerationResults,
  ]);

  return {
    persistAppliedRecognitionCache,
    persistCompareCacheRecognitionSnapshot,
  };
}
