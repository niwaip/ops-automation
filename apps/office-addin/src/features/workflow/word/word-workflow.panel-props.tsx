import React from 'react';
import { WordLoadSection } from '../../document-load/word';
import { WordQuerySection } from '../../parameter-query/word';
import { WordWorkflowDebugPanel } from './WordWorkflowDebugPanel';
import { WordRecognitionFollowup } from './WordRecognitionFollowup';
import {
  WordCompareSectionCandidatesPanel,
  WordRecognitionSectionResultPanel,
} from './WordWorkflowSectionPanels';
import type { CompareCandidateSection } from './word-workflow.section.helpers';
import { shouldShowEmptyWordRecognitionState } from './word-workflow.presenter';

export function buildWordLoadSectionProps(args: {
  step1Collapsed: boolean;
  setStep1Collapsed: React.Dispatch<React.SetStateAction<boolean>>;
  sampleUploadState: React.ComponentProps<typeof WordLoadSection>['sampleUploadState'];
  uploadStatusLabel: string;
  uploadStatusTone?: 'default' | 'success';
  understandingActionHint: string;
  understandingStatusLabel: string;
  understandingStatusTone: string;
  understandingCacheTimeText: string;
  understandingStale: boolean;
  understandingCacheDescription: string;
  isUnderstanding: boolean;
  understandingSummaryCollapsed: boolean;
  setUnderstandingSummaryCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  understandingSummaryText: string;
  displayedUnderstandingSummaryResult: unknown;
  handleStartUnderstanding: (options?: { forceRefresh?: boolean }) => Promise<void>;
  handleSampleUploadStateChange: React.ComponentProps<typeof WordLoadSection>['onUploadStateChange'];
}): React.ComponentProps<typeof WordLoadSection> {
  const {
    step1Collapsed,
    setStep1Collapsed,
    sampleUploadState,
    uploadStatusLabel,
    uploadStatusTone,
    understandingActionHint,
    understandingStatusLabel,
    understandingStatusTone,
    understandingCacheTimeText,
    understandingStale,
    understandingCacheDescription,
    isUnderstanding,
    understandingSummaryCollapsed,
    setUnderstandingSummaryCollapsed,
    understandingSummaryText,
    displayedUnderstandingSummaryResult,
    handleStartUnderstanding,
    handleSampleUploadStateChange,
  } = args;

  return {
    stepCollapsed: step1Collapsed,
    onToggleStep: () => setStep1Collapsed((current) => !current),
    sampleUploadState,
    uploadStatusLabel,
    uploadStatusTone,
    understandingActionHint,
    understandingStatusLabel,
    understandingStatusTone,
    understandingCacheTimeText: !understandingStale ? understandingCacheTimeText : '',
    understandingCacheDescription,
    isUnderstanding,
    understandingSummaryCollapsed,
    understandingSummaryText,
    hasDisplayedUnderstandingSummary: Boolean(displayedUnderstandingSummaryResult),
    onToggleUnderstandingSummary: () => setUnderstandingSummaryCollapsed((current) => !current),
    onStartUnderstanding: () => {
      void handleStartUnderstanding({ forceRefresh: Boolean(displayedUnderstandingSummaryResult) });
    },
    onUploadStateChange: handleSampleUploadStateChange,
  };
}

