import type {
  TemplateCompareResponse,
  TemplateRecognizeResponse,
  TemplateUnderstandResponse,
} from '../../../api/carbone-api';
import type { AISuggestion } from '../../../app/store';
import type { SampleUploadStateLike, WordSectionGenerationResult } from './word-workflow.cache';

type CompareCacheStatus = 'hit' | 'miss' | null;
type DetectionCacheStatus = 'available' | 'none' | 'checking' | null;

export type WordSectionProcessingSummary = {
  total: number;
  succeeded: number;
  empty: number;
  failed: number;
  retryUsed: number;
  qualityIssueSections: number;
  totalCandidates: number;
  totalSuggestions: number;
  narrative: string;
};

export function buildCurrentCompareSignature(
  compareResult: TemplateCompareResponse | null,
  selectedCompareSectionKeys: string[]
): string {
  if (!compareResult) {
    return 'no-compare';
  }

  const candidateSignature = compareResult.candidateFields
    .map((candidate) =>
      [
        candidate.candidateId,
        candidate.fieldIdHint || '',
        candidate.sampleValue || '',
        candidate.sectionId || '',
      ].join(':')
    )
    .join('|');

  return [
    compareResult.compareId || 'compare',
    candidateSignature,
    ...[...selectedCompareSectionKeys].sort(),
  ].join('|');
}

export function buildCurrentRecognitionCacheSignature(
  compareResult: TemplateCompareResponse | null
): string {
  if (!compareResult) {
    return 'no-compare';
  }

  const candidateSignature = compareResult.candidateFields
    .map((candidate) =>
      [
        candidate.candidateId,
        candidate.fieldIdHint || '',
        candidate.sampleValue || '',
        candidate.sectionId || '',
      ].join(':')
    )
    .join('|');

  return [compareResult.compareId || 'compare', candidateSignature, 'all-sections'].join('|');
}

