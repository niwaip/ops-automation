import type { DocumentIR } from '../../../../host/adapters/document-ir';
import { looksLikeJson, sanitizeGlobalUnderstandingText } from './chat-analysis-json.helpers';
import { normalizeTextValue, truncateText } from './chat-analysis-suggestion.common';
import type { StructuredAnalyzeRequest } from './types';

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
    const sheetName =
      normalizeTextValue(sheet.hostData?.sheetName) ||
      normalizeTextValue(sheet.text) ||
      `sheet_${sheetIndex}`;
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
    const sheetCells = cellElements.filter(
      (cell) => Number(cell.hostData?.sheetIndex ?? -1) === sheetIndex
    );
    const sampleCells = sheetCells
      .filter((cell) => normalizeTextValue(cell.text))
      .slice(0, 18)
      .map((cell) => {
        const rowIndex = Number(cell.hostData?.rowIndex ?? 0);
        const colIndex = Number(cell.hostData?.colIndex ?? 0);
        const text = truncateText(normalizeTextValue(cell.text) || '', 24);
        return `${toCellAddress(rowIndex, colIndex)}=${text}`;
      });
    const formulaCount = sheetCells.filter((cell) =>
      normalizeTextValue(cell.hostData?.formula)
    ).length;

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

export function buildExcelBusinessExcerpt(
  documentIR: DocumentIR,
  roleFilter: 'data' | 'mock' | 'all' = 'all'
): string {
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

          const summary =
            pairSummaries.length > 0
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
    const sheetName =
      normalizeTextValue(sheet.hostData?.sheetName) ||
      normalizeTextValue(sheet.text) ||
      `sheet_${sheetIndex}`;
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

export function buildExcelVisibleSheetSummary(
  documentIR: DocumentIR,
  roleFilter: 'data' | 'mock' | 'all' = 'all'
): string {
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

export function extractGlobalUnderstandingText(contents: string[]): string | undefined {
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

export function buildCompactDocumentContext(request: StructuredAnalyzeRequest): string {
  if (request.host === 'excel') {
    return buildCompactExcelDocumentContext(request.documentIR);
  }

  return buildCompactGeneralDocumentContext(request.documentIR);
}

export function normalizeContextAnalysisPayload(
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
      contextAnalysis.userIntent =
        '理解真实数据 sheet 的业务主题、关键实体和命名口径，为后续对照组参数分析提供统一上下文';
    }
    if (
      !normalizeTextValue(contextAnalysis.globalBusinessSummary) &&
      topLevelTheme &&
      topLevelTheme !== '未提供具体数据文档'
    ) {
      contextAnalysis.globalBusinessSummary = topLevelTheme;
    }
    if (
      (!Array.isArray(contextAnalysis.keyEntities) ||
        (contextAnalysis.keyEntities as unknown[]).length === 0) &&
      topLevelEntities.length > 0
    ) {
      contextAnalysis.keyEntities = topLevelEntities;
    }
    if (!normalizeTextValue(contextAnalysis.recommendedDataSchema) && topLevelFieldHierarchy) {
      contextAnalysis.recommendedDataSchema = JSON.stringify(topLevelFieldHierarchy);
    }
    if (
      (!Array.isArray(contextAnalysis.namingPrinciples) ||
        (contextAnalysis.namingPrinciples as unknown[]).length === 0) &&
      topLevelNamingConventions
    ) {
      contextAnalysis.namingPrinciples = Object.entries(topLevelNamingConventions).map(
        ([key, value]) => `${key}:${String(value ?? '').trim()}`
      );
    }
  }

  return Object.keys(contextAnalysis).length > 0 ? contextAnalysis : undefined;
}
