import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AISuggestionItem } from './AISuggestionItem';
import { DraftWorkflowSection } from './AIIdentifyPanel/DraftWorkflowSection';
import { ManualAddParamForm } from './AIIdentifyPanel/ManualAddParamForm';
import { TemplateConfigPanel } from './TemplateConfigPanel';
import { VerifySaveSection } from './AIIdentifyPanel/VerifySaveSection';
import { useWordIdentifyPanel } from './AIIdentifyPanel/useWordIdentifyPanel';
import { createHostAdapter } from '../adapters';
import { WordAPI } from '../utils/office/word/api';
import {
  carboneAPI,
  TemplateFieldCandidate,
  TemplateCompareResponse,
  TemplateRecognizeResponse,
  TemplateUnderstandResponse,
} from '../api/carbone-api';
import { DocumentIR } from '../adapters/document-ir';
import { AISuggestion, useAppStore } from '../taskpane/store';
import { getHostScopedStorageKey } from '../utils/host-storage';
import {
  buildWordKeywordFocusedDebugExcerpt,
  buildWordParameterDetectionDebugText,
  buildWordParamPromptParts,
  detectWordParameterChecks,
  extractWordParamName,
  resolveWordHeaderFieldKey,
} from '../utils/office/word/parameter';
import { extractReadableTextFromWordBase64 } from '../utils/office-file-upload';
import {
  resolveAnalysisExecutor,
  WordSectionPromptAcceptedSuggestion,
  WordSectionPromptBilingualGroup,
  WordSectionPromptCandidate,
} from '../services/analysis-executor';
import { enrichWordSuggestionAnchors } from '../services/suggestion-service';
import {
  buildWordChapterDetectionDebugText,
  buildWordDocumentStructureDebugText,
  deriveWordSectionsFromDocumentIr,
  deriveWordSectionsFromParagraphs,
  WordDetectedSection,
  WordSectionDisplayLanguage,
} from '../utils/office/word/chapter';

import {
  buildWordSectionBilingualPairsForRecognition,
  mergeWordCandidatesBySlotForRecognition,
  takeWordRecognitionBatchForRecognition,
} from '../utils/word-section-recognition';

const WORD_TECHNICAL_SERVICE_DEBUG_KEYWORDS = [
  '技术服务地点',
  'Place where the technical service is to be rendered',
  '技术服务期限',
  'Duration of technical service',
  '技术服务费总额为',
  'The total amount of such compensation for technical service is',
  '乙方指定银行帐号为',
  'Number of the Bank account designated by Party B is as follows',
];

interface Props {
  onApplyComplete?: () => void;
}

type SampleUploadState = {
  uploaded: boolean;
  fileName?: string;
  fileSize?: number;
  fileBase64?: string;
  revision: number;
};

type CompareHeadingLanguageSelection = WordSectionDisplayLanguage;

type CompareParagraph = {
  id: string;
  text: string;
  index: number;
  format: {
    fontSize?: number;
    isBold?: boolean;
    alignment?: string;
    isTitle?: boolean;
    style?: string;
    styleBuiltIn?: string;
  };
};

type CompareUnderlineRange = {
  text: string;
  underlineType: string;
  index: number;
  paragraphIndex: number;
  paragraphText: string;
  position: { start: number; end: number };
};

type CompareTableCellInfo = {
  sourceBlockId?: string;
  tableIndex: number;
  rowIndex: number;
  cellIndex: number;
  text: string;
};

type WordUnderstandingCacheEntry = {
  cacheKey: string;
  result: TemplateUnderstandResponse;
  updatedAt: number;
};

type WordCompareCacheEntry = {
  cacheKey: string;
  result: TemplateCompareResponse & {
    recognitionSnapshot?: WordRecognitionCacheEntry['result'];
  };
  updatedAt: number;
};

type WordRecognitionCacheEntry = {
  cacheKey: string;
  result: {
    suggestions: AISuggestion[];
    sectionGenerationResults: WordSectionGenerationResult[];
    collapsedSections?: Record<string, boolean>;
  };
  updatedAt: number;
};

type WordUnderstandingCacheKeyPayload = {
  host: string;
  title: string;
  stats: Record<string, any>;
  structurePreview: Array<{
    id: string;
    type: string;
    text: string;
  }>;
  sample: {
    fileName: string;
    fileSize: number;
    base64Length?: number;
    base64Head?: string;
    base64Tail?: string;
  };
  languageProfile: {
    sourceLanguage: string;
    targetLanguages: string[];
  };
  compareSignature: string;
};

type WordCompareCacheKeyPayload = {
  host: string;
  title: string;
  stats: Record<string, any>;
  structurePreview: Array<{
    id: string;
    type: string;
    text: string;
  }>;
  sample: {
    fileName: string;
    fileSize: number;
    base64Length?: number;
    base64Head?: string;
    base64Tail?: string;
  };
  templateType: string;
  headingLanguages: string[];
};

