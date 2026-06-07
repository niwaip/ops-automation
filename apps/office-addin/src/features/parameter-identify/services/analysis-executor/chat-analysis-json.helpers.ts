import type { StructuredAnalyzeRequest } from './types';
import { normalizeChatSuggestions } from './chat-analysis-suggestion-normalizer.helpers';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveChatStreamUrl(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl);
  if (normalized.endsWith('/chat/stream')) {
    return normalized;
  }
  if (normalized.endsWith('/ai') || normalized.endsWith('/api/ai')) {
    return `${normalized}/chat/stream`;
  }
  return `${normalized}/ai/chat/stream`;
}

function tryParseJSONObject(content: string): Record<string, unknown> | null {
  const tryParse = (value: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const sanitizedVariants = buildSanitizedJsonCandidates(content);

  for (const candidate of sanitizedVariants) {
    const parsed = tryParse(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function stripThinkArtifacts(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/\[observation\]/gi, '')
    .trim();
}

function extractBalancedJsonObjects(content: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && startIndex >= 0) {
          results.push(content.slice(startIndex, index + 1).trim());
          startIndex = -1;
        }
      }
    }
  }

  return results;
}

function extractBalancedJsonObjectsLoose(content: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let startIndex = -1;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char === '{') {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && startIndex >= 0) {
          results.push(content.slice(startIndex, index + 1).trim());
          startIndex = -1;
        }
      }
    }
  }

  return results;
}

