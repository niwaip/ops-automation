import { useMemo } from 'react';
import type {
  TemplateCompareResponse,
  TemplateRecognizeResponse,
  TemplateUnderstandResponse,
} from '../../../api/carbone-api';
import type { AISuggestion } from '../../../app/store';
import {
  deriveWordSectionsFromDocumentIr,
  type WordDetectedSection,
} from '../../../host/office/word/chapter';
import {
  buildSelectedRecognitionSections,
  buildCompareCandidateSections,
  type CompareCandidateSection,
} from './word-workflow.section.helpers';
import {
  buildCurrentCompareSignature,
  buildCurrentRecognitionCacheSignature,
  buildSectionGenerationResultMap,
  buildSectionProcessingSummary,
  buildSectionSuggestionMap,
  deriveWordWorkflowStatus,
} from './word-workflow.status.helpers';
import {
  buildWordRecognitionCacheKey,
  type WordSectionGenerationResult,
} from './word-workflow.cache';
import { buildWordUnderstandingSummaryText } from './word-workflow.debug';
import {
  normalizeCompareHeadingLanguages,
  type CompareHeadingLanguageSelection,
  type SampleUploadState,
} from './word-workflow.panel.helpers';

interface UseWordWorkflowDerivedStateOptions {
  compareHeadingLanguages: CompareHeadingLanguageSelection[];
  compareResult: TemplateCompareResponse | null;
  compareDocumentIr: Record<string, any> | null;
  selectedCompareSections: Record<string, boolean>;
  sampleUploadState: SampleUploadState;
  understandingResult: TemplateUnderstandResponse | null;
  understandingRevision: number;
  understandingLanguageSignature: string;
  understandingCompareSignature: string;
  understandingCacheStatus: 'hit' | 'miss' | null;
  understandingCacheUpdatedAt: number | null;
  detectedUploadCacheStatus: 'available' | 'none' | 'checking' | null;
  detectedUploadCacheUpdatedAt: number | null;
  detectedUploadCacheResult: TemplateUnderstandResponse | null;
  isUnderstanding: boolean;
  recognitionActivated: boolean;
  recognitionRevision: number;
  recognitionLanguageSignature: string;
  recognitionCompareSignature: string;
  recognitionResult: TemplateRecognizeResponse | null;
  recognitionReadyOverride?: boolean;
  sectionGenerationResults: WordSectionGenerationResult[];
  suggestions: AISuggestion[];
  workflowSourceLanguage: string;
  workflowTargetLanguages: string[];
}