export function buildWordQuerySectionProps(args: {
  step2Collapsed: boolean;
  setStep2Collapsed: React.Dispatch<React.SetStateAction<boolean>>;
  stepStatus: React.ComponentProps<typeof WordQuerySection>['stepStatus'];
  sampleUploadState: React.ComponentProps<typeof WordLoadSection>['sampleUploadState'];
  selectedTemplateType: 'contract' | 'report';
  effectiveCompareHeadingLanguages: React.ComponentProps<typeof WordQuerySection>['effectiveCompareHeadingLanguages'];
  handleCompareDocumentTypeChange: React.ComponentProps<typeof WordQuerySection>['onChangeDocumentType'];
  handleCompareHeadingLanguageToggle: React.ComponentProps<typeof WordQuerySection>['onToggleHeadingLanguage'];
  isComparing: boolean;
  isHighlightingCandidates: boolean;
  isClearingHighlights: boolean;
  handleStartCompare: () => Promise<void>;
  handleHighlightCompareCandidates: () => Promise<void>;
  handleClearCompareHighlights: () => Promise<void>;
  compareResult: React.ComponentProps<typeof WordQuerySection>['compareResult'];
  compareSummaryCollapsed: boolean;
  setCompareSummaryCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  compareSectionsCollapsed: boolean;
  setCompareSectionsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  compareCacheStatus: React.ComponentProps<typeof WordQuerySection>['compareCacheStatus'];
  compareCacheUpdatedAt: number | null;
  selectedCompareSectionKeys: string[];
  compareCandidateSections: React.ComponentProps<typeof WordQuerySection>['compareCandidateSections'];
  selectedCompareSections: Record<string, boolean>;
  collapsedCompareSections: Record<string, boolean>;
  analysisThinkingEnabled: boolean;
  setAnalysisThinkingEnabled: (enabled: boolean) => void;
  recognitionBlocked: boolean;
  isRecognizing: boolean;
  isUnderstanding: boolean;
  recognitionReady: boolean;
  totalSuggestionCount: number;
  pendingSuggestionCount: number;
  derivedPrimaryChapters: unknown[];
  setAllCompareSectionsSelected: (selected: boolean) => void;
  toggleCompareSectionSelection: (sectionKey: string) => void;
  toggleCompareSectionCollapse: (sectionKey: string) => void;
  handleStartRecognition: () => Promise<void>;
  applyState: any;
  persistAppliedRecognitionCache: () => void;
  getCompareDocumentTypeLabel: (templateType: string) => string;
  getCompareHeadingLanguageSummary: (
    languages: React.ComponentProps<typeof WordQuerySection>['effectiveCompareHeadingLanguages'],
  ) => string;
  updateCompareCandidate: React.ComponentProps<typeof WordCompareSectionCandidatesPanel>['onSaveCandidate'];
  deleteCompareCandidate: React.ComponentProps<typeof WordCompareSectionCandidatesPanel>['onDeleteCandidate'];
  isWordLoopCompareCandidate: React.ComponentProps<typeof WordCompareSectionCandidatesPanel>['isWordLoopCompareCandidate'];
  sectionGenerationResultMap: React.ComponentProps<typeof WordRecognitionSectionResultPanel>['sectionGenerationResultMap'];
  sectionSuggestionMap: React.ComponentProps<typeof WordRecognitionSectionResultPanel>['sectionSuggestionMap'];
  collapsedRecognitionSections: React.ComponentProps<typeof WordRecognitionSectionResultPanel>['collapsedRecognitionSections'];
  toggleRecognitionSectionCollapse: React.ComponentProps<typeof WordRecognitionSectionResultPanel>['toggleRecognitionSectionCollapse'];
  formatConfidence: React.ComponentProps<typeof WordRecognitionSectionResultPanel>['formatConfidence'];
  sectionProcessingSummary: { totalSuggestions?: number } | null | undefined;
  followupProps: React.ComponentProps<typeof WordRecognitionFollowup>;
}): React.ComponentProps<typeof WordQuerySection> {
  const {
    step2Collapsed,
    setStep2Collapsed,
    stepStatus,
    sampleUploadState,
    selectedTemplateType,
    effectiveCompareHeadingLanguages,
    handleCompareDocumentTypeChange,
    handleCompareHeadingLanguageToggle,
    isComparing,
    isHighlightingCandidates,
    isClearingHighlights,
    handleStartCompare,
    handleHighlightCompareCandidates,
    handleClearCompareHighlights,
    compareResult,
    compareSummaryCollapsed,
    setCompareSummaryCollapsed,
    compareSectionsCollapsed,
    setCompareSectionsCollapsed,
    compareCacheStatus,
    compareCacheUpdatedAt,
    selectedCompareSectionKeys,
    compareCandidateSections,
    selectedCompareSections,
    collapsedCompareSections,
    analysisThinkingEnabled,
    setAnalysisThinkingEnabled,
    recognitionBlocked,
    isRecognizing,
    isUnderstanding,
    recognitionReady,
    totalSuggestionCount,
    pendingSuggestionCount,
    derivedPrimaryChapters,
    setAllCompareSectionsSelected,
    toggleCompareSectionSelection,
    toggleCompareSectionCollapse,
    handleStartRecognition,
    applyState,
    persistAppliedRecognitionCache,
    getCompareDocumentTypeLabel,
    getCompareHeadingLanguageSummary,
    updateCompareCandidate,
    deleteCompareCandidate,
    isWordLoopCompareCandidate,
    sectionGenerationResultMap,
    sectionSuggestionMap,
    collapsedRecognitionSections,
    toggleRecognitionSectionCollapse,
    formatConfidence,
    sectionProcessingSummary,
    followupProps,
  } = args;

  return {
    stepCollapsed: step2Collapsed,
    onToggleStep: () => setStep2Collapsed((current) => !current),
    stepStatus,
    sampleUploaded: sampleUploadState.uploaded,
    selectedTemplateType,
    effectiveCompareHeadingLanguages,
    onChangeDocumentType: handleCompareDocumentTypeChange,
    onToggleHeadingLanguage: handleCompareHeadingLanguageToggle,
    isComparing,
    isHighlightingCandidates,
    isClearingHighlights,
    onStartCompare: () => {
      void handleStartCompare();
    },
    onHighlightCompareCandidates: () => {
      void handleHighlightCompareCandidates();
    },
    onClearCompareHighlights: () => {
      void handleClearCompareHighlights();
    },
    compareResult,
    compareSummaryCollapsed,
    onToggleCompareSummary: () => setCompareSummaryCollapsed((value) => !value),
    compareSectionsCollapsed,
    onToggleCompareSections: () => setCompareSectionsCollapsed((value) => !value),
    compareCacheStatus,
    compareCacheUpdatedAt,
    selectedCompareSectionKeys,
    compareCandidateSections,
    selectedCompareSections,
    collapsedCompareSections,
    analysisThinkingEnabled,
    onChangeAnalysisThinkingEnabled: setAnalysisThinkingEnabled,
    recognitionBlocked,
    isRecognizing,
    isUnderstanding,
    recognitionReady,
    totalSuggestionCount,
    pendingSuggestionCount,
    derivedPrimaryChapterCount: derivedPrimaryChapters.length,
    onSelectAllCompareSections: setAllCompareSectionsSelected,
    onToggleCompareSectionSelection: toggleCompareSectionSelection,
    onToggleCompareSectionCollapse: toggleCompareSectionCollapse,
    onStartRecognition: () => {
      void handleStartRecognition();
    },
    onApplyAll: () => {
      void (pendingSuggestionCount > 0
        ? applyState.handleApplyAll(persistAppliedRecognitionCache)
        : applyState.handleReapplyAll(persistAppliedRecognitionCache));
    },
    getCompareDocumentTypeLabel,
    getCompareHeadingLanguageSummary,
    renderCompareSectionCandidates: (section) => (
      <WordCompareSectionCandidatesPanel
        section={section as CompareCandidateSection}
        onSaveCandidate={updateCompareCandidate}
        onDeleteCandidate={deleteCompareCandidate}
        isWordLoopCompareCandidate={isWordLoopCompareCandidate}
      />
    ),
    renderCompareSectionIdentifyResult: (section) => (
      <WordRecognitionSectionResultPanel
        section={section as CompareCandidateSection}
        sectionGenerationResultMap={sectionGenerationResultMap}
        sectionSuggestionMap={sectionSuggestionMap}
        collapsedRecognitionSections={collapsedRecognitionSections}
        recognitionReady={recognitionReady}
        toggleRecognitionSectionCollapse={toggleRecognitionSectionCollapse}
        applyState={applyState}
        persistAppliedRecognitionCache={persistAppliedRecognitionCache}
        formatConfidence={formatConfidence}
      />
    ),
    emptyIdentifyStateSlot: shouldShowEmptyWordRecognitionState({
      recognitionBlocked,
      recognitionReady,
      totalSuggestions: sectionProcessingSummary?.totalSuggestions || 0,
    }) ? (
      <div className="word-step-placeholder">
        当前章节还没有可展示的生成参数值，请检查各章节生成结果。
      </div>
    ) : null,
    followupSlot: <WordRecognitionFollowup {...followupProps} />,
  };
}

export function buildWordWorkflowDebugPanelProps(args: {
  showDebugPanel: boolean;
  setShowDebugPanel: (visible: boolean) => void;
  analysisError: string | null;
  analysisErrorDetails?: string | null;
  showErrorDetails: boolean;
  setShowErrorDetails: (visible: boolean) => void;
  recentErrorLogs: React.ComponentProps<typeof WordWorkflowDebugPanel>['recentErrorLogs'];
}): React.ComponentProps<typeof WordWorkflowDebugPanel> {
  const {
    showDebugPanel,
    setShowDebugPanel,
    analysisError,
    analysisErrorDetails,
    showErrorDetails,
    setShowErrorDetails,
    recentErrorLogs,
  } = args;

  return {
    showDebugPanel,
    onToggleDebugPanel: () => setShowDebugPanel(!showDebugPanel),
    analysisError,
    analysisErrorDetails,
    showErrorDetails,
    onToggleErrorDetails: () => setShowErrorDetails(!showErrorDetails),
    recentErrorLogs,
  };
}
