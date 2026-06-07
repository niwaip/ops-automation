import { useState } from 'react';
import type {
  TemplateCompareResponse,
  TemplateRecognizeResponse,
  TemplateUnderstandResponse,
} from '../../../api/carbone-api';
import type { CompareHeadingLanguageSelection, SampleUploadState } from './word-workflow.panel.helpers';
import type { WordSectionGenerationResult } from './word-workflow.cache';

export function useWordWorkflowPanelState() {
  const [draftWorkflowCollapsed, setDraftWorkflowCollapsed] = useState(false);
  const [guidePreviewCollapsed, setGuidePreviewCollapsed] = useState(true);
  const [verifySaveCollapsed, setVerifySaveCollapsed] = useState(false);
  const [step1Collapsed, setStep1Collapsed] = useState(false);
  const [step2Collapsed, setStep2Collapsed] = useState(false);
  const [understandingSummaryCollapsed, setUnderstandingSummaryCollapsed] = useState(true);
  const [compareSummaryCollapsed, setCompareSummaryCollapsed] = useState(false);
  const [compareSectionsCollapsed, setCompareSectionsCollapsed] = useState(false);
  const [sampleUploadState, setSampleUploadState] = useState<SampleUploadState>({
    uploaded: false,
    revision: 0,
  });
  const [compareHeadingLanguages, setCompareHeadingLanguages] = useState<CompareHeadingLanguageSelection[]>(['zh']);
  const [collapsedCompareSections, setCollapsedCompareSections] = useState<Record<string, boolean>>({});
  const [collapsedRecognitionSections, setCollapsedRecognitionSections] = useState<Record<string, boolean>>({});
  const [selectedCompareSections, setSelectedCompareSections] = useState<Record<string, boolean>>({});
  const [understandingRevision, setUnderstandingRevision] = useState(0);
  const [understandingLanguageSignature, setUnderstandingLanguageSignature] = useState('');
  const [understandingCompareSignature, setUnderstandingCompareSignature] = useState('no-compare');
  const [compareResult, setCompareResult] = useState<TemplateCompareResponse | null>(null);
  const [compareDocumentIr, setCompareDocumentIr] = useState<Record<string, any> | null>(null);
  const [recognitionRevision, setRecognitionRevision] = useState(0);
  const [recognitionLanguageSignature, setRecognitionLanguageSignature] = useState('');
  const [recognitionCompareSignature, setRecognitionCompareSignature] = useState('no-compare');
  const [recognitionActivated, setRecognitionActivated] = useState(false);
  const [understandingResult, setUnderstandingResult] = useState<TemplateUnderstandResponse | null>(null);
  const [recognitionResult, setRecognitionResult] = useState<TemplateRecognizeResponse | null>(null);
  const [sectionGenerationResults, setSectionGenerationResults] = useState<WordSectionGenerationResult[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [isHighlightingCandidates, setIsHighlightingCandidates] = useState(false);
  const [isClearingHighlights, setIsClearingHighlights] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isUnderstanding, setIsUnderstanding] = useState(false);
  const [, setCompareHighlightSummary] = useState<string | null>(null);
  const [compareCacheStatus, setCompareCacheStatus] = useState<'hit' | 'miss' | null>(null);
  const [compareCacheUpdatedAt, setCompareCacheUpdatedAt] = useState<number | null>(null);
  const [understandingCacheStatus, setUnderstandingCacheStatus] = useState<'hit' | 'miss' | null>(null);
  const [understandingCacheUpdatedAt, setUnderstandingCacheUpdatedAt] = useState<number | null>(null);
  const [recognitionCacheStatus, setRecognitionCacheStatus] = useState<'hit' | 'miss' | null>(null);
  const [recognitionCacheUpdatedAt, setRecognitionCacheUpdatedAt] = useState<number | null>(null);
  const [detectedUploadCacheStatus, setDetectedUploadCacheStatus] = useState<'available' | 'none' | 'checking' | null>(null);
  const [detectedUploadCacheUpdatedAt, setDetectedUploadCacheUpdatedAt] = useState<number | null>(null);
  const [detectedUploadCacheResult, setDetectedUploadCacheResult] = useState<TemplateUnderstandResponse | null>(null);

  return {
    draftWorkflowCollapsed,
    setDraftWorkflowCollapsed,
    guidePreviewCollapsed,
    setGuidePreviewCollapsed,
    verifySaveCollapsed,
    setVerifySaveCollapsed,
    step1Collapsed,
    setStep1Collapsed,
    step2Collapsed,
    setStep2Collapsed,
    understandingSummaryCollapsed,
    setUnderstandingSummaryCollapsed,
    compareSummaryCollapsed,
    setCompareSummaryCollapsed,
    compareSectionsCollapsed,
    setCompareSectionsCollapsed,
    sampleUploadState,
    setSampleUploadState,
    compareHeadingLanguages,
    setCompareHeadingLanguages,
    collapsedCompareSections,
    setCollapsedCompareSections,
    collapsedRecognitionSections,
    setCollapsedRecognitionSections,
    selectedCompareSections,
    setSelectedCompareSections,
    understandingRevision,
    setUnderstandingRevision,
    understandingLanguageSignature,
    setUnderstandingLanguageSignature,
    understandingCompareSignature,
    setUnderstandingCompareSignature,
    compareResult,
    setCompareResult,
    compareDocumentIr,
    setCompareDocumentIr,
    recognitionRevision,
    setRecognitionRevision,
    recognitionLanguageSignature,
    setRecognitionLanguageSignature,
    recognitionCompareSignature,
    setRecognitionCompareSignature,
    recognitionActivated,
    setRecognitionActivated,
    understandingResult,
    setUnderstandingResult,
    recognitionResult,
    setRecognitionResult,
    sectionGenerationResults,
    setSectionGenerationResults,
    isComparing,
    setIsComparing,
    isHighlightingCandidates,
    setIsHighlightingCandidates,
    isClearingHighlights,
    setIsClearingHighlights,
    isRecognizing,
    setIsRecognizing,
    isUnderstanding,
    setIsUnderstanding,
    setCompareHighlightSummary,
    compareCacheStatus,
    setCompareCacheStatus,
    compareCacheUpdatedAt,
    setCompareCacheUpdatedAt,
    understandingCacheStatus,
    setUnderstandingCacheStatus,
    understandingCacheUpdatedAt,
    setUnderstandingCacheUpdatedAt,
    recognitionCacheStatus,
    setRecognitionCacheStatus,
    recognitionCacheUpdatedAt,
    setRecognitionCacheUpdatedAt,
    detectedUploadCacheStatus,
    setDetectedUploadCacheStatus,
    detectedUploadCacheUpdatedAt,
    setDetectedUploadCacheUpdatedAt,
    detectedUploadCacheResult,
    setDetectedUploadCacheResult,
  };
}