export function useWordWorkflowDerivedState(options: UseWordWorkflowDerivedStateOptions) {
  const languageSignature = `${options.workflowSourceLanguage}:${options.workflowTargetLanguages.join(',')}`;
  const effectiveCompareHeadingLanguages = useMemo(
    () => normalizeCompareHeadingLanguages(options.compareHeadingLanguages),
    [options.compareHeadingLanguages]
  );
  const hasCompare = Boolean(options.compareResult);
  const compareCandidateSections = useMemo(
    () => buildCompareCandidateSections(options.compareResult, options.compareDocumentIr),
    [options.compareDocumentIr, options.compareResult]
  );
  const selectedCompareSectionKeys = useMemo(
    () =>
      compareCandidateSections
        .filter((section) => options.selectedCompareSections[section.sectionKey] ?? true)
        .map((section) => section.sectionKey),
    [compareCandidateSections, options.selectedCompareSections]
  );
  const selectedCompareCandidateFields = useMemo(
    () =>
      compareCandidateSections
        .filter((section) => options.selectedCompareSections[section.sectionKey] ?? true)
        .flatMap((section) => section.candidates),
    [compareCandidateSections, options.selectedCompareSections]
  );
  const effectiveCompareCandidateFields = useMemo(
    () =>
      compareCandidateSections.length > 0
        ? selectedCompareCandidateFields
        : options.compareResult?.candidateFields || [],
    [compareCandidateSections.length, options.compareResult, selectedCompareCandidateFields]
  );
  const currentCompareSignature = useMemo(
    () => buildCurrentCompareSignature(options.compareResult, selectedCompareSectionKeys),
    [options.compareResult, selectedCompareSectionKeys]
  );
  const currentRecognitionCacheSignature = useMemo(
    () => buildCurrentRecognitionCacheSignature(options.compareResult),
    [options.compareResult]
  );
  const workflowStatus = useMemo(
    () =>
      deriveWordWorkflowStatus({
        sampleUploadState: options.sampleUploadState,
        hasCompare,
        understandingResult: options.understandingResult,
        understandingRevision: options.understandingRevision,
        understandingLanguageSignature: options.understandingLanguageSignature,
        understandingCompareSignature: options.understandingCompareSignature,
        languageSignature,
        currentCompareSignature,
        understandingCacheStatus: options.understandingCacheStatus,
        understandingCacheUpdatedAt: options.understandingCacheUpdatedAt,
        detectedUploadCacheStatus: options.detectedUploadCacheStatus,
        detectedUploadCacheUpdatedAt: options.detectedUploadCacheUpdatedAt,
        detectedUploadCacheResult: options.detectedUploadCacheResult,
        isUnderstanding: options.isUnderstanding,
        recognitionActivated: options.recognitionActivated,
        recognitionRevision: options.recognitionRevision,
        recognitionLanguageSignature: options.recognitionLanguageSignature,
        recognitionCompareSignature: options.recognitionCompareSignature,
        currentRecognitionCacheSignature,
        sectionGenerationResults: options.sectionGenerationResults,
        suggestions: options.suggestions,
        recognitionResult: options.recognitionResult,
        effectiveCompareCandidateFieldsCount: effectiveCompareCandidateFields.length,
        compareCandidateSectionsCount: compareCandidateSections.length,
      }),
    [
      compareCandidateSections.length,
      currentCompareSignature,
      currentRecognitionCacheSignature,
      effectiveCompareCandidateFields.length,
      hasCompare,
      languageSignature,
      options.detectedUploadCacheResult,
      options.detectedUploadCacheStatus,
      options.detectedUploadCacheUpdatedAt,
      options.isUnderstanding,
      options.recognitionActivated,
      options.recognitionCompareSignature,
      options.recognitionLanguageSignature,
      options.recognitionResult,
      options.recognitionRevision,
      options.sampleUploadState,
      options.sectionGenerationResults,
      options.suggestions,
      options.understandingCacheStatus,
      options.understandingCacheUpdatedAt,
      options.understandingCompareSignature,
      options.understandingLanguageSignature,
      options.understandingResult,
      options.understandingRevision,
    ]
  );
  const recognitionCacheKey = useMemo(
    () =>
      options.compareDocumentIr
        ? buildWordRecognitionCacheKey(
            options.compareDocumentIr,
            options.sampleUploadState,
            options.workflowSourceLanguage,
            options.workflowTargetLanguages,
            currentRecognitionCacheSignature
          )
        : null,
    [
      currentRecognitionCacheSignature,
      options.compareDocumentIr,
      options.sampleUploadState,
      options.workflowSourceLanguage,
      options.workflowTargetLanguages,
    ]
  );
  const understandingSummaryText = workflowStatus.displayedUnderstandingSummaryResult
    ? buildWordUnderstandingSummaryText(workflowStatus.displayedUnderstandingSummaryResult)
    : '';
  const derivedPrimaryChapters = useMemo<WordDetectedSection[]>(
    () =>
      options.compareDocumentIr ? deriveWordSectionsFromDocumentIr(options.compareDocumentIr) : [],
    [options.compareDocumentIr]
  );
  const detectedSectionMap = useMemo(
    () => new Map(derivedPrimaryChapters.map((section) => [section.sectionKey, section])),
    [derivedPrimaryChapters]
  );
  const selectedRecognitionSections = useMemo<CompareCandidateSection[]>(
    () =>
      buildSelectedRecognitionSections(
        compareCandidateSections,
        options.selectedCompareSections,
        effectiveCompareCandidateFields
      ),
    [compareCandidateSections, effectiveCompareCandidateFields, options.selectedCompareSections]
  );
  const sectionProcessingSummary = useMemo(
    () =>
      buildSectionProcessingSummary(
        workflowStatus.recognitionReady,
        options.sectionGenerationResults
      ),
    [options.sectionGenerationResults, workflowStatus.recognitionReady]
  );
  const sectionGenerationResultMap = useMemo(
    () => buildSectionGenerationResultMap(options.sectionGenerationResults),
    [options.sectionGenerationResults]
  );
  const sectionSuggestionMap = useMemo(
    () => buildSectionSuggestionMap(options.sectionGenerationResults, options.suggestions),
    [options.sectionGenerationResults, options.suggestions]
  );

  return {
    languageSignature,
    effectiveCompareHeadingLanguages,
    hasCompare,
    compareCandidateSections,
    selectedCompareSectionKeys,
    effectiveCompareCandidateFields,
    currentCompareSignature,
    currentRecognitionCacheSignature,
    recognitionCacheKey,
    understandingSummaryText,
    derivedPrimaryChapters,
    detectedSectionMap,
    selectedRecognitionSections,
    sectionProcessingSummary,
    sectionGenerationResultMap,
    sectionSuggestionMap,
    ...workflowStatus,
  };
}
