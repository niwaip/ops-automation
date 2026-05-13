import { carboneAPI } from '../api/carbone-api';
import { DocumentIR, HostType } from '../adapters/document-ir';
import { AISuggestion } from '../taskpane/store';
import { buildPairAnalysisChatPrompt } from './analysis-pair-prompt';
import { buildGeneralPromptTemplate, buildGlobalUnderstandingPromptTemplate } from './analysis-chat-prompt-templates';

export type AnalysisExecutorKind = 'studio' | 'chat';

export type AnalysisStage = 'general' | 'excel-global-understanding' | 'excel-pair-analysis';

export interface StructuredAnalyzeRequest {
  host: HostType;
  documentIR: DocumentIR;
  documentContent: string;
  documentType: 'docx' | 'xlsx' | 'pptx';
  templateType: string;
  context?: string;
  underlineInfo?: Array<Record<string, unknown>>;
  paragraphFormats?: Array<Record<string, unknown>>;
  analysisStage?: AnalysisStage;
  pairLabel?: string;
  globalUnderstandingSummary?: string;
  diffSummary?: string;
  diffOverview?: string;
  candidateFieldList?: string;
}

export class ChatAnalysisError extends Error {
  constructor(
    message: string,
    public readonly details: {
      stage?: AnalysisStage;
      pairLabel?: string;
      url?: string;
      status?: number;
      reason: string;
    }
  ) {
    super(message);
    this.name = 'ChatAnalysisError';
  }
}

export interface StructuredAnalysisExecutor {
  kind: AnalysisExecutorKind;
  requestedKind: AnalysisExecutorKind;
  supportsThinking: boolean;
  fallbackReason?: string;
  analyze(request: StructuredAnalyzeRequest): Promise<any>;
}

interface ResolveAnalysisExecutorOptions {
  apiBaseUrl: string;
  useMultiStage: boolean;
  requestedKind?: AnalysisExecutorKind;
  thinking?: boolean;
  aiOrchestratorBaseUrl?: string;
  aiOrchestratorAuthToken?: string;
}

class StudioAnalysisExecutor implements StructuredAnalysisExecutor {
  kind: AnalysisExecutorKind = 'studio';
  supportsThinking = false;

  constructor(
    public readonly requestedKind: AnalysisExecutorKind,
    private readonly options: ResolveAnalysisExecutorOptions,
    public readonly fallbackReason?: string
  ) {}

