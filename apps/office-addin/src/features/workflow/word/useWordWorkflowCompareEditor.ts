import { useCallback } from 'react';
import type React from 'react';
import type { TemplateCompareResponse, TemplateFieldCandidate } from '../../../api/carbone-api';
import {
  deleteWordCompareCandidate,
  persistWordCompareCacheResult,
  updateWordCompareCandidate,
} from './word-workflow.actions.helpers';
import {
  saveWordCompareCacheEntry,
  type SampleUploadStateLike,
  type WordSectionGenerationResult,
} from './word-workflow.cache';
import type { CompareHeadingLanguageSelection } from './word-workflow.panel.helpers';

interface UseWordWorkflowCompareEditorOptions {
  compareDocumentIr: Record<string, any> | null;
  sampleUploadState: SampleUploadStateLike;
  selectedTemplateType: string;
  effectiveCompareHeadingLanguages: CompareHeadingLanguageSelection[];
  sectionGenerationResults: WordSectionGenerationResult[];
  suggestions: any[];
  collapsedRecognitionSections: Record<string, boolean>;
  setCompareResult: React.Dispatch<React.SetStateAction<TemplateCompareResponse | null>>;
  setCompareCacheStatus: (status: 'hit' | 'miss' | null) => void;
  setCompareCacheUpdatedAt: (updatedAt: number | null) => void;
  buildWordCompareCacheKey: (
    templateDocumentIr: Record<string, any>,
    sampleUploadState: SampleUploadStateLike,
    templateType: string,
    headingLanguages: string[]
  ) => string;
  rebuildCompareSummary: (
    summary: TemplateCompareResponse['compareSummary'],
    candidateFields: TemplateCompareResponse['candidateFields']
  ) => TemplateCompareResponse['compareSummary'];
}

export function useWordWorkflowCompareEditor(options: UseWordWorkflowCompareEditorOptions) {
  const persistCurrentWordCompareCacheResult = useCallback(
    (nextResult: TemplateCompareResponse) => {
      persistWordCompareCacheResult({
        nextResult,
        compareDocumentIr: options.compareDocumentIr,
        sampleUploadState: options.sampleUploadState,
        selectedTemplateType: options.selectedTemplateType,
        effectiveCompareHeadingLanguages: options.effectiveCompareHeadingLanguages,
        sectionGenerationResults: options.sectionGenerationResults,
        suggestions: options.suggestions,
        collapsedRecognitionSections: options.collapsedRecognitionSections,
        buildWordCompareCacheKey: options.buildWordCompareCacheKey,
        saveWordCompareCacheEntry,
        setCompareCacheStatus: options.setCompareCacheStatus,
        setCompareCacheUpdatedAt: options.setCompareCacheUpdatedAt,
      });
    },
    [
      options.buildWordCompareCacheKey,
      options.collapsedRecognitionSections,
      options.compareDocumentIr,
      options.effectiveCompareHeadingLanguages,
      options.sampleUploadState,
      options.sectionGenerationResults,
      options.selectedTemplateType,
      options.setCompareCacheStatus,
      options.setCompareCacheUpdatedAt,
      options.suggestions,
    ]
  );

  const updateCompareCandidate = useCallback(
    (candidateId: string, patch: Partial<TemplateFieldCandidate>) => {
      options.setCompareResult((current) =>
        updateWordCompareCandidate({
          current,
          candidateId,
          patch,
          rebuildCompareSummary: options.rebuildCompareSummary,
          onPersist: persistCurrentWordCompareCacheResult,
        })
      );
    },
    [options.rebuildCompareSummary, options.setCompareResult, persistCurrentWordCompareCacheResult]
  );

  const deleteCompareCandidate = useCallback(
    (candidateId: string) => {
      options.setCompareResult((current) =>
        deleteWordCompareCandidate({
          current,
          candidateId,
          rebuildCompareSummary: options.rebuildCompareSummary,
          onPersist: persistCurrentWordCompareCacheResult,
        })
      );
    },
    [options.rebuildCompareSummary, options.setCompareResult, persistCurrentWordCompareCacheResult]
  );

  return {
    persistCurrentWordCompareCacheResult,
    updateCompareCandidate,
    deleteCompareCandidate,
  };
}
