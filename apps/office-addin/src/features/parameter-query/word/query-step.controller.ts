import type { TemplateCompareResponse } from '../../../api/carbone-api';
import type { CompareCandidateSectionLike, CompareHeadingLanguage } from './query.types';

type CompareHeadingLanguageSelection = CompareHeadingLanguage;
type CacheStatus = 'hit' | 'miss' | null;
type UploadCacheStatus = 'available' | 'none' | 'checking' | null;

type SampleUploadStateLike = {
  uploaded: boolean;
  fileName?: string;
  fileSize?: number;
  fileBase64?: string;
  revision: number;
};

type SetState<T> = (value: T | ((current: T) => T)) => void;

interface CreateWordQueryStepControllerOptions {
  compareCandidateSections: CompareCandidateSectionLike[];
  normalizeCompareHeadingLanguages: (languages: CompareHeadingLanguageSelection[]) => CompareHeadingLanguageSelection[];
  setSelectedTemplateType: (templateType: 'contract' | 'report') => void;
  setCompareHeadingLanguages: SetState<CompareHeadingLanguageSelection[]>;
  setCollapsedCompareSections: SetState<Record<string, boolean>>;
  setCollapsedRecognitionSections: SetState<Record<string, boolean>>;
  setSelectedCompareSections: SetState<Record<string, boolean>>;
  setCompareResult: (result: TemplateCompareResponse | null) => void;
  setCompareDocumentIr: (documentIr: Record<string, any> | null) => void;
  setCompareHighlightSummary: (summary: string | null) => void;
  setCompareCacheStatus: (status: CacheStatus) => void;
  setCompareCacheUpdatedAt: (updatedAt: number | null) => void;
  setUnderstandingResult: (result: null) => void;
  setRecognitionResult: (result: null) => void;
  setSectionGenerationResults: (results: any[]) => void;
  setSuggestions: (suggestions: any[]) => void;
  setUnderstandingCacheStatus: (status: CacheStatus) => void;
  setUnderstandingCacheUpdatedAt: (updatedAt: number | null) => void;
  setRecognitionCacheStatus: (status: CacheStatus) => void;
  setRecognitionCacheUpdatedAt: (updatedAt: number | null) => void;
  setDetectedUploadCacheStatus: (status: UploadCacheStatus) => void;
  setDetectedUploadCacheUpdatedAt: (updatedAt: number | null) => void;
  setDetectedUploadCacheResult: (result: null) => void;
  setSampleUploadState: (state: SampleUploadStateLike) => void;
}

function resetWordQueryProgress(options: Pick<
  CreateWordQueryStepControllerOptions,
  | 'setCompareResult'
  | 'setCompareCacheStatus'
  | 'setCompareCacheUpdatedAt'
  | 'setUnderstandingResult'
  | 'setRecognitionResult'
  | 'setSectionGenerationResults'
  | 'setSuggestions'
  | 'setUnderstandingCacheStatus'
  | 'setUnderstandingCacheUpdatedAt'
  | 'setRecognitionCacheStatus'
  | 'setRecognitionCacheUpdatedAt'
>) {
  options.setCompareResult(null);
  options.setCompareCacheStatus(null);
  options.setCompareCacheUpdatedAt(null);
  options.setUnderstandingResult(null);
  options.setRecognitionResult(null);
  options.setSectionGenerationResults([]);
  options.setSuggestions([]);
  options.setUnderstandingCacheStatus(null);
  options.setUnderstandingCacheUpdatedAt(null);
  options.setRecognitionCacheStatus(null);
  options.setRecognitionCacheUpdatedAt(null);
}

function clearWordRecognitionCacheMarkers(options: Pick<
  CreateWordQueryStepControllerOptions,
  | 'setUnderstandingCacheStatus'
  | 'setUnderstandingCacheUpdatedAt'
  | 'setRecognitionCacheStatus'
  | 'setRecognitionCacheUpdatedAt'
>) {
  options.setUnderstandingCacheStatus(null);
  options.setUnderstandingCacheUpdatedAt(null);
  options.setRecognitionCacheStatus(null);
  options.setRecognitionCacheUpdatedAt(null);
}

export function createWordQueryStepController(options: CreateWordQueryStepControllerOptions) {
  const handleCompareDocumentTypeChange = (templateType: 'contract' | 'report') => {
    options.setSelectedTemplateType(templateType);
    resetWordQueryProgress(options);
  };

  const handleCompareHeadingLanguageToggle = (language: CompareHeadingLanguageSelection) => {
    options.setCompareHeadingLanguages((current) => {
      const next = current.includes(language)
        ? current.filter((item) => item !== language)
        : [...current, language];
      return options.normalizeCompareHeadingLanguages(next);
    });
    resetWordQueryProgress(options);
  };

  const toggleCompareSectionCollapse = (sectionKey: string) => {
    options.setCollapsedCompareSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? true),
    }));
  };

  const toggleRecognitionSectionCollapse = (sectionKey: string) => {
    options.setCollapsedRecognitionSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? false),
    }));
  };

  const toggleCompareSectionSelection = (sectionKey: string) => {
    options.setSelectedCompareSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? true),
    }));
    clearWordRecognitionCacheMarkers(options);
  };

  const setAllCompareSectionsSelected = (selected: boolean) => {
    const nextState: Record<string, boolean> = {};
    options.compareCandidateSections.forEach((section) => {
      nextState[section.sectionKey] = selected;
    });
    options.setSelectedCompareSections(nextState);
    clearWordRecognitionCacheMarkers(options);
  };

  const handleSampleUploadStateChange = (nextState: SampleUploadStateLike) => {
    options.setCompareHighlightSummary(null);
    if (!nextState.uploaded) {
      options.setCompareResult(null);
      options.setCompareDocumentIr(null);
      resetWordQueryProgress(options);
    } else {
      options.setCompareCacheStatus(null);
      options.setCompareCacheUpdatedAt(null);
      clearWordRecognitionCacheMarkers(options);
    }
    options.setDetectedUploadCacheStatus(nextState.uploaded ? 'checking' : null);
    options.setDetectedUploadCacheUpdatedAt(null);
    options.setDetectedUploadCacheResult(null);
    options.setSampleUploadState(nextState);
  };

  return {
    handleCompareDocumentTypeChange,
    handleCompareHeadingLanguageToggle,
    toggleCompareSectionCollapse,
    toggleRecognitionSectionCollapse,
    toggleCompareSectionSelection,
    setAllCompareSectionsSelected,
    handleSampleUploadStateChange,
  };
}