export function deriveWordWorkflowStatus(args: {
  sampleUploadState: SampleUploadStateLike;
  hasCompare: boolean;
  understandingResult: TemplateUnderstandResponse | null;
  understandingRevision: number;
  understandingLanguageSignature: string;
  understandingCompareSignature: string;
  languageSignature: string;
  currentCompareSignature: string;
  understandingCacheStatus: CompareCacheStatus;
  understandingCacheUpdatedAt: number | null;
  detectedUploadCacheStatus: DetectionCacheStatus;
  detectedUploadCacheUpdatedAt: number | null;
  detectedUploadCacheResult: TemplateUnderstandResponse | null;
  isUnderstanding: boolean;
  recognitionActivated: boolean;
  recognitionRevision: number;
  recognitionLanguageSignature: string;
  recognitionCompareSignature: string;
  currentRecognitionCacheSignature: string;
  sectionGenerationResults: WordSectionGenerationResult[];
  suggestions: AISuggestion[];
  recognitionResult: TemplateRecognizeResponse | null;
  effectiveCompareCandidateFieldsCount: number;
  compareCandidateSectionsCount: number;
}): {
  displayedCacheUpdatedAt: number | null;
  understandingStale: boolean;
  recognitionStale: boolean;
  hasRecognitionSnapshot: boolean;
  recognitionDataFresh: boolean;
  recognitionReady: boolean;
  recognitionSelectionBlocked: boolean;
  recognitionBlocked: boolean;
  totalSuggestionCount: number;
  pendingSuggestionCount: number;
  uploadStatusLabel: string;
  uploadStatusTone: 'default' | 'success';
  understandingStatusLabel: string;
  understandingStatusTone: '' | 'warning' | 'success';
  understandingCacheTimeText: string;
  understandingCacheDescription: string;
  understandingActionHint: string;
  displayedUnderstandingSummaryResult: TemplateUnderstandResponse | null;
} {
  const hasUnderstanding = Boolean(args.understandingResult);
  const displayedCacheUpdatedAt =
    args.understandingCacheUpdatedAt ??
    (args.detectedUploadCacheStatus === 'available' ? args.detectedUploadCacheUpdatedAt : null);

  const understandingStale =
    hasUnderstanding &&
    (args.understandingRevision !== args.sampleUploadState.revision ||
      args.understandingLanguageSignature !== args.languageSignature ||
      args.understandingCompareSignature !== args.currentCompareSignature);

  const recognitionStale =
    args.recognitionActivated &&
    (args.recognitionRevision !== args.sampleUploadState.revision ||
      args.recognitionLanguageSignature !== args.languageSignature ||
      args.recognitionCompareSignature !== args.currentRecognitionCacheSignature);

  const hasRecognitionSnapshot =
    args.recognitionActivated &&
    (args.sectionGenerationResults.length > 0 ||
      args.suggestions.length > 0 ||
      Boolean(args.recognitionResult));
  const recognitionDataFresh =
    hasRecognitionSnapshot &&
    args.recognitionRevision === args.sampleUploadState.revision &&
    args.recognitionLanguageSignature === args.languageSignature &&
    args.recognitionCompareSignature === args.currentRecognitionCacheSignature;
  const recognitionReady = args.recognitionActivated && recognitionDataFresh && !recognitionStale;
  const recognitionSelectionBlocked =
    args.compareCandidateSectionsCount > 0 && args.effectiveCompareCandidateFieldsCount === 0;
  const recognitionBlocked =
    !args.sampleUploadState.uploaded || !args.hasCompare || recognitionSelectionBlocked;
  const totalSuggestionCount = args.suggestions.length;
  const pendingSuggestionCount = args.suggestions.filter(
    (suggestion) => !suggestion.applied
  ).length;
  const uploadStatusLabel = args.sampleUploadState.uploaded ? '已上传' : '待上传';
  const uploadStatusTone: 'default' | 'success' = args.sampleUploadState.uploaded
    ? 'success'
    : 'default';

  const understandingStatusLabel = !args.sampleUploadState.uploaded
    ? '未开始'
    : args.isUnderstanding
      ? '理解中'
      : understandingStale
        ? '缓存待刷新'
        : args.understandingCacheStatus === 'hit'
          ? '缓存命中'
          : args.understandingCacheStatus === 'miss'
            ? '已写入缓存'
            : args.detectedUploadCacheStatus === 'checking'
              ? '检查缓存中'
              : args.detectedUploadCacheStatus === 'available'
                ? '检测到缓存'
                : args.understandingResult
                  ? '已完成理解'
                  : '待理解';

  const understandingStatusTone: '' | 'warning' | 'success' = args.isUnderstanding
    ? 'warning'
    : args.understandingCacheStatus === 'hit' ||
        args.understandingResult ||
        args.detectedUploadCacheStatus === 'available'
      ? 'success'
      : understandingStale
        ? 'warning'
        : '';

  const understandingCacheTimeText = displayedCacheUpdatedAt
    ? new Date(displayedCacheUpdatedAt).toLocaleString()
    : '';

  const understandingCacheDescription = !args.sampleUploadState.uploaded
    ? '请先上传参考示例文件'
    : args.isUnderstanding
      ? '正在生成全文理解'
      : understandingStale
        ? '检测到变化，需要重新理解'
        : args.understandingCacheStatus === 'hit'
          ? '当前结果来自本地缓存'
          : args.understandingCacheStatus === 'miss'
            ? '当前结果已写入本地缓存'
            : args.detectedUploadCacheStatus === 'checking'
              ? '正在检查本地缓存'
              : args.detectedUploadCacheStatus === 'available'
                ? '已检测到可复用缓存'
                : args.detectedUploadCacheStatus === 'none'
                  ? '当前没有可复用缓存'
                  : args.understandingResult
                    ? '当前结果可直接用于参数生成'
                    : '点击按钮开始全文理解';

  const understandingActionHint = !args.sampleUploadState.uploaded
    ? '等待上传参考示例文件'
    : understandingStale
      ? '建议重新理解'
      : args.understandingCacheStatus === 'hit'
        ? '可直接复用缓存'
        : args.understandingCacheStatus === 'miss'
          ? '结果已缓存'
          : args.detectedUploadCacheStatus === 'checking'
            ? '正在检查缓存'
            : args.detectedUploadCacheStatus === 'available'
              ? '检测到可复用缓存'
              : args.understandingResult
                ? '当前结果可直接用于参数生成'
                : '点击开始全文理解';

  const displayedUnderstandingSummaryResult =
    args.understandingResult && !understandingStale
      ? args.understandingResult
      : args.detectedUploadCacheStatus === 'available'
        ? args.detectedUploadCacheResult
        : null;

  return {
    displayedCacheUpdatedAt,
    understandingStale,
    recognitionStale,
    hasRecognitionSnapshot,
    recognitionDataFresh,
    recognitionReady,
    recognitionSelectionBlocked,
    recognitionBlocked,
    totalSuggestionCount,
    pendingSuggestionCount,
    uploadStatusLabel,
    uploadStatusTone,
    understandingStatusLabel,
    understandingStatusTone,
    understandingCacheTimeText,
    understandingCacheDescription,
    understandingActionHint,
    displayedUnderstandingSummaryResult,
  };
}