  async analyze(request: StructuredAnalyzeRequest): Promise<any> {
    carboneAPI.setBaseUrl(this.options.apiBaseUrl);
    return this.options.useMultiStage
      ? await carboneAPI.identifyDocumentMultiStage(request)
      : await carboneAPI.identifyDocumentDirect(request);
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveChatStreamUrl(baseUrl: string): string {
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

function looksLikeJson(content: string): boolean {
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

function salvageSuggestionRecordFromMalformedObject(content: string): Record<string, unknown> | null {
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

function sanitizeGlobalUnderstandingText(content: string): string {
  let text = extractReadableTextContent(content);
  if (!text) {
    return '';
  }

  text = trimAfterLastMarker(text, [
    '如果当前只看到 1 个真实数据 sheet，就如实说明当前工作簿中可见的真实数据范围，不要臆造其他 sheet。',
    '不要复述提示词规则，不要讨论模式、工具、task、skills 或 thinking。',
    '请直接输出“对整份工作簿的理解内容”，使用自然语言分段描述，不要返回 JSON。',
  ]);

  const headingMatch = text.match(/(?:^|\n)(###\s+.+|[一二三四五六七八九十]+、.+)/);
  if (headingMatch && headingMatch.index && headingMatch.index > 0) {
    const candidate = text.slice(headingMatch.index).trim();
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
    const laterHeading = text.match(/(?:\n|^)(###\s+.+|[一二三四五六七八九十]+、.+)/);
    if (laterHeading && typeof laterHeading.index === 'number') {
      text = text.slice(laterHeading.index).trim();
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

function tryParseJSONArray(content: string): Array<Record<string, unknown>> | null {
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

function salvageChatPayload(
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

function normalizeTextValue(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : undefined;
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function toColumnName(columnIndex: number): string {
  let value = columnIndex + 1;
  let result = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function toCellAddress(rowIndex: number, colIndex: number): string {
  return `${toColumnName(colIndex)}${rowIndex + 1}`;
}

function buildCompactExcelDocumentContext(documentIR: DocumentIR): string {
  const sheetElements = documentIR.elements
    .filter((element) => element.type === 'sheet')
    .sort((a, b) => Number(a.hostData?.sheetIndex ?? 0) - Number(b.hostData?.sheetIndex ?? 0));
  const cellElements = documentIR.elements
    .filter((element) => element.type === 'cell')
    .sort((a, b) => {
      const sheetDiff = Number(a.hostData?.sheetIndex ?? 0) - Number(b.hostData?.sheetIndex ?? 0);
      if (sheetDiff !== 0) {
        return sheetDiff;
      }
      const rowDiff = Number(a.hostData?.rowIndex ?? 0) - Number(b.hostData?.rowIndex ?? 0);
      if (rowDiff !== 0) {
        return rowDiff;
      }
      return Number(a.hostData?.colIndex ?? 0) - Number(b.hostData?.colIndex ?? 0);
    });

  const sections = sheetElements.map((sheet) => {
    const sheetIndex = Number(sheet.hostData?.sheetIndex ?? -1);
    const sheetName = normalizeTextValue(sheet.hostData?.sheetName) || normalizeTextValue(sheet.text) || `sheet_${sheetIndex}`;
    const sheetRole = normalizeTextValue(sheet.hostData?.sheetRole) || 'unknown';
    const pairIndex = Number(sheet.hostData?.pairIndex ?? -1);
    const tables = Array.isArray(sheet.hostData?.tables)
      ? (sheet.hostData?.tables as Array<Record<string, unknown>>)
          .map((table) => {
            const tableName = normalizeTextValue(table.name) || 'unnamed_table';
            const address = normalizeTextValue(table.address);
            return address ? `${tableName}(${address})` : tableName;
          })
          .slice(0, 5)
      : [];
    const sheetCells = cellElements.filter((cell) => Number(cell.hostData?.sheetIndex ?? -1) === sheetIndex);
    const sampleCells = sheetCells
      .filter((cell) => normalizeTextValue(cell.text))
      .slice(0, 18)
      .map((cell) => {
        const rowIndex = Number(cell.hostData?.rowIndex ?? 0);
        const colIndex = Number(cell.hostData?.colIndex ?? 0);
        const text = truncateText(normalizeTextValue(cell.text) || '', 24);
        return `${toCellAddress(rowIndex, colIndex)}=${text}`;
      });
    const formulaCount = sheetCells.filter((cell) => normalizeTextValue(cell.hostData?.formula)).length;

    return [
      `Sheet[${sheetIndex}] ${sheetName}`,
      `role=${sheetRole}`,
      pairIndex >= 0 ? `pair=${pairIndex + 1}` : undefined,
      `tables=${tables.length > 0 ? tables.join(', ') : 'none'}`,
      `formulaCells=${formulaCount}`,
      `samples=${sampleCells.length > 0 ? sampleCells.join(' | ') : 'none'}`,
    ]
      .filter(Boolean)
      .join(' ; ');
  });

  return sections.join('\n');
}

function buildExcelBusinessExcerpt(documentIR: DocumentIR, roleFilter: 'data' | 'mock' | 'all' = 'all'): string {
  const cellElements = documentIR.elements
    .filter((element) => element.type === 'cell')
    .sort((a, b) => {
      const sheetDiff = Number(a.hostData?.sheetIndex ?? 0) - Number(b.hostData?.sheetIndex ?? 0);
      if (sheetDiff !== 0) {
        return sheetDiff;
      }
      const rowDiff = Number(a.hostData?.rowIndex ?? 0) - Number(b.hostData?.rowIndex ?? 0);
      if (rowDiff !== 0) {
        return rowDiff;
      }
      return Number(a.hostData?.colIndex ?? 0) - Number(b.hostData?.colIndex ?? 0);
    });

  const filteredCells = cellElements.filter((cell) => {
    const role = normalizeTextValue(cell.hostData?.sheetRole) || 'unknown';
    if (roleFilter === 'all') {
      return true;
    }
    return role === roleFilter;
  });

  const cellsBySheet = new Map<number, typeof filteredCells>();
  filteredCells.forEach((cell) => {
    const sheetIndex = Number(cell.hostData?.sheetIndex ?? -1);
    const existing = cellsBySheet.get(sheetIndex) || [];
    existing.push(cell);
    cellsBySheet.set(sheetIndex, existing);
  });

  const sections = Array.from(cellsBySheet.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, sheetCells]) => {
      const firstCell = sheetCells[0];
      const sheetName = normalizeTextValue(firstCell?.hostData?.sheetName) || 'unknown_sheet';
      const rowMap = new Map<number, Array<{ colIndex: number; text: string }>>();

      sheetCells.forEach((cell) => {
        const rowIndex = Number(cell.hostData?.rowIndex ?? -1);
        const colIndex = Number(cell.hostData?.colIndex ?? -1);
        const text = normalizeTextValue(cell.text);
        if (rowIndex < 0 || colIndex < 0 || !text) {
          return;
        }
        const rowItems = rowMap.get(rowIndex) || [];
        rowItems.push({ colIndex, text: truncateText(text, 40) });
        rowMap.set(rowIndex, rowItems);
      });

      const rowSummaries = Array.from(rowMap.entries())
        .sort((a, b) => a[0] - b[0])
        .slice(0, 12)
        .map(([rowIndex, rowItems]) => {
          const sortedItems = rowItems.sort((a, b) => a.colIndex - b.colIndex);
          const pairSummaries: string[] = [];
          for (let index = 0; index < sortedItems.length - 1; index += 2) {
            const left = sortedItems[index];
            const right = sortedItems[index + 1];
            if (left?.text && right?.text) {
              pairSummaries.push(`${left.text}=${right.text}`);
            }
          }

          const summary = pairSummaries.length > 0
            ? pairSummaries.join('；')
            : sortedItems.map((item) => item.text).join(' | ');

          return `Row ${rowIndex + 1}: ${summary}`;
        });

      return [`Sheet ${sheetName}`, ...rowSummaries].join('\n');
    });

  return sections.join('\n\n');
}

function collectExcelSheetRows(
  documentIR: DocumentIR,
  roleFilter: 'data' | 'mock' | 'all' = 'all'
): Array<{
  sheetIndex: number;
  sheetName: string;
  sheetRole: string;
  pairIndex: number;
  tables: string[];
  rows: Array<{
    rowIndex: number;
    cells: Array<{ colIndex: number; text: string }>;
  }>;
}> {
  const sheetElements = documentIR.elements
    .filter((element) => element.type === 'sheet')
    .filter((element) => {
      if (roleFilter === 'all') {
        return true;
      }
      return normalizeTextValue(element.hostData?.sheetRole) === roleFilter;
    })
    .sort((a, b) => Number(a.hostData?.sheetIndex ?? 0) - Number(b.hostData?.sheetIndex ?? 0));
  const cellElements = documentIR.elements
    .filter((element) => element.type === 'cell')
    .filter((element) => {
      if (roleFilter === 'all') {
        return true;
      }
      return normalizeTextValue(element.hostData?.sheetRole) === roleFilter;
    });

  return sheetElements.map((sheet) => {
    const sheetIndex = Number(sheet.hostData?.sheetIndex ?? -1);
    const sheetName = normalizeTextValue(sheet.hostData?.sheetName) || normalizeTextValue(sheet.text) || `sheet_${sheetIndex}`;
    const sheetRole = normalizeTextValue(sheet.hostData?.sheetRole) || 'unknown';
    const pairIndex = Number(sheet.hostData?.pairIndex ?? -1);
    const tables = Array.isArray(sheet.hostData?.tables)
      ? (sheet.hostData?.tables as Array<Record<string, unknown>>)
          .map((table) => normalizeTextValue(table.name))
          .filter((value): value is string => Boolean(value))
      : [];
    const rowMap = new Map<number, Array<{ colIndex: number; text: string }>>();

    cellElements
      .filter((cell) => Number(cell.hostData?.sheetIndex ?? -1) === sheetIndex)
      .forEach((cell) => {
        const rowIndex = Number(cell.hostData?.rowIndex ?? -1);
        const colIndex = Number(cell.hostData?.colIndex ?? -1);
        const text = normalizeTextValue(cell.text);
        if (rowIndex < 0 || colIndex < 0 || !text) {
          return;
        }
        const rowItems = rowMap.get(rowIndex) || [];
        rowItems.push({ colIndex, text: truncateText(text, 40) });
        rowMap.set(rowIndex, rowItems);
      });

    const rows = Array.from(rowMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rowIndex, cells]) => ({
        rowIndex,
        cells: cells.sort((a, b) => a.colIndex - b.colIndex),
      }));

    return {
      sheetIndex,
      sheetName,
      sheetRole,
      pairIndex,
      tables,
      rows,
    };
  });
}

function buildExcelVisibleSheetSummary(documentIR: DocumentIR, roleFilter: 'data' | 'mock' | 'all' = 'all'): string {
  const sheets = collectExcelSheetRows(documentIR, roleFilter);
  if (sheets.length === 0) {
    return '未识别到可见 sheet。';
  }

  return sheets
    .map((sheet) => {
      const tableSegment = sheet.tables.length > 0 ? `；表格=${sheet.tables.join('、')}` : '';
      const pairSegment = sheet.pairIndex >= 0 ? `；对照组=${sheet.pairIndex + 1}` : '';
      return `${sheet.sheetName}（role=${sheet.sheetRole}${pairSegment}${tableSegment}）`;
    })
    .join('\n');
}

function extractGlobalUnderstandingText(contents: string[]): string | undefined {
  for (const content of contents) {
    const readableText = sanitizeGlobalUnderstandingText(content);
    if (!readableText || looksLikeJson(readableText)) {
      continue;
    }
    return readableText;
  }

  return undefined;
}

function buildCompactGeneralDocumentContext(documentIR: DocumentIR): string {
  const elementSummary = documentIR.elements
    .slice(0, 60)
    .map((element) => {
      const text = truncateText(normalizeTextValue(element.text) || '', 36);
      return `${element.type}:${text || '[empty]'}`;
    })
    .join('\n');

  return [
    `host=${documentIR.host}`,
    `elements=${documentIR.elements.length}`,
    `anchors=${documentIR.anchors.length}`,
    `stats=${JSON.stringify(documentIR.stats)}`,
    elementSummary,
  ].join('\n');
}

function buildCompactDocumentContext(request: StructuredAnalyzeRequest): string {
  if (request.host === 'excel') {
    return buildCompactExcelDocumentContext(request.documentIR);
  }

  return buildCompactGeneralDocumentContext(request.documentIR);
}

function normalizeContextAnalysisPayload(
  parsed: Record<string, unknown>,
  request: StructuredAnalyzeRequest
): Record<string, unknown> | undefined {
  const explicitContextAnalysis =
    parsed.contextAnalysis && typeof parsed.contextAnalysis === 'object'
      ? ({ ...(parsed.contextAnalysis as Record<string, unknown>) } as Record<string, unknown>)
      : undefined;

  const topLevelTheme = normalizeTextValue(parsed.theme);
  const topLevelEntities = Array.isArray(parsed.entities)
    ? (parsed.entities as unknown[]).map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const topLevelFieldHierarchy =
    parsed.field_hierarchy && typeof parsed.field_hierarchy === 'object'
      ? (parsed.field_hierarchy as Record<string, unknown>)
      : undefined;
  const topLevelNamingConventions =
    parsed.naming_conventions && typeof parsed.naming_conventions === 'object'
      ? (parsed.naming_conventions as Record<string, unknown>)
      : undefined;

  const contextAnalysis = explicitContextAnalysis || {};

  if (request.analysisStage === 'excel-global-understanding') {
    if (!normalizeTextValue(contextAnalysis.detectedTemplateType)) {
      contextAnalysis.detectedTemplateType = request.templateType || 'unknown';
    }
    if (!normalizeTextValue(contextAnalysis.userIntent)) {
      contextAnalysis.userIntent = '理解真实数据 sheet 的业务主题、关键实体和命名口径，为后续对照组参数分析提供统一上下文';
    }
    if (!normalizeTextValue(contextAnalysis.globalBusinessSummary) && topLevelTheme && topLevelTheme !== '未提供具体数据文档') {
      contextAnalysis.globalBusinessSummary = topLevelTheme;
    }
    if ((!Array.isArray(contextAnalysis.keyEntities) || (contextAnalysis.keyEntities as unknown[]).length === 0) && topLevelEntities.length > 0) {
      contextAnalysis.keyEntities = topLevelEntities;
    }
    if (!normalizeTextValue(contextAnalysis.recommendedDataSchema) && topLevelFieldHierarchy) {
      contextAnalysis.recommendedDataSchema = JSON.stringify(topLevelFieldHierarchy);
    }
    if ((!Array.isArray(contextAnalysis.namingPrinciples) || (contextAnalysis.namingPrinciples as unknown[]).length === 0) && topLevelNamingConventions) {
      contextAnalysis.namingPrinciples = Object.entries(topLevelNamingConventions).map(
        ([key, value]) => `${key}:${String(value ?? '').trim()}`
      );
    }
  }

  return Object.keys(contextAnalysis).length > 0 ? contextAnalysis : undefined;
}

function clampConfidence(value: unknown): number {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return 0.75;
  }
  return Math.max(0, Math.min(1, numeric));
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function sanitizeArrayPath(value: string): string {
  return value
    .replace(/[{}]/g, '')
    .replace(/(\[(?:i)?\])+$/g, '')
    .trim();
}

function extractVariableArrayPath(value: string): string {
  const normalized = value.replace(/[{}]/g, '').trim();
  const match = normalized.match(/^(d\.[A-Za-z_][A-Za-z0-9_.]*)\[\]\.[A-Za-z_][A-Za-z0-9_]*$/);
  return match?.[1] || '';
}

function normalizeLoopMarker(arrayPath: string): string {
  const normalized = sanitizeArrayPath(arrayPath);
  if (!normalized) {
    return '{#d.rows}{/d.rows}';
  }
  return `{#${normalized}}{/${normalized}}`;
}

function normalizeVariableMarker(value: string, fallbackPath = 'd.textValue'): string {
  const normalized = value.trim();
  if (!normalized) {
    return `{${fallbackPath}}`;
  }
  const unwrapped = normalized.startsWith('{') && normalized.endsWith('}')
    ? normalized.slice(1, -1).trim()
    : normalized;
  const candidate = containsCjk(unwrapped) ? fallbackPath : unwrapped;

  if (/^[A-Za-z_][A-Za-z0-9_[\].]*$/.test(candidate)) {
    return `{${candidate}}`;
  }
  return `{${fallbackPath}}`;
}

function inferSuggestionType(
  record: Record<string, unknown>,
  details: Record<string, unknown>
): AISuggestion['type'] {
  const rawType = normalizeTextValue(record.type)?.toLowerCase();
  const fieldType = normalizeTextValue(details.fieldType)?.toLowerCase();
  const suggestedName = normalizeTextValue(record.suggestedName) || '';
  const arrayPath = normalizeTextValue(details.arrayPath);

  if (rawType === 'loop' || fieldType === 'loop' || arrayPath || suggestedName.includes('{#')) {
    return 'loop';
  }

  return 'variable';
}

function buildDefaultDescription(
  request: StructuredAnalyzeRequest,
  suggestionType: AISuggestion['type']
): string {
  if (request.analysisStage === 'excel-pair-analysis') {
    return suggestionType === 'loop'
      ? `AI 根据 ${request.pairLabel || '当前对照组'} 的表格/跨行差异识别为循环块`
      : `AI 根据 ${request.pairLabel || '当前对照组'} 的留白与真实值差异识别为参数字段`;
  }

  if (request.analysisStage === 'excel-global-understanding') {
    return 'AI 生成的全局真实数据理解摘要';
  }

  return suggestionType === 'loop'
    ? 'AI 识别为循环块'
    : 'AI 识别为参数字段';
}

function getRecordString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = normalizeTextValue(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function buildFallbackChapterFromLabel(label: string, request: StructuredAnalyzeRequest): string | undefined {
  if (/合同编号|签订日期|甲方|乙方|采购方|供应商|项目名称|币种|质保期|合同摘要|金额/.test(label)) {
    return '合同基本信息';
  }
  if (/设备|规格|单位|数量|单价|小计|明细/.test(label)) {
    return '采购明细';
  }
  if (/交付|到货|安装完成|验收|批次/.test(label)) {
    return '交付验收';
  }
  if (/付款|违约|比例|应付金额|违约金/.test(label)) {
    return '付款违约';
  }
  return request.analysisStage === 'excel-pair-analysis' ? request.pairLabel : undefined;
}

function buildDetailedFallbackDescription(label: string, suggestionType: AISuggestion['type']): string {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return suggestionType === 'loop' ? 'AI 识别出的循环数据区域' : 'AI 识别出的业务参数';
  }
  return suggestionType === 'loop'
    ? `${normalizedLabel}对应重复记录或表格明细区域，可在渲染时按数组数据循环展开`
    : `${normalizedLabel}是当前文档中的业务参数，用于在模板渲染时填充对应位置`;
}

function buildDetailedFallbackSignificance(
  label: string,
  request: StructuredAnalyzeRequest,
  suggestionType: AISuggestion['type']
): string {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return suggestionType === 'loop'
      ? `用于 ${request.pairLabel || '当前对照组'} 的循环渲染`
      : `用于 ${request.pairLabel || '当前对照组'} 的字段渲染`;
  }
  return suggestionType === 'loop'
    ? `${normalizedLabel}用于承载重复明细、计划或节点数据，渲染时应从业务输入中提取数组并逐项展开。`
    : `${normalizedLabel}用于文档定点渲染，可从自然语言、表单输入或业务系统字段中提取并回填到模板。`;
}

function buildRuleBasedDescription(
  label: string,
  fieldType: string | undefined,
  mappingRule: string | undefined,
  remark: string | undefined,
  suggestionType: AISuggestion['type']
): string {
  const normalizedLabel = label.trim();
  if (remark) {
    return `${normalizedLabel || '该字段'}：${remark}`;
  }
  if (mappingRule) {
    return `${normalizedLabel || '该字段'}在模板中按规则映射到对应填写位置：${mappingRule}`;
  }
  if (normalizedLabel) {
    return suggestionType === 'loop'
      ? `${normalizedLabel}对应重复数据区域，需要按数组内容循环渲染`
      : `${normalizedLabel}是需要从业务输入中提取并回填到模板中的${fieldType || '业务'}字段`;
  }
  return suggestionType === 'loop' ? 'AI 识别出的循环数据区域' : 'AI 识别出的业务参数';
}

function buildRuleBasedSignificance(
  label: string,
  mappingRule: string | undefined,
  remark: string | undefined,
  validation: string | undefined,
  request: StructuredAnalyzeRequest,
  suggestionType: AISuggestion['type']
): string {
  const normalizedLabel = label.trim();
  const segments = [
    remark,
    mappingRule ? `映射规则：${mappingRule}` : undefined,
    validation ? `校验要求：${validation}` : undefined,
  ].filter(Boolean);

  if (segments.length > 0) {
    return `${normalizedLabel || '该参数'}用于模板渲染。${segments.join('；')}`;
  }

  if (!normalizedLabel) {
    return suggestionType === 'loop'
      ? `用于 ${request.pairLabel || '当前对照组'} 的循环渲染`
      : `用于 ${request.pairLabel || '当前对照组'} 的字段渲染`;
  }

  return suggestionType === 'loop'
    ? `${normalizedLabel}用于承载重复明细、计划或节点数据，渲染时应从业务输入中提取数组并逐项展开。`
    : `${normalizedLabel}用于文档定点渲染，可从自然语言、表单输入或业务系统字段中提取并回填到模板。`;
}

function buildFallbackSuggestedName(label: string, index: number, suggestionType: AISuggestion['type']): string {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return suggestionType === 'loop' ? 'd.rows' : 'd.textValue';
  }

  const mappings: Array<[RegExp, string]> = [
    [/批次/, 'd.deliveryPlans[].batch'],
    [/交付地点|到货地点/, 'd.deliveryPlans[].deliveryLocation'],
    [/计划到货日|计划交付日|预计到货日/, 'd.deliveryPlans[].plannedArrivalDate'],
    [/安装完成日|安装完成时间/, 'd.deliveryPlans[].installationCompletionDate'],
    [/验收类型|验收方式/, 'd.deliveryPlans[].acceptanceType'],
    [/验收标准/, 'd.acceptanceStandard'],
    [/安装条件说明/, 'd.installationConditionNotes'],
    [/付款节点|付款阶段/, 'd.paymentTerms[].paymentStage'],
    [/付款条件/, 'd.paymentTerms[].paymentCondition'],
    [/应付金额|付款金额/, 'd.paymentTerms[].payableAmount'],
    [/合同编号|编号/, 'd.contract.contractNo'],
    [/签订日期|日期/, 'd.contract.signDate'],
    [/甲方|采购方/, 'd.contract.buyerName'],
    [/乙方|供应商/, 'd.contract.supplierName'],
    [/项目名称|项目/, 'd.contract.projectName'],
    [/币种/, 'd.contract.currency'],
    [/质保期/, 'd.contract.warrantyPeriodMonths'],
    [/合同摘要|摘要/, 'd.contract.summary'],
    [/交付|验收/, 'd.deliveryPlans'],
    [/付款|违约/, 'd.paymentTerms'],
    [/设备|规格|数量|单价|小计|明细/, 'd.items'],
  ];

  for (const [pattern, path] of mappings) {
    if (pattern.test(normalizedLabel)) {
      return suggestionType === 'loop' ? path : path;
    }
  }

  return suggestionType === 'loop' ? 'd.rows' : `d.field${index + 1}`;
}

function normalizeChatSuggestions(value: unknown, request: StructuredAnalyzeRequest): AISuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const details = (record.details && typeof record.details === 'object'
        ? record.details
        : {}) as Record<string, unknown>;
      const suggestionType = inferSuggestionType(record, details);
      const fallbackLabel = getRecordString(record, ['label', 'fieldName', '字段'])
        || normalizeTextValue(details.context)
        || '';
      const fallbackAddress = getRecordString(record, ['address', 'elementPath', '地址']);
      const fallbackFieldType = getRecordString(record, ['fieldTypeGuess', 'dataType', '字段类型']);
      const fallbackRemark = getRecordString(record, ['remark', '备注']);
      const fallbackMappingRule = getRecordString(record, ['mappingRule', '映射规则']);
      const fallbackValue = getRecordString(record, ['value', 'fieldValue', '原始值']);
      const fallbackValidation = record.validation && typeof record.validation === 'object'
        ? JSON.stringify(record.validation)
        : getRecordString(record, ['validation', '校验规则']);
      const rawSuggestedName = normalizeTextValue(record.suggestedName);
      const arrayPath = normalizeTextValue(details.arrayPath);
      const fallbackSuggestedName = buildFallbackSuggestedName(fallbackLabel, index, suggestionType) || 'd.textValue';
      const normalizedLoopArrayPath = sanitizeArrayPath(
        containsCjk(arrayPath || rawSuggestedName || '')
          ? fallbackSuggestedName
          : (arrayPath || rawSuggestedName || fallbackSuggestedName || 'd.rows')
      );
      const normalizedSuggestedName = suggestionType === 'loop'
        ? normalizeLoopMarker(normalizedLoopArrayPath)
        : normalizeVariableMarker(rawSuggestedName || fallbackSuggestedName, fallbackSuggestedName);
      const normalizedVariableArrayPath = containsCjk(arrayPath || '')
        ? extractVariableArrayPath(fallbackSuggestedName)
        : sanitizeArrayPath(arrayPath || extractVariableArrayPath(normalizedSuggestedName));
      const chapter = normalizeTextValue(details.chapter)
        || buildFallbackChapterFromLabel(fallbackLabel, request)
        || (request.analysisStage === 'excel-pair-analysis' ? request.pairLabel : undefined);
      const displayPosition = normalizeTextValue(details.displayPosition)
        || normalizeTextValue(record.elementPath)
        || fallbackAddress
        || request.pairLabel
        || 'AI 识别位置';
      const context = normalizeTextValue(record.context)
        || normalizeTextValue(details.context)
        || (fallbackLabel ? `标签=${fallbackLabel}` : undefined)
        || request.diffSummary
        || request.context;
      const fieldType = normalizeTextValue(details.fieldType)
        || fallbackFieldType
        || (suggestionType === 'loop' ? 'loop' : 'text');

      return {
        id: String(record.id || `chat-suggestion-${index}`),
        type: suggestionType,
        elementPath: normalizeTextValue(record.elementPath) || fallbackAddress || displayPosition,
        suggestedName: normalizedSuggestedName,
        originalText: normalizeTextValue(record.originalText)
          || fallbackValue
          || (suggestionType === 'loop' ? (arrayPath || 'd.rows') : ''),
        confidence: clampConfidence(record.confidence),
        applied: Boolean(record.applied ?? false),
        context,
        details: {
          source: 'ai',
          description: normalizeTextValue(details.description)
            || buildRuleBasedDescription(
              fallbackLabel,
              fieldType,
              fallbackMappingRule,
              fallbackRemark,
              suggestionType
            )
            || buildDetailedFallbackDescription(fallbackLabel, suggestionType)
            || buildDefaultDescription(request, suggestionType),
          formatter: normalizeTextValue(details.formatter),
          loopType: details.loopType === 'implicit' ? 'implicit' : 'explicit',
          arrayPath: suggestionType === 'loop'
            ? normalizedLoopArrayPath
            : normalizedVariableArrayPath,
          tableName: normalizeTextValue(details.tableName),
          context,
          chapter,
          significance: normalizeTextValue(details.significance)
            || buildRuleBasedSignificance(
              fallbackLabel,
              fallbackMappingRule,
              fallbackRemark,
              fallbackValidation,
              request,
              suggestionType
            )
            || buildDetailedFallbackSignificance(fallbackLabel, request, suggestionType)
            || (request.analysisStage === 'excel-pair-analysis'
              ? `来自 ${request.pairLabel || '当前对照组'} 的 AI 分析结果`
              : '来自 AI 的分析结果'),
          displayPosition,
          beforeBlank: normalizeTextValue(details.beforeBlank),
          afterBlank: normalizeTextValue(details.afterBlank),
          fieldType,
        },
      } satisfies AISuggestion;
    })
    .filter((suggestion) => suggestion.suggestedName || suggestion.originalText || suggestion.elementPath);
}

function buildGlobalUnderstandingChatPrompt(request: StructuredAnalyzeRequest): string {
  const visibleSheetSummary = buildExcelVisibleSheetSummary(request.documentIR, 'all');
  const businessExcerpt = buildExcelBusinessExcerpt(request.documentIR, 'all').slice(0, 5000);
  return buildGlobalUnderstandingPromptTemplate({
    host: request.host,
    documentType: request.documentType,
    context: request.context,
    visibleSheetSummary,
    businessExcerpt,
  });
}



function buildGeneralChatPrompt(request: StructuredAnalyzeRequest): string {
  const compactDocumentContext = buildCompactDocumentContext(request);
  const serializedContent = String(request.documentContent || '').slice(0, 8000);
  return buildGeneralPromptTemplate({
    host: request.host,
    documentType: request.documentType,
    templateType: request.templateType,
    context: request.context,
    compactDocumentContext,
    serializedContent,
  });
}

function buildChatAnalysisPrompt(request: StructuredAnalyzeRequest): string {
  if (request.analysisStage === 'excel-global-understanding') {
    return buildGlobalUnderstandingChatPrompt(request);
  }

  if (request.analysisStage === 'excel-pair-analysis') {
    return buildPairAnalysisChatPrompt(request);
  }

  return buildGeneralChatPrompt(request);
}

function buildPromptDebugSummary(request: StructuredAnalyzeRequest): string {
  const excelVisibleSheets = request.host === 'excel'
    ? truncateText(
        buildExcelVisibleSheetSummary(
          request.documentIR,
          'all'
        ),
        800
      )
    : undefined;
  const contentExcerpt = request.host === 'excel'
    ? truncateText(
        buildExcelBusinessExcerpt(
          request.documentIR,
          request.analysisStage === 'excel-global-understanding' ? 'all' : 'all'
        ).replace(/\s+/g, ' ').trim(),
        1000
      )
    : truncateText(String(request.documentContent || '').replace(/\s+/g, ' ').trim(), 600);
  const lines = [
    `stage=${request.analysisStage || 'general'}`,
    request.pairLabel ? `pair=${request.pairLabel}` : undefined,
    request.globalUnderstandingSummary ? `global=${truncateText(request.globalUnderstandingSummary, 220)}` : undefined,
    request.diffSummary ? `diff=${truncateText(request.diffSummary, 220)}` : undefined,
    excelVisibleSheets ? `sheets=${excelVisibleSheets}` : undefined,
    contentExcerpt ? `content=${contentExcerpt}` : undefined,
  ].filter(Boolean);

  return lines.join('\n');
}

class ChatAnalysisExecutor implements StructuredAnalysisExecutor {
  kind: AnalysisExecutorKind = 'chat';
  supportsThinking = true;

  constructor(
    public readonly requestedKind: AnalysisExecutorKind,
    private readonly options: ResolveAnalysisExecutorOptions
  ) {}

  async analyze(request: StructuredAnalyzeRequest): Promise<any> {
    if (!this.options.aiOrchestratorBaseUrl) {
      throw new ChatAnalysisError('缺少 AI Orchestrator 地址，无法使用 chat 执行器', {
        stage: request.analysisStage,
        pairLabel: request.pairLabel,
        url: this.options.aiOrchestratorBaseUrl,
        reason: 'missing_ai_orchestrator_url',
      });
    }

    const url = resolveChatStreamUrl(this.options.aiOrchestratorBaseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.aiOrchestratorAuthToken) {
      headers.Authorization = this.options.aiOrchestratorAuthToken.startsWith('Bearer ')
        ? this.options.aiOrchestratorAuthToken
        : `Bearer ${this.options.aiOrchestratorAuthToken}`;
    }

    const promptRequestText = buildChatAnalysisPrompt(request);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: promptRequestText,
          sessionId: `office-addin-analysis-${Date.now()}`,
          config: {
            mode: 'chat',
            thinking: this.options.thinking !== false,
          },
        }),
      });
    } catch (error) {
      throw new ChatAnalysisError(`chat 执行器请求失败: ${error instanceof Error ? error.message : 'unknown error'}`, {
        stage: request.analysisStage,
        pairLabel: request.pairLabel,
        url,
        reason: 'network_error',
      });
    }

    if (!response.ok) {
      throw new ChatAnalysisError(`chat 执行器请求失败: HTTP ${response.status}`, {
        stage: request.analysisStage,
        pairLabel: request.pairLabel,
        url,
        status: response.status,
        reason: 'http_error',
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ChatAnalysisError('chat 执行器未返回可读取的数据流', {
        stage: request.analysisStage,
        pairLabel: request.pairLabel,
        url,
        reason: 'missing_stream_reader',
      });
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let latestResultContent = '';
    let latestObservationContent = '';
    const resultPayloads: string[] = [];
    const observationPayloads: string[] = [];
    const eventPayloads: Array<{ type: string; content: string }> = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const dataLines = chunk
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s*/, ''));

        for (const line of dataLines) {
          try {
            const event = JSON.parse(line) as { type?: string; content?: string };
            if (typeof event.content === 'string' && ['observation', 'result'].includes(String(event.type))) {
              if (String(event.type) === 'result') {
                latestResultContent = event.content;
                resultPayloads.push(event.content);
              } else {
                latestObservationContent = event.content;
                observationPayloads.push(event.content);
              }
              eventPayloads.push({
                type: String(event.type),
                content: event.content,
              });
            }
          } catch {
            // ignore malformed SSE chunks
          }
        }
      }
    }

    const mergedResultPayload = resultPayloads.join('');
    const mergedResultPayloadWithNewlines = resultPayloads.join('\n');
    const payloadCandidates = [
      latestResultContent,
      mergedResultPayload,
      mergedResultPayloadWithNewlines,
      ...resultPayloads.slice().reverse(),
    ].filter(Boolean);
    let parsed: Record<string, unknown> | null = null;
    let salvaged = false;

    if (request.analysisStage === 'excel-global-understanding') {
      const globalUnderstandingText = extractGlobalUnderstandingText(payloadCandidates);
      if (globalUnderstandingText) {
        parsed = {
          suggestions: [],
          contextAnalysis: {
            detectedTemplateType: request.templateType || 'unknown',
            userIntent: '理解整份工作簿的业务类型、关键字段、sheet 职责与相互关系，为后续逐对照组参数识别提供上下文',
            globalBusinessSummary: globalUnderstandingText,
            globalUnderstandingText,
            usedAI: true,
            flowType: 'chat',
          },
        };
      } else {
        const jsonPayload = salvageChatPayload(payloadCandidates, request);
        parsed = jsonPayload.parsed;
        salvaged = jsonPayload.salvaged;

        const status = normalizeTextValue(parsed?.status)?.toLowerCase();
        const message = normalizeTextValue(parsed?.message);
        const hasContextAnalysis = Boolean(
          parsed?.contextAnalysis && typeof parsed.contextAnalysis === 'object'
        );
        if (!hasContextAnalysis && (status === 'error' || message)) {
          parsed = null;
        }
      }
    } else if (request.analysisStage === 'excel-pair-analysis') {
      const jsonPayload = salvageChatPayload(payloadCandidates, request);
      parsed = jsonPayload.parsed;
      salvaged = jsonPayload.salvaged;

      if (!parsed) {
        const directSuggestionArray = payloadCandidates
          .map((content) => tryParseJSONArray(content))
          .find((value): value is Array<Record<string, unknown>> => Array.isArray(value));

        if (directSuggestionArray) {
          parsed = {
            suggestions: directSuggestionArray,
          };
        }
      }
    } else {
      const jsonPayload = salvageChatPayload(payloadCandidates, request);
      parsed = jsonPayload.parsed;
      salvaged = jsonPayload.salvaged;
    }

    if (!parsed) {
      throw new ChatAnalysisError('chat 执行器未返回可解析的 JSON 结构', {
        stage: request.analysisStage,
        pairLabel: request.pairLabel,
        url,
        reason:
          latestResultContent || latestObservationContent || resultPayloads.length > 0 || observationPayloads.length > 0
            ? 'invalid_json_response'
            : 'empty_stream_response',
      });
    }

    const normalizedSuggestions = normalizeChatSuggestions(parsed.suggestions, request);
    const normalizedContextAnalysis = normalizeContextAnalysisPayload(parsed, request);
    const rawAiResponse = eventPayloads
      .filter((event) => event.type === 'result')
      .slice(-4)
      .map((event) => `[${event.type}] ${event.content}`)
      .join('\n');
    return {
      suggestions: normalizedSuggestions,
      rawSuggestions: normalizedSuggestions,
      contextAnalysis: {
        ...(normalizedContextAnalysis || {}),
        usedAI: true,
        flowType: 'chat',
        salvagedMalformedJson: salvaged,
        analysisStage: request.analysisStage || 'general',
        aiServiceUrl: this.options.aiOrchestratorBaseUrl,
        promptDebugSummary: buildPromptDebugSummary(request),
        promptRequestText,
        rawAiResponse,
      },
    };
  }
}

export function resolveAnalysisExecutor(
  options: ResolveAnalysisExecutorOptions
): StructuredAnalysisExecutor {
  const requestedKind = options.requestedKind || 'studio';

  if (requestedKind === 'chat') {
    if (options.aiOrchestratorBaseUrl) {
      return new ChatAnalysisExecutor(requestedKind, options);
    }
    return new StudioAnalysisExecutor(
      requestedKind,
      options,
      'office-addin 未配置 AI Orchestrator 地址，chat 执行器暂时回退到 studio 结构化分析接口'
    );
  }

  return new StudioAnalysisExecutor(requestedKind, options);
}