type WordSectionGenerationResult = {
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

const WORD_SECTION_RECOGNITION_BATCH_SIZE = 6;
const WORD_SECTION_RECOGNITION_MAX_ROUNDS = 5;

type WordCandidateHintSummary = {
  fieldIdHint?: string;
  fieldTypeHint?: string;
  generationPolicyHint?: TemplateFieldCandidate['generationPolicyHint'];
  placeholderPattern: 'inline_ellipsis_gap' | 'underline_or_space_gap' | 'label_only_gap' | 'table_cell_gap';
  promptHint?: string;
};

const WORD_UNDERSTANDING_CACHE_STORAGE_KEY = getHostScopedStorageKey('word', 'understanding-cache:v5');
const WORD_COMPARE_CACHE_STORAGE_KEY = getHostScopedStorageKey('word', 'compare-cache:v1');
const WORD_RECOGNITION_CACHE_STORAGE_KEY = getHostScopedStorageKey('word', 'recognition-cache:v1');
const WORD_UNDERSTANDING_CACHE_MAX_ENTRIES = 3;
const WORD_COMPARE_CACHE_MAX_ENTRIES = 3;
const WORD_RECOGNITION_CACHE_MAX_ENTRIES = 3;
const WORD_RECOGNITION_CACHE_MAX_EXCERPT_LENGTH = 320;
const WORD_RECOGNITION_CACHE_MAX_PROMPT_SUMMARY_LENGTH = 400;
const WORD_RECOGNITION_CACHE_MAX_QUALITY_ISSUES = 6;
const WORD_RECOGNITION_CACHE_MAX_ERROR_TEXT_LENGTH = 240;
const WORD_FIELD_HINT_MAP: Record<string, {
  fieldTypeHint: string;
  generationPolicyHint: NonNullable<TemplateFieldCandidate['generationPolicyHint']>;
}> = {
  contractNo: {
    fieldTypeHint: 'text',
    generationPolicyHint: 'llm_translate',
  },
  signingDate: {
    fieldTypeHint: 'date',
    generationPolicyHint: 'format_only',
  },
  signingPlace: {
    fieldTypeHint: 'geo_name',
    generationPolicyHint: 'llm_translate',
  },
  partyAName: {
    fieldTypeHint: 'legal_entity_name',
    generationPolicyHint: 'dictionary_first',
  },
  partyBName: {
    fieldTypeHint: 'legal_entity_name',
    generationPolicyHint: 'dictionary_first',
  },
  serviceName: {
    fieldTypeHint: 'service_name',
    generationPolicyHint: 'dictionary_first',
  },
  projectName: {
    fieldTypeHint: 'project_name',
    generationPolicyHint: 'dictionary_first',
  },
  serviceLocation: {
    fieldTypeHint: 'geo_name',
    generationPolicyHint: 'llm_translate',
  },
};

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function normalizeWordHintText(...values: Array<unknown>): string {
  return values
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

function inferWordCandidateHints(candidate: Pick<TemplateFieldCandidate, 'anchorText' | 'segmentText' | 'sampleValue' | 'matchReason'>): WordCandidateHintSummary {
  const combinedText = normalizeWordHintText(
    candidate.anchorText,
    extractWordParamName(candidate.anchorText || ''),
    candidate.segmentText,
    candidate.sampleValue
  );
  const directFieldIdHint = resolveWordHeaderFieldKey(candidate.anchorText || '')
    || resolveWordHeaderFieldKey(extractWordParamName(candidate.anchorText || ''));
  const fieldIdHint = directFieldIdHint;
  const hintConfig = fieldIdHint ? WORD_FIELD_HINT_MAP[fieldIdHint] : undefined;
  const hasInlineEllipsis = /(?:\.{3,}|…+)/u.test(combinedText);
  const placeholderPattern = candidate.matchReason?.includes('表格规则')
    ? 'table_cell_gap'
    : candidate.matchReason?.includes('下划线规则')
      ? 'underline_or_space_gap'
      : hasInlineEllipsis
        ? 'inline_ellipsis_gap'
        : 'label_only_gap';
  const promptHint = hasInlineEllipsis
    ? '句内出现省略号、下划线或空格占位时，应优先根据占位前后文和样本值识别被替换的业务实体，不要把占位后的整段正文误当成参数值。'
    : undefined;

  return {
    fieldIdHint,
    fieldTypeHint: hintConfig?.fieldTypeHint,
    generationPolicyHint: hintConfig?.generationPolicyHint,
    placeholderPattern,
    promptHint,
  };
}

function normalizeCacheText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildWordUnderstandingSummaryText(result: TemplateUnderstandResponse | null): string {
  if (!result) {
    return '全篇文档理解结果暂不可用，请仅基于当前章节候选生成参数。';
  }

  if (result.summary.understandingSummaryText) {
    return result.summary.understandingSummaryText;
  }

  const { languageProfile, summary } = result;
  const targetLanguages = languageProfile.targetLanguages.length > 0
    ? languageProfile.targetLanguages.join('、')
    : '无目标语言';
  const sectionText = summary.sectionHints.length > 0
    ? `主要章节包括 ${summary.sectionHints.slice(0, 6).join('、')}`
    : '当前未提取到明确章节标题';
  const layoutText = summary.layoutFeatures.length > 0
    ? `版式特征判断为 ${summary.layoutFeatures.join('、')}`
    : '版式特征仍以基础结构判断为主';

  return [
    summary.sampleFileName ? `系统已结合模板与参考示例文件《${summary.sampleFileName}》完成整篇理解。` : '系统已结合当前模板与参考示例文件完成整篇理解。',
    `当前按 ${languageProfile.sourceLanguage} 作为源语言，目标语言为 ${targetLanguages}。`,
    `文档结构上识别到 ${summary.paragraphCount} 个段落、${summary.tableCount} 个表格，${sectionText}。`,
    `${layoutText}。`,
  ].join('');
}

function loadWordUnderstandingCache(): Record<string, WordUnderstandingCacheEntry> {
  try {
    const raw = localStorage.getItem(WORD_UNDERSTANDING_CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, WordUnderstandingCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function loadWordCompareCache(): Record<string, WordCompareCacheEntry> {
  try {
    const raw = localStorage.getItem(WORD_COMPARE_CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, WordCompareCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function loadWordRecognitionCache(): Record<string, WordRecognitionCacheEntry> {
  try {
    const raw = localStorage.getItem(WORD_RECOGNITION_CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, WordRecognitionCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function trimCacheString(value: unknown, maxLength: number): string | undefined {
  const text = String(value || '').trim();
  if (!text) {
    return undefined;
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function isStorageQuotaExceeded(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    const quotaMessage = `${error.name} ${error.message}`.toLowerCase();
    return quotaMessage.includes('quota') && quotaMessage.includes('exceed');
  }
  return String((error as { message?: string })?.message || '').includes('quota');
}

function limitCacheEntries<T extends { cacheKey: string; updatedAt: number }>(
  cache: Record<string, T>,
  maxEntries: number,
  preferredKey?: string
): Record<string, T> {
  const sortedEntries = Object.entries(cache)
    .sort(([, left], [, right]) => {
      if (preferredKey) {
        if (left.cacheKey === preferredKey && right.cacheKey !== preferredKey) {
          return -1;
        }
        if (right.cacheKey === preferredKey && left.cacheKey !== preferredKey) {
          return 1;
        }
      }
      return right.updatedAt - left.updatedAt;
    })
    .slice(0, Math.max(maxEntries, preferredKey && cache[preferredKey] ? 1 : 0));

  return sortedEntries.reduce<Record<string, T>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

function writeCacheMapToStorage<T extends { cacheKey: string; updatedAt: number }>(
  storageKey: string,
  cache: Record<string, T>,
  preferredKey: string | undefined,
  maxEntries: number
): void {
  const nextCache = limitCacheEntries(cache, maxEntries, preferredKey);
  const preferredOnlyCache = preferredKey && nextCache[preferredKey]
    ? { [preferredKey]: nextCache[preferredKey] }
    : undefined;

  try {
    localStorage.setItem(storageKey, JSON.stringify(nextCache));
    return;
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) {
      console.warn(`Failed to persist cache for ${storageKey}`, error);
      return;
    }
  }

  if (preferredOnlyCache) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferredOnlyCache));
      return;
    } catch (error) {
      if (!isStorageQuotaExceeded(error)) {
        console.warn(`Failed to persist compact cache for ${storageKey}`, error);
        return;
      }
    }
  }

  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore cleanup failures. The cache is best-effort only.
  }
}

function sanitizeWordRecognitionResultForStorage(
  result: WordRecognitionCacheEntry['result']
): WordRecognitionCacheEntry['result'] {
  return {
    suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
    sectionGenerationResults: (Array.isArray(result.sectionGenerationResults) ? result.sectionGenerationResults : [])
      .map((section) => ({
        ...section,
        excerpt: trimCacheString(section.excerpt, WORD_RECOGNITION_CACHE_MAX_EXCERPT_LENGTH),
        promptDebugSummary: trimCacheString(section.promptDebugSummary, WORD_RECOGNITION_CACHE_MAX_PROMPT_SUMMARY_LENGTH),
        promptRequestText: undefined,
        rawAiResponse: undefined,
        qualityIssues: Array.isArray(section.qualityIssues)
          ? section.qualityIssues.slice(0, WORD_RECOGNITION_CACHE_MAX_QUALITY_ISSUES)
          : undefined,
        error: section.error
          ? {
              message: trimCacheString(section.error.message, WORD_RECOGNITION_CACHE_MAX_ERROR_TEXT_LENGTH),
              reason: trimCacheString(section.error.reason, WORD_RECOGNITION_CACHE_MAX_ERROR_TEXT_LENGTH),
              url: trimCacheString(section.error.url, WORD_RECOGNITION_CACHE_MAX_ERROR_TEXT_LENGTH),
              status: section.error.status,
            }
          : undefined,
      })),
    collapsedSections: result.collapsedSections,
  };
}

function isWordCompareCacheCompatible(entry: WordCompareCacheEntry | undefined): boolean {
  return Boolean(
    entry
    && typeof entry.cacheKey === 'string'
    && Array.isArray(entry.result?.candidateFields)
    && entry.result?.compareSummary
    && (
      entry.result?.recognitionSnapshot === undefined
      || (
        Array.isArray(entry.result.recognitionSnapshot?.suggestions)
        && Array.isArray(entry.result.recognitionSnapshot?.sectionGenerationResults)
      )
    )
    && typeof entry.updatedAt === 'number'
  );
}

function isWordRecognitionCacheCompatible(entry: WordRecognitionCacheEntry | undefined): boolean {
  return Boolean(
    entry
    && typeof entry.cacheKey === 'string'
    && Array.isArray(entry.result?.suggestions)
    && Array.isArray(entry.result?.sectionGenerationResults)
    && (
      entry.result?.collapsedSections === undefined
      || (
        entry.result?.collapsedSections
        && typeof entry.result.collapsedSections === 'object'
        && !Array.isArray(entry.result.collapsedSections)
      )
    )
    && typeof entry.updatedAt === 'number'
  );
}

function isWordUnderstandingCacheCompatible(entry: WordUnderstandingCacheEntry | undefined): boolean {
  if (!entry?.result?.summary) {
    return false;
  }

  const summaryText = String(entry.result.summary.understandingSummaryText || '').trim();
  const promptRequestText = String(entry.result.contextAnalysis?.promptRequestText || '').trim();
  const isNewPromptStyle = promptRequestText.includes('【系统提示词】')
    && promptRequestText.includes('你是文档理解助手')
    && promptRequestText.includes('## 文档类型与用途')
    && !promptRequestText.includes('必须返回 JSON 对象');

  return Boolean(summaryText) && Boolean(promptRequestText) && isNewPromptStyle;
}

function saveWordUnderstandingCacheEntry(entry: WordUnderstandingCacheEntry): void {
  const cache = loadWordUnderstandingCache();
  cache[entry.cacheKey] = entry;
  writeCacheMapToStorage(
    WORD_UNDERSTANDING_CACHE_STORAGE_KEY,
    cache,
    entry.cacheKey,
    WORD_UNDERSTANDING_CACHE_MAX_ENTRIES
  );
}

function saveWordCompareCacheEntry(entry: WordCompareCacheEntry): void {
  const cache = loadWordCompareCache();
  cache[entry.cacheKey] = {
    ...entry,
    result: entry.result.recognitionSnapshot
      ? {
          ...entry.result,
          recognitionSnapshot: sanitizeWordRecognitionResultForStorage(entry.result.recognitionSnapshot),
        }
      : entry.result,
  };
  writeCacheMapToStorage(
    WORD_COMPARE_CACHE_STORAGE_KEY,
    cache,
    entry.cacheKey,
    WORD_COMPARE_CACHE_MAX_ENTRIES
  );
}

function saveWordRecognitionCacheEntry(entry: WordRecognitionCacheEntry): void {
  const cache = loadWordRecognitionCache();
  cache[entry.cacheKey] = {
    ...entry,
    result: sanitizeWordRecognitionResultForStorage(entry.result),
  };
  writeCacheMapToStorage(
    WORD_RECOGNITION_CACHE_STORAGE_KEY,
    cache,
    entry.cacheKey,
    WORD_RECOGNITION_CACHE_MAX_ENTRIES
  );
}

function removeWordCompareCacheEntry(cacheKey: string): void {
  const cache = loadWordCompareCache();
  if (!cache[cacheKey]) {
    return;
  }
  delete cache[cacheKey];
  writeCacheMapToStorage(WORD_COMPARE_CACHE_STORAGE_KEY, cache, undefined, WORD_COMPARE_CACHE_MAX_ENTRIES);
}

function removeWordUnderstandingCacheEntry(cacheKey: string): void {
  const cache = loadWordUnderstandingCache();
  if (!cache[cacheKey]) {
    return;
  }
  delete cache[cacheKey];
  writeCacheMapToStorage(WORD_UNDERSTANDING_CACHE_STORAGE_KEY, cache, undefined, WORD_UNDERSTANDING_CACHE_MAX_ENTRIES);
}

function removeWordRecognitionCacheEntry(cacheKey: string): void {
  const cache = loadWordRecognitionCache();
  if (!cache[cacheKey]) {
    return;
  }
  delete cache[cacheKey];
  writeCacheMapToStorage(WORD_RECOGNITION_CACHE_STORAGE_KEY, cache, undefined, WORD_RECOGNITION_CACHE_MAX_ENTRIES);
}

function mergeRecognitionResultWithAppliedCache(
  nextResult: WordRecognitionCacheEntry['result'],
  cachedEntry?: WordRecognitionCacheEntry
): WordRecognitionCacheEntry['result'] {
  if (!cachedEntry || !isWordRecognitionCacheCompatible(cachedEntry)) {
    return nextResult;
  }

  const currentSuggestions = Array.isArray(nextResult.suggestions) ? nextResult.suggestions : [];
  const currentSectionResults = Array.isArray(nextResult.sectionGenerationResults)
    ? nextResult.sectionGenerationResults
    : [];
  const currentSectionKeys = new Set(currentSectionResults.map((section) => section.sectionKey));
  const cachedSuggestionsById = new Map(
    (Array.isArray(cachedEntry.result.suggestions) ? cachedEntry.result.suggestions : [])
      .map((suggestion) => [suggestion.id, suggestion] as const)
  );
  const cachedSuggestionSectionMap = new Map<string, string>();
  (Array.isArray(cachedEntry.result.sectionGenerationResults) ? cachedEntry.result.sectionGenerationResults : [])
    .forEach((section) => {
      section.suggestionIds.forEach((suggestionId) => {
        cachedSuggestionSectionMap.set(suggestionId, section.sectionKey);
      });
    });
  const mergedSuggestions = dedupeWordSectionSuggestions([
    ...currentSuggestions,
    ...Array.from(cachedSuggestionsById.values()).filter((suggestion) => {
      const sectionKey = cachedSuggestionSectionMap.get(suggestion.id);
      return Boolean(sectionKey) && !currentSectionKeys.has(String(sectionKey));
    }),
  ]);
  const mergedSuggestionsById = new Map(
    mergedSuggestions.map((suggestion) => [suggestion.id, suggestion] as const)
  );
  const sectionResultMap = new Map<string, WordSectionGenerationResult>(
    (Array.isArray(cachedEntry.result.sectionGenerationResults) ? cachedEntry.result.sectionGenerationResults : [])
      .filter((section) => !currentSectionKeys.has(section.sectionKey))
      .map((section) => [
        section.sectionKey,
        {
          ...section,
          suggestionIds: section.suggestionIds.filter((suggestionId) => mergedSuggestionsById.has(suggestionId)),
          suggestionCount: section.suggestionIds.filter((suggestionId) => mergedSuggestionsById.has(suggestionId)).length,
        } as WordSectionGenerationResult,
      ] as const)
  );

  currentSectionResults.forEach((section) => {
    sectionResultMap.set(section.sectionKey, {
      ...section,
      suggestionIds: section.suggestionIds.filter((suggestionId) => mergedSuggestionsById.has(suggestionId)),
      suggestionCount: section.suggestionIds.filter((suggestionId) => mergedSuggestionsById.has(suggestionId)).length,
    });
  });

  return {
    suggestions: mergedSuggestions,
    sectionGenerationResults: Array.from(sectionResultMap.values()),
    collapsedSections: {
      ...(cachedEntry.result.collapsedSections || {}),
      ...(nextResult.collapsedSections || {}),
    },
  };
}

function buildWordUnderstandingCachePayload(
  templateDocumentIr: Record<string, any>,
  sampleUploadState: SampleUploadState,
  sourceLanguage: string,
  targetLanguages: string[],
  compareSignature: string,
): WordUnderstandingCacheKeyPayload {
  const elements = Array.isArray(templateDocumentIr?.elements) ? templateDocumentIr.elements : [];
  const stats = templateDocumentIr?.stats && typeof templateDocumentIr.stats === 'object'
    ? templateDocumentIr.stats
    : {};
  const structurePreview = elements
    .slice(0, 24)
    .map((element: Record<string, unknown>) => ({
      id: String(element.id || ''),
      type: String(element.type || ''),
      text: normalizeCacheText(element.text).slice(0, 48),
    }));
  const sampleSignature = sampleUploadState.fileBase64
    ? {
        fileName: sampleUploadState.fileName || '',
        fileSize: sampleUploadState.fileSize || 0,
        base64Length: sampleUploadState.fileBase64.length,
        base64Head: sampleUploadState.fileBase64.slice(0, 32),
        base64Tail: sampleUploadState.fileBase64.slice(-32),
      }
    : {
        fileName: sampleUploadState.fileName || '',
        fileSize: sampleUploadState.fileSize || 0,
      };

  return {
    host: templateDocumentIr?.host || 'word',
    title: normalizeCacheText(templateDocumentIr?.metadata?.title),
    stats,
    structurePreview,
    sample: sampleSignature,
    languageProfile: {
      sourceLanguage,
      targetLanguages: [...targetLanguages].sort(),
    },
    compareSignature,
  };
}

function buildWordCompareCachePayload(
  templateDocumentIr: Record<string, any>,
  sampleUploadState: SampleUploadState,
  templateType: string,
  headingLanguages: string[],
): WordCompareCacheKeyPayload {
  const elements = Array.isArray(templateDocumentIr?.elements) ? templateDocumentIr.elements : [];
  const stats = templateDocumentIr?.stats && typeof templateDocumentIr.stats === 'object'
    ? templateDocumentIr.stats
    : {};
  const structurePreview = elements
    .slice(0, 24)
    .map((element: Record<string, unknown>) => ({
      id: String(element.id || ''),
      type: String(element.type || ''),
      text: normalizeCacheText(element.text).slice(0, 48),
    }));
  const sampleSignature = sampleUploadState.fileBase64
    ? {
        fileName: sampleUploadState.fileName || '',
        fileSize: sampleUploadState.fileSize || 0,
        base64Length: sampleUploadState.fileBase64.length,
        base64Head: sampleUploadState.fileBase64.slice(0, 32),
        base64Tail: sampleUploadState.fileBase64.slice(-32),
      }
    : {
        fileName: sampleUploadState.fileName || '',
        fileSize: sampleUploadState.fileSize || 0,
      };

  return {
    host: templateDocumentIr?.host || 'word',
    title: normalizeCacheText(templateDocumentIr?.metadata?.title),
    stats,
    structurePreview,
    sample: sampleSignature,
    templateType,
    headingLanguages: [...headingLanguages].sort(),
  };
}

function buildWordUnderstandingCacheKey(
  templateDocumentIr: Record<string, any>,
  sampleUploadState: SampleUploadState,
  sourceLanguage: string,
  targetLanguages: string[],
  compareSignature: string,
): string {
  return JSON.stringify(buildWordUnderstandingCachePayload(
    templateDocumentIr,
    sampleUploadState,
    sourceLanguage,
    targetLanguages,
    compareSignature,
  ));
}

function buildWordRecognitionCacheKey(
  templateDocumentIr: Record<string, any>,
  sampleUploadState: SampleUploadState,
  sourceLanguage: string,
  targetLanguages: string[],
  compareSignature: string,
): string {
  return buildWordUnderstandingCacheKey(
    templateDocumentIr,
    sampleUploadState,
    sourceLanguage,
    targetLanguages,
    compareSignature,
  );
}

function buildWordCompareCacheKey(
  templateDocumentIr: Record<string, any>,
  sampleUploadState: SampleUploadState,
  templateType: string,
  headingLanguages: string[],
): string {
  return JSON.stringify(buildWordCompareCachePayload(
    templateDocumentIr,
    sampleUploadState,
    templateType,
    headingLanguages,
  ));
}

function parseWordUnderstandingCacheKey(cacheKey: string): WordUnderstandingCacheKeyPayload | null {
  try {
    const parsed = JSON.parse(cacheKey) as WordUnderstandingCacheKeyPayload;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function findLatestMatchingWordUnderstandingCacheEntry(options: {
  templateDocumentIr: Record<string, any>;
  sampleUploadState: SampleUploadState;
  sourceLanguage: string;
  targetLanguages: string[];
}): WordUnderstandingCacheEntry | null {
  const basePayload = buildWordUnderstandingCachePayload(
    options.templateDocumentIr,
    options.sampleUploadState,
    options.sourceLanguage,
    options.targetLanguages,
    '',
  );
  const { compareSignature: _ignoredCompareSignature, ...expectedMatcher } = basePayload;
  const expectedMatcherKey = JSON.stringify(expectedMatcher);
  const matchedEntries = Object.values(loadWordUnderstandingCache())
    .filter((entry) => isWordUnderstandingCacheCompatible(entry))
    .filter((entry) => {
      const parsedKey = parseWordUnderstandingCacheKey(entry.cacheKey);
      if (!parsedKey) {
        return false;
      }
      const { compareSignature: _ignored, ...matcher } = parsedKey;
      return JSON.stringify(matcher) === expectedMatcherKey;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);

  return matchedEntries[0] || null;
}

function buildSuggestionGroupSummary(groupSuggestions: AISuggestion[]) {
  const total = groupSuggestions.length;
  const pendingReviewCount = groupSuggestions.filter((suggestion) => suggestion.details?.needsReview).length;
  const highRiskCount = groupSuggestions.filter((suggestion) => suggestion.details?.riskLevel === 'high').length;
  const matchedTermCount = groupSuggestions.filter((suggestion) => suggestion.details?.termMatchStatus === 'matched').length;
  const averageConfidence = total > 0
    ? groupSuggestions.reduce((sum, suggestion) => sum + suggestion.confidence, 0) / total
    : 0;

  return {
    total,
    pendingReviewCount,
    highRiskCount,
    matchedTermCount,
    averageConfidence,
  };
}

function buildUnderstandingDebugText(result: TemplateUnderstandResponse, fallbackNarrative: string): string {
  return [
    '【理解摘要】',
    result.summary.understandingSummaryText || fallbackNarrative || result.summary.documentTitle || '已生成整体理解结果',
    '',
    '【发送给 AI 的请求原文】',
    result.contextAnalysis?.promptRequestText || '无',
    '',
    '【AI 原始返回】',
    result.contextAnalysis?.rawAiResponse || '无',
  ].join('\n');
}

function buildPromptTraceDebugText(promptRequestText?: string, rawAiResponse?: string): string {
  return [
    '【发送给 AI 的完整提示词】',
    promptRequestText || '无',
    '',
    '【AI 完整原始返回】',
    rawAiResponse || '无',
  ].join('\n');
}

function getLanguageHintLabel(hint?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown'): string {
  switch (hint) {
    case 'zh':
      return '中文';
    case 'ja':
      return '日文';
    case 'en':
      return '英文';
    case 'mixed':
      return '混合';
    case 'unknown':
    default:
      return '未知';
  }
}

function getCompareLanguageRelationLabel(candidate: TemplateCompareResponse['candidateFields'][number]): string {
  const relation = candidate.languageRelation;
  if (!relation) {
    return '未标注';
  }
  switch (relation.mode) {
    case 'adjacent_bilingual_block':
      return `${getLanguageHintLabel(relation.currentLanguageHint)} -> 邻近 ${getLanguageHintLabel(relation.peerLanguageHint)}`;
    case 'same_block_mixed_language':
      return '同块混合语言';
    case 'single_language':
      return `${getLanguageHintLabel(relation.currentLanguageHint)}单语`;
    case 'unknown':
    default:
      return '未知';
  }
}

function inferWordTextLanguageHint(text: string): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  const value = String(text || '').trim();
  if (!value) {
    return 'unknown';
  }

  const hasKana = /[\u3040-\u30ff]/u.test(value);
  const hasCjk = /[\u4e00-\u9fff]/u.test(value);
  const hasLatin = /[A-Za-z]/u.test(value);

  if (hasKana && hasCjk) {
    return 'ja';
  }
  if (hasKana) {
    return 'ja';
  }
  if (hasCjk && hasLatin) {
    return 'mixed';
  }
  if (hasCjk) {
    return 'zh';
  }
  if (hasLatin) {
    return 'en';
  }

  return 'unknown';
}

function getWordCandidateLanguageHint(candidate: TemplateFieldCandidate): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  const anchorSnippet = String(candidate.localAnchorText || candidate.anchorText || '').trim();
  const slotSnippet = String(candidate.parameterSlot || '').trim();
  const paragraphSnippet = String(candidate.segmentText || '').trim();
  const matchSnippet = String(candidate.matchText || '').trim();

  const orderedTexts = [anchorSnippet, slotSnippet, paragraphSnippet, matchSnippet];
  for (const text of orderedTexts) {
    const hint = inferWordTextLanguageHint(text);
    if (hint !== 'unknown') {
      return hint;
    }
  }

  return 'unknown';
}

function getWordCandidatePositionOrder(candidate: TemplateFieldCandidate): number {
  if (typeof candidate.location?.anchorStart === 'number') {
    return candidate.location.anchorStart;
  }
  if (typeof candidate.location?.cellIndex === 'number') {
    return candidate.location.cellIndex;
  }
  if (typeof candidate.location?.rowIndex === 'number') {
    return candidate.location.rowIndex;
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortWordCandidatesByPosition(candidates: TemplateFieldCandidate[]): TemplateFieldCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftParagraph = typeof left.location?.paragraphIndex === 'number' ? left.location.paragraphIndex : Number.MAX_SAFE_INTEGER;
    const rightParagraph = typeof right.location?.paragraphIndex === 'number' ? right.location.paragraphIndex : Number.MAX_SAFE_INTEGER;
    if (leftParagraph !== rightParagraph) {
      return leftParagraph - rightParagraph;
    }

    const leftOrder = getWordCandidatePositionOrder(left);
    const rightOrder = getWordCandidatePositionOrder(right);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.candidateId.localeCompare(right.candidateId);
  });
}

type WordTableCellBilingualGroup = {
  cellKey: string;
  sourceBlockId: string;
  candidates: TemplateFieldCandidate[];
  leftCandidates: TemplateFieldCandidate[];
  rightCandidates: TemplateFieldCandidate[];
  leftLanguage: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  rightLanguage: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
};

function buildWordTableCellKey(candidate: TemplateFieldCandidate): string | undefined {
  if (
    typeof candidate.location?.tableIndex !== 'number'
    || typeof candidate.location?.rowIndex !== 'number'
    || typeof candidate.location?.cellIndex !== 'number'
  ) {
    return undefined;
  }
  return [
    candidate.location.tableIndex,
    candidate.location.rowIndex,
    candidate.location.cellIndex,
  ].join('|');
}

function inferWordCandidateGroupLanguage(
  candidates: TemplateFieldCandidate[],
  fallback: 'zh' | 'ja'
): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  const explicitHints = candidates
    .map((candidate) => candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate))
    .filter((hint): hint is 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' => Boolean(hint) && hint !== 'unknown');

  if (explicitHints.length > 0) {
    const preferredHint = explicitHints.find((hint) => hint === 'zh' || hint === 'ja');
    return preferredHint || explicitHints[0];
  }

  return fallback;
}

function buildWordTableCellBilingualGroups(candidates: TemplateFieldCandidate[]): WordTableCellBilingualGroup[] {
  const groupsByCell = new Map<string, TemplateFieldCandidate[]>();
  sortWordCandidatesByPosition(candidates).forEach((candidate) => {
    const cellKey = buildWordTableCellKey(candidate);
    if (!cellKey) {
      return;
    }
    const current = groupsByCell.get(cellKey) || [];
    current.push(candidate);
    groupsByCell.set(cellKey, current);
  });

  const bilingualGroups: WordTableCellBilingualGroup[] = [];
  Array.from(groupsByCell.entries()).forEach(([cellKey, cellCandidates]) => {
    const orderedCandidates = sortWordCandidatesByPosition(cellCandidates);
    if (orderedCandidates.length < 2) {
      return;
    }

    const zhCandidates = orderedCandidates.filter(
      (candidate) => (candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate)) === 'zh'
    );
    const jaCandidates = orderedCandidates.filter(
      (candidate) => (candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate)) === 'ja'
    );
    if (zhCandidates.length === 0 || jaCandidates.length === 0) {
      return;
    }

    const leftCandidates = zhCandidates;
    const rightCandidates = jaCandidates;
    const leftLanguage = 'zh';
    const rightLanguage = 'ja';

    bilingualGroups.push({
      cellKey,
      sourceBlockId: String(orderedCandidates[0]?.sourceBlockId || `cell-${cellKey}`),
      candidates: orderedCandidates,
      leftCandidates,
      rightCandidates,
      leftLanguage,
      rightLanguage,
      tableIndex: orderedCandidates[0]?.location?.tableIndex,
      rowIndex: orderedCandidates[0]?.location?.rowIndex,
      cellIndex: orderedCandidates[0]?.location?.cellIndex,
    });
  });

  return bilingualGroups;
}

function attachWordTableCellBilingualRelations(candidateFields: TemplateFieldCandidate[]): void {
  buildWordTableCellBilingualGroups(candidateFields).forEach((group) => {
    const pairCount = Math.min(group.leftCandidates.length, group.rightCandidates.length);
    for (let pairOrdinal = 0; pairOrdinal < pairCount; pairOrdinal += 1) {
      const leftCandidate = group.leftCandidates[pairOrdinal];
      const rightCandidate = group.rightCandidates[pairOrdinal];
      if (!leftCandidate || !rightCandidate) {
        continue;
      }
      if (leftCandidate.languageRelation?.mode !== 'single_language' || rightCandidate.languageRelation?.mode !== 'single_language') {
        continue;
      }

      leftCandidate.languageRelation = {
        mode: 'same_block_mixed_language',
        currentLanguageHint: group.leftLanguage,
        peerBlockId: group.sourceBlockId,
        peerLanguageHint: group.rightLanguage,
        peerCandidateId: rightCandidate.candidateId,
        pairOrdinal,
      };
      rightCandidate.languageRelation = {
        mode: 'same_block_mixed_language',
        currentLanguageHint: group.rightLanguage,
        peerBlockId: group.sourceBlockId,
        peerLanguageHint: group.leftLanguage,
        peerCandidateId: leftCandidate.candidateId,
        pairOrdinal,
      };
    }
  });
}

function attachWordCandidateLanguageRelations(candidateFields: TemplateFieldCandidate[]): TemplateFieldCandidate[] {
  const nextCandidates = candidateFields.map((candidate) => ({
    ...candidate,
    languageRelation: {
      mode: 'single_language' as const,
      currentLanguageHint: candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate),
    },
  }));

  // Table cells may contain zh/ja lines in the same block, so pair them before paragraph logic.
  attachWordTableCellBilingualRelations(nextCandidates);

  const candidatesBySection = new Map<string, TemplateFieldCandidate[]>();
  nextCandidates.forEach((candidate) => {
    if (candidate.languageRelation?.mode !== 'single_language') {
      return;
    }
    const paragraphIndex = candidate.location?.paragraphIndex;
    if (typeof paragraphIndex !== 'number') {
      return;
    }
    const sectionKey = String(candidate.sectionId || candidate.sectionTitle || 'ungrouped');
    const existing = candidatesBySection.get(sectionKey) || [];
    existing.push(candidate);
    candidatesBySection.set(sectionKey, existing);
  });

  candidatesBySection.forEach((sectionCandidates) => {
    const paragraphGroups = Array.from(
      sectionCandidates.reduce((map, candidate) => {
        const paragraphIndex = candidate.location?.paragraphIndex;
        if (typeof paragraphIndex !== 'number') {
          return map;
        }
        const existing = map.get(paragraphIndex) || [];
        existing.push(candidate);
        map.set(paragraphIndex, existing);
        return map;
      }, new Map<number, TemplateFieldCandidate[]>())
    )
      .sort((left, right) => left[0] - right[0])
      .map(([paragraphIndex, paragraphCandidates]) => {
        const sortedCandidates = sortWordCandidatesByPosition(paragraphCandidates);
        const paragraphLanguageHint = sortedCandidates[0]?.languageRelation?.currentLanguageHint
          || getWordCandidateLanguageHint(sortedCandidates[0]);
        return {
          paragraphIndex,
          candidates: sortedCandidates,
          languageHint: paragraphLanguageHint,
          sourceBlockId: String(sortedCandidates[0]?.sourceBlockId || `paragraph-${paragraphIndex}`),
        };
      });

    for (let index = 0; index < paragraphGroups.length - 1; index += 1) {
      const currentGroup = paragraphGroups[index];
      const nextGroup = paragraphGroups[index + 1];
      if (!currentGroup || !nextGroup) {
        continue;
      }

      const currentLang = currentGroup.languageHint;
      const nextLang = nextGroup.languageHint;
      const isBilingualAdjacentPair = (
        Math.abs(nextGroup.paragraphIndex - currentGroup.paragraphIndex) <= 1
        && ((currentLang === 'zh' && nextLang === 'ja') || (currentLang === 'ja' && nextLang === 'zh'))
      );

      if (!isBilingualAdjacentPair) {
        continue;
      }

      const pairCount = Math.min(currentGroup.candidates.length, nextGroup.candidates.length);
      for (let pairOrdinal = 0; pairOrdinal < pairCount; pairOrdinal += 1) {
        const currentCandidate = currentGroup.candidates[pairOrdinal];
        const nextCandidate = nextGroup.candidates[pairOrdinal];
        if (
          !currentCandidate
          || !nextCandidate
          || currentCandidate.languageRelation?.mode !== 'single_language'
          || nextCandidate.languageRelation?.mode !== 'single_language'
        ) {
          continue;
        }

        currentCandidate.languageRelation = {
          mode: 'adjacent_bilingual_block',
          currentLanguageHint: currentLang,
          peerBlockId: nextGroup.sourceBlockId,
          peerLanguageHint: nextLang,
          peerCandidateId: nextCandidate.candidateId,
          pairOrdinal,
        };
        nextCandidate.languageRelation = {
          mode: 'adjacent_bilingual_block',
          currentLanguageHint: nextLang,
          peerBlockId: currentGroup.sourceBlockId,
          peerLanguageHint: currentLang,
          peerCandidateId: currentCandidate.candidateId,
          pairOrdinal,
        };
      }

      index += 1;
    }
  });

  return nextCandidates;
}

function formatCompareLocation(candidate: TemplateCompareResponse['candidateFields'][number]): string {
  const location = candidate.location;
  if (!location) {
    return '未标注';
  }
  const parts = [
    location.blockType ? `块:${location.blockType}` : '',
    location.paragraphIndex !== undefined ? `段落#${location.paragraphIndex}` : '',
    location.tableIndex !== undefined ? `表#${location.tableIndex}` : '',
    location.rowIndex !== undefined ? `行#${location.rowIndex}` : '',
    location.cellIndex !== undefined ? `列#${location.cellIndex}` : '',
    location.contentControlId !== undefined ? `控件#${location.contentControlId}` : '',
    location.anchorStart !== undefined && location.anchorEnd !== undefined
      ? `锚点${location.anchorStart}-${location.anchorEnd}`
      : '',
  ].filter(Boolean);
  return parts.join(' | ') || '未标注';
}

function isMachineGeneratedCompareFieldIdHint(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(String(value || '').trim());
}

function getCompareCandidateAnchorLabel(candidate: TemplateCompareResponse['candidateFields'][number]): string {
  return extractWordParamName(candidate.localAnchorText || candidate.anchorText || '').trim();
}

function getCompareCandidateDisplayName(candidate: TemplateCompareResponse['candidateFields'][number]): string {
  const fieldIdHint = String(candidate.fieldIdHint || '').trim();
  const anchorLabel = getCompareCandidateAnchorLabel(candidate);

  if (fieldIdHint && (!anchorLabel || !isMachineGeneratedCompareFieldIdHint(fieldIdHint))) {
    return fieldIdHint;
  }

  return anchorLabel
    || fieldIdHint
    || candidate.anchorText
    || '候选字段';
}

function compactWordPromptText(value: unknown, maxLength = 160): string {
  const normalized = safeCompareText(value);
  if (!normalized) {
    return '';
  }
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function buildWordCandidatePromptSlot(
  candidate: TemplateCompareResponse['candidateFields'][number],
  siblingCandidates: TemplateCompareResponse['candidateFields'],
  paragraphTextByIndex: Map<number, string>,
): { localAnchorText: string; parameterSlot?: string } {
  const paragraphIndex = candidate.location?.paragraphIndex;
  const paragraphText = typeof paragraphIndex === 'number'
    ? String(paragraphTextByIndex.get(paragraphIndex) || '')
    : '';
  const anchorStart = candidate.location?.anchorStart;
  const anchorEnd = candidate.location?.anchorEnd;
  const rawAnchorText = compactWordPromptText(candidate.anchorText || '无');

  if (!paragraphText || typeof anchorStart !== 'number' || typeof anchorEnd !== 'number') {
    return {
      localAnchorText: rawAnchorText,
      parameterSlot: rawAnchorText === '无' ? undefined : `[参数] ${rawAnchorText}`,
    };
  }

  const sameParagraphCandidates = siblingCandidates
    .filter((item) =>
      item.candidateId !== candidate.candidateId
      && item.location?.paragraphIndex === paragraphIndex
      && typeof item.location?.anchorStart === 'number'
      && typeof item.location?.anchorEnd === 'number'
    )
    .sort((left, right) => (
      Number(left.location?.anchorStart || 0) - Number(right.location?.anchorStart || 0)
    ));

  const promptParts = buildWordParamPromptParts({
    paragraphText,
    start: anchorStart,
    end: anchorEnd,
    siblingRanges: sameParagraphCandidates.map((item) => ({
      start: Number(item.location?.anchorStart),
      end: Number(item.location?.anchorEnd),
    })),
    fallbackAnchorText: candidate.anchorText || rawAnchorText,
  });

  return {
    localAnchorText: compactWordPromptText(promptParts.localAnchorText || rawAnchorText, 48) || rawAnchorText,
    parameterSlot: promptParts.parameterSlot
      ? compactWordPromptText(promptParts.parameterSlot, 120)
      : undefined,
  };
}

const WordCompareCandidateCard: React.FC<{
  candidate: TemplateFieldCandidate;
  onSave: (candidateId: string, patch: Partial<TemplateFieldCandidate>) => void;
  onDelete: (candidateId: string) => void;
}> = ({ candidate, onSave, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(getCompareCandidateDisplayName(candidate));
  const [editSampleValue, setEditSampleValue] = useState(candidate.sampleValue || '');
  const referenceSnippet = String(candidate.matchText || candidate.segmentText || '').trim();

  useEffect(() => {
    setEditName(getCompareCandidateDisplayName(candidate));
    setEditSampleValue(candidate.sampleValue || '');
  }, [candidate]);

  const handleSave = () => {
    onSave(candidate.candidateId, {
      fieldIdHint: editName.trim() || undefined,
      sampleValue: editSampleValue.trim(),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(getCompareCandidateDisplayName(candidate));
    setEditSampleValue(candidate.sampleValue || '');
    setIsEditing(false);
  };

  return (
    <div className="word-compare-candidate-card">
      <div className="word-compare-candidate-row">
        <div className="analysis-source-label">参数名</div>
        <div className="analysis-source-value word-compare-candidate-name">
          {isEditing ? (
            <input
              type="text"
              className="edit-input"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="请输入参数名"
            />
          ) : (
            getCompareCandidateDisplayName(candidate)
          )}
        </div>
      </div>
      <div className="word-compare-candidate-row">
        <div className="analysis-source-label">参考值</div>
        <div className="analysis-source-value word-compare-candidate-value">
          {isEditing ? (
            <input
              type="text"
              className="edit-input"
              value={editSampleValue}
              onChange={(event) => setEditSampleValue(event.target.value)}
              placeholder="请输入样本值"
            />
          ) : (
            candidate.sampleValue || '待补参考值'
          )}
        </div>
      </div>
      {referenceSnippet && (
        <div className="word-compare-candidate-row">
          <div className="analysis-source-label">参考片段</div>
          <div className="analysis-source-value" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {referenceSnippet}
          </div>
        </div>
      )}
      <div className="word-compare-candidate-row">
        <div className="analysis-source-label">锚点</div>
        <div className="analysis-source-value">
          {candidate.anchorText || '未识别锚点'}
        </div>
      </div>
      <div className="suggestion-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
        {isEditing ? (
          <>
            <button type="button" className="confirm-btn" onClick={handleSave}>
              保存
            </button>
            <button type="button" className="cancel-btn" onClick={handleCancel}>
              取消
            </button>
          </>
        ) : (
          <>
            <button type="button" className="dismiss-btn" onClick={() => setIsEditing(true)}>
              编辑
            </button>
            <button type="button" className="dismiss-btn" onClick={() => onDelete(candidate.candidateId)}>
              删除
            </button>
          </>
        )}
      </div>
    </div>
  );
};

function isContractDocumentType(templateType: string): boolean {
  return templateType === 'contract';
}

function getCompareDocumentTypeLabel(templateType: string): string {
  return isContractDocumentType(templateType) ? '合同' : '其他';
}

function normalizeCompareHeadingLanguages(
  languages: CompareHeadingLanguageSelection[]
): CompareHeadingLanguageSelection[] {
  const normalized = Array.from(new Set(
    languages.filter((language): language is CompareHeadingLanguageSelection =>
      language === 'zh' || language === 'ja' || language === 'en'
    )
  ));

  return normalized.length > 0 ? normalized : ['zh'];
}

function getCompareHeadingLanguageSummary(
  languages: CompareHeadingLanguageSelection[]
): string {
  const normalized = normalizeCompareHeadingLanguages(languages);
  const labels: Record<CompareHeadingLanguageSelection, string> = {
    zh: '中文',
    ja: '日语',
    en: '英语',
  };
  return normalized.map((language) => labels[language]).join(' + ');
}

type CompareCandidateSection = {
  sectionKey: string;
  sectionId?: string;
  sectionTitle: string;
  candidates: TemplateCompareResponse['candidateFields'];
  previewCandidates?: TemplateCompareResponse['candidateFields'];
  hiddenCandidateCount?: number;
  isAttachment?: boolean;
};

function buildWordSectionParagraphTextMap(documentIr: DocumentIR): Map<number, string> {
  return new Map(
    documentIr.elements
      .filter((element) => element.type === 'paragraph')
      .map((element) => [Number(element.hostData?.index), String(element.text || '')] as const)
      .filter(([index]) => Number.isFinite(index))
  );
}

function buildWordSectionPromptCandidates(
  documentIr: DocumentIR,
  section: CompareCandidateSection
): WordSectionPromptCandidate[] {
  const paragraphTextByIndex = buildWordSectionParagraphTextMap(documentIr);

  return section.candidates.map((candidate) => {
    const { localAnchorText, parameterSlot } = candidate.parameterSlot
      ? {
          localAnchorText: candidate.localAnchorText || candidate.anchorText || '无',
          parameterSlot: candidate.parameterSlot,
        }
      : buildWordCandidatePromptSlot(
          candidate,
          section.candidates,
          paragraphTextByIndex,
        );
    const hints = inferWordCandidateHints(candidate);
    const isLoopCandidate = isWordLoopCompareCandidate(candidate);
    return {
      candidateId: candidate.candidateId,
      sourceBlockId: candidate.sourceBlockId,
      anchorText: compactWordPromptText(localAnchorText || candidate.localAnchorText || candidate.anchorText || '无'),
      parameterSlot,
      sampleValue: compactWordPromptText(candidate.sampleValue || '无'),
      fieldIdHint: candidate.fieldIdHint || hints.fieldIdHint,
      fieldTypeHint: candidate.fieldTypeHint || hints.fieldTypeHint,
      generationPolicyHint: candidate.generationPolicyHint || hints.generationPolicyHint,
      language: candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate),
      paragraphIndex: candidate.location?.paragraphIndex,
      candidateType: isLoopCandidate ? 'loop_column' : 'variable',
      loopGroupKey: isLoopCandidate && typeof candidate.location?.tableIndex === 'number'
        ? `table-${candidate.location.tableIndex}`
        : undefined,
      tableIndex: candidate.location?.tableIndex,
      rowIndex: candidate.location?.rowIndex,
      cellIndex: candidate.location?.cellIndex,
    };
  });
}

function buildWordSectionCandidateList(documentIr: DocumentIR, section: CompareCandidateSection): string {
  if (section.candidates.length === 0) {
    return '当前章节没有显式候选参数。';
  }

  const paragraphTextByIndex = buildWordSectionParagraphTextMap(documentIr);

  return section.candidates
    .map((candidate, index) => {
      const { localAnchorText, parameterSlot } = candidate.parameterSlot
        ? {
            localAnchorText: candidate.localAnchorText || candidate.anchorText || '无',
            parameterSlot: candidate.parameterSlot,
          }
        : buildWordCandidatePromptSlot(
            candidate,
            section.candidates,
            paragraphTextByIndex,
          );
      const anchorText = compactWordPromptText(localAnchorText || candidate.localAnchorText || candidate.anchorText || '无');
      const sampleValue = compactWordPromptText(candidate.sampleValue || '无');
      const hints = inferWordCandidateHints(candidate);
      return [
        `[候选 ${index + 1}]`,
        `candidateId: ${candidate.candidateId}`,
        `anchorText: ${anchorText}`,
        parameterSlot ? `parameterSlot: ${parameterSlot}` : undefined,
        `sampleValue: ${sampleValue}`,
        candidate.fieldIdHint || hints.fieldIdHint
          ? `fieldIdHint: ${candidate.fieldIdHint || hints.fieldIdHint}`
          : undefined,
        isWordLoopCompareCandidate(candidate)
          ? `candidateType: loop_column(table-${candidate.location?.tableIndex ?? '?'})`
          : 'candidateType: variable',
        candidate.fieldTypeHint || hints.fieldTypeHint
          ? `fieldTypeHint: ${candidate.fieldTypeHint || hints.fieldTypeHint}`
          : undefined,
        candidate.generationPolicyHint || hints.generationPolicyHint
          ? `generationPolicyHint: ${candidate.generationPolicyHint || hints.generationPolicyHint}`
          : undefined,
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

function buildWordSectionBilingualPairs(section: CompareCandidateSection): Array<{
  pairKey: string;
  candidates: [TemplateFieldCandidate, TemplateFieldCandidate];
}> {
  return buildWordSectionBilingualPairsForRecognition(section.candidates);
}

function buildWordSectionParagraphGroups(candidates: TemplateFieldCandidate[]): Array<{
  paragraphIndex: number;
  candidates: TemplateFieldCandidate[];
  languageHint: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  sourceBlockId: string;
}> {
  return Array.from(
    candidates.reduce((map, candidate) => {
      const paragraphIndex = candidate.location?.paragraphIndex;
      if (typeof paragraphIndex !== 'number') {
        return map;
      }
      const existing = map.get(paragraphIndex) || [];
      existing.push(candidate);
      map.set(paragraphIndex, existing);
      return map;
    }, new Map<number, TemplateFieldCandidate[]>())
  )
    .sort((left, right) => left[0] - right[0])
    .map(([paragraphIndex, paragraphCandidates]) => {
      const sortedCandidates = sortWordCandidatesByPosition(paragraphCandidates);
      const paragraphLanguageHint = sortedCandidates[0]?.languageRelation?.currentLanguageHint
        || getWordCandidateLanguageHint(sortedCandidates[0]);
      return {
        paragraphIndex,
        candidates: sortedCandidates,
        languageHint: paragraphLanguageHint,
        sourceBlockId: String(sortedCandidates[0]?.sourceBlockId || `paragraph-${paragraphIndex}`),
      };
    });
}

function isWordAdjacentBilingualParagraphGroup(
  left: {
    paragraphIndex: number;
    languageHint: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  },
  right: {
    paragraphIndex: number;
    languageHint: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  },
): boolean {
  return (
    Math.abs(right.paragraphIndex - left.paragraphIndex) <= 1
    && ((left.languageHint === 'zh' && right.languageHint === 'ja') || (left.languageHint === 'ja' && right.languageHint === 'zh'))
  );
}

type WordLoopDisplayPair = {
  key: string;
  leftCandidates: TemplateFieldCandidate[];
  rightCandidates: TemplateFieldCandidate[];
  leftLanguage: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  rightLanguage: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  cellIndex?: number;
};

function inferWordLoopDisplayLanguage(
  candidates: TemplateFieldCandidate[],
  fallback: 'zh' | 'ja'
): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  const explicitHints = candidates
    .map((candidate) => candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate))
    .filter((hint): hint is 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' => Boolean(hint) && hint !== 'unknown');

  if (explicitHints.length > 0) {
    const preferredHint = explicitHints.find((hint) => hint === 'zh' || hint === 'ja');
    return preferredHint || explicitHints[0];
  }

  return fallback;
}

function buildWordLoopDisplayPairs(loopCandidates: TemplateFieldCandidate[]): WordLoopDisplayPair[] {
  const pairsByCell = new Map<string, TemplateFieldCandidate[]>();

  sortWordCandidatesByPosition(loopCandidates).forEach((candidate) => {
    const key = [
      candidate.location?.tableIndex ?? 'table',
      candidate.location?.rowIndex ?? 'row',
      candidate.location?.cellIndex ?? candidate.candidateId,
    ].join('|');
    const current = pairsByCell.get(key) || [];
    current.push(candidate);
    pairsByCell.set(key, current);
  });

  return Array.from(pairsByCell.entries())
    .sort((left, right) => {
      const leftCellIndex = left[1][0]?.location?.cellIndex ?? Number.MAX_SAFE_INTEGER;
      const rightCellIndex = right[1][0]?.location?.cellIndex ?? Number.MAX_SAFE_INTEGER;
      return leftCellIndex - rightCellIndex;
    })
    .map(([key, slotCandidates]) => {
      const orderedCandidates = [...slotCandidates];
      if (orderedCandidates.length >= 2) {
        const firstCandidate = orderedCandidates[0];
        const secondCandidate = orderedCandidates[1];
        const firstLanguage = firstCandidate ? inferWordLoopDisplayLanguage([firstCandidate], 'zh') : 'unknown';
        const secondLanguage = secondCandidate ? inferWordLoopDisplayLanguage([secondCandidate], 'ja') : 'unknown';

        if (firstLanguage === 'ja' && secondLanguage === 'zh') {
          orderedCandidates[0] = secondCandidate;
          orderedCandidates[1] = firstCandidate;
        }
      }

      const leftCandidates = orderedCandidates[0] ? [orderedCandidates[0]] : [];
      const rightCandidates = orderedCandidates.slice(1);
      const leftLanguage = inferWordLoopDisplayLanguage(leftCandidates, 'zh');
      let rightLanguage = inferWordLoopDisplayLanguage(rightCandidates, 'ja');

      if (rightCandidates.length > 0 && rightLanguage === leftLanguage) {
        rightLanguage = leftLanguage === 'zh' ? 'ja' : 'zh';
      }

      return {
        key,
        leftCandidates,
        rightCandidates,
        leftLanguage,
        rightLanguage,
        cellIndex: slotCandidates[0]?.location?.cellIndex,
      };
    });
}

function buildWordCompareCandidateDisplayGroups(section: CompareCandidateSection): Array<{
  key: string;
  type: 'sentence_pair' | 'cell_pair' | 'single_sentence' | 'loop_group';
  candidates?: TemplateFieldCandidate[];
  leftCandidates?: TemplateFieldCandidate[];
  rightCandidates?: TemplateFieldCandidate[];
  leftLanguage?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  rightLanguage?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
  loopPairs?: WordLoopDisplayPair[];
}> {
  const previewCandidates = Array.isArray(section.previewCandidates) && section.previewCandidates.length > 0
    ? section.previewCandidates
    : section.candidates;

  const loopCandidates = previewCandidates.filter((candidate) => isWordLoopCompareCandidate(candidate));
  const nonLoopCandidates = previewCandidates.filter((candidate) => !isWordLoopCompareCandidate(candidate));
  const groups: Array<{
    key: string;
    type: 'sentence_pair' | 'cell_pair' | 'single_sentence' | 'loop_group';
    candidates?: TemplateFieldCandidate[];
    leftCandidates?: TemplateFieldCandidate[];
    rightCandidates?: TemplateFieldCandidate[];
    leftLanguage?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
    rightLanguage?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
    tableIndex?: number;
    rowIndex?: number;
    cellIndex?: number;
    loopPairs?: WordLoopDisplayPair[];
  }> = [];

  if (loopCandidates.length > 0) {
    const loopGroups = new Map<string, TemplateFieldCandidate[]>();
    loopCandidates.forEach((candidate) => {
      const key = typeof candidate.location?.tableIndex === 'number'
        ? `loop-table:${candidate.location.tableIndex}`
        : `loop-source:${candidate.sourceBlockId || candidate.candidateId}`;
      const current = loopGroups.get(key) || [];
      current.push(candidate);
      loopGroups.set(key, current);
    });

    loopGroups.forEach((groupCandidates, key) => {
      groups.push({
        key,
        type: 'loop_group',
        candidates: sortWordCandidatesByPosition(groupCandidates),
        tableIndex: groupCandidates[0]?.location?.tableIndex,
        loopPairs: buildWordLoopDisplayPairs(groupCandidates),
      });
    });
  }

  if (nonLoopCandidates.length === 0) {
    return groups;
  }

  const usedNonLoopCandidateIds = new Set<string>();
  buildWordTableCellBilingualGroups(nonLoopCandidates).forEach((group) => {
    group.candidates.forEach((candidate) => usedNonLoopCandidateIds.add(candidate.candidateId));
    groups.push({
      key: `cell-pair:${group.cellKey}`,
      type: 'cell_pair',
      leftCandidates: group.leftCandidates,
      rightCandidates: group.rightCandidates,
      leftLanguage: group.leftLanguage,
      rightLanguage: group.rightLanguage,
      tableIndex: group.tableIndex,
      rowIndex: group.rowIndex,
      cellIndex: group.cellIndex,
    });
  });

  const remainingNonLoopCandidates = nonLoopCandidates.filter((candidate) => !usedNonLoopCandidateIds.has(candidate.candidateId));
  if (remainingNonLoopCandidates.length === 0) {
    return groups;
  }

  if (remainingNonLoopCandidates.length <= 1) {
    return [
      ...groups,
      ...remainingNonLoopCandidates.map((candidate) => ({
        key: candidate.candidateId,
        type: 'single_sentence' as const,
        candidates: [candidate],
      })),
    ];
  }

  const paragraphGroups = buildWordSectionParagraphGroups(remainingNonLoopCandidates);
  const handledCandidateIds = new Set<string>();

  for (let index = 0; index < paragraphGroups.length; index += 1) {
    const currentGroup = paragraphGroups[index];
    const nextGroup = paragraphGroups[index + 1];
    if (currentGroup && nextGroup && isWordAdjacentBilingualParagraphGroup(currentGroup, nextGroup)) {
      const orderedGroups = currentGroup.languageHint === 'zh'
        ? [currentGroup, nextGroup]
        : [nextGroup, currentGroup];
      orderedGroups[0].candidates.forEach((candidate) => handledCandidateIds.add(candidate.candidateId));
      orderedGroups[1].candidates.forEach((candidate) => handledCandidateIds.add(candidate.candidateId));
      groups.push({
        key: `sentence-pair:${orderedGroups[0].paragraphIndex}|${orderedGroups[1].paragraphIndex}`,
        type: 'sentence_pair',
        leftCandidates: orderedGroups[0].candidates,
        rightCandidates: orderedGroups[1].candidates,
        leftLanguage: orderedGroups[0].languageHint,
        rightLanguage: orderedGroups[1].languageHint,
      });
      index += 1;
      continue;
    }

    if (currentGroup) {
      currentGroup.candidates.forEach((candidate) => handledCandidateIds.add(candidate.candidateId));
      groups.push({
        key: `sentence-single:${currentGroup.paragraphIndex}`,
        type: 'single_sentence',
        candidates: currentGroup.candidates,
      });
    }
  }

  remainingNonLoopCandidates
    .filter((candidate) => !handledCandidateIds.has(candidate.candidateId))
    .forEach((candidate) => {
      groups.push({
        key: candidate.candidateId,
        type: 'single_sentence',
        candidates: [candidate],
      });
    });

  return groups;
}

function buildWordSectionBilingualPairList(documentIr: DocumentIR, section: CompareCandidateSection): string {
  const sentenceGroups = buildWordSectionParagraphGroups(section.candidates);
  const bilingualGroups: Array<{
    left: typeof sentenceGroups[number];
    right: typeof sentenceGroups[number];
  }> = [];

  for (let index = 0; index < sentenceGroups.length - 1; index += 1) {
    const currentGroup = sentenceGroups[index];
    const nextGroup = sentenceGroups[index + 1];
    if (!currentGroup || !nextGroup || !isWordAdjacentBilingualParagraphGroup(currentGroup, nextGroup)) {
      continue;
    }
    bilingualGroups.push(
      currentGroup.languageHint === 'zh'
        ? { left: currentGroup, right: nextGroup }
        : { left: nextGroup, right: currentGroup }
    );
    index += 1;
  }

  if (bilingualGroups.length === 0) {
    return '未识别到显式双语句子对照组。';
  }

  const paragraphTextByIndex = new Map(
    documentIr.elements
      .filter((element) => element.type === 'paragraph')
      .map((element) => [Number(element.hostData?.index), String(element.text || '')] as const)
      .filter(([index]) => Number.isFinite(index))
  );

  return bilingualGroups
    .map((group, index) => {
      const renderGroupLines = (
        candidates: TemplateFieldCandidate[],
        languageLabel: string,
        paragraphIndex: number,
      ) => {
        const candidateLines = candidates.map((candidate) => {
        const { localAnchorText, parameterSlot } = candidate.parameterSlot
          ? {
              localAnchorText: candidate.localAnchorText || candidate.anchorText || '无',
              parameterSlot: candidate.parameterSlot,
            }
          : buildWordCandidatePromptSlot(
              candidate,
              section.candidates,
              paragraphTextByIndex,
            );
        return [
          `${languageLabel} candidateId: ${candidate.candidateId}`,
          `sourceBlockId: ${candidate.sourceBlockId}`,
          `anchorText: ${compactWordPromptText(localAnchorText || candidate.localAnchorText || candidate.anchorText || '无')}`,
          parameterSlot ? `parameterSlot: ${parameterSlot}` : undefined,
        ].filter(Boolean).join('\n');
      });

        return [
          `${languageLabel} paragraphIndex: ${paragraphIndex}`,
          `${languageLabel} candidateCount: ${candidates.length}`,
          ...candidateLines,
        ].join('\n');
      };

      return [
        `[双语句子对照组 ${index + 1}]`,
        'pairRule: 当前对照组按句子为单位比较，参数顺序不要求一致；同一组内可出现 1比1 或 3比3。',
        renderGroupLines(group.left.candidates, getLanguageHintLabel(group.left.languageHint), group.left.paragraphIndex),
        renderGroupLines(group.right.candidates, getLanguageHintLabel(group.right.languageHint), group.right.paragraphIndex),
      ].join('\n');
    })
    .join('\n\n');
}

function buildWordSectionPromptBilingualGroups(section: CompareCandidateSection): WordSectionPromptBilingualGroup[] {
  return buildWordSectionBilingualPairs(section)
    .map((pair) => {
      const zhCandidateIds = pair.candidates
        .filter((candidate) => (candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate)) === 'zh')
        .map((candidate) => candidate.candidateId);
      const jpCandidateIds = pair.candidates
        .filter((candidate) => (candidate.languageRelation?.currentLanguageHint || getWordCandidateLanguageHint(candidate)) === 'ja')
        .map((candidate) => candidate.candidateId);

      if (zhCandidateIds.length === 0 || jpCandidateIds.length === 0) {
        return undefined;
      }

      return {
        groupKey: `pair:${zhCandidateIds.join(',')}|${jpCandidateIds.join(',')}`,
        pairType: 'candidate_pair' as const,
        zhCandidateIds,
        jpCandidateIds,
      };
    })
    .filter((group): group is WordSectionPromptBilingualGroup => Boolean(group));
}

function buildWordSectionSubset(
  section: CompareCandidateSection,
  candidates: TemplateFieldCandidate[]
): CompareCandidateSection {
  return {
    ...section,
    candidates,
    previewCandidates: candidates,
    hiddenCandidateCount: 0,
  };
}

function mergeWordCandidatesBySlot(candidates: TemplateFieldCandidate[]): TemplateFieldCandidate[] {
  return mergeWordCandidatesBySlotForRecognition(candidates);
}

function isWordLoopCompareCandidate(candidate: TemplateFieldCandidate): boolean {
  return String(candidate.matchReason || '').includes('标准表格列标题');
}

function filterWordPromptBilingualGroupsByCandidates(
  groups: WordSectionPromptBilingualGroup[],
  candidates: TemplateFieldCandidate[]
): WordSectionPromptBilingualGroup[] {
  if (groups.length === 0 || candidates.length === 0) {
    return [];
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.candidateId));
  return groups.filter((group) => {
    const allIds = [...group.zhCandidateIds, ...group.jpCandidateIds];
    return allIds.every((candidateId) => candidateIds.has(candidateId));
  });
}

function normalizeWordSuggestionPathForQualityCheck(value: string): string {
  return value.replace(/[{}]/g, '').trim();
}

function isGenericWordSuggestedName(value: string): boolean {
  return /^(?:d\.)?(?:[A-Za-z_][A-Za-z0-9_]*\[\]\.)?(field\d*|textValue|textField\d*|value\d*|var\d*|param\d*|undefined|null|unknown)$/i
    .test(normalizeWordSuggestionPathForQualityCheck(value));
}

function isValidWordSuggestedPath(value: string): boolean {
  const normalized = normalizeWordSuggestionPathForQualityCheck(value);
  return Boolean(normalized)
    && /^[A-Za-z_][A-Za-z0-9_[\].]*$/.test(normalized)
    && !/[^\x00-\x7F]/.test(normalized);
}

function buildAcceptedWordSuggestionSummaries(
  suggestions: AISuggestion[]
): WordSectionPromptAcceptedSuggestion[] {
  return suggestions.map((suggestion) => ({
    candidateId: String(suggestion.details?.candidateId || ''),
    suggestedName: suggestion.suggestedName,
    type: suggestion.type,
    fieldType: suggestion.details?.fieldType,
    confidence: suggestion.confidence,
  })).filter((item) => item.candidateId && item.suggestedName);
}

function isWordSuggestionHighQuality(
  suggestion: AISuggestion | undefined,
  expectedCandidateId: string
): boolean {
  if (!suggestion) {
    return false;
  }

  if (String(suggestion.details?.candidateId || '').trim() !== expectedCandidateId) {
    return false;
  }

  if (!isValidWordSuggestedPath(suggestion.suggestedName || '')) {
    return false;
  }

  if (isGenericWordSuggestedName(suggestion.suggestedName || '')) {
    return false;
  }

  return suggestion.confidence >= 0.75;
}

function selectBestWordSuggestionForCandidate(
  suggestions: AISuggestion[],
  candidateId: string
): AISuggestion | undefined {
  return suggestions
    .filter((suggestion) => String(suggestion.details?.candidateId || '').trim() === candidateId)
    .sort((left, right) => right.confidence - left.confidence)[0];
}

function appendUniqueCandidateIds(targetQueue: string[], candidateIds: string[]): void {
  candidateIds.forEach((candidateId) => {
    if (!targetQueue.includes(candidateId)) {
      targetQueue.push(candidateId);
    }
  });
}

function takeWordRecognitionBatch(
  options: {
    retryLoopIds: string[];
    unsentLoopIds: string[];
    retryNormalIds: string[];
    unsentNormalIds: string[];
    candidateById: Map<string, TemplateFieldCandidate>;
    acceptedIds: Set<string>;
  }
): TemplateFieldCandidate[] {
  return takeWordRecognitionBatchForRecognition(options);
}

function stripWordBilingualSuggestedNameSuffix(value: string): string {
  return String(value || '')
    .replace(/[{}]/g, '')
    .replace(/_(cn|jp)$/i, '')
    .trim();
}

function sortWordPairedSuggestions(
  suggestions: AISuggestion[],
  candidateById: Map<string, TemplateFieldCandidate>
): AISuggestion[] {
  const getOrder = (suggestion: AISuggestion): number => {
    const candidateId = suggestion.details?.candidateId;
    const languageHint = candidateId
      ? candidateById.get(candidateId)?.languageRelation?.currentLanguageHint
      : undefined;
    if (languageHint === 'zh') {
      return 0;
    }
    if (languageHint === 'ja') {
      return 1;
    }

    const normalizedName = String(suggestion.suggestedName || '').replace(/[{}]/g, '');
    if (/_cn$/i.test(normalizedName)) {
      return 0;
    }
    if (/_jp$/i.test(normalizedName)) {
      return 1;
    }

    return 9;
  };

  return [...suggestions].sort((left, right) => getOrder(left) - getOrder(right));
}

function buildWordSectionSuggestionDisplayGroups(
  section: CompareCandidateSection,
  suggestions: AISuggestion[]
): Array<{
  key: string;
  type: 'pair' | 'single';
  suggestions: AISuggestion[];
  pairPath?: string;
}> {
  if (suggestions.length <= 1) {
    return suggestions.map((suggestion) => ({
      key: suggestion.id,
      type: 'single' as const,
      suggestions: [suggestion],
    }));
  }

  const candidateById = new Map(section.candidates.map((candidate) => [candidate.candidateId, candidate] as const));
  const pairCandidateLookup = new Map<string, string>();
  buildWordSectionBilingualPairs(section).forEach((pair) => {
    const [left, right] = pair.candidates;
    pairCandidateLookup.set(left.candidateId, right.candidateId);
    pairCandidateLookup.set(right.candidateId, left.candidateId);
  });

  const suggestionByCandidateId = new Map<string, AISuggestion>();
  suggestions.forEach((suggestion) => {
    const candidateId = suggestion.details?.candidateId;
    if (candidateId && !suggestionByCandidateId.has(candidateId)) {
      suggestionByCandidateId.set(candidateId, suggestion);
    }
  });

  const seenSuggestionIds = new Set<string>();
  const groups: Array<{
    key: string;
    type: 'pair' | 'single';
    suggestions: AISuggestion[];
    pairPath?: string;
  }> = [];

  suggestions.forEach((suggestion) => {
    if (seenSuggestionIds.has(suggestion.id)) {
      return;
    }

    const candidateId = suggestion.details?.candidateId;
    const peerCandidateId = candidateId ? pairCandidateLookup.get(candidateId) : undefined;
    const peerSuggestion = peerCandidateId ? suggestionByCandidateId.get(peerCandidateId) : undefined;

    if (peerSuggestion && !seenSuggestionIds.has(peerSuggestion.id)) {
      const orderedSuggestions = sortWordPairedSuggestions([suggestion, peerSuggestion], candidateById);
      orderedSuggestions.forEach((item) => seenSuggestionIds.add(item.id));
      groups.push({
        key: `pair:${orderedSuggestions.map((item) => item.id).sort().join('|')}`,
        type: 'pair',
        suggestions: orderedSuggestions,
        pairPath: stripWordBilingualSuggestedNameSuffix(orderedSuggestions[0]?.suggestedName || ''),
      });
      return;
    }

    const basePath = stripWordBilingualSuggestedNameSuffix(suggestion.suggestedName);
    const fallbackPeer = suggestions.find((candidateSuggestion) =>
      candidateSuggestion.id !== suggestion.id
      && !seenSuggestionIds.has(candidateSuggestion.id)
      && /_(cn|jp)$/i.test(String(candidateSuggestion.suggestedName || '').replace(/[{}]/g, ''))
      && stripWordBilingualSuggestedNameSuffix(candidateSuggestion.suggestedName) === basePath
    );

    if (fallbackPeer) {
      const orderedSuggestions = sortWordPairedSuggestions([suggestion, fallbackPeer], candidateById);
      orderedSuggestions.forEach((item) => seenSuggestionIds.add(item.id));
      groups.push({
        key: `pair:${orderedSuggestions.map((item) => item.id).sort().join('|')}`,
        type: 'pair',
        suggestions: orderedSuggestions,
        pairPath: basePath,
      });
      return;
    }

    seenSuggestionIds.add(suggestion.id);
    groups.push({
      key: suggestion.id,
      type: 'single',
      suggestions: [suggestion],
    });
  });

  return groups;
}

function buildWordSectionExcerpt(
  documentIr: DocumentIR,
  section: CompareCandidateSection,
  detectedSection?: WordDetectedSection
): string {
  const paragraphLines = documentIr.elements
    .filter((element) => {
      if (element.type !== 'paragraph') {
        return false;
      }
      const paragraphIndex = Number(element.hostData?.index);
      if (!Number.isFinite(paragraphIndex)) {
        return false;
      }
      if (detectedSection) {
        return paragraphIndex >= detectedSection.startParagraphIndex && paragraphIndex <= detectedSection.endParagraphIndex;
      }
      return section.candidates.some((candidate) => candidate.location?.paragraphIndex === paragraphIndex);
    })
    .map((element) => String(element.text || '').trim())
    .filter(Boolean)
    .slice(0, 12);

  if (paragraphLines.length > 0) {
    return paragraphLines.join('\n');
  }

  return section.candidates
    .map((candidate) => [candidate.anchorText, candidate.segmentText, candidate.sampleValue].filter(Boolean).join(' | '))
    .filter(Boolean)
    .slice(0, 10)
    .join('\n') || section.sectionTitle;
}

function buildWordSectionDocumentIR(
  documentIr: DocumentIR,
  section: CompareCandidateSection,
  detectedSection?: WordDetectedSection
): DocumentIR {
  const sourceBlockIds = new Set(section.candidates.map((candidate) => candidate.sourceBlockId).filter(Boolean));
  const paragraphIndexes = new Set(
    section.candidates
      .map((candidate) => candidate.location?.paragraphIndex)
      .filter((value): value is number => typeof value === 'number')
  );

  const elements = documentIr.elements.filter((element) => {
    if (sourceBlockIds.has(element.id)) {
      return true;
    }

    if (element.type === 'paragraph') {
      const paragraphIndex = Number(element.hostData?.index);
      if (!Number.isFinite(paragraphIndex)) {
        return false;
      }
      if (detectedSection) {
        return paragraphIndex >= detectedSection.startParagraphIndex && paragraphIndex <= detectedSection.endParagraphIndex;
      }
      return paragraphIndexes.has(paragraphIndex);
    }

    if (element.type === 'cell') {
      return sourceBlockIds.has(element.id);
    }

    return false;
  });

  const paragraphCount = elements.filter((element) => element.type === 'paragraph').length;
  const tableCount = elements.filter((element) => element.type === 'table').length;
  const cellCount = elements.filter((element) => element.type === 'cell').length;

  return {
    ...documentIr,
    elements,
    anchors: documentIr.anchors,
    stats: {
      ...documentIr.stats,
      paragraphCount,
      tableCount,
      cellCount,
    },
  };
}

function buildWordSectionDocumentContent(
  documentIr: DocumentIR,
  section: CompareCandidateSection,
  detectedSection?: WordDetectedSection
): string {
  const sectionDocumentIr = buildWordSectionDocumentIR(documentIr, section, detectedSection);
  const sectionTexts = sectionDocumentIr.elements
    .map((element) => String(element.text || '').trim())
    .filter(Boolean)
    .slice(0, 40);

  const sampleTexts = section.candidates
    .map((candidate) => {
      const matchText = String(candidate.matchText || '').trim();
      if (matchText) {
        return matchText;
      }

      const sampleValue = String(candidate.sampleValue || '').trim();
      const anchorText = String(candidate.anchorText || '').trim();
      if (sampleValue && anchorText) {
        return `${anchorText}：${sampleValue}`;
      }

      return '';
    })
    .filter(Boolean);
  const uniqueSampleTexts = Array.from(new Set(sampleTexts)).slice(0, 20);

  const combinedTexts: string[] = [];

  if (sectionTexts.length > 0) {
    combinedTexts.push('【模板段落】', ...sectionTexts);
  }

  if (uniqueSampleTexts.length > 0) {
    if (combinedTexts.length > 0) combinedTexts.push('');
    combinedTexts.push('【真实文档段落（辅助语境）】', ...uniqueSampleTexts);
  }

  if (combinedTexts.length > 0) {
    return combinedTexts.join('\n');
  }

  return buildWordSectionExcerpt(documentIr, section, detectedSection);
}

function hydrateWordSectionSuggestions(
  documentIr: DocumentIR,
  section: CompareCandidateSection,
  excerpt: string,
  suggestions: AISuggestion[]
): AISuggestion[] {
  const sectionScopedSuggestions = suggestions.map((suggestion, index) => ({
    ...suggestion,
    id: `${section.sectionKey}-${suggestion.id || index + 1}`,
    context: suggestion.context || excerpt,
    details: {
      ...suggestion.details,
      source: suggestion.details?.source || 'ai',
      chapter: section.sectionTitle,
    },
  }));

  return attachCompareCandidateAnchors(
    documentIr,
    section,
    enrichWordSuggestionAnchors(documentIr, sectionScopedSuggestions)
  );
}

function extractSuggestionFieldLeaf(suggestedName: string): string {
  return String(suggestedName || '')
    .replace(/[{}]/g, '')
    .replace(/^d\./, '')
    .replace(/\[(?:\d+)?\]/g, '')
    .split('.')
    .map((segment) => segment.replace(/[^A-Za-z0-9_]/g, '').toLowerCase())
    .filter(Boolean)
    .pop() || '';
}

function extractSuggestionPathTokens(suggestedName: string): string[] {
  return String(suggestedName || '')
    .replace(/[{}]/g, '')
    .replace(/^d\./, '')
    .replace(/\[(?:\d+)?\]/g, '')
    .split('.')
    .map((segment) => segment.replace(/[^A-Za-z0-9_]/g, '').toLowerCase())
    .filter(Boolean);
}

function splitWordIdentifierTokens(value: string): string[] {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/g)
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length >= 2);
}

function buildWordAnchorFromCompareCandidate(
  candidate: TemplateFieldCandidate,
  paragraphTextByIndex: Map<number, string>,
): NonNullable<AISuggestion['details']>['wordAnchor'] | undefined {
  const location = candidate.location;
  if (!location) {
    return undefined;
  }

  if (typeof location.contentControlId === 'number') {
    return {
      type: 'content-control',
      contentControlId: location.contentControlId,
    };
  }

  if (
    typeof location.tableIndex === 'number'
    && typeof location.rowIndex === 'number'
    && typeof location.cellIndex === 'number'
  ) {
    return {
      type: 'table-cell',
      tableIndex: location.tableIndex,
      rowIndex: location.rowIndex,
      cellIndex: location.cellIndex,
    };
  }

  if (
    typeof location.paragraphIndex === 'number'
    && typeof location.anchorStart === 'number'
    && typeof location.anchorEnd === 'number'
  ) {
    return {
      type: 'text-range',
      paragraphIndex: location.paragraphIndex,
      start: location.anchorStart,
      end: location.anchorEnd,
      paragraphText: paragraphTextByIndex.get(location.paragraphIndex) || '',
    };
  }

  return undefined;
}

function scoreCompareCandidateForSuggestion(
  suggestion: AISuggestion,
  candidate: TemplateFieldCandidate,
): number {
  const candidateHints = inferWordCandidateHints(candidate);
  const candidateTexts = [
    candidate.anchorText,
    extractWordParamName(candidate.anchorText || ''),
    candidate.sampleValue,
    candidate.matchText,
    candidate.segmentText,
    candidate.fieldIdHint,
    candidateHints.fieldIdHint,
  ]
    .map((value) => normalizeCompareLookupText(value))
    .filter(Boolean);
  const suggestionTexts = [
    suggestion.originalText,
    suggestion.elementPath,
    suggestion.context,
    suggestion.details?.context,
    suggestion.details?.beforeBlank,
    suggestion.details?.afterBlank,
  ]
    .map((value) => normalizeCompareLookupText(value))
    .filter(Boolean);

  let score = 0;
  suggestionTexts.forEach((text) => {
    candidateTexts.forEach((candidateText) => {
      if (!text || !candidateText) {
        return;
      }
      if (text === candidateText) {
        score += 120;
        return;
      }
      if (text.includes(candidateText) || candidateText.includes(text)) {
        score += 48;
      }
    });
  });

  if (suggestion.details?.candidateId && suggestion.details.candidateId === candidate.candidateId) {
    score += 1000;
  }

  const suggestionFieldLeaf = extractSuggestionFieldLeaf(suggestion.suggestedName);
  const candidateFieldLeaf = String(candidate.fieldIdHint || candidateHints.fieldIdHint || '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toLowerCase();
  if (suggestionFieldLeaf && candidateFieldLeaf && suggestionFieldLeaf === candidateFieldLeaf) {
    score += 80;
  }

  const suggestionPathTokens = extractSuggestionPathTokens(suggestion.suggestedName)
    .flatMap((token) => splitWordIdentifierTokens(token));
  const candidateFieldTokens = splitWordIdentifierTokens(candidate.fieldIdHint || candidateHints.fieldIdHint || '');
  if (suggestionPathTokens.length > 0 && candidateFieldTokens.length > 0) {
    const overlapCount = candidateFieldTokens.filter((token) => suggestionPathTokens.includes(token)).length;
    score += Math.min(40, overlapCount * 18);
  }

  if (
    candidate.sectionTitle
    && suggestion.details?.chapter
    && normalizeCompareLookupText(candidate.sectionTitle) === normalizeCompareLookupText(suggestion.details.chapter)
  ) {
    score += 12;
  }

  return score;
}

function attachCompareCandidateAnchors(
  documentIr: DocumentIR,
  section: CompareCandidateSection,
  suggestions: AISuggestion[],
): AISuggestion[] {
  if (section.candidates.length === 0 || suggestions.length === 0) {
    return suggestions;
  }

  const paragraphTextByIndex = new Map(
    documentIr.elements
      .filter((element) => element.type === 'paragraph')
      .map((element) => [Number(element.hostData?.index), String(element.text || '')] as const)
      .filter(([index]) => Number.isFinite(index))
  );
  const candidateById = new Map(section.candidates.map((candidate) => [candidate.candidateId, candidate] as const));
  const unusedCandidateIndexes = new Set(section.candidates.map((_, index) => index));

  return suggestions.map((suggestion, suggestionIndex) => {
    const explicitCandidateId = String(suggestion.details?.candidateId || '').trim();
    if (explicitCandidateId) {
      const matchedCandidate = candidateById.get(explicitCandidateId);
      if (matchedCandidate) {
        const wordAnchor = buildWordAnchorFromCompareCandidate(matchedCandidate, paragraphTextByIndex);
        if (wordAnchor) {
          const matchedCandidateIndex = section.candidates.findIndex((candidate) => candidate.candidateId === explicitCandidateId);
          if (matchedCandidateIndex >= 0) {
            unusedCandidateIndexes.delete(matchedCandidateIndex);
          }
          return {
            ...suggestion,
            underlineInfo: suggestion.underlineInfo || (
              wordAnchor.type === 'text-range'
                ? {
                    paragraphIndex: wordAnchor.paragraphIndex,
                    position: { start: wordAnchor.start || 0, end: wordAnchor.end || 0 },
                    paragraphText: wordAnchor.paragraphText,
                  }
                : undefined
            ),
            details: {
              ...suggestion.details,
              candidateId: explicitCandidateId,
              peerCandidateId: matchedCandidate.languageRelation?.peerCandidateId,
              currentLanguageHint: matchedCandidate.languageRelation?.currentLanguageHint,
              pairOrdinal: matchedCandidate.languageRelation?.pairOrdinal,
              wordAnchor,
            },
          };
        }
      }
    }

    if (suggestion.details?.wordAnchor) {
      return suggestion;
    }

    let matchedCandidateIndex = -1;
    let matchedScore = -1;

    unusedCandidateIndexes.forEach((candidateIndex) => {
      const candidate = section.candidates[candidateIndex];
      const score = scoreCompareCandidateForSuggestion(suggestion, candidate);
      if (score > matchedScore) {
        matchedScore = score;
        matchedCandidateIndex = candidateIndex;
      }
    });

    if (matchedScore <= 0 && section.candidates.length === suggestions.length && unusedCandidateIndexes.has(suggestionIndex)) {
      matchedCandidateIndex = suggestionIndex;
    }

    if (matchedCandidateIndex < 0) {
      return suggestion;
    }

    const matchedCandidate = section.candidates[matchedCandidateIndex];
    const wordAnchor = buildWordAnchorFromCompareCandidate(matchedCandidate, paragraphTextByIndex);
    if (!wordAnchor) {
      return suggestion;
    }

    unusedCandidateIndexes.delete(matchedCandidateIndex);

    return {
      ...suggestion,
      underlineInfo: suggestion.underlineInfo || (
        wordAnchor.type === 'text-range'
          ? {
              paragraphIndex: wordAnchor.paragraphIndex,
              position: { start: wordAnchor.start || 0, end: wordAnchor.end || 0 },
              paragraphText: wordAnchor.paragraphText,
            }
          : undefined
      ),
      details: {
        ...suggestion.details,
        candidateId: suggestion.details?.candidateId || matchedCandidate.candidateId,
        peerCandidateId: matchedCandidate.languageRelation?.peerCandidateId,
        currentLanguageHint: matchedCandidate.languageRelation?.currentLanguageHint,
        pairOrdinal: matchedCandidate.languageRelation?.pairOrdinal,
        wordAnchor,
      },
    };
  });
}

function dedupeWordSectionSuggestions(suggestions: AISuggestion[]): AISuggestion[] {
  const deduped = new Map<string, AISuggestion>();

  suggestions.forEach((suggestion) => {
    const key = [
      suggestion.type,
      suggestion.suggestedName,
      suggestion.elementPath,
      suggestion.originalText,
      suggestion.details?.chapter,
    ].map((value) => String(value || '')).join('|');
    const existing = deduped.get(key);
    if (!existing || suggestion.confidence > existing.confidence) {
      deduped.set(key, suggestion);
    }
  });

  return Array.from(deduped.values());
}

function buildCompareDebugText(
  result: TemplateCompareResponse,
  debugContext?: {
    underlineCount?: number;
    underlineCharCount?: number;
    underlineSpaceCount?: number;
    tableCellCount?: number;
    paragraphCount?: number;
    underlines?: CompareUnderlineRange[];
  }
): string {
  const buildUnderlineSnippet = (underline: CompareUnderlineRange): string => {
    const sourceText = underline.paragraphText || '';
    if (!sourceText) {
      return '无上下文';
    }
    const snippetStart = Math.max(0, underline.position.start - 12);
    const snippetEnd = Math.min(sourceText.length, underline.position.end + 12);
    return sourceText.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim() || '无上下文';
  };

  const buildUnderlineDiagnostics = (): string => {
    const underlines = debugContext?.underlines || [];
    if (underlines.length === 0) {
      return '本次未记录原始下划线锚点。';
    }

    const candidateLines = underlines.slice(0, 30).map((underline, index) => {
      const matchedCandidates = result.candidateFields.filter((candidate) => {
        const paragraphIndex = candidate.location?.paragraphIndex;
        const anchorStart = candidate.location?.anchorStart;
        const anchorEnd = candidate.location?.anchorEnd;
        if (
          paragraphIndex !== underline.paragraphIndex
          || typeof anchorStart !== 'number'
          || typeof anchorEnd !== 'number'
        ) {
          return false;
        }
        return Math.max(anchorStart, underline.position.start) <= Math.min(anchorEnd, underline.position.end);
      });

      const location = `段落#${underline.paragraphIndex} | 锚点${underline.position.start}-${underline.position.end}`;
      const underlineMeta = `${underline.underlineType || 'unknown'} | ${JSON.stringify(underline.text)}`;
      const snippet = buildUnderlineSnippet(underline);
      if (matchedCandidates.length === 0) {
        return `${index + 1}. ${location} | ${underlineMeta} | 未进入候选池 | 片段: ${snippet}`;
      }

      return `${index + 1}. ${location} | ${underlineMeta} | 命中候选: ${matchedCandidates
        .map((candidate) => `${getCompareCandidateDisplayName(candidate)}(${formatCompareLocation(candidate)})`)
        .join(' ; ')} | 片段: ${snippet}`;
    });

    const unmatchedCount = underlines.filter((underline) => !result.candidateFields.some((candidate) => {
      const paragraphIndex = candidate.location?.paragraphIndex;
      const anchorStart = candidate.location?.anchorStart;
      const anchorEnd = candidate.location?.anchorEnd;
      if (
        paragraphIndex !== underline.paragraphIndex
        || typeof anchorStart !== 'number'
        || typeof anchorEnd !== 'number'
      ) {
        return false;
      }
      return Math.max(anchorStart, underline.position.start) <= Math.min(anchorEnd, underline.position.end);
    })).length;

    return [
      `共记录 ${underlines.length} 个 underline 锚点，其中未进入候选池 ${unmatchedCount} 个。`,
      ...candidateLines,
      underlines.length > 30 ? `... 其余 ${underlines.length - 30} 个锚点已省略` : undefined,
    ].filter(Boolean).join('\n');
  };

  const buildSampleValueDiagnostics = (): string => {
    if (result.candidateFields.length === 0) {
      return '本次没有候选参数。';
    }

    return result.candidateFields
      .slice(0, 20)
      .map((candidate, index) => [
        `${index + 1}. ${getCompareCandidateDisplayName(candidate)}`,
        `锚点: ${candidate.anchorText || '无锚点'}`,
        `参考值: ${candidate.sampleValue || '待补参考值'}`,
        `参考片段: ${candidate.matchText || candidate.segmentText || '无参考片段'}`,
        `位置: ${formatCompareLocation(candidate)}`,
      ].join(' | '))
      .join('\n');
  };

  return [
    '【参数查询结果】',
    `workflowId: ${result.workflowId}`,
    `compareId: ${result.compareId}`,
    `候选字段: ${result.compareSummary.candidateCount}`,
    `章节数: ${result.compareSummary.sectionCount}`,
    debugContext ? `下划线锚点: ${debugContext.underlineCount || 0}（字符 ${debugContext.underlineCharCount || 0} / 空格 ${debugContext.underlineSpaceCount || 0}）` : undefined,
    debugContext ? `段落数: ${debugContext.paragraphCount || 0} | 表格单元格数: ${debugContext.tableCellCount || 0}` : undefined,
    '',
    '【候选池预览】',
    result.candidateFields
      .slice(0, 10)
      .map((candidate) =>
        `${candidate.candidateId} | ${candidate.fieldIdHint || inferWordCandidateHints(candidate).fieldIdHint || 'unknown'} | ${candidate.fieldTypeHint || inferWordCandidateHints(candidate).fieldTypeHint || 'text'} | ${candidate.anchorText || '无锚点'} | ${candidate.sampleValue || '无样本值'} | ${formatCompareLocation(candidate)} | ${getCompareLanguageRelationLabel(candidate)} | ${candidate.matchReason || '无命中说明'}`
      )
      .join('\n') || '无',
    '',
    '【查询诊断】',
    debugContext
      ? `下划线锚点已进入前端规则检测；若候选数明显少于下划线锚点数，通常是空格区域未通过 underline 校验、冒号规则被同段下划线抑制，或同位置候选被去重。`
      : '缓存结果未附带本次查询的原始下划线统计。',
    '',
    '【下划线锚点对照】',
    buildUnderlineDiagnostics(),
    '',
    '【参考值提取预览】',
    buildSampleValueDiagnostics(),
  ].join('\n');
}

function rebuildCompareSummary(
  currentSummary: TemplateCompareResponse['compareSummary'],
  candidateFields: TemplateFieldCandidate[],
): TemplateCompareResponse['compareSummary'] {
  const sectionOrder = new Map(currentSummary.sections.map((section, index) => [section.sectionId, index]));
  const sectionMap = new Map<string, TemplateCompareResponse['compareSummary']['sections'][number]>();

  candidateFields.forEach((candidate) => {
    const sectionId = candidate.sectionId || `__ungrouped__${candidate.sourceBlockId}`;
    const sectionTitle = candidate.sectionTitle || '未归类章节';
    const currentSection = sectionMap.get(sectionId) || {
      sectionId,
      sectionTitle,
      candidateCount: 0,
      matchedCandidateCount: 0,
      unmatchedCandidateCount: 0,
      highConfidenceCandidateCount: 0,
      compareStatus: 'attention' as const,
      compareMode: 'structure_only' as const,
      looseMatchScore: 0,
      topAnchors: [],
      samplePreview: undefined,
    };

    currentSection.candidateCount += 1;
    if (candidate.matchText) {
      currentSection.matchedCandidateCount += 1;
      currentSection.samplePreview = currentSection.samplePreview || candidate.matchText;
    } else {
      currentSection.unmatchedCandidateCount += 1;
    }
    if ((candidate.confidence || 0) >= 0.85) {
      currentSection.highConfidenceCandidateCount += 1;
    }
    if (candidate.compareMode === 'section_loose_compare') {
      currentSection.compareMode = 'section_loose_compare';
    } else if (
      candidate.compareMode === 'global_probe_fallback'
      && currentSection.compareMode !== 'section_loose_compare'
    ) {
      currentSection.compareMode = 'global_probe_fallback';
    }
    currentSection.looseMatchScore = Math.max(currentSection.looseMatchScore, candidate.sectionMatchScore || 0);
    if (candidate.anchorText && !currentSection.topAnchors.includes(candidate.anchorText)) {
      currentSection.topAnchors = [...currentSection.topAnchors, candidate.anchorText].slice(0, 5);
    }
    sectionMap.set(sectionId, currentSection);
  });

  const sections: TemplateCompareResponse['compareSummary']['sections'] = Array.from(sectionMap.values())
    .map((section) => {
      const compareStatus: TemplateCompareResponse['compareSummary']['sections'][number]['compareStatus'] = section.matchedCandidateCount === 0
        ? 'attention'
        : (section.matchedCandidateCount === section.candidateCount ? 'aligned' : 'partial');
      return {
        ...section,
        compareStatus,
      };
    })
    .sort((left, right) => {
      const leftOrder = sectionOrder.get(left.sectionId);
      const rightOrder = sectionOrder.get(right.sectionId);
      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }
      if (leftOrder !== undefined) {
        return -1;
      }
      if (rightOrder !== undefined) {
        return 1;
      }
      return left.sectionTitle.localeCompare(right.sectionTitle, 'zh-Hans-CN');
    });

  return {
    ...currentSummary,
    candidateCount: candidateFields.length,
    sectionCount: sections.length,
    sections,
  };
}

function safeCompareText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeCompareLookupText(value: unknown): string {
  return safeCompareText(value)
    .toLowerCase()
    .replace(/[（）()【】\[\]]/g, '')
    .replace(/\s+/g, '');
}

function buildTableAnchorParagraphMap(
  ooxml: string,
  paragraphs: CompareParagraph[],
): Map<number, number> {
  const anchors = new Map<number, number>();
  if (!ooxml.trim()) {
    return anchors;
  }

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(ooxml, 'application/xml');
    const parserError = xml.getElementsByTagName('parsererror')[0];
    if (parserError) {
      return anchors;
    }

    const body = Array.from(xml.getElementsByTagName('*')).find((node) => node.localName === 'body');
    if (!body) {
      return anchors;
    }

    const normalizedParagraphs = paragraphs
      .filter((paragraph) => safeCompareText(paragraph.text))
      .sort((left, right) => left.index - right.index);
    let paragraphCursor = 0;
    let lastMatchedParagraphIndex: number | undefined;
    let tableIndex = 0;

    Array.from(body.childNodes).forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const element = node as Element;
      if (element.localName === 'p') {
        const paragraphText = safeCompareText(element.textContent || '');
        if (!paragraphText) {
          return;
        }

        const normalizedXmlText = normalizeCompareLookupText(paragraphText);
        if (!normalizedXmlText) {
          return;
        }

        for (let index = paragraphCursor; index < normalizedParagraphs.length; index += 1) {
          const candidate = normalizedParagraphs[index];
          const normalizedCandidate = normalizeCompareLookupText(candidate.text);
          if (!normalizedCandidate) {
            continue;
          }
          if (
            normalizedCandidate === normalizedXmlText
            || normalizedCandidate.includes(normalizedXmlText)
            || normalizedXmlText.includes(normalizedCandidate)
          ) {
            lastMatchedParagraphIndex = candidate.index;
            paragraphCursor = index + 1;
            break;
          }
        }
        return;
      }

      if (element.localName === 'tbl') {
        if (lastMatchedParagraphIndex !== undefined) {
          anchors.set(tableIndex, lastMatchedParagraphIndex);
        }
        tableIndex += 1;
      }
    });
  } catch {
    return anchors;
  }

  return anchors;
}

function getFrontendQueryCandidateConfidence(
  sourceType: 'underline' | 'label-only' | 'table-cell',
  underlineType?: string,
): number {
  if (sourceType === 'table-cell') {
    if (underlineType === 'table-loop-column') {
      return 0.88;
    }
    if (underlineType === 'table-cell-top-label') {
      return 0.8;
    }
    if (underlineType === 'table-cell-right-label') {
      return 0.72;
    }
    return 0.84;
  }
  if (sourceType === 'label-only' && underlineType === 'label-gap') {
    return 0.82;
  }
  return sourceType === 'underline' ? 0.82 : 0.76;
}

function getFrontendQueryMatchReason(
  sourceType: 'underline' | 'label-only' | 'table-cell',
  underlineType?: string,
): string {
  if (sourceType === 'table-cell') {
    if (underlineType === 'table-loop-column') {
      return '前端表格规则: 标准表格列标题';
    }
    if (underlineType === 'table-cell-top-label') {
      return '前端表格规则: 上方标题映射空白单元格';
    }
    if (underlineType === 'table-cell-right-label') {
      return '前端表格规则: 左侧缺失时取右侧标签';
    }
    return '前端表格规则: 空白单元格优先取左侧标签';
  }
  if (sourceType === 'label-only' && underlineType === 'label-gap') {
    return '前端下划线规则: 标签后下划线或空白占位';
  }
  return sourceType === 'underline'
    ? '前端下划线规则: 下划线或空格占位'
    : '前端冒号规则: 冒号后空白占位';
}

function isDetectedHeadingParagraph(
  paragraphIndex: number,
  detectedSections: WordDetectedSection[],
): boolean {
  return detectedSections.some((section) =>
    section.headingParagraphIndices.includes(paragraphIndex)
    || section.startParagraphIndex === paragraphIndex
  );
}

function buildFrontendCompareResult(args: {
  templateType: string;
  headingLanguages: CompareHeadingLanguageSelection[];
  paragraphs: CompareParagraph[];
  underlines: CompareUnderlineRange[];
  tableCells: CompareTableCellInfo[];
  sampleText: string;
  tableAnchorParagraphMap: Map<number, number>;
}): TemplateCompareResponse {
  const {
    templateType,
    paragraphs,
    underlines,
    tableCells,
    sampleText,
    tableAnchorParagraphMap,
  } = args;

  const nonEmptyParagraphs = paragraphs.filter((paragraph) => safeCompareText(paragraph.text));
  const detectedSections = deriveWordSectionsFromParagraphs(
    nonEmptyParagraphs.map((paragraph) => ({
      id: paragraph.id,
      text: paragraph.text,
      paragraphIndex: paragraph.index,
      format: paragraph.format,
    }))
  );

  const detectedParams = detectWordParameterChecks({
    templateType,
    paragraphs: nonEmptyParagraphs.map((paragraph) => ({
      id: paragraph.id,
      index: paragraph.index,
      text: paragraph.text,
      format: paragraph.format,
    })),
    underlines: underlines.map((underline) => ({
      text: underline.text,
      underlineType: underline.underlineType,
      paragraphIndex: underline.paragraphIndex,
      paragraphText: underline.paragraphText,
      position: underline.position,
    })),
    tableCells,
    sampleText,
    includeLabelOnly: true,
  }).filter((param) => {
    if (param.sourceType !== 'label-only') {
      return true;
    }
    if (param.underlineType === 'label-gap') {
      return true;
    }
    return !isDetectedHeadingParagraph(param.paragraphIndex, detectedSections);
  });

  const candidateFields = attachWordCandidateLanguageRelations(detectedParams.map((param, index) => {
    const targetParagraphIndex = param.sourceType === 'table-cell' && param.tableIndex !== undefined
      ? tableAnchorParagraphMap.get(param.tableIndex)
      : param.paragraphIndex;
    const matchedSection = typeof targetParagraphIndex === 'number'
      ? detectedSections.find((section) =>
          targetParagraphIndex >= section.startParagraphIndex && targetParagraphIndex <= section.endParagraphIndex
        )
      : undefined;

    const fallbackSectionId = param.sourceType === 'table-cell' && param.tableIndex !== undefined
      ? `table-${param.tableIndex}`
      : (targetParagraphIndex !== undefined && targetParagraphIndex >= 0
        ? `paragraph-${targetParagraphIndex}`
        : `ungrouped-${index}`);
    const fallbackSectionTitle = param.sourceType === 'table-cell' && param.tableIndex !== undefined
      ? `表格 ${param.tableIndex + 1}`
      : (typeof targetParagraphIndex === 'number' && targetParagraphIndex >= 0
        ? `段落 ${targetParagraphIndex + 1}`
        : '未归类章节');
    const matchReason = getFrontendQueryMatchReason(param.sourceType, param.underlineType);
    const candidateHints = inferWordCandidateHints({
      anchorText: param.anchorText,
      sampleValue: param.sampleValue || '',
      segmentText: param.paragraphText || param.anchorText,
      matchReason,
    });

    return {
      candidateId: `frontend-word-query-${index + 1}`,
      sourceBlockId: param.sourceBlockId || fallbackSectionId,
      anchorText: param.anchorText,
      localAnchorText: param.localAnchorText,
      parameterSlot: param.parameterSlot,
      sampleValue: param.sampleValue || '',
      segmentText: param.paragraphText || param.anchorText,
      sectionId: matchedSection?.sectionKey || fallbackSectionId,
      sectionTitle: matchedSection?.sectionTitle || fallbackSectionTitle,
      fieldTypeHint: candidateHints.fieldTypeHint,
      generationPolicyHint: candidateHints.generationPolicyHint,
      confidence: getFrontendQueryCandidateConfidence(param.sourceType, param.underlineType),
      matchText: param.sampleMatchText,
      matchReason: matchReason,
      compareMode: 'structure_only',
      sectionMatchScore: matchedSection ? 1 : 0,
      fieldIdHint: candidateHints.fieldIdHint,
      location: {
        blockType: param.sourceType === 'table-cell' ? 'cell' : 'paragraph',
        paragraphIndex: typeof targetParagraphIndex === 'number' && targetParagraphIndex >= 0
          ? targetParagraphIndex
          : undefined,
        tableIndex: param.tableIndex,
        rowIndex: param.rowIndex,
        cellIndex: param.cellIndex,
        anchorStart: param.sourceType === 'table-cell' ? undefined : param.start,
        anchorEnd: param.sourceType === 'table-cell' ? undefined : param.end,
      },
      languageRelation: param.languageHint
        ? {
            mode: 'single_language',
            currentLanguageHint: param.languageHint,
          }
        : undefined,
    };
  }));

  const summarySeed: TemplateCompareResponse['compareSummary'] = {
    candidateCount: candidateFields.length,
    sectionCount: detectedSections.length,
    sections: detectedSections.map((section) => ({
      sectionId: section.sectionKey,
      sectionTitle: section.sectionTitle,
      candidateCount: 0,
      matchedCandidateCount: 0,
      unmatchedCandidateCount: 0,
      highConfidenceCandidateCount: 0,
      compareStatus: 'attention',
      compareMode: 'structure_only',
      looseMatchScore: 0,
      topAnchors: [],
      samplePreview: undefined,
    })),
    warnings: [],
  };

  const warnings: string[] = [];
  if (candidateFields.length === 0) {
    warnings.push('当前模板未检测到参数候补，请检查文档类型、标题语言或模板中的占位写法。');
  }
  if (detectedSections.length === 0) {
    warnings.push('当前未识别到明确章节标题，已按参数自身位置回退分组。');
  }

  return {
    workflowId: `frontend-word-query-${templateType}`,
    compareId: `frontend-${Date.now()}`,
    candidateFields,
    compareSummary: {
      ...rebuildCompareSummary(summarySeed, candidateFields),
      warnings,
    },
    cacheStatus: {
      compareHit: false,
    },
  };
}

export const WordIdentifyPanel: React.FC<Props> = ({ onApplyComplete }) => {
  const {
    storeState,
    workflowState,
    applyState,
    recentErrorLogs,
    previewInlineSupported,
    getDownloadLabel,
  } = useWordIdentifyPanel();

  const {
    isAnalyzing,
    suggestions,
    analysisError,
    analysisErrorDetails,
    apiBaseUrl,
    aiOrchestratorBaseUrl,
    aiOrchestratorAuthToken,
    analysisExecutor,
    analysisThinkingEnabled,
    setAnalysisThinkingEnabled,
    setSuggestions,
    setAnalysisError,
    addDebugLog,
    showDebugPanel,
    setShowDebugPanel,
  } = storeState;

  const persistAppliedRecognitionCache = () => {
    if (!recognitionCacheKey) {
      onApplyComplete?.();
      return;
    }

    const latestSuggestions = useAppStore.getState().suggestions;
    const cachedEntry = loadWordRecognitionCache()[recognitionCacheKey];
    const mergedResult = mergeRecognitionResultWithAppliedCache({
      suggestions: latestSuggestions,
      sectionGenerationResults,
      collapsedSections: collapsedRecognitionSections,
    }, cachedEntry);

    saveWordRecognitionCacheEntry({
      cacheKey: recognitionCacheKey,
      result: mergedResult,
      updatedAt: Date.now(),
    });
    persistCompareCacheRecognitionSnapshot(mergedResult);
    setRecognitionCacheUpdatedAt(Date.now());
    if (recognitionCacheStatus == null) {
      setRecognitionCacheStatus('miss');
    }
    onApplyComplete?.();
  };

  const {
    selectedTemplateType,
    setSelectedTemplateType,
    useMultiStage,
    showErrorDetails,
    setShowErrorDetails,
    workflowSourceLanguage,
    setWorkflowSourceLanguage,
    workflowTargetLanguages,
    setWorkflowTargetLanguages,
    aiSkillGuide,
    isGeneratingGuide,
    isVerifying,
    draftId,
    draftInfo,
    latestBackendDraftInfo,
    isSavingDraft,
    draftWorkflowNotice,
    handleGenerateAISkillGuide,
    handleVerifyTemplate,
    handleSaveDraft,
    handleLoadDraft,
    handleClearDraft,
    aiDescription,
    aiGeneratedData,
    isGeneratingParams,
    aiGenerateResult,
    previewResult,
    isPreviewing,
    templateName,
    setTemplateName,
    saveResult,
    isSaving,
    handleAiDescriptionChange,
    handleGenerateParameters,
    handlePreviewWithAIParams,
    handleSaveTemplateAndGuide,
  } = workflowState;

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
  const [, setRecognitionCacheUpdatedAt] = useState<number | null>(null);
  const [detectedUploadCacheStatus, setDetectedUploadCacheStatus] = useState<'available' | 'none' | 'checking' | null>(null);
  const [detectedUploadCacheUpdatedAt, setDetectedUploadCacheUpdatedAt] = useState<number | null>(null);
  const [detectedUploadCacheResult, setDetectedUploadCacheResult] = useState<TemplateUnderstandResponse | null>(null);
  const compareCacheProbeTokenRef = useRef(0);
  const cacheProbeTokenRef = useRef(0);
  const hostAdapter = useMemo(() => createHostAdapter('word'), []);

  const languageSignature = `${workflowSourceLanguage}:${workflowTargetLanguages.join(',')}`;
  const effectiveCompareHeadingLanguages = useMemo(
    () => normalizeCompareHeadingLanguages(compareHeadingLanguages),
    [compareHeadingLanguages]
  );
  const hasCompare = Boolean(compareResult);
  const hasUnderstanding = Boolean(understandingResult);
  const compareCandidateSections = useMemo(() => {
    if (!compareResult) {
      return [];
    }

    const detectedSections = compareDocumentIr
      ? deriveWordSectionsFromDocumentIr(compareDocumentIr)
      : [];

    if (detectedSections.length > 0) {
      const chapterMap = new Map<string, CompareCandidateSection>(
        detectedSections.map((chapter: WordDetectedSection) => [
          chapter.sectionKey,
          {
            sectionKey: chapter.sectionKey,
            sectionId: chapter.sectionKey,
            sectionTitle: chapter.sectionTitle,
            candidates: [] as TemplateCompareResponse['candidateFields'],
            isAttachment: chapter.isAttachment,
          },
        ])
      );
      const unmatchedSections = new Map<string, CompareCandidateSection>();

      compareResult.candidateFields.forEach((candidate) => {
        const paragraphIndex = candidate.location?.paragraphIndex;
        const matchedChapter = typeof paragraphIndex === 'number'
          ? detectedSections.find((chapter: WordDetectedSection) =>
              paragraphIndex >= chapter.startParagraphIndex && paragraphIndex <= chapter.endParagraphIndex
            )
          : undefined;

        if (matchedChapter) {
          chapterMap.get(matchedChapter.sectionKey)?.candidates.push(candidate);
          return;
        }

        const fallbackKey = candidate.sectionId || candidate.sectionTitle || `__ungrouped__${candidate.sourceBlockId}`;
        const current: CompareCandidateSection = unmatchedSections.get(fallbackKey) || {
          sectionKey: fallbackKey,
          sectionId: candidate.sectionId,
          sectionTitle: candidate.sectionTitle || '未归类章节',
          candidates: [] as TemplateCompareResponse['candidateFields'],
          isAttachment: false,
        };
        current.candidates.push(candidate);
        unmatchedSections.set(fallbackKey, current);
      });

      return [
        ...Array.from(chapterMap.values()).filter((section) => section.candidates.length > 0),
        ...Array.from(unmatchedSections.values()),
      ]
        .map((section) => ({
          ...section,
          previewCandidates: section.candidates,
          hiddenCandidateCount: 0,
        }));
    }

    const sectionOrder = new Map(
      compareResult.compareSummary.sections.map((section, index) => [section.sectionId, index])
    );
    const sectionMap = new Map<string, {
      sectionKey: string;
      sectionId?: string;
      sectionTitle: string;
      candidates: TemplateCompareResponse['candidateFields'];
      isAttachment?: boolean;
    }>();

    compareResult.candidateFields.forEach((candidate) => {
      const sectionKey = candidate.sectionId || candidate.sectionTitle || `__ungrouped__${candidate.sourceBlockId}`;
      const current = sectionMap.get(sectionKey) || {
        sectionKey,
        sectionId: candidate.sectionId,
        sectionTitle: candidate.sectionTitle || '未归类章节',
        candidates: [] as TemplateCompareResponse['candidateFields'],
        isAttachment: false,
      };
      current.candidates.push(candidate);
      sectionMap.set(sectionKey, current);
    });

    return Array.from(sectionMap.values())
      .sort((left, right) => {
        const leftOrder = left.sectionId ? sectionOrder.get(left.sectionId) : undefined;
        const rightOrder = right.sectionId ? sectionOrder.get(right.sectionId) : undefined;

        if (leftOrder !== undefined && rightOrder !== undefined) {
          return leftOrder - rightOrder;
        }
        if (leftOrder !== undefined) {
          return -1;
        }
        if (rightOrder !== undefined) {
          return 1;
        }
        return left.sectionTitle.localeCompare(right.sectionTitle, 'zh-Hans-CN');
      })
      .map((section) => ({
        ...section,
        previewCandidates: section.candidates,
        hiddenCandidateCount: 0,
      }))
      ;
  }, [compareDocumentIr, compareResult, effectiveCompareHeadingLanguages]);
  const selectedCompareSectionKeys = useMemo(
    () => compareCandidateSections
      .filter((section) => selectedCompareSections[section.sectionKey] ?? true)
      .map((section) => section.sectionKey),
    [compareCandidateSections, selectedCompareSections]
  );

  const renderSuggestionCard = (suggestion: AISuggestion) => (
    <AISuggestionItem
      key={suggestion.id}
      suggestion={suggestion}
      onApply={() => { void applyState.handleApplySingle(suggestion, persistAppliedRecognitionCache); }}
      onDismiss={() => applyState.dismissSuggestion(suggestion.id)}
      onUpdateName={(newName: string) => applyState.updateSuggestionName(suggestion.id, newName)}
      onUpdateDetails={(details: any) => applyState.updateSuggestionDetails(suggestion.id, details)}
    />
  );
  const persistWordCompareCacheResult = (nextResult: TemplateCompareResponse) => {
    if (!compareDocumentIr) {
      return;
    }

    const cacheKey = buildWordCompareCacheKey(
      compareDocumentIr,
      sampleUploadState,
      selectedTemplateType,
      effectiveCompareHeadingLanguages,
    );
    const updatedAt = Date.now();
    const recognitionSnapshot = (sectionGenerationResults.length > 0 || suggestions.length > 0)
      ? {
          suggestions,
          sectionGenerationResults,
          collapsedSections: collapsedRecognitionSections,
        }
      : undefined;
    saveWordCompareCacheEntry({
      cacheKey,
      result: {
        ...nextResult,
        cacheStatus: {
          compareHit: false,
        },
        recognitionSnapshot,
      },
      updatedAt,
    });
    setCompareCacheStatus('miss');
    setCompareCacheUpdatedAt(updatedAt);
  };
  const persistCompareCacheRecognitionSnapshot = (
    recognitionSnapshot: WordRecognitionCacheEntry['result']
  ) => {
    if (!compareDocumentIr || !compareResult) {
      return;
    }

    const cacheKey = buildWordCompareCacheKey(
      compareDocumentIr,
      sampleUploadState,
      selectedTemplateType,
      effectiveCompareHeadingLanguages,
    );
    const updatedAt = Date.now();
    saveWordCompareCacheEntry({
      cacheKey,
      result: {
        ...compareResult,
        cacheStatus: {
          compareHit: false,
        },
        recognitionSnapshot,
      },
      updatedAt,
    });
    setCompareCacheUpdatedAt(updatedAt);
  };
  const updateCompareCandidate = (candidateId: string, patch: Partial<TemplateFieldCandidate>) => {
    setCompareResult((current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const candidateFields = current.candidateFields.map((candidate) => {
        if (candidate.candidateId !== candidateId) {
          return candidate;
        }
        changed = true;
        return {
          ...candidate,
          ...patch,
        };
      });

      if (!changed) {
        return current;
      }

      const nextResult = {
        ...current,
        candidateFields,
        compareSummary: rebuildCompareSummary(current.compareSummary, candidateFields),
      };
      persistWordCompareCacheResult(nextResult);
      return nextResult;
    });
  };
  const deleteCompareCandidate = (candidateId: string) => {
    setCompareResult((current) => {
      if (!current) {
        return current;
      }

      const candidateFields = current.candidateFields.filter((candidate) => candidate.candidateId !== candidateId);
      if (candidateFields.length === current.candidateFields.length) {
        return current;
      }

      const nextResult = {
        ...current,
        candidateFields,
        compareSummary: rebuildCompareSummary(current.compareSummary, candidateFields),
      };
      persistWordCompareCacheResult(nextResult);
      return nextResult;
    });
  };
  const selectedCompareCandidateFields = useMemo(
    () => compareCandidateSections
      .filter((section) => selectedCompareSections[section.sectionKey] ?? true)
      .flatMap((section) => section.candidates),
    [compareCandidateSections, selectedCompareSections]
  );
  const effectiveCompareCandidateFields = useMemo(
    () => (compareCandidateSections.length > 0
      ? selectedCompareCandidateFields
      : (compareResult?.candidateFields || [])),
    [compareCandidateSections.length, compareResult, selectedCompareCandidateFields]
  );
  const currentCompareSignature = useMemo(() => {
    if (!compareResult) {
      return 'no-compare';
    }

    const candidateSignature = compareResult.candidateFields
      .map((candidate) => [
        candidate.candidateId,
        candidate.fieldIdHint || '',
        candidate.sampleValue || '',
        candidate.sectionId || '',
      ].join(':'))
      .join('|');

    return [
      compareResult.compareId || 'compare',
      candidateSignature,
      ...[...selectedCompareSectionKeys].sort(),
    ].join('|');
  }, [compareResult, selectedCompareSectionKeys]);
  const currentRecognitionCacheSignature = useMemo(() => {
    if (!compareResult) {
      return 'no-compare';
    }

    const candidateSignature = compareResult.candidateFields
      .map((candidate) => [
        candidate.candidateId,
        candidate.fieldIdHint || '',
        candidate.sampleValue || '',
        candidate.sectionId || '',
      ].join(':'))
      .join('|');

    return [
      compareResult.compareId || 'compare',
      candidateSignature,
      'all-sections',
    ].join('|');
  }, [compareResult]);
  const displayedCacheUpdatedAt = understandingCacheUpdatedAt
    ?? (detectedUploadCacheStatus === 'available' ? detectedUploadCacheUpdatedAt : null);
  const understandingStale = hasUnderstanding && (
    understandingRevision !== sampleUploadState.revision
    || understandingLanguageSignature !== languageSignature
    || understandingCompareSignature !== currentCompareSignature
  );
  const recognitionStale = recognitionActivated && (
    recognitionRevision !== sampleUploadState.revision
    || recognitionLanguageSignature !== languageSignature
    || recognitionCompareSignature !== currentRecognitionCacheSignature
  );
  const hasRecognitionSnapshot = recognitionActivated
    && (sectionGenerationResults.length > 0 || suggestions.length > 0 || Boolean(recognitionResult));
  const recognitionDataFresh = hasRecognitionSnapshot
    && recognitionRevision === sampleUploadState.revision
    && recognitionLanguageSignature === languageSignature
    && recognitionCompareSignature === currentRecognitionCacheSignature;
  const recognitionReady = recognitionActivated && recognitionDataFresh && !recognitionStale;
  const recognitionSelectionBlocked = compareCandidateSections.length > 0 && effectiveCompareCandidateFields.length === 0;
  const recognitionBlocked = !sampleUploadState.uploaded || !hasCompare || recognitionSelectionBlocked;
  const totalSuggestionCount = suggestions.length;
  const pendingSuggestionCount = suggestions.filter((suggestion) => !suggestion.applied).length;
  const uploadStatusLabel = sampleUploadState.uploaded ? '已上传' : '待上传';
  const uploadStatusTone = sampleUploadState.uploaded ? 'success' : 'default';
  const understandingStatusLabel = !sampleUploadState.uploaded
    ? '未开始'
    : isUnderstanding
      ? '理解中'
      : understandingStale
        ? '缓存待刷新'
        : understandingCacheStatus === 'hit'
          ? '缓存命中'
          : understandingCacheStatus === 'miss'
            ? '已写入缓存'
            : detectedUploadCacheStatus === 'checking'
              ? '检查缓存中'
              : detectedUploadCacheStatus === 'available'
                ? '检测到缓存'
            : understandingResult
              ? '已完成理解'
              : '待理解';
  const understandingStatusTone = isUnderstanding
    ? 'warning'
    : understandingCacheStatus === 'hit' || understandingResult || detectedUploadCacheStatus === 'available'
      ? 'success'
      : understandingStale
        ? 'warning'
        : '';
  const understandingCacheTimeText = displayedCacheUpdatedAt
    ? new Date(displayedCacheUpdatedAt).toLocaleString()
    : '';
  const understandingCacheDescription = !sampleUploadState.uploaded
    ? '请先上传参考示例文件'
    : isUnderstanding
      ? '正在生成全文理解'
      : understandingStale
        ? '检测到变化，需要重新理解'
        : understandingCacheStatus === 'hit'
          ? '当前结果来自本地缓存'
          : understandingCacheStatus === 'miss'
            ? '当前结果已写入本地缓存'
            : detectedUploadCacheStatus === 'checking'
              ? '正在检查本地缓存'
              : detectedUploadCacheStatus === 'available'
                ? '已检测到可复用缓存'
                : detectedUploadCacheStatus === 'none'
                  ? '当前没有可复用缓存'
            : understandingResult
              ? '当前结果可直接用于参数生成'
              : '点击按钮开始全文理解';
  const understandingActionHint = !sampleUploadState.uploaded
    ? '等待上传参考示例文件'
    : understandingStale
      ? '建议重新理解'
      : understandingCacheStatus === 'hit'
        ? '可直接复用缓存'
        : understandingCacheStatus === 'miss'
          ? '结果已缓存'
          : detectedUploadCacheStatus === 'checking'
            ? '正在检查缓存'
            : detectedUploadCacheStatus === 'available'
              ? '检测到可复用缓存'
          : understandingResult
            ? '当前结果可直接用于参数生成'
            : '点击开始全文理解';
  const displayedUnderstandingSummaryResult = understandingResult && !understandingStale
    ? understandingResult
    : detectedUploadCacheStatus === 'available'
      ? detectedUploadCacheResult
      : null;
  const recognitionCacheKey = useMemo(
    () => (compareDocumentIr
      ? buildWordRecognitionCacheKey(
          compareDocumentIr,
          sampleUploadState,
          workflowSourceLanguage,
          workflowTargetLanguages,
          currentRecognitionCacheSignature,
        )
      : null),
    [
      compareDocumentIr,
      sampleUploadState,
      workflowSourceLanguage,
      workflowTargetLanguages,
      currentRecognitionCacheSignature,
    ]
  );
  const understandingSummaryText = displayedUnderstandingSummaryResult
    ? buildWordUnderstandingSummaryText(displayedUnderstandingSummaryResult)
    : '';
  const derivedPrimaryChapters = useMemo<WordDetectedSection[]>(
    () => (compareDocumentIr
      ? deriveWordSectionsFromDocumentIr(compareDocumentIr)
      : []),
    [compareDocumentIr, effectiveCompareHeadingLanguages]
  );
  const detectedSectionMap = useMemo(
    () => new Map(derivedPrimaryChapters.map((section) => [section.sectionKey, section])),
    [derivedPrimaryChapters]
  );
  const selectedRecognitionSections = useMemo<CompareCandidateSection[]>(
    () => {
      const selectedSections = compareCandidateSections
        .filter((section) => selectedCompareSections[section.sectionKey] ?? true)
        .map((section) => ({
          sectionKey: section.sectionKey,
          sectionId: section.sectionId,
          sectionTitle: section.sectionTitle,
          candidates: mergeWordCandidatesBySlot(section.candidates),
          isAttachment: section.isAttachment,
        }));

      if (selectedSections.length > 0) {
        return selectedSections;
      }

      if (effectiveCompareCandidateFields.length === 0) {
        return [];
      }

      return [{
        sectionKey: 'selected-word-candidates',
        sectionId: 'selected-word-candidates',
        sectionTitle: '已选章节',
        candidates: mergeWordCandidatesBySlot(effectiveCompareCandidateFields),
        isAttachment: false,
      }];
    },
    [compareCandidateSections, effectiveCompareCandidateFields, selectedCompareSections]
  );

  useEffect(() => {
    if (compareCandidateSections.length === 0) {
      setCollapsedCompareSections({});
      setSelectedCompareSections({});
      return;
    }

    setCollapsedCompareSections((current) => {
      const nextState: Record<string, boolean> = {};
      compareCandidateSections.forEach((section) => {
        nextState[section.sectionKey] = current[section.sectionKey] ?? true;
      });
      return nextState;
    });
    setSelectedCompareSections((current) => {
      const nextState: Record<string, boolean> = {};
      compareCandidateSections.forEach((section) => {
        nextState[section.sectionKey] = current[section.sectionKey] ?? true;
      });
      return nextState;
    });
  }, [compareCandidateSections]);

  useEffect(() => {
    if (sectionGenerationResults.length === 0) {
      setCollapsedRecognitionSections({});
      return;
    }

    setCollapsedRecognitionSections((current) => {
      const nextState: Record<string, boolean> = {};
      sectionGenerationResults.forEach((section) => {
        nextState[section.sectionKey] = current[section.sectionKey] ?? false;
      });
      return nextState;
    });
  }, [sectionGenerationResults]);

  useEffect(() => {
    const nextTargetLanguages = effectiveCompareHeadingLanguages.filter((language) => language !== 'zh');
    setWorkflowSourceLanguage('zh');
    setWorkflowTargetLanguages(nextTargetLanguages);
  }, [effectiveCompareHeadingLanguages, setWorkflowSourceLanguage, setWorkflowTargetLanguages]);

  useEffect(() => {
    if (!sampleUploadState.uploaded || !compareDocumentIr || !hasCompare || !recognitionCacheKey) {
      return;
    }
    if (recognitionReady && !recognitionStale) {
      return;
    }

    const cachedEntry = loadWordRecognitionCache()[recognitionCacheKey];
    if (!isWordRecognitionCacheCompatible(cachedEntry)) {
      if (cachedEntry) {
        removeWordRecognitionCacheEntry(recognitionCacheKey);
      }
      return;
    }

    setSectionGenerationResults(cachedEntry.result.sectionGenerationResults);
    setSuggestions(cachedEntry.result.suggestions);
    setCollapsedRecognitionSections(cachedEntry.result.collapsedSections || {});
    setRecognitionResult(null);
    setRecognitionRevision(sampleUploadState.revision);
    setRecognitionLanguageSignature(languageSignature);
    setRecognitionCompareSignature(currentRecognitionCacheSignature);
    setRecognitionActivated(true);
    setRecognitionCacheStatus('hit');
    setRecognitionCacheUpdatedAt(cachedEntry.updatedAt);
    addDebugLog(
      'info',
      'Word 参数缓存命中',
      [
        `章节数: ${cachedEntry.result.sectionGenerationResults.length}`,
        `参数数: ${cachedEntry.result.suggestions.length}`,
        `缓存时间: ${new Date(cachedEntry.updatedAt).toLocaleString()}`,
      ].join('\n')
    );
  }, [
    addDebugLog,
    compareDocumentIr,
    currentCompareSignature,
    hasCompare,
    languageSignature,
    recognitionCacheKey,
    recognitionReady,
    recognitionStale,
    sampleUploadState,
    setSuggestions,
  ]);

  useEffect(() => {
    if (
      !sampleUploadState.uploaded
      || !compareDocumentIr
      || !recognitionCacheKey
      || !recognitionActivated
      || recognitionStale
      || !recognitionDataFresh
      || (sectionGenerationResults.length === 0 && suggestions.length === 0)
    ) {
      return;
    }

    saveWordRecognitionCacheEntry({
      cacheKey: recognitionCacheKey,
      result: {
        suggestions,
        sectionGenerationResults,
        collapsedSections: collapsedRecognitionSections,
      },
      updatedAt: Date.now(),
    });
  }, [
    collapsedRecognitionSections,
    compareDocumentIr,
    recognitionActivated,
    recognitionCacheKey,
    recognitionDataFresh,
    recognitionStale,
    sampleUploadState,
    sectionGenerationResults,
    suggestions,
  ]);

  useEffect(() => {
    if (!sampleUploadState.uploaded || !sampleUploadState.fileBase64) {
      setCompareDocumentIr(null);
      setCompareResult(null);
      setCompareCacheStatus(null);
      setCompareCacheUpdatedAt(null);
      return;
    }

    const currentProbeToken = compareCacheProbeTokenRef.current + 1;
    compareCacheProbeTokenRef.current = currentProbeToken;

    void hostAdapter.extractDocument()
      .then((templateDocumentIr) => {
        if (compareCacheProbeTokenRef.current !== currentProbeToken) {
          return;
        }

        const documentIr = templateDocumentIr as Record<string, any>;
        setCompareDocumentIr(documentIr);
        const compareCacheKey = buildWordCompareCacheKey(
          documentIr,
          sampleUploadState,
          selectedTemplateType,
          effectiveCompareHeadingLanguages,
        );
        const cachedCompareEntry = loadWordCompareCache()[compareCacheKey];
        if (isWordCompareCacheCompatible(cachedCompareEntry)) {
          const cachedResult: TemplateCompareResponse = {
            ...cachedCompareEntry.result,
            cacheStatus: {
              compareHit: true,
            },
          };
          setCompareResult(cachedResult);
          if (cachedCompareEntry.result.recognitionSnapshot) {
            setSectionGenerationResults(cachedCompareEntry.result.recognitionSnapshot.sectionGenerationResults);
            setSuggestions(cachedCompareEntry.result.recognitionSnapshot.suggestions);
            setCollapsedRecognitionSections(cachedCompareEntry.result.recognitionSnapshot.collapsedSections || {});
            setRecognitionResult(null);
            setRecognitionRevision(sampleUploadState.revision);
            setRecognitionLanguageSignature(languageSignature);
            setRecognitionCompareSignature(currentRecognitionCacheSignature);
            setRecognitionActivated(true);
          }
          setCompareCacheStatus('hit');
          setCompareCacheUpdatedAt(cachedCompareEntry.updatedAt);
          return;
        }

        if (cachedCompareEntry) {
          removeWordCompareCacheEntry(compareCacheKey);
        }
        setCompareResult(null);
        setCompareCacheStatus(null);
        setCompareCacheUpdatedAt(null);
      })
      .catch(() => {
        if (compareCacheProbeTokenRef.current !== currentProbeToken) {
          return;
        }
        setCompareDocumentIr(null);
        setCompareResult(null);
        setCompareCacheStatus(null);
        setCompareCacheUpdatedAt(null);
      });
  }, [
    effectiveCompareHeadingLanguages,
    hostAdapter,
    sampleUploadState,
    selectedTemplateType,
  ]);

  useEffect(() => {
    if (!sampleUploadState.uploaded || !sampleUploadState.fileBase64) {
      setDetectedUploadCacheStatus(null);
      setDetectedUploadCacheUpdatedAt(null);
      setDetectedUploadCacheResult(null);
      return;
    }

    const currentProbeToken = cacheProbeTokenRef.current + 1;
    cacheProbeTokenRef.current = currentProbeToken;
    setDetectedUploadCacheStatus('checking');

    void hostAdapter.extractDocument()
      .then((templateDocumentIr) => {
        if (cacheProbeTokenRef.current !== currentProbeToken) {
          return;
        }
        const matchedEntry = findLatestMatchingWordUnderstandingCacheEntry({
          templateDocumentIr: templateDocumentIr as Record<string, any>,
          sampleUploadState,
          sourceLanguage: workflowSourceLanguage,
          targetLanguages: workflowTargetLanguages,
        });
        if (matchedEntry) {
          setDetectedUploadCacheStatus('available');
          setDetectedUploadCacheUpdatedAt(matchedEntry.updatedAt);
          setDetectedUploadCacheResult(matchedEntry.result);
          return;
        }
        setDetectedUploadCacheStatus('none');
        setDetectedUploadCacheUpdatedAt(null);
        setDetectedUploadCacheResult(null);
      })
      .catch(() => {
        if (cacheProbeTokenRef.current !== currentProbeToken) {
          return;
        }
        setDetectedUploadCacheStatus('none');
        setDetectedUploadCacheUpdatedAt(null);
        setDetectedUploadCacheResult(null);
      });
  }, [
    hostAdapter,
    sampleUploadState,
    workflowSourceLanguage,
    workflowTargetLanguages,
  ]);

  const sectionProcessingSummary = useMemo(() => {
    if (!recognitionReady || sectionGenerationResults.length === 0) {
      return null;
    }

    const succeeded = sectionGenerationResults.filter((section) => section.aiCallSucceeded && section.suggestionCount > 0).length;
    const empty = sectionGenerationResults.filter((section) => section.aiCallSucceeded && section.suggestionCount === 0 && !section.error).length;
    const failed = sectionGenerationResults.filter((section) => !section.aiCallSucceeded || section.error).length;
    const retryUsed = sectionGenerationResults.filter((section) => section.usedRetry).length;
    const qualityIssueSections = sectionGenerationResults.filter((section) => (section.qualityIssues || []).length > 0).length;
    const totalCandidates = sectionGenerationResults.reduce((sum, section) => sum + section.candidateCount, 0);
    const totalSuggestions = sectionGenerationResults.reduce((sum, section) => sum + section.suggestionCount, 0);

    return {
      total: sectionGenerationResults.length,
      succeeded,
      empty,
      failed,
      retryUsed,
      qualityIssueSections,
      totalCandidates,
      totalSuggestions,
      narrative: totalSuggestions > 0
        ? `本次共处理 ${sectionGenerationResults.length} 个章节，累计候选 ${totalCandidates} 个，生成参数 ${totalSuggestions} 个。`
        : `本次已处理 ${sectionGenerationResults.length} 个章节，但当前还没有产出可落地的参数建议。`,
    };
  }, [recognitionReady, sectionGenerationResults]);
  const sectionGenerationResultMap = useMemo(
    () => new Map(sectionGenerationResults.map((section) => [section.sectionKey, section])),
    [sectionGenerationResults]
  );
  const sectionSuggestionMap = useMemo(() => {
    const suggestionById = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));

    return new Map(
      sectionGenerationResults.map((section) => [
        section.sectionKey,
        section.suggestionIds
          .map((id) => suggestionById.get(id))
          .filter((suggestion): suggestion is AISuggestion => Boolean(suggestion)),
      ])
    );
  }, [sectionGenerationResults, suggestions]);

  const buildWorkflowRequest = async (options?: {
    includeUnderstanding?: boolean;
    useSelectedCompareCandidates?: boolean;
    prefetchedUnderstanding?: TemplateUnderstandResponse | null;
  }) => {
    const templateDocumentIr = await hostAdapter.extractDocument();
    const candidateFields = options?.useSelectedCompareCandidates
      ? (compareResult ? effectiveCompareCandidateFields : undefined)
      : compareResult?.candidateFields;
    const compareSignature = options?.useSelectedCompareCandidates
      ? currentCompareSignature
      : (compareResult ? `${compareResult.compareId || 'compare'}|all` : 'no-compare');
    return {
      request: {
        templateDocumentIr,
        sampleDocument: sampleUploadState.fileBase64
          ? {
              fileName: sampleUploadState.fileName,
              contentBase64: sampleUploadState.fileBase64,
            }
          : undefined,
        candidateFields,
        prefetchedUnderstanding: options?.includeUnderstanding
          ? options?.prefetchedUnderstanding || understandingResult || undefined
          : undefined,
        sourceLanguage: workflowSourceLanguage,
        targetLanguages: workflowTargetLanguages,
        options: {
          enableTermMatch: true,
          enableLayoutDetection: true,
          templateType: selectedTemplateType,
          useMultiStage,
          analysisExecutor,
          thinking: analysisThinkingEnabled,
        },
      },
      cacheKey: buildWordUnderstandingCacheKey(
        templateDocumentIr,
        sampleUploadState,
        workflowSourceLanguage,
        workflowTargetLanguages,
        compareSignature,
      ),
    };
  };

  const handleCompareDocumentTypeChange = (templateType: 'contract' | 'report') => {
    setSelectedTemplateType(templateType);
    setCompareResult(null);
    setCompareCacheStatus(null);
    setCompareCacheUpdatedAt(null);
    setUnderstandingResult(null);
    setRecognitionResult(null);
    setSectionGenerationResults([]);
    setSuggestions([]);
    setUnderstandingCacheStatus(null);
    setUnderstandingCacheUpdatedAt(null);
    setRecognitionCacheStatus(null);
    setRecognitionCacheUpdatedAt(null);
  };

  const handleCompareHeadingLanguageToggle = (language: CompareHeadingLanguageSelection) => {
    setCompareHeadingLanguages((current) => {
      const next = current.includes(language)
        ? current.filter((item) => item !== language)
        : [...current, language];
      return normalizeCompareHeadingLanguages(next);
    });
    setCompareResult(null);
    setCompareCacheStatus(null);
    setCompareCacheUpdatedAt(null);
    setUnderstandingResult(null);
    setRecognitionResult(null);
    setSectionGenerationResults([]);
    setSuggestions([]);
    setUnderstandingCacheStatus(null);
    setUnderstandingCacheUpdatedAt(null);
    setRecognitionCacheStatus(null);
    setRecognitionCacheUpdatedAt(null);
  };

  const toggleCompareSectionCollapse = (sectionKey: string) => {
    setCollapsedCompareSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? true),
    }));
  };

  const toggleRecognitionSectionCollapse = (sectionKey: string) => {
    setCollapsedRecognitionSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? false),
    }));
  };

  const toggleCompareSectionSelection = (sectionKey: string) => {
    setSelectedCompareSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? true),
    }));
    setUnderstandingCacheStatus(null);
    setUnderstandingCacheUpdatedAt(null);
    setRecognitionCacheStatus(null);
    setRecognitionCacheUpdatedAt(null);
  };

  const setAllCompareSectionsSelected = (selected: boolean) => {
    const nextState: Record<string, boolean> = {};
    compareCandidateSections.forEach((section) => {
      nextState[section.sectionKey] = selected;
    });
    setSelectedCompareSections(nextState);
    setUnderstandingCacheStatus(null);
    setUnderstandingCacheUpdatedAt(null);
    setRecognitionCacheStatus(null);
    setRecognitionCacheUpdatedAt(null);
  };

  const handleSampleUploadStateChange = (nextState: SampleUploadState) => {
    setCompareResult(null);
    setCompareDocumentIr(null);
    setCompareHighlightSummary(null);
    setCompareCacheStatus(null);
    setCompareCacheUpdatedAt(null);
    setUnderstandingResult(null);
    setRecognitionResult(null);
    setSectionGenerationResults([]);
    setSuggestions([]);
    setUnderstandingCacheStatus(null);
    setUnderstandingCacheUpdatedAt(null);
    setRecognitionCacheStatus(null);
    setRecognitionCacheUpdatedAt(null);
    setDetectedUploadCacheStatus(nextState.uploaded ? 'checking' : null);
    setDetectedUploadCacheUpdatedAt(null);
    setDetectedUploadCacheResult(null);
    setSampleUploadState(nextState);
  };

  const handleStartCompare = async () => {
    setCompareHighlightSummary(null);
    setCompareCacheStatus(null);
    setCompareCacheUpdatedAt(null);
    setUnderstandingResult(null);
    setRecognitionResult(null);
    setSectionGenerationResults([]);
    setRecognitionActivated(false);
    setSuggestions([]);
    setCollapsedRecognitionSections({});
    setRecognitionCacheStatus(null);
    setRecognitionCacheUpdatedAt(null);
    setAnalysisError(null, undefined);
    if (!sampleUploadState.fileBase64) {
      setAnalysisError('请先上传参考示例文件', '参考示例文件 base64 内容为空');
      return;
    }

    setIsComparing(true);
    try {
      const templateDocumentIr = await hostAdapter.extractDocument();
      const compareCacheKey = buildWordCompareCacheKey(
        templateDocumentIr as Record<string, any>,
        sampleUploadState,
        selectedTemplateType,
        effectiveCompareHeadingLanguages,
      );
      const cachedCompareEntry = loadWordCompareCache()[compareCacheKey];

      setCompareDocumentIr(templateDocumentIr as Record<string, any>);

      if (cachedCompareEntry) {
        removeWordCompareCacheEntry(compareCacheKey);
      }
      addDebugLog('info', 'Word 参数查询重新执行', '本次点击“查询”已跳过已有缓存，并将在完成后写回最新结果。');

      const [
        paragraphs,
        underlines,
        tableCells,
        ooxml,
        sampleText,
      ] = await Promise.all([
        WordAPI.getParagraphsWithFormat(),
        WordAPI.getUnderlinedTexts(),
        WordAPI.getTableCells(),
        WordAPI.getDocumentOoxml(),
        sampleUploadState.fileBase64
          ? extractReadableTextFromWordBase64(sampleUploadState.fileBase64)
          : Promise.resolve(''),
      ]);

      const result = buildFrontendCompareResult({
        templateType: selectedTemplateType,
        headingLanguages: effectiveCompareHeadingLanguages,
        paragraphs: paragraphs.map((paragraph) => ({
          id: `word-paragraph-${paragraph.index}`,
          text: paragraph.text,
          index: paragraph.index,
          format: paragraph.format,
        })),
        underlines: underlines.map((underline) => ({
          text: underline.text,
          underlineType: underline.underlineType,
          index: underline.index,
          paragraphIndex: underline.paragraphIndex,
          paragraphText: underline.paragraphText,
          position: underline.position,
        })),
        tableCells: tableCells.map((cell) => ({
          sourceBlockId: `word-cell-${cell.tableIndex}-${cell.rowIndex}-${cell.cellIndex}`,
          tableIndex: cell.tableIndex,
          rowIndex: cell.rowIndex,
          cellIndex: cell.cellIndex,
          text: cell.text,
        })),
        sampleText,
        tableAnchorParagraphMap: buildTableAnchorParagraphMap(
          ooxml,
          paragraphs.map((paragraph) => ({
            id: `word-paragraph-${paragraph.index}`,
            text: paragraph.text,
            index: paragraph.index,
            format: paragraph.format,
          }))
        ),
      });

      const nextUpdatedAt = Date.now();
      const uncachedResult: TemplateCompareResponse = {
        ...result,
        cacheStatus: {
          compareHit: false,
        },
      };
      saveWordCompareCacheEntry({
        cacheKey: compareCacheKey,
        result: uncachedResult,
        updatedAt: nextUpdatedAt,
      });
      setCompareResult(uncachedResult);
      setCompareCacheStatus('miss');
      setCompareCacheUpdatedAt(nextUpdatedAt);
      addDebugLog(
        'info',
        'Word 参数查询完成',
        buildCompareDebugText(uncachedResult, {
          underlineCount: underlines.length,
          underlineCharCount: underlines.filter((underline) => underline.underlineType === 'underline-char').length,
          underlineSpaceCount: underlines.filter((underline) => underline.underlineType !== 'underline-char').length,
          tableCellCount: tableCells.length,
          paragraphCount: paragraphs.length,
          underlines: underlines.map((underline) => ({
            text: underline.text,
            underlineType: underline.underlineType,
            index: underline.index,
            paragraphIndex: underline.paragraphIndex,
            paragraphText: underline.paragraphText,
            position: underline.position,
          })),
        })
      );
      addDebugLog(
        'debug',
        'Word 保修期下划线采集诊断',
        buildWordKeywordFocusedDebugExcerpt({
          title: '【下划线定向诊断】',
          text: WordAPI.getLastUnderlineDebugReport(),
          keywords: WORD_TECHNICAL_SERVICE_DEBUG_KEYWORDS,
        })
      );
      addDebugLog(
        'debug',
        'Word 参数查询逐段诊断',
        buildWordParameterDetectionDebugText({
          templateType: selectedTemplateType,
          paragraphs: paragraphs.map((paragraph) => ({
            id: `word-paragraph-${paragraph.index}`,
            text: paragraph.text,
            index: paragraph.index,
            format: paragraph.format,
          })),
          underlines: underlines.map((underline) => ({
            text: underline.text,
            underlineType: underline.underlineType,
            paragraphIndex: underline.paragraphIndex,
            paragraphText: underline.paragraphText,
            position: underline.position,
          })),
          tableCells: tableCells.map((cell) => ({
            sourceBlockId: `word-cell-${cell.tableIndex}-${cell.rowIndex}-${cell.cellIndex}`,
            tableIndex: cell.tableIndex,
            rowIndex: cell.rowIndex,
            cellIndex: cell.cellIndex,
            text: cell.text,
          })),
          sampleText,
          includeLabelOnly: true,
          keywordFilters: WORD_TECHNICAL_SERVICE_DEBUG_KEYWORDS,
        })
      );
      addDebugLog(
        'debug',
        'Word 完整文档结构快照',
        buildWordDocumentStructureDebugText(templateDocumentIr as DocumentIR)
      );
      addDebugLog(
        'debug',
        'Word 章节判定明细',
        buildWordChapterDetectionDebugText(templateDocumentIr as DocumentIR)
      );
    } catch (error: any) {
      setAnalysisError(error?.message || '参数查询失败', error?.stack || error?.response?.data ? JSON.stringify(error.response?.data, null, 2) : undefined);
    } finally {
      setIsComparing(false);
    }
  };

  const highlightCompareCandidate = async (candidate: TemplateFieldCandidate): Promise<boolean> => {
    const location = candidate.location;
    if (!location) {
      return false;
    }

    if (typeof location.contentControlId === 'number') {
      return WordAPI.highlightContentControlById(location.contentControlId);
    }

    if (
      typeof location.tableIndex === 'number'
      && typeof location.rowIndex === 'number'
      && typeof location.cellIndex === 'number'
    ) {
      return WordAPI.highlightTableCell(location.tableIndex, location.rowIndex, location.cellIndex);
    }

    if (
      typeof location.paragraphIndex === 'number'
      && typeof location.anchorStart === 'number'
      && typeof location.anchorEnd === 'number'
    ) {
      return WordAPI.highlightUnderlineByPosition(
        location.paragraphIndex,
        location.anchorStart,
        location.anchorEnd,
        candidate.anchorText
      );
    }

    const fallbackText = String(candidate.anchorText || candidate.sampleValue || candidate.matchText || '').trim();
    if (!fallbackText) {
      return false;
    }

    const highlightCount = await WordAPI.highlightText(fallbackText);
    return highlightCount > 0;
  };

  const handleHighlightCompareCandidates = async () => {
    if (!compareResult) {
      return;
    }

    const candidates = effectiveCompareCandidateFields.length > 0
      ? effectiveCompareCandidateFields
      : compareResult.candidateFields;

    if (candidates.length === 0) {
      setCompareHighlightSummary('当前没有可高亮的候选参数。');
      return;
    }

    setAnalysisError(null, undefined);
    setIsHighlightingCandidates(true);
    setCompareHighlightSummary(null);
    try {
      await WordAPI.clearAllHighlights();
      let highlightedCount = 0;

      for (const candidate of candidates) {
        const highlighted = await highlightCompareCandidate(candidate);
        if (highlighted) {
          highlightedCount += 1;
        }
      }

      const summary = highlightedCount > 0
        ? `已高亮 ${highlightedCount} / ${candidates.length} 个候选位置，可直接回到文档核对。`
        : '本次未能定位到可高亮的位置，请检查候选锚点或文档内容是否已变化。';
      setCompareHighlightSummary(summary);
      addDebugLog(
        'info',
        'Word 候选参数高亮检测',
        [
          `候选总数: ${candidates.length}`,
          `高亮成功: ${highlightedCount}`,
          ...candidates.slice(0, 20).map((candidate, index) =>
            `${index + 1}. ${getCompareCandidateDisplayName(candidate)} | ${candidate.anchorText || '无锚点'}`
          ),
        ].join('\n')
      );
    } catch (error: any) {
      setCompareHighlightSummary('高亮检测失败，请稍后重试。');
      setAnalysisError(error?.message || '高亮检测失败', error?.stack);
    } finally {
      setIsHighlightingCandidates(false);
    }
  };

  const handleClearCompareHighlights = async () => {
    setIsClearingHighlights(true);
    setAnalysisError(null, undefined);
    try {
      await WordAPI.clearAllHighlights();
      setCompareHighlightSummary('已清除文档中的高亮标记。');
    } catch (error: any) {
      setCompareHighlightSummary('清除高亮失败，请稍后重试。');
      setAnalysisError(error?.message || '清除高亮失败', error?.stack);
    } finally {
      setIsClearingHighlights(false);
    }
  };

  const ensureUnderstandingForRecognition = async (
    options?: { forceRefresh?: boolean }
  ): Promise<TemplateUnderstandResponse | null> => {
    if (!sampleUploadState.fileBase64) {
      setAnalysisError('请先上传参考示例文件', '参考示例文件 base64 内容为空');
      return null;
    }
    if (compareResult && compareCandidateSections.length > 0 && effectiveCompareCandidateFields.length === 0) {
      setAnalysisError('请至少勾选一个章节', '当前已生成章节候选，但没有勾选任何章节，无法基于章节候选生成参数');
      return null;
    }

    setIsUnderstanding(true);
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const workflowRequest = await buildWorkflowRequest({ useSelectedCompareCandidates: true });
      const forceRefresh = Boolean(options?.forceRefresh);
      const cachedEntry = loadWordUnderstandingCache()[workflowRequest.cacheKey];
      if (!forceRefresh && isWordUnderstandingCacheCompatible(cachedEntry)) {
        setUnderstandingResult(cachedEntry.result);
        setUnderstandingRevision(sampleUploadState.revision);
        setUnderstandingLanguageSignature(languageSignature);
        setUnderstandingCompareSignature(currentCompareSignature);
        setUnderstandingCacheStatus('hit');
        setUnderstandingCacheUpdatedAt(cachedEntry.updatedAt);
        addDebugLog(
          'info',
          'Word 章节理解缓存命中',
          [
            `样本: ${sampleUploadState.fileName || '未命名样本'}`,
            `语言配置: ${workflowSourceLanguage} -> ${workflowTargetLanguages.join(', ') || '单语言'}`,
            `章节选择: ${selectedCompareSectionKeys.length || compareCandidateSections.length || 0}`,
            '',
            buildUnderstandingDebugText(cachedEntry.result, cachedEntry.result.summary.understandingSummaryText || ''),
          ].join('\n')
        );
        return cachedEntry.result;
      }
      if (forceRefresh && cachedEntry) {
        addDebugLog(
          'info',
          'Word 章节理解强制刷新',
          '检测到手动重新理解请求，已跳过本地缓存并重新请求后端理解结果'
        );
      }
      if (cachedEntry) {
        removeWordUnderstandingCacheEntry(workflowRequest.cacheKey);
        if (!forceRefresh) {
          addDebugLog(
            'info',
            'Word 章节理解缓存失效',
            '检测到旧版或不兼容缓存，已自动清理并重新请求后端理解结果'
          );
        }
      }

      const result = await carboneAPI.understandTemplateWorkflow(workflowRequest.request);
      const nextUpdatedAt = Date.now();
      setUnderstandingResult(result);
      setUnderstandingRevision(sampleUploadState.revision);
      setUnderstandingLanguageSignature(languageSignature);
      setUnderstandingCompareSignature(currentCompareSignature);
      setUnderstandingCacheStatus('miss');
      setUnderstandingCacheUpdatedAt(nextUpdatedAt);
      saveWordUnderstandingCacheEntry({
        cacheKey: workflowRequest.cacheKey,
        result,
        updatedAt: nextUpdatedAt,
      });
      addDebugLog(
        'info',
        'Word 章节理解完成',
        buildUnderstandingDebugText(result, result.summary.understandingSummaryText || '')
      );
      return result;
    } finally {
      setIsUnderstanding(false);
    }
  };

  const handleStartUnderstanding = async () => {
    setAnalysisError(null, undefined);
    await ensureUnderstandingForRecognition({ forceRefresh: Boolean(displayedUnderstandingSummaryResult) });
  };

  const handleStartRecognition = async () => {
    if (!sampleUploadState.uploaded) {
      return;
    }
    setAnalysisError(null, undefined);
    if (!sampleUploadState.fileBase64) {
      setAnalysisError('请先上传参考示例文件', '参考示例文件 base64 内容为空');
      return;
    }

    if (compareResult && compareCandidateSections.length > 0 && effectiveCompareCandidateFields.length === 0) {
      setAnalysisError('请至少勾选一个章节', '当前已生成章节候选，但没有勾选任何章节，无法生成参数');
      return;
    }

    setIsRecognizing(true);
    setRecognitionCacheStatus(null);
    setRecognitionCacheUpdatedAt(null);
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const prefetchedUnderstanding = await ensureUnderstandingForRecognition();
      if (!prefetchedUnderstanding) {
        return;
      }
      const workflowRequest = await buildWorkflowRequest({
        includeUnderstanding: true,
        useSelectedCompareCandidates: true,
        prefetchedUnderstanding,
      });
      const templateDocumentIr = workflowRequest.request.templateDocumentIr as DocumentIR;
      const sectionResults: WordSectionGenerationResult[] = [];
      const sectionSuggestions: AISuggestion[] = [];
      const understandingSummaryText = buildWordUnderstandingSummaryText(prefetchedUnderstanding);

      setRecognitionResult(null);

      addDebugLog(
        'info',
        'Word 章节参数生成开始',
        [
          `executor: ${analysisExecutor}`,
          `thinking: ${analysisThinkingEnabled ? 'on' : 'off'}`,
          `章节数: ${selectedRecognitionSections.length}`,
          `语言配置: ${workflowSourceLanguage} -> ${workflowTargetLanguages.join(', ') || '单语言'}`,
          '',
          '章节列表:',
          ...selectedRecognitionSections.map((section) => `- ${section.sectionTitle} | 候选 ${section.candidates.length}`),
        ].join('\n')
      );

      for (const section of selectedRecognitionSections) {
        const detectedSection = detectedSectionMap.get(section.sectionKey);
        const excerpt = buildWordSectionExcerpt(templateDocumentIr, section, detectedSection);
        const sectionDocumentIr = buildWordSectionDocumentIR(templateDocumentIr, section, detectedSection);
        const sectionDocumentContent = buildWordSectionDocumentContent(templateDocumentIr, section, detectedSection);
        const structuredBilingualGroups = buildWordSectionPromptBilingualGroups(section);
        const candidateFieldList = buildWordSectionCandidateList(templateDocumentIr, section);
        const bilingualCandidatePairs = buildWordSectionBilingualPairList(templateDocumentIr, section);

        addDebugLog(
          'info',
          `Word 章节请求详情: ${section.sectionTitle}`,
          [
            `原始候选数: ${section.candidates.length}`,
            `分批上限: ${WORD_SECTION_RECOGNITION_BATCH_SIZE}`,
            `最大轮次: ${WORD_SECTION_RECOGNITION_MAX_ROUNDS}`,
            '【双语配对参考】',
            bilingualCandidatePairs,
            '',
            '',
            '【章节候选列表】',
            candidateFieldList,
            '',
            '【章节内容摘要】',
          ].join('\n')
        );
        const candidateById = new Map(section.candidates.map((candidate) => [candidate.candidateId, candidate] as const));
        const acceptedSuggestionsByCandidateId = new Map<string, AISuggestion>();
        const acceptedCandidateIds = new Set<string>();
        const retryLoopIds: string[] = [];
        const retryNormalIds: string[] = [];
        const unsentLoopIds = section.candidates
          .filter((candidate) => isWordLoopCompareCandidate(candidate))
          .map((candidate) => candidate.candidateId);
        const unsentNormalIds = section.candidates
          .filter((candidate) => !isWordLoopCompareCandidate(candidate))
          .map((candidate) => candidate.candidateId);
        const aggregatedQualityIssues = new Set<string>();
        const aggregatedPromptRequests: string[] = [];
        const aggregatedRawResponses: string[] = [];
        const chatSessionId = `office-word-section-${section.sectionKey}-${Date.now()}`;
        let executedRounds = 0;
        let aiCallSucceeded = false;
        let lastPromptDebugSummary: string | undefined;
        let lastError: any;

        for (let roundIndex = 1; roundIndex <= WORD_SECTION_RECOGNITION_MAX_ROUNDS; roundIndex += 1) {
          const currentBatch = takeWordRecognitionBatch({
            retryLoopIds,
            unsentLoopIds,
            retryNormalIds,
            unsentNormalIds,
            candidateById,
            acceptedIds: acceptedCandidateIds,
          });
          if (currentBatch.length === 0) {
            break;
          }

          executedRounds = roundIndex;
          const batchSection = buildWordSectionSubset(section, currentBatch);
          const batchStructuredCandidates = buildWordSectionPromptCandidates(templateDocumentIr, batchSection);
          const batchStructuredBilingualGroups = filterWordPromptBilingualGroupsByCandidates(
            structuredBilingualGroups,
            currentBatch
          );
          const batchCandidateFieldList = buildWordSectionCandidateList(templateDocumentIr, batchSection);
          const batchBilingualCandidatePairs = buildWordSectionBilingualPairList(templateDocumentIr, batchSection);
          const batchContainsLoop = currentBatch.some((candidate) => isWordLoopCompareCandidate(candidate));

          addDebugLog(
            'info',
            `Word 章节批次识别: ${section.sectionTitle}`,
            [
              `轮次: ${roundIndex}/${WORD_SECTION_RECOGNITION_MAX_ROUNDS}`,
              `会话: ${chatSessionId}`,
              `批次类型: ${batchContainsLoop ? '循环单独批次' : '普通批次'}`,
              `批次候选数: ${currentBatch.length}`,
              `已保留参数: ${acceptedCandidateIds.size}`,
              `批次 candidateIds: ${currentBatch.map((candidate) => candidate.candidateId).join(', ')}`,
            ].join('\n')
          );

          try {
            const executor = resolveAnalysisExecutor({
              apiBaseUrl,
              useMultiStage,
              requestedKind: analysisExecutor,
              thinking: roundIndex > 1 ? true : analysisThinkingEnabled,
              aiOrchestratorBaseUrl,
              aiOrchestratorAuthToken,
            });
            const response = await executor.analyze({
              host: 'word',
              documentIR: sectionDocumentIr,
              documentContent: sectionDocumentContent,
              documentType: 'docx',
              templateType: selectedTemplateType,
              context: [
                `当前阶段为 Word 章节参数生成。`,
                `只允许分析当前章节：${section.sectionTitle}。`,
                `当前为第 ${roundIndex}/${WORD_SECTION_RECOGNITION_MAX_ROUNDS} 轮批次识别。`,
                `源语言=${workflowSourceLanguage}，目标语言=${workflowTargetLanguages.join(', ') || '单语言'}。`,
              ].join('\n'),
              analysisStage: 'word-section-analysis',
              pairLabel: section.sectionTitle,
              globalUnderstandingSummary: understandingSummaryText,
              diffSummary: excerpt,
              diffOverview: excerpt,
              candidateFieldList: batchCandidateFieldList,
              bilingualCandidatePairs: batchBilingualCandidatePairs,
              wordSectionCandidates: batchStructuredCandidates,
              wordSectionBilingualGroups: batchStructuredBilingualGroups,
              wordSectionAcceptedSuggestions: buildAcceptedWordSuggestionSummaries(
                Array.from(acceptedSuggestionsByCandidateId.values())
              ),
              wordSectionRoundIndex: roundIndex,
              wordSectionMaxRounds: WORD_SECTION_RECOGNITION_MAX_ROUNDS,
              chatSessionId,
            });

            aiCallSucceeded = true;
            lastPromptDebugSummary = response?.contextAnalysis?.promptDebugSummary
              ? String(response.contextAnalysis.promptDebugSummary)
              : lastPromptDebugSummary;
            if (response?.contextAnalysis?.promptRequestText) {
              aggregatedPromptRequests.push(
                `【第 ${roundIndex} 轮请求】\n${String(response.contextAnalysis.promptRequestText)}`
              );
            }
            if (response?.contextAnalysis?.rawAiResponse) {
              aggregatedRawResponses.push(
                `【第 ${roundIndex} 轮返回】\n${String(response.contextAnalysis.rawAiResponse)}`
              );
            }

            const currentSuggestions = hydrateWordSectionSuggestions(
              templateDocumentIr,
              batchSection,
              excerpt,
              Array.isArray(response?.suggestions) ? response.suggestions as AISuggestion[] : []
            );
            const promptTraceDebugText = buildPromptTraceDebugText(
              response?.contextAnalysis?.promptRequestText
                ? String(response.contextAnalysis.promptRequestText)
                : undefined,
              response?.contextAnalysis?.rawAiResponse
                ? String(response.contextAnalysis.rawAiResponse)
                : undefined,
            );

            const failedCandidateIds: string[] = [];
            currentBatch.forEach((candidate) => {
              const bestSuggestion = selectBestWordSuggestionForCandidate(currentSuggestions, candidate.candidateId);
              if (isWordSuggestionHighQuality(bestSuggestion, candidate.candidateId)) {
                acceptedCandidateIds.add(candidate.candidateId);
                acceptedSuggestionsByCandidateId.set(candidate.candidateId, bestSuggestion as AISuggestion);
                return;
              }
              failedCandidateIds.push(candidate.candidateId);
            });

            if (response?.contextAnalysis?.salvagedMalformedJson) {
              aggregatedQualityIssues.add(`第 ${roundIndex} 轮 AI 返回存在轻度 JSON 污染，结果已按容错逻辑修复`);
            }
            if (currentSuggestions.length === 0) {
              aggregatedQualityIssues.add(`第 ${roundIndex} 轮当前批次未返回结构化参数建议`);
            }
            if (failedCandidateIds.length > 0) {
              aggregatedQualityIssues.add(`第 ${roundIndex} 轮有 ${failedCandidateIds.length} 个候选未通过质量校验`);
            }

            appendUniqueCandidateIds(
              batchContainsLoop ? retryLoopIds : retryNormalIds,
              failedCandidateIds.filter((candidateId) => !acceptedCandidateIds.has(candidateId))
            );

            addDebugLog(
              failedCandidateIds.length > 0 ? 'warn' : 'info',
              `Word 章节批次完成: ${section.sectionTitle}`,
              [
                `轮次: ${roundIndex}/${WORD_SECTION_RECOGNITION_MAX_ROUNDS}`,
                `批次候选: ${currentBatch.length}`,
                `本轮通过: ${currentBatch.length - failedCandidateIds.length}`,
                `累计保留: ${acceptedCandidateIds.size}/${section.candidates.length}`,
                failedCandidateIds.length > 0 ? `待继续识别: ${failedCandidateIds.join(', ')}` : '本轮全部通过质量校验',
                '',
                promptTraceDebugText,
              ].filter(Boolean).join('\n')
            );
          } catch (error: any) {
            lastError = error;
            appendUniqueCandidateIds(
              retryLoopIds,
              currentBatch
                .filter((candidate) => isWordLoopCompareCandidate(candidate))
                .map((candidate) => candidate.candidateId)
            );
            appendUniqueCandidateIds(
              retryNormalIds,
              currentBatch
                .filter((candidate) => !isWordLoopCompareCandidate(candidate))
                .map((candidate) => candidate.candidateId)
            );

            const errorMessage = error?.message || '章节参数生成失败';
            const errorPromptTraceDebugText = buildPromptTraceDebugText(
              error?.details?.promptRequestText
                ? String(error.details.promptRequestText)
                : error?.response?.data?.contextAnalysis?.promptRequestText
                  ? String(error.response.data.contextAnalysis.promptRequestText)
                  : undefined,
              error?.details?.rawAiResponse
                ? String(error.details.rawAiResponse)
                : error?.response?.data?.contextAnalysis?.rawAiResponse
                  ? String(error.response.data.contextAnalysis.rawAiResponse)
                  : undefined,
            );
            aggregatedQualityIssues.add(`第 ${roundIndex} 轮调用执行器失败: ${errorMessage}`);

            addDebugLog(
              roundIndex < WORD_SECTION_RECOGNITION_MAX_ROUNDS ? 'warn' : 'error',
              roundIndex < WORD_SECTION_RECOGNITION_MAX_ROUNDS
                ? `Word 章节批次失败，准备下一轮: ${section.sectionTitle}`
                : `Word 章节批次失败，已达最大轮次: ${section.sectionTitle}`,
              [
                `轮次: ${roundIndex}/${WORD_SECTION_RECOGNITION_MAX_ROUNDS}`,
                `错误: ${errorMessage}`,
                error?.details ? JSON.stringify(error.details, null, 2) : '',
                '',
                errorPromptTraceDebugText,
              ].filter(Boolean).join('\n')
            );
          }

          if (acceptedCandidateIds.size >= section.candidates.length) {
            break;
          }
        }

        const acceptedSuggestions = dedupeWordSectionSuggestions(
          Array.from(acceptedSuggestionsByCandidateId.values())
        );
        sectionSuggestions.push(...acceptedSuggestions);

        const unresolvedCount = section.candidates.length - acceptedCandidateIds.size;
        if (unresolvedCount > 0) {
          aggregatedQualityIssues.add(
            `章节仍有 ${unresolvedCount} 个候选在 ${WORD_SECTION_RECOGNITION_MAX_ROUNDS} 轮内未通过质量校验`
          );
        }

        sectionResults.push({
          sectionKey: section.sectionKey,
          sectionTitle: section.sectionTitle,
          candidateCount: section.candidates.length,
          suggestionCount: acceptedSuggestions.length,
          suggestionIds: acceptedSuggestions.map((suggestion) => suggestion.id),
          aiCallSucceeded,
          usedRetry: executedRounds > 1,
          retryCount: Math.max(0, executedRounds - 1),
          excerpt,
          promptDebugSummary: lastPromptDebugSummary,
          promptRequestText: aggregatedPromptRequests.join('\n\n'),
          rawAiResponse: aggregatedRawResponses.join('\n\n'),
          qualityIssues: Array.from(aggregatedQualityIssues),
          error: !aiCallSucceeded && lastError
            ? {
                message: lastError?.message || '章节参数生成失败',
                reason: lastError?.details?.reason,
                url: lastError?.details?.url,
                status: lastError?.details?.status,
              }
            : undefined,
        });

        addDebugLog(
          acceptedSuggestions.length > 0 ? 'info' : 'warn',
          `Word 章节参数生成完成: ${section.sectionTitle}`,
          [
            `候选数: ${section.candidates.length}`,
            `保留参数: ${acceptedSuggestions.length}`,
            `执行轮次: ${executedRounds}`,
            `会话: ${chatSessionId}`,
            unresolvedCount > 0 ? `未完成候选: ${unresolvedCount}` : '全部候选已完成识别',
          ].join('\n')
        );
      }

      addDebugLog(
        'info',
        'Word 参数识别总览',
        [
          sectionSuggestions.length > 0
            ? `本次共处理 ${sectionResults.length} 个章节，累计候选 ${sectionResults.reduce((sum, section) => sum + section.candidateCount, 0)} 个，生成参数 ${sectionSuggestions.length} 个。`
            : `本次已处理 ${sectionResults.length} 个章节，但当前还没有产出可落地的参数建议。`,
          '',
          '【章节处理明细】',
          ...sectionResults.map((section, index) => {
            const status = section.error ? '失败' : section.suggestionCount > 0 ? '成功' : '空结果';
            const detailLines = [
              `${index + 1}. ${section.sectionTitle}`,
              `状态: ${status}`,
              `候选: ${section.candidateCount}`,
              `参数: ${section.suggestionCount}`,
              `重试: ${section.usedRetry ? `是（${section.retryCount} 次）` : '否'}`,
            ];

            if (section.promptDebugSummary) {
              detailLines.push(`摘要: ${section.promptDebugSummary}`);
            }
            if (section.promptRequestText || section.rawAiResponse) {
              detailLines.push(buildPromptTraceDebugText(section.promptRequestText, section.rawAiResponse));
            }
            if (section.qualityIssues && section.qualityIssues.length > 0) {
              detailLines.push(`质量提示: ${section.qualityIssues.join(' | ')}`);
            }
            if (section.error?.message) {
              detailLines.push(`错误: ${section.error.message}`);
            }

            return detailLines.join('\n');
          }),
        ].join('\n')
      );

      const nextSuggestions = dedupeWordSectionSuggestions(sectionSuggestions);
      const nextCollapsedRecognitionSections = selectedRecognitionSections.reduce<Record<string, boolean>>((acc, section) => {
        acc[section.sectionKey] = collapsedRecognitionSections[section.sectionKey] ?? false;
        return acc;
      }, {});
      const recognitionUpdatedAt = Date.now();
      const cachedRecognitionEntry = recognitionCacheKey
        ? loadWordRecognitionCache()[recognitionCacheKey]
        : undefined;
      const mergedRecognitionResult = mergeRecognitionResultWithAppliedCache({
        suggestions: nextSuggestions,
        sectionGenerationResults: sectionResults,
        collapsedSections: nextCollapsedRecognitionSections,
      }, cachedRecognitionEntry);

      setRecognitionResult(null);
      setSectionGenerationResults(mergedRecognitionResult.sectionGenerationResults);
      setSuggestions(mergedRecognitionResult.suggestions);
      setCollapsedRecognitionSections(mergedRecognitionResult.collapsedSections || {});
      if (recognitionCacheKey) {
        saveWordRecognitionCacheEntry({
          cacheKey: recognitionCacheKey,
          result: mergedRecognitionResult,
          updatedAt: recognitionUpdatedAt,
        });
      }
      persistCompareCacheRecognitionSnapshot(mergedRecognitionResult);
      setRecognitionCacheStatus('miss');
      setRecognitionCacheUpdatedAt(recognitionUpdatedAt);
    } catch (error: any) {
      setAnalysisError(error?.message || '参数识别失败', error?.stack || error?.response?.data ? JSON.stringify(error.response?.data, null, 2) : undefined);
      return;
    } finally {
      setIsRecognizing(false);
    }
    setRecognitionRevision(sampleUploadState.revision);
    setRecognitionLanguageSignature(languageSignature);
    setRecognitionCompareSignature(currentRecognitionCacheSignature);
    setRecognitionActivated(true);
  };

  const renderSectionSuggestionBlock = (section: CompareCandidateSection) => {
    const sectionResult = sectionGenerationResultMap.get(section.sectionKey);
    const sectionSuggestions = sectionSuggestionMap.get(section.sectionKey) || [];
    const sectionSuggestionGroups = buildWordSectionSuggestionDisplayGroups(section, sectionSuggestions);
    const groupName = sectionSuggestions[0]?.details?.chapter || section.sectionTitle;
    const sectionCollapsed = collapsedRecognitionSections[section.sectionKey] ?? false;
    const pendingCount = sectionSuggestions.filter((suggestion) => !suggestion.applied).length;
    const appliedCount = sectionSuggestions.filter((suggestion) => suggestion.applied).length;
    const groupSummary = sectionSuggestions.length > 0
      ? buildSuggestionGroupSummary(sectionSuggestions)
      : null;

    if (!sectionResult && !recognitionReady) {
      return null;
    }

    return (
      <div className="analysis-source-card analysis-source-card-compact" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="analysis-source-header word-summary-collapse-btn"
          style={{ width: '100%', border: 'none', background: 'transparent' }}
          onClick={() => toggleRecognitionSectionCollapse(section.sectionKey)}
        >
          <div className="analysis-source-title">生成参数</div>
          <div className="word-step-card-toggle-meta">
            <span className="analysis-source-badge source-ai">章节结果</span>
            <span>{sectionCollapsed ? '展开' : '收起'}</span>
          </div>
        </button>
        <div className="word-tag-list word-tag-list-compact">
          <span className="word-tag">章节 {section.sectionTitle}</span>
          <span className="word-tag">候选参数 {section.candidates.length}</span>
          {sectionResult && (
            <>
              <span className={`word-tag ${sectionResult.error ? 'risk-high' : sectionSuggestions.length > 0 ? 'success' : 'warning'}`}>
                生成参数 {sectionSuggestions.length}
              </span>
              {sectionResult.qualityIssues && sectionResult.qualityIssues.length > 0 && (
                <span className="word-tag warning">质量提示 {sectionResult.qualityIssues.length}</span>
              )}
            </>
          )}
          {groupSummary && (
            <>
              <span className="word-tag">平均置信度 {formatConfidence(groupSummary.averageConfidence)}</span>
              <span className="word-tag warning">待确认 {groupSummary.pendingReviewCount}</span>
              <span className="word-tag risk-high">高风险 {groupSummary.highRiskCount}</span>
            </>
          )}
        </div>
        {sectionResult?.error?.message && (
          <div className="word-status-summary-item warning">
            当前章节生成失败: {sectionResult.error.message}
          </div>
        )}
        {sectionResult?.qualityIssues && sectionResult.qualityIssues.length > 0 && !sectionResult.error?.message && (
          <div className="word-status-summary-item warning">
            {sectionResult.qualityIssues.join(' | ')}
          </div>
        )}
        {sectionCollapsed ? (
          <div className="word-step-placeholder">
            当前章节参数已折叠，点击“展开”查看生成参数与应用操作。
          </div>
        ) : !sectionResult ? (
          <div className="word-step-placeholder">
            点击“生成参数”后，这里会直接展示当前章节的生成参数值。
          </div>
        ) : sectionSuggestions.length === 0 ? (
          <div className="word-step-placeholder">
            当前章节还没有可展示的生成参数值。
          </div>
        ) : (
          <>
            <div className="excel-understanding-actions" style={{ margin: '12px 0' }}>
              <button
                className="sheet-action-btn"
                onClick={() => applyState.setActiveManualAddGroup(applyState.activeManualAddGroup === groupName ? null : groupName)}
              >
                {applyState.activeManualAddGroup === groupName ? '取消添加' : '添加参数'}
              </button>
              <button
                className="sheet-action-btn sheet-action-btn-primary"
                onClick={() => { void applyState.handleApplyGroup(groupName, persistAppliedRecognitionCache); }}
                disabled={pendingCount === 0}
              >
                应用 ({pendingCount})
              </button>
              <button
                className="sheet-action-btn"
                onClick={() => { void applyState.handleReapplyGroup(groupName, persistAppliedRecognitionCache); }}
                disabled={appliedCount === 0}
              >
                重新应用
              </button>
            </div>
            {applyState.activeManualAddGroup === groupName && (
              <ManualAddParamForm applyState={applyState} targetGroupName={groupName} />
            )}
            <div className="suggestion-list">
              {sectionSuggestionGroups.map((group) => (
                group.type === 'pair' ? (
                  <div
                    key={group.key}
                    style={{
                      border: '1px dashed #cbd5e1',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 12,
                      background: '#f8fafc',
                    }}
                  >
                    <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                      <span className="word-tag">双语成对显示</span>
                      {group.pairPath && (
                        <span className="word-tag">{group.pairPath}</span>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: 12,
                      }}
                    >
                      {group.suggestions.map((suggestion) => renderSuggestionCard(suggestion))}
                    </div>
                  </div>
                ) : (
                  renderSuggestionCard(group.suggestions[0])
                )
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const stepStatus = {
    upload: sampleUploadState.uploaded,
    compare: hasCompare,
    recognition: recognitionReady,
  };

  return (
    <div className="ai-identify-panel word-identify-panel">
      <section className="word-step-card">
        <button
          type="button"
          className="word-step-card-header word-step-card-toggle"
          onClick={() => setStep1Collapsed((current) => !current)}
        >
          <div>
            <div className="word-step-card-index">步骤 1</div>
            <h3>上传参考示例文件</h3>
          </div>
          <div className="word-step-card-toggle-meta">
            <span>{step1Collapsed ? '展开' : '收起'}</span>
          </div>
        </button>
        {!step1Collapsed && (
          <div className="word-sample-upload-section">
            <TemplateConfigPanel
              variant="upload-only"
              uploadStatusLabel={uploadStatusLabel}
              uploadStatusTone={uploadStatusTone}
              uploadActionSlot={(
                <div className="word-understanding-inline-actions">
                  <div className="word-understanding-inline-header">
                    <div className="word-understanding-inline-copy">
                      <div className="word-understanding-inline-title">全文理解</div>
                      <div className="word-understanding-inline-description">{understandingActionHint}</div>
                    </div>
                    <span className={`word-tag ${understandingStatusTone || ''}`}>{understandingStatusLabel}</span>
                  </div>
                  <div className="word-understanding-inline-toolbar">
                    <button
                      type="button"
                      className="sheet-action-btn sheet-action-btn-primary"
                      onClick={() => { void handleStartUnderstanding(); }}
                      disabled={isUnderstanding || !sampleUploadState.uploaded}
                    >
                      {isUnderstanding
                        ? '理解中...'
                        : displayedUnderstandingSummaryResult
                          ? '重新理解全文'
                          : '理解全文'}
                    </button>
                    {understandingCacheTimeText && !understandingStale && (
                      <span className="word-tag">缓存于 {understandingCacheTimeText}</span>
                    )}
                  </div>
                  <div className="word-understanding-inline-footnote">{understandingCacheDescription}</div>
                </div>
              )}
              onUploadStateChange={handleSampleUploadStateChange}
            />
            {displayedUnderstandingSummaryResult && (
              <>
                <div className="word-sample-understanding-summary">
                  <button
                    type="button"
                    className="word-summary-collapse-btn"
                    onClick={() => setUnderstandingSummaryCollapsed((current) => !current)}
                  >
                    <span>全文理解摘要</span>
                    <span>{understandingSummaryCollapsed ? '展开' : '收起'}</span>
                  </button>
                  {!understandingSummaryCollapsed && (
                    <div className="word-sample-understanding-summary-text">
                      {understandingSummaryText}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className={`word-step-card ${!sampleUploadState.uploaded ? 'is-disabled' : ''}`}>
        <button
          type="button"
          className="word-step-card-header word-step-card-toggle"
          onClick={() => setStep2Collapsed((current) => !current)}
        >
          <div>
            <div className="word-step-card-index">步骤 2</div>
            <h3>参数查询、识别与验证</h3>
          </div>
          <div className="word-step-card-toggle-meta">
            {stepStatus.compare && <span className="word-step-status success">候选池已生成</span>}
            {stepStatus.recognition && <span className="word-step-status success">参数已识别</span>}
            <span>{step2Collapsed ? '展开' : '收起'}</span>
          </div>
        </button>

        {!step2Collapsed && (
          <>
        {!sampleUploadState.uploaded && (
          <div className="word-step-placeholder">
            请先完成第一步上传参考示例文件，第二步才会解锁。
          </div>
        )}

        {sampleUploadState.uploaded && (
          <>
            <div className="word-compare-toolbar-card">
              <div className="word-compare-toolbar-header">
                <div className="word-compare-toolbar-copy">
                  <div className="analysis-source-title">参数查询设置</div>
                  <div className="word-compare-toolbar-meta">
                    选择合同类型与标题语言，命中本地缓存时会自动回填候选章节。
                  </div>
                </div>
                <div className="excel-understanding-actions word-compare-toolbar-actions">
                  <button
                    className="sheet-action-btn sheet-action-btn-primary"
                    onClick={() => { void handleStartCompare(); }}
                    disabled={isComparing || !sampleUploadState.uploaded}
                  >
                    {isComparing ? (
                      <span className="analyzing-indicator">
                        <span className="spinner"></span>
                        <span className="loading-text">查询</span>
                      </span>
                    ) : '查询'}
                  </button>
                  <button
                    type="button"
                    className="sheet-action-btn"
                    onClick={() => { void handleHighlightCompareCandidates(); }}
                    disabled={!compareResult || isComparing || isHighlightingCandidates}
                  >
                    {isHighlightingCandidates ? '高亮中...' : '高亮'}
                  </button>
                  <button
                    type="button"
                    className="sheet-action-btn"
                    onClick={() => { void handleClearCompareHighlights(); }}
                    disabled={isClearingHighlights}
                  >
                    {isClearingHighlights ? '清除中...' : '清除高亮'}
                  </button>
                </div>
              </div>
              <div className="word-understanding-config-grid word-understanding-config-grid-compact">
                <div className="template-type-selector word-compact-selector">
                  <label>类型</label>
                  <div className="word-language-mode-list">
                    <label className={`word-language-mode ${selectedTemplateType === 'contract' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="word-compare-document-type"
                        checked={selectedTemplateType === 'contract'}
                        onChange={() => handleCompareDocumentTypeChange('contract')}
                      />
                      合同
                    </label>
                    <label className={`word-language-mode ${selectedTemplateType !== 'contract' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="word-compare-document-type"
                        checked={selectedTemplateType !== 'contract'}
                        onChange={() => handleCompareDocumentTypeChange('report')}
                      />
                      其他
                    </label>
                  </div>
                </div>
                <div className="template-type-selector word-compact-selector">
                  <label>语言</label>
                  <div className="word-language-mode-list">
                    <label className={`word-language-mode ${effectiveCompareHeadingLanguages.includes('zh') ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={effectiveCompareHeadingLanguages.includes('zh')}
                        onChange={() => handleCompareHeadingLanguageToggle('zh')}
                      />
                      中文
                    </label>
                    <label className={`word-language-mode ${effectiveCompareHeadingLanguages.includes('ja') ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={effectiveCompareHeadingLanguages.includes('ja')}
                        onChange={() => handleCompareHeadingLanguageToggle('ja')}
                      />
                      日语
                    </label>
                    <label className={`word-language-mode ${effectiveCompareHeadingLanguages.includes('en') ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={effectiveCompareHeadingLanguages.includes('en')}
                        onChange={() => handleCompareHeadingLanguageToggle('en')}
                      />
                      英语
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {compareResult && (
              <>
                <div className="analysis-source-card analysis-source-card-compact word-compare-summary-card">
                  <div
                    className="excel-reference-card-group-header"
                    onClick={() => setCompareSummaryCollapsed((value) => !value)}
                    style={{ userSelect: 'none' }}
                  >
                    <div>
                      <div className="analysis-source-title">查询摘要</div>
                      <div className="excel-reference-card-group-meta">
                        本次共生成 {compareResult.compareSummary.candidateCount} 个候选字段，覆盖 {compareResult.compareSummary.sectionCount} 个章节区域。
                      </div>
                    </div>
                    <span className="analysis-source-badge source-ai">查询结果</span>
                  </div>
                  {!compareSummaryCollapsed && (
                    <>
                      <div className="word-summary-paragraph">
                        本次共生成 {compareResult.compareSummary.candidateCount} 个候选字段，覆盖 {compareResult.compareSummary.sectionCount} 个章节区域。
                      </div>
                      <div className="word-tag-list word-tag-list-compact">
                        <span className="word-tag">类型: {getCompareDocumentTypeLabel(selectedTemplateType)}</span>
                        <span className="word-tag">语言: {getCompareHeadingLanguageSummary(effectiveCompareHeadingLanguages)}</span>
                        {compareCacheStatus && (
                          <span className={`word-tag ${compareCacheStatus === 'hit' ? 'success' : ''}`}>
                            {compareCacheStatus === 'hit' ? '候选缓存命中' : '候选已缓存'}
                          </span>
                        )}
                        {compareCacheUpdatedAt && (
                          <span className="word-tag">缓存于 {new Date(compareCacheUpdatedAt).toLocaleString()}</span>
                        )}
                        <span className="word-tag">queryId: {compareResult.compareId}</span>
                        <span className="word-tag success">候选字段 {compareResult.compareSummary.candidateCount}</span>
                        <span className="word-tag">章节 {compareResult.compareSummary.sectionCount}</span>
                        {derivedPrimaryChapters.length > 0 && (
                          <span className="word-tag success">拆分章节 {derivedPrimaryChapters.length}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="analysis-source-card">
                  <div
                    className="excel-reference-card-group-header"
                    onClick={() => setCompareSectionsCollapsed((value) => !value)}
                    style={{ userSelect: 'none' }}
                  >
                    <div>
                      <div className="analysis-source-title">候选章节</div>
                      <div className="excel-reference-card-group-meta">
                        {derivedPrimaryChapters.length > 0 ? '按章节候选参数' : '候选池预览'}
                        {compareCandidateSections.length > 0 ? ` · 已选章节 ${selectedCompareSectionKeys.length} / ${compareCandidateSections.length}` : ''}
                      </div>
                    </div>
                    <div className="excel-understanding-actions" onClick={(event) => event.stopPropagation()}>
                      {compareCandidateSections.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="sheet-action-btn"
                            onClick={() => setAllCompareSectionsSelected(true)}
                          >
                            全选
                          </button>
                          <button
                            type="button"
                            className="sheet-action-btn"
                            onClick={() => setAllCompareSectionsSelected(false)}
                          >
                            清空
                          </button>
                          <label className="checkbox-label excel-analysis-chip">
                            <input
                              type="checkbox"
                              checked={analysisThinkingEnabled}
                              onChange={(event) => setAnalysisThinkingEnabled(event.target.checked)}
                            />
                            <span>think</span>
                          </label>
                          <button
                            type="button"
                            className="sheet-action-btn sheet-action-btn-primary word-main-action-btn"
                            onClick={() => { void handleStartRecognition(); }}
                            disabled={recognitionBlocked || isRecognizing || isUnderstanding}
                          >
                            {isRecognizing ? '生成中...' : recognitionReady ? '重新生成参数' : '生成参数'}
                          </button>
                          <button
                            type="button"
                            className="sheet-action-btn"
                            onClick={() => {
                              void (pendingSuggestionCount > 0
                                ? applyState.handleApplyAll(persistAppliedRecognitionCache)
                                : applyState.handleReapplyAll(persistAppliedRecognitionCache));
                            }}
                            disabled={totalSuggestionCount === 0}
                            title={pendingSuggestionCount > 0 ? '一键应用全部未应用的参数' : '当前无待应用参数，将重新应用全部参数'}
                          >
                            全部应用 {totalSuggestionCount > 0 ? `(${pendingSuggestionCount > 0 ? pendingSuggestionCount : totalSuggestionCount})` : ''}
                          </button>
                        </>
                      )}
                      <span className="analysis-source-badge source-ai">候选池</span>
                    </div>
                  </div>
                  {!compareSectionsCollapsed && (
                    <div className="analysis-pair-results">
                      <div className="word-compare-section-list">
                        {compareCandidateSections.map((section) => (
                          <div
                            key={section.sectionKey}
                            className={`word-compare-section-card ${(selectedCompareSections[section.sectionKey] ?? true) ? '' : 'is-unselected'}`}
                          >
                            <div
                              className="word-highlight-card-header"
                              style={{ gap: 12 }}
                            >
                              <div
                                className="word-highlight-field-title word-compare-section-title-row"
                                style={{ cursor: 'pointer', flex: 1 }}
                                onClick={() => toggleCompareSectionCollapse(section.sectionKey)}
                              >
                                <label
                                  className="sheet-pair-checkbox word-compare-section-checkbox"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedCompareSections[section.sectionKey] ?? true}
                                    onChange={() => toggleCompareSectionSelection(section.sectionKey)}
                                  />
                                </label>
                                <div className="word-compare-section-title-text">
                                  <strong>{section.sectionTitle}</strong>
                                  <span className="word-compare-section-count">候选 {section.candidates.length}</span>
                                </div>
                              </div>
                              <div className="analysis-pair-result-meta">
                                {section.isAttachment ? '附件 · ' : ''}
                                {selectedCompareSections[section.sectionKey] ?? true ? '已选 · ' : '未选 · '}
                                <button
                                  type="button"
                                  className="word-summary-collapse-btn"
                                  onClick={() => toggleCompareSectionCollapse(section.sectionKey)}
                                >
                                  {collapsedCompareSections[section.sectionKey] ?? true ? '展开' : '收起'}
                                </button>
                              </div>
                            </div>
                            {!(collapsedCompareSections[section.sectionKey] ?? true) && (
                              <div className="word-compare-candidate-list">
                                {buildWordCompareCandidateDisplayGroups(section).map((group) => (
                                  group.type === 'sentence_pair' || group.type === 'cell_pair' ? (
                                    <div
                                      key={group.key}
                                      style={{
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: 12,
                                        padding: 12,
                                        marginBottom: 12,
                                        background: '#f8fafc',
                                      }}
                                    >
                                      <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                                        <span className="word-tag">
                                          {group.type === 'cell_pair' ? '单元格双语对照' : '双语句子对照'}
                                        </span>
                                        {group.type === 'cell_pair' && typeof group.tableIndex === 'number' && (
                                          <span className="word-tag">表格 {group.tableIndex + 1}</span>
                                        )}
                                        {group.type === 'cell_pair' && typeof group.rowIndex === 'number' && (
                                          <span className="word-tag">行 {group.rowIndex + 1}</span>
                                        )}
                                        {group.type === 'cell_pair' && typeof group.cellIndex === 'number' && (
                                          <span className="word-tag">列 {group.cellIndex + 1}</span>
                                        )}
                                        <span className="word-tag">
                                          {`${getLanguageHintLabel(group.leftLanguage)} ${group.leftCandidates?.length || 0} : ${group.rightCandidates?.length || 0} ${getLanguageHintLabel(group.rightLanguage)}`}
                                        </span>
                                      </div>
                                      <div
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                                          gap: 12,
                                        }}
                                      >
                                        <div>
                                          <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                                            <span className="word-tag">{getLanguageHintLabel(group.leftLanguage)}</span>
                                            <span className="word-tag">候选 {group.leftCandidates?.length || 0}</span>
                                          </div>
                                          {(group.leftCandidates || []).map((candidate) => (
                                            <WordCompareCandidateCard
                                              key={candidate.candidateId}
                                              candidate={candidate}
                                              onSave={updateCompareCandidate}
                                              onDelete={deleteCompareCandidate}
                                            />
                                          ))}
                                        </div>
                                        <div>
                                          <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                                            <span className="word-tag">{getLanguageHintLabel(group.rightLanguage)}</span>
                                            <span className="word-tag">候选 {group.rightCandidates?.length || 0}</span>
                                          </div>
                                          {(group.rightCandidates || []).map((candidate) => (
                                            <WordCompareCandidateCard
                                              key={candidate.candidateId}
                                              candidate={candidate}
                                              onSave={updateCompareCandidate}
                                              onDelete={deleteCompareCandidate}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  ) : group.type === 'loop_group' ? (
                                    <div
                                      key={group.key}
                                      style={{
                                        border: '1px solid #bfdbfe',
                                        borderRadius: 12,
                                        padding: 12,
                                        marginBottom: 12,
                                        background: '#f8fbff',
                                      }}
                                    >
                                      <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                                        <span className="word-tag">循环参数组</span>
                                        {typeof group.tableIndex === 'number' ? (
                                          <span className="word-tag">表格 {group.tableIndex + 1}</span>
                                        ) : null}
                                        <span className="word-tag">候选 {(group.candidates || []).length}</span>
                                      </div>
                                      {(group.loopPairs && group.loopPairs.length > 0) ? (
                                        <div style={{ display: 'grid', gap: 12 }}>
                                          {group.loopPairs.map((pair) => (
                                            <div
                                              key={pair.key}
                                              style={{
                                                border: '1px dashed #cbd5e1',
                                                borderRadius: 12,
                                                padding: 12,
                                                background: '#fff',
                                              }}
                                            >
                                              <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                                                <span className="word-tag">
                                                  {typeof pair.cellIndex === 'number' ? `列 ${pair.cellIndex + 1}` : '表头列'}
                                                </span>
                                                <span className="word-tag">
                                                  {`${getLanguageHintLabel(pair.leftLanguage)} ${pair.leftCandidates.length} : ${pair.rightCandidates.length} ${getLanguageHintLabel(pair.rightLanguage)}`}
                                                </span>
                                              </div>
                                              <div
                                                style={{
                                                  display: 'grid',
                                                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                                                  gap: 12,
                                                }}
                                              >
                                                <div>
                                                  <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                                                    <span className="word-tag">{getLanguageHintLabel(pair.leftLanguage)}</span>
                                                    <span className="word-tag">候选 {pair.leftCandidates.length}</span>
                                                  </div>
                                                  {(pair.leftCandidates || []).map((candidate) => (
                                                    <WordCompareCandidateCard
                                                      key={candidate.candidateId}
                                                      candidate={candidate}
                                                      onSave={updateCompareCandidate}
                                                      onDelete={deleteCompareCandidate}
                                                    />
                                                  ))}
                                                </div>
                                                <div>
                                                  <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                                                    <span className="word-tag">{getLanguageHintLabel(pair.rightLanguage)}</span>
                                                    <span className="word-tag">候选 {pair.rightCandidates.length}</span>
                                                  </div>
                                                  {(pair.rightCandidates || []).map((candidate) => (
                                                    <WordCompareCandidateCard
                                                      key={candidate.candidateId}
                                                      candidate={candidate}
                                                      onSave={updateCompareCandidate}
                                                      onDelete={deleteCompareCandidate}
                                                    />
                                                  ))}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        (group.candidates || []).map((candidate) => (
                                          <WordCompareCandidateCard
                                            key={candidate.candidateId}
                                            candidate={candidate}
                                            onSave={updateCompareCandidate}
                                            onDelete={deleteCompareCandidate}
                                          />
                                        ))
                                      )}
                                    </div>
                                  ) : (
                                    <div
                                      key={group.key}
                                      style={{
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 12,
                                        padding: 12,
                                        marginBottom: 12,
                                        background: '#fff',
                                      }}
                                    >
                                      <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                                        <span className="word-tag">单句参数组</span>
                                        <span className="word-tag">候选 {(group.candidates || []).length}</span>
                                      </div>
                                      {(group.candidates || []).map((candidate) => (
                                        <WordCompareCandidateCard
                                          key={candidate.candidateId}
                                          candidate={candidate}
                                          onSave={updateCompareCandidate}
                                          onDelete={deleteCompareCandidate}
                                        />
                                      ))}
                                    </div>
                                  )
                                ))}
                              </div>
                            )}
                            {(selectedCompareSections[section.sectionKey] ?? true) && renderSectionSuggestionBlock(section)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {compareResult.compareSummary.warnings.length > 0 && (
                    <div className="word-step-note warning">
                      {compareResult.compareSummary.warnings.join(' | ')}
                    </div>
                  )}
                </div>

                {!recognitionBlocked && recognitionReady && sectionProcessingSummary?.totalSuggestions === 0 ? (
                  <div className="word-step-placeholder">
                    当前章节还没有可展示的生成参数值，请检查各章节生成结果。
                  </div>
                ) : null}

                {recognitionReady && (
                  <div className="word-followup-section">
                    <DraftWorkflowSection
                      suggestions={suggestions}
                      isAnalyzing={isAnalyzing}
                      aiSkillGuide={aiSkillGuide}
                      draftId={draftId}
                      draftInfo={draftInfo}
                      latestBackendDraftInfo={latestBackendDraftInfo}
                      templateAssetNotice={draftWorkflowNotice}
                      isGeneratingGuide={isGeneratingGuide}
                      isVerifying={isVerifying}
                      isSavingDraft={isSavingDraft}
                      draftWorkflowCollapsed={draftWorkflowCollapsed}
                      guidePreviewCollapsed={guidePreviewCollapsed}
                      setDraftWorkflowCollapsed={setDraftWorkflowCollapsed}
                      setGuidePreviewCollapsed={setGuidePreviewCollapsed}
                      handleGenerateAISkillGuide={handleGenerateAISkillGuide}
                      handleVerifyTemplate={handleVerifyTemplate}
                      handleSaveDraft={handleSaveDraft}
                      handleLoadDraft={handleLoadDraft}
                      handleClearDraft={handleClearDraft}
                    />
                  </div>
                )}

                {recognitionReady && (aiSkillGuide || aiGeneratedData || previewResult || draftId || saveResult) && (
                  <VerifySaveSection
                    suggestions={suggestions}
                    aiSkillGuide={aiSkillGuide}
                    aiGeneratedData={aiGeneratedData}
                    previewResult={previewResult}
                    draftId={draftId}
                    saveResult={saveResult}
                    verifySaveCollapsed={verifySaveCollapsed}
                    setVerifySaveCollapsed={setVerifySaveCollapsed}
                    isGeneratingParams={isGeneratingParams}
                    analysisThinkingEnabled={analysisThinkingEnabled}
                    setAnalysisThinkingEnabled={setAnalysisThinkingEnabled}
                    aiDescription={aiDescription}
                    handleAiDescriptionChange={handleAiDescriptionChange}
                    handleGenerateParameters={handleGenerateParameters}
                    aiGenerateResult={aiGenerateResult}
                    isPreviewing={isPreviewing}
                    handlePreviewWithAIParams={handlePreviewWithAIParams}
                    previewInlineSupported={previewInlineSupported}
                    apiBaseUrl={apiBaseUrl}
                    getDownloadLabel={getDownloadLabel}
                    templateName={templateName}
                    setTemplateName={setTemplateName}
                    selectedTemplateType={selectedTemplateType}
                    isSaving={isSaving}
                    handleSaveTemplateAndGuide={handleSaveTemplateAndGuide}
                  />
                )}
              </>
            )}
          </>
        )}
          </>
        )}
      </section>

      <button
        className="debug-toggle-btn"
        onClick={() => setShowDebugPanel(!showDebugPanel)}
      >
        {showDebugPanel ? '隐藏日志' : '显示日志'}
      </button>

      {analysisError && (
        <div className="error-message-container">
          <div className="error-message" onClick={() => setShowErrorDetails(!showErrorDetails)}>
            <span className="error-icon">❌</span>
            <span className="error-text">{analysisError}</span>
            <span className="error-toggle">{showErrorDetails ? '▼' : '▶'}</span>
          </div>
          {showErrorDetails && analysisErrorDetails && (
            <div className="error-details">
              <pre>{analysisErrorDetails}</pre>
            </div>
          )}
        </div>
      )}

      {(analysisError || recentErrorLogs.length > 0) && (
        <section className="word-error-log-section">
          <div className="word-error-log-header">
            <h3>识别错误日志</h3>
            <span>Word 页底部固定展示，便于直接排查 500</span>
          </div>
          {analysisError && (
            <div className="word-error-log-card latest">
              <div className="word-error-log-title">当前错误</div>
              <div className="word-error-log-message">{analysisError}</div>
              <pre className="word-error-log-pre">
                {analysisErrorDetails || analysisError}
              </pre>
            </div>
          )}
          {recentErrorLogs.length > 0 && (
            <div className="word-error-log-list">
              {recentErrorLogs.map((log) => (
                <div key={log.id} className="word-error-log-card">
                  <div className="word-error-log-meta">
                    <span>[{log.level.toUpperCase()}]</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="word-error-log-message">{log.message}</div>
                  {log.details && (
                    <pre className="word-error-log-pre">{log.details}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