export function buildSectionProcessingSummary(
  recognitionReady: boolean,
  sectionGenerationResults: WordSectionGenerationResult[]
): WordSectionProcessingSummary | null {
  if (!recognitionReady || sectionGenerationResults.length === 0) {
    return null;
  }

  const succeeded = sectionGenerationResults.filter(
    (section) => section.aiCallSucceeded && section.suggestionCount > 0
  ).length;
  const empty = sectionGenerationResults.filter(
    (section) => section.aiCallSucceeded && section.suggestionCount === 0 && !section.error
  ).length;
  const failed = sectionGenerationResults.filter(
    (section) => !section.aiCallSucceeded || section.error
  ).length;
  const retryUsed = sectionGenerationResults.filter((section) => section.usedRetry).length;
  const qualityIssueSections = sectionGenerationResults.filter(
    (section) => (section.qualityIssues || []).length > 0
  ).length;
  const totalCandidates = sectionGenerationResults.reduce(
    (sum, section) => sum + section.candidateCount,
    0
  );
  const totalSuggestions = sectionGenerationResults.reduce(
    (sum, section) => sum + section.suggestionCount,
    0
  );

  return {
    total: sectionGenerationResults.length,
    succeeded,
    empty,
    failed,
    retryUsed,
    qualityIssueSections,
    totalCandidates,
    totalSuggestions,
    narrative:
      totalSuggestions > 0
        ? `本次共处理 ${sectionGenerationResults.length} 个章节，累计候选 ${totalCandidates} 个，生成参数 ${totalSuggestions} 个。`
        : `本次已处理 ${sectionGenerationResults.length} 个章节，但当前还没有产出可落地的参数建议。`,
  };
}

export function buildSectionGenerationResultMap(
  sectionGenerationResults: WordSectionGenerationResult[]
): Map<string, WordSectionGenerationResult> {
  return new Map(sectionGenerationResults.map((section) => [section.sectionKey, section]));
}

export function buildSectionSuggestionMap(
  sectionGenerationResults: WordSectionGenerationResult[],
  suggestions: AISuggestion[]
): Map<string, AISuggestion[]> {
  const suggestionById = new Map(
    suggestions.map((suggestion) => [suggestion.id, suggestion] as const)
  );

  return new Map(
    sectionGenerationResults.map((section) => [
      section.sectionKey,
      section.suggestionIds
        .map((id) => suggestionById.get(id))
        .filter((suggestion): suggestion is AISuggestion => Boolean(suggestion)),
    ])
  );
}
