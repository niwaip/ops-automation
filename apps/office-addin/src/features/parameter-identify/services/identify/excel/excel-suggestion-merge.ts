import { DocumentIR } from '../../../../../host/adapters/document-ir';
import { AISuggestion } from '../../../../../app/store';
import {
  buildExcelExtractionHint,
  buildExcelHeuristicDescription,
  extractExcelCells,
  extractExcelSheets,
  inferExcelFieldTypeWithLabel,
} from './excel-heuristic';
import type { ExcelSheetInfo } from './excel-heuristic';

type SuggestionDetails = NonNullable<AISuggestion['details']>;
type ExcelColumnMapping = NonNullable<SuggestionDetails['columnMappings']>[number];
type ExcelTableAnchor = {
  type: 'table';
  sheetName: string;
  sheetIndex?: number;
  pairIndex?: number;
  tableName?: string;
  startAddress?: string;
  endAddress?: string;
};

export interface ExcelPairSuggestionContext {
  pairIndex: number;
  pairLabel: string;
  pairDocumentIR: DocumentIR;
  mockSheet?: ExcelSheetInfo;
  dataSheet?: ExcelSheetInfo;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
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

function buildAsciiIdentifier(value: string, fallback: string): string {
  const normalized = normalizeText(value)
    .replace(/['"`]/g, '')
    .replace(/[，。；：、,.!?:()[\]{}<>《》【】（）/\-]+/g, ' ')
    .replace(/[^\x00-\x7F]+/g, ' ')
    .replace(/\s+/g, '');

  return normalized || fallback;
}

function mapExcelBusinessFieldName(_label: string): string | undefined {
  return undefined;
}

function buildExcelLoopFieldName(header: string, columnIndex: number): string {
  return mapExcelBusinessFieldName(header) || buildAsciiIdentifier(header, `field${columnIndex + 1}`);
}

function normalizeLoopArrayBasePath(arrayPath: string): string {
  return normalizeText(arrayPath).replace(/(\[(?:i)?\])+$/g, '');
}

function extractVariableArrayPath(value: string): string {
  const normalized = normalizeText(value).replace(/[{}]/g, '');
  const match = normalized.match(/^(d\.[A-Za-z_][A-Za-z0-9_.]*)\[\]\.[A-Za-z_][A-Za-z0-9_]*$/);
  return match?.[1] || '';
}

function columnNameToIndex(columnName: string): number {
  let result = 0;
  const normalized = columnName.toUpperCase();
  for (let index = 0; index < normalized.length; index += 1) {
    result = result * 26 + (normalized.charCodeAt(index) - 64);
  }
  return Math.max(result - 1, 0);
}

function stripSheetPrefix(address: string): string {
  const normalized = normalizeText(address).replace(/\$/g, '');
  const bangIndex = normalized.lastIndexOf('!');
  return bangIndex >= 0 ? normalized.slice(bangIndex + 1) : normalized;
}

function parseR1C1Range(address: string): {
  sheetName?: string;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} | undefined {
  const normalized = normalizeText(address).replace(/\$/g, '');
  if (!normalized) {
    return undefined;
  }

  const bangIndex = normalized.lastIndexOf('!');
  const sheetName = bangIndex >= 0
    ? normalized.slice(0, bangIndex).replace(/^'/, '').replace(/'$/, '').replace(/''/g, '\'')
    : undefined;
  const rangePart = bangIndex >= 0 ? normalized.slice(bangIndex + 1) : normalized;
  const match = rangePart.match(/^R(\d+)C(\d+)(?::R(\d+)C(\d+))?$/i);
  if (!match) {
    return undefined;
  }

  return {
    sheetName,
    startRow: Number(match[1]),
    endRow: Number(match[3] || match[1]),
    startCol: Math.max(Number(match[2]) - 1, 0),
    endCol: Math.max(Number(match[4] || match[2]) - 1, 0),
  };
}

function parseA1Range(address: string): {
  sheetName?: string;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} | undefined {
  const normalized = normalizeText(address).replace(/\$/g, '');
  if (!normalized) {
    return undefined;
  }

  const bangIndex = normalized.lastIndexOf('!');
  const sheetName = bangIndex >= 0
    ? normalized.slice(0, bangIndex).replace(/^'/, '').replace(/'$/, '').replace(/''/g, '\'')
    : undefined;
  const rangePart = bangIndex >= 0 ? normalized.slice(bangIndex + 1) : normalized;
  const r1c1Range = parseR1C1Range(address);
  if (r1c1Range) {
    return r1c1Range;
  }

  const match = rangePart.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
  if (!match) {
    return undefined;
  }

  return {
    sheetName,
    startRow: Number(match[2]),
    endRow: Number(match[4] || match[2]),
    startCol: columnNameToIndex(match[1]),
    endCol: columnNameToIndex(match[3] || match[1]),
  };
}

function rangesOverlap(
  left: ReturnType<typeof parseA1Range>,
  right: ReturnType<typeof parseA1Range>
): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.startRow <= right.endRow &&
    left.endRow >= right.startRow &&
    left.startCol <= right.endCol &&
    left.endCol >= right.startCol
  );
}

function extractLoopArrayPath(suggestion: AISuggestion): string {
  const directPath = normalizeText(suggestion.details?.arrayPath);
  if (directPath) {
    return directPath;
  }

  const suggestedName = normalizeText(suggestion.suggestedName);
  const markerMatch = suggestedName.match(/\{#([^}]+)\}/);
  if (markerMatch?.[1]) {
    return markerMatch[1].trim();
  }

  return suggestedName
    .replace(/\{[#/]?/g, '')
    .replace(/\}/g, '')
    .trim();
}

export function buildExcelColumnMappingsForTable(
  documentIR: DocumentIR,
  tableAnchor: ExcelTableAnchor,
  arrayPath: string
): ExcelColumnMapping[] | undefined {
  if (!arrayPath) {
    return undefined;
  }

  const normalizedArrayPath = normalizeLoopArrayBasePath(arrayPath);
  const sheets = extractExcelSheets(documentIR);
  const cells = extractExcelCells(documentIR);
  const tableSheet = sheets.find((sheet) => normalizeText(sheet.name) === normalizeText(tableAnchor.sheetName));
  const tableMeta = tableSheet?.tables.find((table) =>
    (tableAnchor.tableName && normalizeText(table.name) === normalizeText(tableAnchor.tableName))
    || (tableAnchor.startAddress && rangesOverlap(parseA1Range(table.address), parseA1Range(tableAnchor.startAddress)))
  );

  if (!tableSheet || !tableMeta) {
    return undefined;
  }

  const headerRange = parseA1Range(tableMeta.headerAddress || tableMeta.address);
  if (!headerRange) {
    return undefined;
  }

  const headerRowIndex = headerRange.startRow - 1;
  const sampleRowIndex = headerRowIndex + 1;
  const mappings: ExcelColumnMapping[] = [];

  for (let columnIndex = headerRange.startCol; columnIndex <= headerRange.endCol; columnIndex += 1) {
    const tableColumnIndex = columnIndex - headerRange.startCol;
    const headerCell = cells.find((cell) =>
      normalizeText(cell.sheetName) === normalizeText(tableSheet.name)
      && cell.rowIndex === headerRowIndex
      && cell.colIndex === columnIndex
    );
    const sampleCell = cells.find((cell) =>
      normalizeText(cell.sheetName) === normalizeText(tableSheet.name)
      && cell.rowIndex === sampleRowIndex
      && cell.colIndex === columnIndex
    );
    const headerName = normalizeText(headerCell?.text) || `列${tableColumnIndex + 1}`;
    const fieldName = buildExcelLoopFieldName(headerName, tableColumnIndex);

    mappings.push({
      headerName,
      variablePath: `${normalizedArrayPath}[].${fieldName}`,
      sampleValue: normalizeText(sampleCell?.text),
      columnIndex: tableColumnIndex,
    });
  }

  return mappings.length > 0 ? mappings : undefined;
}

function buildExcelTableAnchorForSuggestion(
  documentIR: DocumentIR,
  suggestion: AISuggestion,
  fallbackPairIndex?: number
): ExcelTableAnchor | undefined {
  const sheets = extractExcelSheets(documentIR);
  const requestedTableName = normalizeText(suggestion.details?.tableName || suggestion.originalText);
  const requestedPosition = parseA1Range(suggestion.details?.displayPosition || suggestion.elementPath || '');
  const candidateSheetName = normalizeText(
    suggestion.details?.excelAnchor?.sheetName
      || suggestion.details?.chapter
      || requestedPosition?.sheetName
  );

  const candidateTables = sheets.flatMap((sheet) =>
    sheet.tables.map((table) => ({
      sheet,
      table,
    }))
  );

  const byName = requestedTableName
    ? candidateTables.find(({ table }) => normalizeText(table.name) === requestedTableName)
    : undefined;
  const byPosition = requestedPosition
    ? candidateTables.find(({ sheet, table }) => {
        if (candidateSheetName && normalizeText(sheet.name) !== candidateSheetName) {
          return false;
        }
        const tableRange = parseA1Range(table.address);
        return rangesOverlap(tableRange, requestedPosition);
      })
    : undefined;
  const bySheet = candidateSheetName
    ? candidateTables.find(({ sheet }) => normalizeText(sheet.name) === candidateSheetName)
    : undefined;
  const fallbackTable = candidateTables[0];
  const matched = byName || byPosition || bySheet || fallbackTable;

  if (!matched) {
    return undefined;
  }

  return {
    type: 'table',
    sheetName: matched.sheet.name,
    sheetIndex: matched.sheet.sheetIndex,
    pairIndex: matched.sheet.pairIndex >= 0 ? matched.sheet.pairIndex : fallbackPairIndex,
    tableName: matched.table.name,
    startAddress: stripSheetPrefix(matched.table.headerAddress || matched.table.address),
    endAddress: stripSheetPrefix(matched.table.dataBodyAddress || matched.table.address),
  };
}

export function annotateSuggestionSource(
  suggestions: AISuggestion[],
  source: 'ai' | 'heuristic' | 'manual'
): AISuggestion[] {
  return suggestions.map((suggestion) => ({
    ...suggestion,
    details: {
      ...suggestion.details,
      source: suggestion.details?.source || source,
    },
  }));
}

export function expandExcelLoopColumnSuggestions(suggestions: AISuggestion[]): AISuggestion[] {
  const expanded: AISuggestion[] = [];
  const existingVariableKeys = new Set<string>();
  const explicitVariableArrayKeys = new Set<string>();

  const buildArrayExpansionKey = (arrayPath: string, pairIndex?: number): string => {
    const normalizedArrayPath = normalizeLoopArrayBasePath(arrayPath);
    return `${pairIndex ?? -1}:${normalizedArrayPath}`;
  };

  for (const suggestion of suggestions) {
    if (suggestion.type === 'variable') {
      existingVariableKeys.add(normalizeText(suggestion.suggestedName));
      const arrayPath = normalizeLoopArrayBasePath(
        suggestion.details?.arrayPath
          || extractVariableArrayPath(suggestion.suggestedName)
      );
      if (arrayPath) {
        explicitVariableArrayKeys.add(
          buildArrayExpansionKey(arrayPath, suggestion.details?.excelAnchor?.pairIndex)
        );
      }
    }
  }

  for (const suggestion of suggestions) {
    expanded.push(suggestion);

    if (suggestion.type !== 'loop' || !Array.isArray(suggestion.details?.columnMappings)) {
      continue;
    }

    const tableAnchor = suggestion.details?.excelAnchor?.type === 'table'
      ? suggestion.details.excelAnchor
      : undefined;
    const headerRange = parseA1Range(tableAnchor?.startAddress || '');
    const bodyRange = parseA1Range(tableAnchor?.endAddress || '');
    const firstDataRow = bodyRange?.startRow || (headerRange ? headerRange.startRow + 1 : undefined);
    const startColumn = headerRange?.startCol ?? 0;
    const targetSheetName = tableAnchor?.sheetName || suggestion.details?.chapter || '';

    suggestion.details.columnMappings.forEach((mapping, mappingIndex) => {
      const variablePath = normalizeText(mapping.variablePath);
      if (!variablePath) {
        return;
      }

      const marker = `{${variablePath}}`;
      if (existingVariableKeys.has(marker)) {
        return;
      }

      const relativeColumnIndex = mapping.columnIndex ?? mappingIndex;
      const absoluteColumnIndex = startColumn + relativeColumnIndex;
      const address = typeof firstDataRow === 'number'
        ? `${toColumnName(absoluteColumnIndex)}${firstDataRow}`
        : suggestion.elementPath;
      const inferredFieldType = inferExcelFieldTypeWithLabel(mapping.sampleValue || '', '', mapping.headerName);
      const normalizedLoopArrayPath = normalizeLoopArrayBasePath(extractLoopArrayPath(suggestion));

      if (explicitVariableArrayKeys.has(buildArrayExpansionKey(normalizedLoopArrayPath, tableAnchor?.pairIndex))) {
        return;
      }

      expanded.push({
        id: `${suggestion.id}-col-${relativeColumnIndex}`,
        type: 'variable',
        elementPath: targetSheetName ? `${targetSheetName}!${address}` : address,
        suggestedName: marker,
        originalText: mapping.sampleValue || mapping.headerName,
        confidence: Math.max(0.82, suggestion.confidence - 0.03),
        applied: suggestion.applied,
        context: `${suggestion.context} | 明细列: ${mapping.headerName}`,
        details: {
          source: suggestion.details?.source || 'heuristic',
          description: buildExcelHeuristicDescription(mapping.headerName, variablePath),
          fieldType: inferredFieldType,
          loopType: undefined,
          arrayPath: `${normalizedLoopArrayPath}[]`,
          tableName: suggestion.details?.tableName,
          chapter: suggestion.details?.chapter,
          significance: buildExcelExtractionHint(mapping.headerName, variablePath, inferredFieldType),
          displayPosition: targetSheetName ? `${targetSheetName}!${address}` : address,
          context: `来自循环表 ${suggestion.details?.tableName || suggestion.originalText} 的列映射`,
          excelAnchor: targetSheetName
            ? {
                type: 'cell',
                sheetName: targetSheetName,
                sheetIndex: tableAnchor?.sheetIndex,
                pairIndex: tableAnchor?.pairIndex,
                address,
                rowIndex: typeof firstDataRow === 'number' ? firstDataRow - 1 : undefined,
                colIndex: absoluteColumnIndex,
              }
            : undefined,
        },
      });
      existingVariableKeys.add(marker);
    });
  }

  return expanded;
}

export function dedupeExcelArraySuggestions(suggestions: AISuggestion[]): AISuggestion[] {
  const deduped: AISuggestion[] = [];
  const seenLoopKeys = new Set<string>();
  const seenArrayVariableKeys = new Set<string>();

  for (const suggestion of suggestions) {
    const arrayPath = normalizeText(
      suggestion.details?.arrayPath
      || extractLoopArrayPath(suggestion)
    );
    const tableName = normalizeText(suggestion.details?.tableName || '');
    const pairIndex = suggestion.details?.excelAnchor?.pairIndex;
    const pairKey = typeof pairIndex === 'number' ? String(pairIndex) : 'na';

    if (suggestion.type === 'loop') {
      const loopKey = `${pairKey}|${tableName || 'table'}|${arrayPath || normalizeText(suggestion.suggestedName)}`;
      if (seenLoopKeys.has(loopKey)) {
        continue;
      }
      seenLoopKeys.add(loopKey);
      deduped.push(suggestion);
      continue;
    }

    const normalizedSuggestedName = normalizeText(suggestion.suggestedName);
    const isArrayVariable = normalizedSuggestedName.includes('[].');
    if (!isArrayVariable) {
      deduped.push(suggestion);
      continue;
    }

    const variableKey = `${pairKey}|${tableName || 'table'}|${normalizedSuggestedName}`;
    if (seenArrayVariableKeys.has(variableKey)) {
      continue;
    }

    seenArrayVariableKeys.add(variableKey);
    deduped.push(suggestion);
  }

  return deduped;
}

function rewriteDisplayPositionSheet(
  position: string | undefined,
  targetSheetName: string | undefined
): string | undefined {
  const normalizedTarget = normalizeText(targetSheetName);
  const normalizedPosition = normalizeText(position);
  if (!normalizedTarget || !normalizedPosition) {
    return position;
  }

  const match = normalizedPosition.match(/^(.+?)!([A-Z]+\d+(?::[A-Z]+\d+)?)$/i);
  if (!match) {
    return position;
  }

  return `${normalizedTarget}!${match[2]}`;
}

function applyDefaultExcelSuggestionMetadata(
  suggestions: AISuggestion[],
  pair: ExcelPairSuggestionContext
): AISuggestion[] {
  const templateSheetName = pair.mockSheet?.name || pair.dataSheet?.name || `对照组 ${pair.pairIndex + 1}`;
  const templateSheetIndex = pair.mockSheet?.sheetIndex ?? pair.dataSheet?.sheetIndex;
  const chapter = templateSheetName;

  const inferExcelAnchorFromPosition = (
    suggestion: AISuggestion
  ): NonNullable<SuggestionDetails['excelAnchor']> | undefined => {
    const position = normalizeText(
      suggestion.details?.displayPosition || suggestion.elementPath || ''
    );
    const match = position.match(/^(.+?)!([A-Z]+\d+)(?::([A-Z]+\d+))?$/i);
    if (!match) {
      return undefined;
    }

    const sheetName = match[1];
    const startAddress = match[2];
    const endAddress = match[3];

    if (suggestion.type === 'loop') {
      return {
        type: 'table',
        sheetName,
        pairIndex: pair.pairIndex,
        tableName: suggestion.details?.tableName,
        startAddress,
        endAddress: endAddress || startAddress,
      };
    }

    return {
      type: 'cell',
      sheetName,
      pairIndex: pair.pairIndex,
      address: startAddress,
    };
  };

  return suggestions.map((suggestion) => {
    const inferredAnchorFromPosition = inferExcelAnchorFromPosition(suggestion);
    const inferredTableAnchor = suggestion.type === 'loop'
      ? buildExcelTableAnchorForSuggestion(pair.pairDocumentIR, suggestion, pair.pairIndex)
      : undefined;
    const rawExcelAnchor = suggestion.details?.excelAnchor
      || inferredTableAnchor
      || inferredAnchorFromPosition;
    const excelAnchor = rawExcelAnchor?.type === 'table'
      ? {
          ...rawExcelAnchor,
          sheetName: templateSheetName,
          sheetIndex: templateSheetIndex,
        }
      : rawExcelAnchor?.type === 'cell'
        ? {
            ...rawExcelAnchor,
            sheetName: templateSheetName,
            sheetIndex: templateSheetIndex,
          }
        : rawExcelAnchor;
    const loopArrayPath = suggestion.type === 'loop' ? extractLoopArrayPath(suggestion) : '';
    const tableExcelAnchor = excelAnchor?.type === 'table'
      ? {
          type: 'table' as const,
          sheetName: excelAnchor.sheetName,
          sheetIndex: excelAnchor.sheetIndex,
          pairIndex: excelAnchor.pairIndex,
          tableName: excelAnchor.tableName,
          startAddress: excelAnchor.startAddress,
          endAddress: excelAnchor.endAddress,
        }
      : undefined;
    const columnMappings = suggestion.details?.columnMappings
      || (suggestion.type === 'loop' && tableExcelAnchor && loopArrayPath
        ? buildExcelColumnMappingsForTable(pair.pairDocumentIR, tableExcelAnchor, loopArrayPath)
        : undefined);

    return {
      ...suggestion,
      details: {
        ...suggestion.details,
        chapter,
        description:
          suggestion.details?.description ||
          `AI 基于 ${pair.pairLabel} 的对照差异生成的模板化建议`,
        significance:
          suggestion.details?.significance ||
          `来自 ${pair.pairLabel} 的对照分析结果`,
        displayPosition:
          rewriteDisplayPositionSheet(
            suggestion.details?.displayPosition || suggestion.elementPath || pair.pairLabel,
            templateSheetName
          ) || pair.pairLabel,
        tableName: suggestion.details?.tableName || inferredTableAnchor?.tableName,
        columnMappings,
        excelAnchor,
      },
    };
  });
}

function normalizeSuggestionPathForQualityCheck(value: string): string {
  return value.replace(/[{}]/g, '').trim();
}

function isGenericFallbackSuggestedName(value: string): boolean {
  return /^(?:d\.)?(?:[A-Za-z_][A-Za-z0-9_]*\[\]\.)?(field\d*|textValue|textField\d*|value\d*|var\d*|param\d*|undefined|null|unknown)$/i
    .test(normalizeSuggestionPathForQualityCheck(value));
}

export function normalizeExcelPairSuggestions(
  pair: ExcelPairSuggestionContext,
  pairResponse: { suggestions: AISuggestion[]; rawSuggestions?: AISuggestion[] }
): AISuggestion[] {
  return dedupeExcelArraySuggestions(
    expandExcelLoopColumnSuggestions(
      applyDefaultExcelSuggestionMetadata(
        annotateSuggestionSource((pairResponse.rawSuggestions || pairResponse.suggestions) as AISuggestion[], 'ai'),
        pair
      )
    )
  );
}

export function evaluateExcelPairAttempt(
  pair: { loopDetected: boolean },
  pairSuggestions: AISuggestion[],
  contextAnalysis?: Record<string, unknown>
): {
  salvagedMalformedJson: boolean;
  qualityIssues: string[];
  needsRetry: boolean;
} {
  const qualityIssues: string[] = [];
  const salvagedMalformedJson = Boolean(contextAnalysis?.salvagedMalformedJson);
  if (salvagedMalformedJson) {
    qualityIssues.push('malformed-json');
  }

  if (pairSuggestions.length === 0) {
    qualityIssues.push('empty-result');
  }

  if (pair.loopDetected && !pairSuggestions.some((suggestion) => suggestion.type === 'loop')) {
    qualityIssues.push('missing-loop');
  }

  if (pairSuggestions.some((suggestion) => isGenericFallbackSuggestedName(suggestion.suggestedName || ''))) {
    qualityIssues.push('generic-name');
  }

  return {
    salvagedMalformedJson,
    qualityIssues,
    needsRetry: qualityIssues.length > 0,
  };
}

export function summarizeSuggestionSources(suggestions: AISuggestion[]): {
  resultSource: 'ai' | 'heuristic' | 'manual' | 'ai+heuristic' | 'mixed' | 'unknown';
  sourceCounts: Record<string, number>;
} {
  const sourceCounts = suggestions.reduce<Record<string, number>>((counts, suggestion) => {
    const source = suggestion.details?.source || 'unknown';
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});

  const distinctSources = Object.keys(sourceCounts).filter((source) => sourceCounts[source] > 0);

  if (distinctSources.length === 0) {
    return {
      resultSource: 'unknown',
      sourceCounts,
    };
  }

  if (distinctSources.length === 1) {
    return {
      resultSource: distinctSources[0] as 'ai' | 'heuristic' | 'manual' | 'ai+heuristic',
      sourceCounts,
    };
  }

  if (distinctSources.includes('ai') && distinctSources.includes('heuristic') && distinctSources.length === 2) {
    return {
      resultSource: 'ai+heuristic',
      sourceCounts,
    };
  }

  return {
    resultSource: 'mixed',
    sourceCounts,
  };
}
