import type { TemplateCompareResponse, TemplateUnderstandResponse } from '../../../api/carbone-api';
import type { AISuggestion } from '../../../app/store';
import { getHostScopedStorageKey } from '../../../shared/utils/host-storage';

export type SampleUploadStateLike = {
  uploaded?: boolean;
  fileName?: string;
  fileSize?: number;
  fileBase64?: string;
  revision: number;
};

export type WordSectionGenerationResult = {
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

export type WordRecognitionSnapshot = {
  suggestions: AISuggestion[];
  sectionGenerationResults: WordSectionGenerationResult[];
  collapsedSections?: Record<string, boolean>;
};

export type WordUnderstandingCacheEntry = {
  cacheKey: string;
  result: TemplateUnderstandResponse;
  updatedAt: number;
};

export type WordCompareCacheEntry = {
  cacheKey: string;
  result: TemplateCompareResponse & {
    recognitionSnapshot?: WordRecognitionSnapshot;
  };
  updatedAt: number;
};

export type WordRecognitionCacheEntry = {
  cacheKey: string;
  result: WordRecognitionSnapshot;
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

function normalizeCacheText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadWordUnderstandingCache(): Record<string, WordUnderstandingCacheEntry> {
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

export function loadWordCompareCache(): Record<string, WordCompareCacheEntry> {
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

export function loadWordRecognitionCache(): Record<string, WordRecognitionCacheEntry> {
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

function sanitizeWordRecognitionResultForStorage(result: WordRecognitionSnapshot): WordRecognitionSnapshot {
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

export function isWordCompareCacheCompatible(entry: WordCompareCacheEntry | undefined): boolean {
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

export function isWordRecognitionCacheCompatible(entry: WordRecognitionCacheEntry | undefined): boolean {
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

export function isWordUnderstandingCacheCompatible(entry: WordUnderstandingCacheEntry | undefined): boolean {
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

export function saveWordUnderstandingCacheEntry(entry: WordUnderstandingCacheEntry): void {
  const cache = loadWordUnderstandingCache();
  cache[entry.cacheKey] = entry;
  writeCacheMapToStorage(
    WORD_UNDERSTANDING_CACHE_STORAGE_KEY,
    cache,
    entry.cacheKey,
    WORD_UNDERSTANDING_CACHE_MAX_ENTRIES
  );
}

export function saveWordCompareCacheEntry(entry: WordCompareCacheEntry): void {
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

export function saveWordRecognitionCacheEntry(entry: WordRecognitionCacheEntry): void {
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

export function removeWordCompareCacheEntry(cacheKey: string): void {
  const cache = loadWordCompareCache();
  if (!cache[cacheKey]) {
    return;
  }
  delete cache[cacheKey];
  writeCacheMapToStorage(WORD_COMPARE_CACHE_STORAGE_KEY, cache, undefined, WORD_COMPARE_CACHE_MAX_ENTRIES);
}

export function removeWordUnderstandingCacheEntry(cacheKey: string): void {
  const cache = loadWordUnderstandingCache();
  if (!cache[cacheKey]) {
    return;
  }
  delete cache[cacheKey];
  writeCacheMapToStorage(WORD_UNDERSTANDING_CACHE_STORAGE_KEY, cache, undefined, WORD_UNDERSTANDING_CACHE_MAX_ENTRIES);
}

export function removeWordRecognitionCacheEntry(cacheKey: string): void {
  const cache = loadWordRecognitionCache();
  if (!cache[cacheKey]) {
    return;
  }
  delete cache[cacheKey];
  writeCacheMapToStorage(WORD_RECOGNITION_CACHE_STORAGE_KEY, cache, undefined, WORD_RECOGNITION_CACHE_MAX_ENTRIES);
}

export function mergeWordRecognitionResultWithAppliedCache(
  nextResult: WordRecognitionSnapshot,
  cachedEntry: WordRecognitionCacheEntry | undefined,
  dedupeSuggestions: (suggestions: AISuggestion[]) => AISuggestion[]
): WordRecognitionSnapshot {
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
  const mergedSuggestions = dedupeSuggestions([
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
  sampleUploadState: SampleUploadStateLike,
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
  sampleUploadState: SampleUploadStateLike,
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

export function buildWordUnderstandingCacheKey(
  templateDocumentIr: Record<string, any>,
  sampleUploadState: SampleUploadStateLike,
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

export function buildWordRecognitionCacheKey(
  templateDocumentIr: Record<string, any>,
  sampleUploadState: SampleUploadStateLike,
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

export function buildWordCompareCacheKey(
  templateDocumentIr: Record<string, any>,
  sampleUploadState: SampleUploadStateLike,
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

export function findLatestMatchingWordUnderstandingCacheEntry(options: {
  templateDocumentIr: Record<string, any>;
  sampleUploadState: SampleUploadStateLike;
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