function extractJsonStringField(content: string, fieldName: string): string | undefined {
  const match = content.match(new RegExp(`"${fieldName}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 'i'));
  if (!match) {
    return undefined;
  }

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function extractJsonNumberField(content: string, fieldName: string): number | undefined {
  const match = content.match(new RegExp(`"${fieldName}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
  return match ? Number(match[1]) : undefined;
}

function extractJsonBooleanField(content: string, fieldName: string): boolean | undefined {
  const match = content.match(new RegExp(`"${fieldName}"\\s*:\\s*(true|false)`, 'i'));
  return match ? match[1].toLowerCase() === 'true' : undefined;
}

function countJsonFieldOccurrences(content: string, fieldName: string): number {
  return content.match(new RegExp(`"${fieldName}"\\s*:`, 'gi'))?.length || 0;
}

function isSuspiciousMalformedSuggestionObject(content: string): boolean {
  // Duplicate core keys usually mean the object was truncated or stitched together incorrectly.
  return ['id', 'type', 'elementPath', 'suggestedName', 'originalText']
    .some((fieldName) => countJsonFieldOccurrences(content, fieldName) > 1);
}

function salvageSuggestionRecordFromMalformedObject(content: string): Record<string, unknown> | null {
  if (isSuspiciousMalformedSuggestionObject(content)) {
    return null;
  }

  const id = extractJsonStringField(content, 'id');
  const type = extractJsonStringField(content, 'type');
  const suggestedName = extractJsonStringField(content, 'suggestedName');
  const elementPath = extractJsonStringField(content, 'elementPath');
  const originalText = extractJsonStringField(content, 'originalText');

  if (!id && !suggestedName && !elementPath) {
    return null;
  }

  const details: Record<string, unknown> = {};
  const detailStringFields = [
    'description',
    'fieldType',
    'loopType',
    'arrayPath',
    'tableName',
    'chapter',
    'significance',
    'displayPosition',
    'context',
  ];

  detailStringFields.forEach((fieldName) => {
    const value = extractJsonStringField(content, fieldName);
    if (typeof value === 'string') {
      details[fieldName] = value;
    }
  });

  const confidence = extractJsonNumberField(content, 'confidence');
  const applied = extractJsonBooleanField(content, 'applied');
  const context = extractJsonStringField(content, 'context');

  return {
    ...(id ? { id } : {}),
    ...(type ? { type } : {}),
    ...(elementPath ? { elementPath } : {}),
    ...(suggestedName ? { suggestedName } : {}),
    ...(originalText ? { originalText } : {}),
    ...(typeof confidence === 'number' ? { confidence } : {}),
    ...(typeof applied === 'boolean' ? { applied } : {}),
    ...(context ? { context } : {}),
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

function splitJsonObjectFragments(content: string): string[] {
  const readable = stripThinkArtifacts(content).trim();
  if (!readable) {
    return [];
  }

  const normalized = readable
    .replace(/^\[result\]\s*/i, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const arrayBody = normalized
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .trim();

  if (!arrayBody) {
    return [];
  }

  return arrayBody
    .split(/\}\s*,\s*\{/g)
    .map((fragment, index, fragments) => {
      const prefix = index === 0 ? '' : '{';
      const suffix = index === fragments.length - 1 ? '' : '}';
      return `${prefix}${fragment}${suffix}`.trim();
    })
    .filter(Boolean);
}

function buildSanitizedJsonCandidates(content: string): string[] {
  const trimmed = content.trim();
  const stripped = stripThinkArtifacts(trimmed);
  const candidates = new Set<string>();
  const fencedCandidates = [trimmed, stripped]
    .map((value) => value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));

  [trimmed, stripped, ...fencedCandidates].forEach((value) => {
    if (value) {
      candidates.add(value);
    }
  });

  [trimmed, stripped, ...fencedCandidates].forEach((value) => {
    extractBalancedJsonObjects(value).forEach((candidate) => {
      if (candidate) {
        candidates.add(candidate);
      }
    });
  });

  [trimmed, stripped, ...fencedCandidates].forEach((value) => {
    const normalized = value.replace(/^\[result\]\s*/i, '').trim();
    const firstObjectIndex = normalized.indexOf('{');
    if (firstObjectIndex >= 0) {
      candidates.add(normalized.slice(firstObjectIndex).trim());
    }
  });

  return Array.from(candidates);
}

function removeTrailingCommas(value: string): string {
  return value.replace(/,\s*([}\]])/g, '$1');
}

function buildSanitizedJsonArrayCandidates(content: string): string[] {
  const stripped = stripThinkArtifacts(content);
  const candidates = new Set<string>();
  const trimmed = stripped.trim();

  if (trimmed) {
    candidates.add(trimmed);
    candidates.add(removeTrailingCommas(trimmed));
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced) {
    candidates.add(fenced);
    candidates.add(removeTrailingCommas(fenced));
  }

  const normalized = trimmed.replace(/^\[result\]\s*/i, '').trim();
  const firstArrayIndex = normalized.indexOf('[');
  if (firstArrayIndex >= 0) {
    const arrayTail = normalized.slice(firstArrayIndex).trim();
    candidates.add(arrayTail);
    candidates.add(removeTrailingCommas(arrayTail));
    const balancedArray = extractBalancedSegment(normalized, firstArrayIndex, '[', ']');
    if (balancedArray) {
      candidates.add(balancedArray);
      candidates.add(removeTrailingCommas(balancedArray));
    }
  }

  return Array.from(candidates);
}

function extractReadableTextContent(content: string): string {
  const stripped = stripThinkArtifacts(content).trim();
  if (!stripped) {
    return '';
  }

  const fenced = stripped.match(/```(?:text|markdown|md|json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidate = fenced || stripped;

  return candidate
    .replace(/^\[result\]\s*/i, '')
    .trim();
}

function trimAfterLastMarker(content: string, markers: string[]): string {
  let text = content;

  markers.forEach((marker) => {
    const index = text.lastIndexOf(marker);
    if (index >= 0 && index + marker.length < text.length) {
      text = text.slice(index + marker.length).trim();
    }
  });

  return text.replace(/^[\s:：】\]\[]+/, '').trim();
}

function findStructuredHeadingStart(text: string): number | null {
  const headingPattern = /(?:^|\n)(###\s+.+|第[一二三四五六七八九十百千万零两0-9０-９]+[章节条編部節款項目][^\n]*|[一二三四五六七八九十]+、.+|[（(][^（）()\n]{1,20}[)）]|(?:article|Article|ARTICLE)\s*[0-9]+[^\n]*)/u;
  const match = text.match(headingPattern);
  return typeof match?.index === 'number' ? match.index : null;
}

export function sanitizeGlobalUnderstandingText(content: string): string {
  let text = extractReadableTextContent(content);
  if (!text) {
    return '';
  }

  text = trimAfterLastMarker(text, [
    '如果当前只看到 1 个真实数据 sheet，就如实说明当前工作簿中可见的真实数据范围，不要臆造其他 sheet。',
    '不要复述提示词规则，不要讨论模式、工具、task、skills 或 thinking。',
    '请直接输出“对整份工作簿的理解内容”，使用自然语言分段描述，不要返回 JSON。',
  ]);

  const headingStart = findStructuredHeadingStart(text);
  if (typeof headingStart === 'number' && headingStart > 0) {
    const candidate = text.slice(headingStart).trim();
    if (candidate.length >= Math.max(40, text.length / 4)) {
      text = candidate;
    }
  }

  const errorLeadPatterns = [
    '缺少待分析的数据文档',
    '未提供具体数据',
    '当前消息中未包含实际业务数据',
  ];
  const hasLeadingError = errorLeadPatterns.some((pattern) => text.startsWith(pattern) || text.includes(`"${pattern}"`));
  if (hasLeadingError) {
    const laterHeadingStart = findStructuredHeadingStart(text);
    if (typeof laterHeadingStart === 'number') {
      text = text.slice(laterHeadingStart).trim();
    }
  }

  return text.trim();
}

function extractBalancedSegment(content: string, startIndex: number, openChar: string, closeChar: string): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

export function tryParseJSONArray(content: string): Array<Record<string, unknown>> | null {
  const tryParse = (value: string): Array<Record<string, unknown>> | null => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
        : null;
    } catch {
      return null;
    }
  };

  const candidates = buildSanitizedJsonArrayCandidates(content);
  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractNamedJsonSegment(content: string, propertyName: string, openingChar: '[' | '{'): string | null {
  const normalized = stripThinkArtifacts(content);
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*\\${openingChar}`, 'i');
  const match = pattern.exec(normalized);
  if (!match) {
    return null;
  }

  const openingIndex = normalized.indexOf(openingChar, match.index);
  if (openingIndex < 0) {
    return null;
  }

  return extractBalancedSegment(normalized, openingIndex, openingChar, openingChar === '[' ? ']' : '}');
}

function salvageSuggestionRecords(content: string): Array<Record<string, unknown>> {
  const tryParseObjectCandidates = (candidates: string[]): Array<Record<string, unknown>> =>
    candidates
      .map((candidate) =>
        tryParseJSONObject(removeTrailingCommas(candidate)) || salvageSuggestionRecordFromMalformedObject(candidate)
      )
      .filter((value): value is Record<string, unknown> => Boolean(value));

  const suggestionArray = extractNamedJsonSegment(content, 'suggestions', '[');
  if (suggestionArray) {
    const parsedArray = tryParseJSONArray(suggestionArray);
    if (parsedArray && parsedArray.length > 0) {
      return parsedArray;
    }

    const objectCandidates = tryParseObjectCandidates(extractBalancedJsonObjects(suggestionArray));
    if (objectCandidates.length > 0) {
      return objectCandidates;
    }

    const looseObjectCandidates = tryParseObjectCandidates(extractBalancedJsonObjectsLoose(suggestionArray));
    if (looseObjectCandidates.length > 0) {
      return looseObjectCandidates;
    }
  }

  const readable = extractReadableTextContent(content);
  const firstArrayStart = readable.indexOf('[');
  if (firstArrayStart >= 0) {
    const balancedArray = extractBalancedSegment(readable, firstArrayStart, '[', ']');
    const parsedArray = balancedArray ? tryParseJSONArray(balancedArray) : null;
    if (parsedArray && parsedArray.length > 0) {
      return parsedArray;
    }
  }

  const strictCandidates = tryParseObjectCandidates(extractBalancedJsonObjects(readable));
  if (strictCandidates.length > 0) {
    return strictCandidates;
  }

  const looseCandidates = tryParseObjectCandidates(extractBalancedJsonObjectsLoose(readable));
  if (looseCandidates.length > 0) {
    return looseCandidates;
  }

  return tryParseObjectCandidates(splitJsonObjectFragments(readable));
}

function salvageContextAnalysis(content: string): Record<string, unknown> | undefined {
  const contextAnalysisObject = extractNamedJsonSegment(content, 'contextAnalysis', '{');
  if (!contextAnalysisObject) {
    return undefined;
  }

  return tryParseJSONObject(removeTrailingCommas(contextAnalysisObject)) || undefined;
}

function extractAlternativeSuggestionArray(parsed: Record<string, unknown>): unknown[] | undefined {
  const candidateKeys = [
    'suggestions',
    'fieldExtractionRules',
    'fields',
    '候选字段处理建议',
  ];

  for (const key of candidateKeys) {
    const value = parsed[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

export function salvageChatPayload(
  contents: string[],
  request: StructuredAnalyzeRequest
): { parsed: Record<string, unknown> | null; salvaged: boolean } {
  const parsed = contents
    .map((content) => tryParseJSONObject(content))
    .find((value): value is Record<string, unknown> => Boolean(value));
  if (parsed) {
    const parsedSuggestions = normalizeChatSuggestions(extractAlternativeSuggestionArray(parsed), request);
    if (parsedSuggestions.length > 0 || request.analysisStage === 'excel-global-understanding') {
      return {
        parsed: parsed.suggestions
          ? parsed
          : {
              ...parsed,
              suggestions: parsedSuggestions,
            },
        salvaged: false,
      };
    }
  }

  for (const content of contents) {
    const salvagedSuggestions = salvageSuggestionRecords(content);
    const salvagedContextAnalysis = salvageContextAnalysis(content);
    if (salvagedSuggestions.length > 0 || salvagedContextAnalysis) {
      return {
        parsed: {
          ...(salvagedContextAnalysis ? { contextAnalysis: salvagedContextAnalysis } : {}),
          suggestions: salvagedSuggestions,
        },
        salvaged: true,
      };
    }
  }

  return { parsed: parsed ?? null, salvaged: false };
}
