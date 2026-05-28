import { HostAdapter } from '../adapters';
import { DocumentIR } from '../adapters/document-ir';
import { AISuggestion, ExcelSheetPairState } from '../taskpane/store';
import { OfficeHelper } from '../utils/office-api';
import {
  resolveAnalysisExecutor,
  AnalysisExecutorKind,
  StructuredAnalyzeRequest,
  ChatAnalysisError,
} from './analysis-executor';

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

export interface AnalyzeDocumentOptions {
  apiBaseUrl: string;
  templateType: string;
  useMultiStage: boolean;
  analysisExecutor?: AnalysisExecutorKind;
  thinking?: boolean;
  aiOrchestratorBaseUrl?: string;
  aiOrchestratorAuthToken?: string;
  skill?: any;
  excelGlobalUnderstandingCache?: {
    summary: string;
    promptRequestText?: string;
    promptDebugSummary?: string;
    rawAiResponse?: string;
  };
}

export interface AnalyzeDocumentResult {
  documentIR: DocumentIR;
  suggestions: AISuggestion[];
  templateConfig?: any;
  contextAnalysis?: Record<string, unknown>;
}

function toErrorInfo(error: unknown): Record<string, unknown> | undefined {
  if (error instanceof ChatAnalysisError) {
    return {
      message: error.message,
      stage: error.details.stage,
      pairLabel: error.details.pairLabel,
      url: error.details.url,
      status: error.details.status,
      reason: error.details.reason,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      reason: 'unknown_error',
    };
  }

  return undefined;
}

interface ExcelSheetInfo {
  id: string;
  name: string;
  sheetIndex: number;
  pairIndex: number;
  sheetRole: 'mock' | 'data';
  tables: Array<{
    name: string;
    address: string;
    headerAddress?: string;
    dataBodyAddress?: string;
  }>;
}

interface ExcelCellInfo {
  id: string;
  text: string;
  pairIndex: number;
  sheetIndex: number;
  sheetName: string;
  sheetRole: 'mock' | 'data';
  rowIndex: number;
  colIndex: number;
  formula: string;
}

interface ExcelPairAnalysisInput {
  pairIndex: number;
  pairLabel: string;
  mockSheet?: ExcelSheetInfo;
  dataSheet?: ExcelSheetInfo;
  pairDocumentIR: DocumentIR;
  diffSummary: string;
  diffOverview: string;
  candidateFieldList: string;
  candidateCount: number;
  loopDetected: boolean;
}

interface ExcelPairAttemptResult {
  pairSuggestions: AISuggestion[];
  aiCallSucceeded: boolean;
  error?: Record<string, unknown>;
  promptDebugSummary?: string;
  promptRequestText?: string;
  rawAiResponse?: string;
  salvagedMalformedJson: boolean;
  qualityIssues: string[];
  needsRetry: boolean;
}

interface WorkbookSheetSummary {
  name: string;
  index: number;
  address: string;
  rowCount: number;
  columnCount: number;
  tables: Array<{
    name: string;
    address: string;
    headerAddress?: string;
    dataBodyAddress?: string;
  }>;
  values: (string | number | boolean | null)[][];
  formulas: string[][];
}

interface ExcelLoopTableContext {
  sheetName: string;
  tableName: string;
  headerRange: NonNullable<ReturnType<typeof parseA1Range>>;
  bodyRange: ReturnType<typeof parseA1Range>;
  firstDataRowIndex: number;
}

export interface AnalyzeExcelWorkbookUnderstandingResult {
  documentIR: DocumentIR;
  summary: string;
  contextAnalysis?: Record<string, unknown>;
}

function serializeWordDocument(documentIR: DocumentIR): string {
  return documentIR.elements
    .filter((element) => element.type === 'paragraph' || element.type === 'table')
    .map((element) => element.text || '')
    .filter(Boolean)
    .join('\n');
}

function serializeDocument(documentIR: DocumentIR): string {
  if (documentIR.host === 'word') {
    return serializeWordDocument(documentIR);
  }

  return JSON.stringify(documentIR);
}

function buildDocumentContext(documentIR: DocumentIR, templateType: string): string {
  if (documentIR.host === 'excel') {
    const pairCount = documentIR.stats.sheetPairCount || 0;
    const sheetCount = documentIR.stats.sheetCount || 0;
    return `这是一份${templateType}类型的Excel表格。空白模板sheet保留结构，真实数据sheet提供实例内容，用户后续还会手动补足信息。请先基于Office原生结构解析成对sheet差异，识别可参数化cells、跨行循环和表格区域，再结合AI输出参数名称、描述、类型和模板化建议。当前只处理保留且参与比较的sheet对照组，共${pairCount}组、${sheetCount}个sheet。`;
  }

  return `这是一份${templateType}类型的${
    documentIR.host === 'word' ? 'Word文档' : 'PPT演示文稿'
  }，需要识别可参数化区域并生成模板变量`;
}

function extractWordUnderlineInfo(documentIR: DocumentIR): Array<Record<string, unknown>> {
  return documentIR.anchors
    .filter((anchor) => anchor.type === 'word-range')
    .map((anchor) => ({
      text: anchor.text,
      paragraphIndex: anchor.ref.paragraphIndex,
      paragraphText: anchor.ref.paragraphText,
      underlineType: anchor.ref.underlineType,
      position: {
        start: anchor.ref.start,
        end: anchor.ref.end,
      },
    }));
}

function extractWordParagraphFormats(documentIR: DocumentIR): Array<Record<string, unknown>> {
  return documentIR.elements
    .filter((element) => element.type === 'paragraph' && element.hostData?.format)
    .map((element) => ({
      text: element.text || '',
      index: element.hostData?.index,
      format: element.hostData?.format,
    }));
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

function toCellAddress(rowIndex: number, colIndex: number): string {
  return `${toColumnName(colIndex)}${rowIndex + 1}`;
}

function stripExcelSheetRoleSuffix(sheetName: string): string {
  return normalizeText(sheetName)
    .replace(/[_\s-]*(模板|模版|数据)$/u, '')
    .trim();
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
  // 移除硬编码的业务字段映射，进行标准化
  return undefined;
}

function mapExcelSheetFieldGroup(sheetName: string): string {
  // 移除硬编码的业务分组映射，进行标准化
  const normalizedSheet = stripExcelSheetRoleSuffix(sheetName);
  const asciiName = buildAsciiIdentifier(normalizedSheet, '');
  return asciiName || 'sheet';
}

function buildExcelFieldName(label: string, sheetName: string, rowIndex: number, colIndex: number): string {
  const sheetSegment = mapExcelSheetFieldGroup(sheetName);
  const fieldSegment = buildAsciiIdentifier(label, `fieldR${rowIndex + 1}C${colIndex + 1}`);
  return `d.${sheetSegment}.${fieldSegment}`;
}

function buildExcelArrayPath(sheetName: string): string {
  // 移除硬编码的数组路径映射，进行标准化
  const normalizedSheet = stripExcelSheetRoleSuffix(sheetName);
  const asciiName = buildAsciiIdentifier(normalizedSheet, '');
  return asciiName ? `d.${asciiName}List` : 'd.rows';
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

  const startRow = Number(match[1]);
  const startCol = Math.max(Number(match[2]) - 1, 0);
  const endRow = Number(match[3] || match[1]);
  const endCol = Math.max(Number(match[4] || match[2]) - 1, 0);

  return {
    sheetName,
    startRow,
    endRow,
    startCol,
    endCol,
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

  const startCol = columnNameToIndex(match[1]);
  const startRow = Number(match[2]);
  const endCol = columnNameToIndex(match[3] || match[1]);
  const endRow = Number(match[4] || match[2]);

  return {
    sheetName,
    startRow,
    endRow,
    startCol,
    endCol,
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

function isCellInParsedRange(
  rowIndex: number,
  colIndex: number,
  range: ReturnType<typeof parseA1Range>
): boolean {
  if (!range) {
    return false;
  }

  return (
    rowIndex >= range.startRow - 1 &&
    rowIndex <= range.endRow - 1 &&
    colIndex >= range.startCol &&
    colIndex <= range.endCol
  );
}

function buildExcelLoopTableContexts(
  mockSheet: ExcelSheetInfo | undefined,
  dataSheet: ExcelSheetInfo | undefined
): ExcelLoopTableContext[] {
  const sheets = [dataSheet, mockSheet].filter(Boolean) as ExcelSheetInfo[];

  return sheets.flatMap((sheet) =>
    sheet.tables
      .map((table) => {
        const headerRange = parseA1Range(table.headerAddress || table.address);
        if (!headerRange) {
          return undefined;
        }

        const bodyRange = parseA1Range(table.dataBodyAddress || table.address);
        const firstDataRowIndex = bodyRange
          ? Math.max(bodyRange.startRow - 1, headerRange.startRow)
          : headerRange.startRow;

        return {
          sheetName: sheet.name,
          tableName: table.name,
          headerRange,
          bodyRange,
          firstDataRowIndex,
        };
      })
      .filter((context): context is ExcelLoopTableContext => Boolean(context))
  );
}

function getExcelLoopTableContextForCell(
  cell: ExcelCellInfo,
  tableContexts: ExcelLoopTableContext[]
): ExcelLoopTableContext | undefined {
  return tableContexts.find((context) =>
    normalizeText(context.sheetName) === normalizeText(cell.sheetName) &&
    isCellInParsedRange(cell.rowIndex, cell.colIndex, context.bodyRange || context.headerRange)
  );
}

function getExcelLoopHeaderLabel(
  cell: ExcelCellInfo,
  tableContext: ExcelLoopTableContext,
  dataCellMap: Map<string, ExcelCellInfo>,
  mockCellMap: Map<string, ExcelCellInfo>
): string {
  const headerRowIndex = tableContext.headerRange.startRow - 1;
  const headerKey = `${headerRowIndex}:${cell.colIndex}`;
  return normalizeText(dataCellMap.get(headerKey)?.text) || normalizeText(mockCellMap.get(headerKey)?.text);
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

function buildExcelLoopFieldName(header: string, columnIndex: number): string {
  return mapExcelBusinessFieldName(header) || buildAsciiIdentifier(header, `field${columnIndex + 1}`);
}

function buildExcelLoopPromptSummary(
  mockSheet: ExcelSheetInfo | undefined,
  dataSheet: ExcelSheetInfo | undefined,
  cells: ExcelCellInfo[]
): {
  summary: string;
  fieldCount: number;
} | undefined {
  const templateSheet = mockSheet || dataSheet;
  const sampleSheet = dataSheet || mockSheet;
  const templateTable = templateSheet?.tables[0];
  const sampleTable = sampleSheet?.tables[0] || templateTable;
  const pairIndex = dataSheet?.pairIndex ?? mockSheet?.pairIndex;
  if (!sampleTable || !templateTable || typeof pairIndex !== 'number') {
    return undefined;
  }

  const headerRange = parseA1Range(sampleTable.headerAddress || sampleTable.address);
  const bodyRange = parseA1Range(sampleTable.dataBodyAddress || sampleTable.address);
  const templateHeaderRange = parseA1Range(templateTable.headerAddress || templateTable.address);
  const templateBodyRange = parseA1Range(templateTable.dataBodyAddress || templateTable.address);
  if (!headerRange || !templateHeaderRange) {
    return undefined;
  }

  const headerRowIndex = Math.max(headerRange.startRow - 1, 0);
  const sampleFirstDataRowIndex = bodyRange
    ? Math.max(bodyRange.startRow - 1, headerRowIndex + 1)
    : headerRowIndex + 1;
  const templateHeaderRowIndex = Math.max(templateHeaderRange.startRow - 1, 0);
  const templateFirstDataRowIndex = templateBodyRange
    ? Math.max(templateBodyRange.startRow - 1, templateHeaderRowIndex + 1)
    : templateHeaderRowIndex + 1;
  const lastColumnIndex = bodyRange?.endCol ?? headerRange.endCol;
  const pairCells = cells.filter((cell) => cell.pairIndex === pairIndex);
  const cellMap = new Map<string, ExcelCellInfo>();

  for (const cell of pairCells) {
    cellMap.set(`${cell.sheetRole}:${cell.rowIndex}:${cell.colIndex}`, cell);
  }

  const firstRowItems: string[] = [];

  for (let columnIndex = headerRange.startCol; columnIndex <= lastColumnIndex; columnIndex += 1) {
    const headerCell =
      cellMap.get(`data:${headerRowIndex}:${columnIndex}`)
      || cellMap.get(`mock:${headerRowIndex}:${columnIndex}`);
    const rowCell =
      cellMap.get(`data:${sampleFirstDataRowIndex}:${columnIndex}`)
      || cellMap.get(`mock:${sampleFirstDataRowIndex}:${columnIndex}`);
    const headerName = normalizeText(headerCell?.text) || `列${columnIndex - headerRange.startCol + 1}`;
    const sampleValue = normalizeText(rowCell?.text);
    if (sampleValue) {
      const templateColumnIndex = templateHeaderRange.startCol + (columnIndex - headerRange.startCol);
      firstRowItems.push(
        `字段名称：${headerName}，示例值：${sampleValue}，位置：${toCellAddress(templateFirstDataRowIndex, templateColumnIndex)}`
      );
    }
  }

  return {
    summary: [
      `表区域: ${templateTable.address || '未知'}`,
      firstRowItems.length > 0 ? '明细数据:' : undefined,
      ...firstRowItems,
    ].filter(Boolean).join('\n'),
    fieldCount: firstRowItems.length,
  };
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

function buildExcelColumnMappingsForTable(
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

function inferExcelFieldType(value: string, formula: string): string {
  const normalizedValue = normalizeText(value);
  const normalizedFormula = normalizeText(formula);

  if (!normalizedValue && normalizedFormula) {
    return 'formula';
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalizedValue)) {
    return 'date';
  }

  if (/^-?\d+(\.\d+)?%$/.test(normalizedValue)) {
    return 'percent';
  }

  if (/^-?\d+(\.\d+)?$/.test(normalizedValue)) {
    return 'number';
  }

  if (/^(true|false|是|否)$/i.test(normalizedValue)) {
    return 'boolean';
  }

  return 'text';
}

function inferExcelFieldTypeWithLabel(value: string, formula: string, _label: string): string {
  // 移除硬编码的业务字段类型映射，优先依赖基础类型推断
  return inferExcelFieldType(value, formula);
}

function buildExcelExtractionHint(label: string, variablePath: string, fieldType: string): string {
  const normalizedLabel = normalizeText(label);

  if (fieldType === 'date') {
    return `用于从自然语言中提取日期类参数，并将识别到的日期值赋值给 ${variablePath}。`;
  }

  if (fieldType === 'number' || fieldType === 'percent') {
    return `用于从自然语言中提取数值类参数，并将识别到的数值赋值给 ${variablePath}。`;
  }

  return `用于从自然语言或结构化输入中提取“${normalizedLabel || variablePath}”的值，并赋值给 ${variablePath}。`;
}

function buildExcelHeuristicDescription(label: string, variablePath: string): string {
  if (label) {
    return `参数 ${variablePath} 对应“${label}”，建议在渲染前先从用户自然语言、表单或业务上下文中抽取该值。`;
  }

  return `参数 ${variablePath} 来自成对 sheet 差异，建议在渲染前从用户输入或上下文中补足该字段值。`;
}

function extractExcelSheets(documentIR: DocumentIR): ExcelSheetInfo[] {
  return documentIR.elements
    .filter((element) => element.type === 'sheet')
    .map((element) => ({
      id: element.id,
      name: String(element.text || ''),
      sheetIndex: Number(element.hostData?.sheetIndex ?? -1),
      pairIndex: Number(element.hostData?.pairIndex ?? -1),
      sheetRole: (element.hostData?.sheetRole as 'mock' | 'data') || 'mock',
      tables: Array.isArray(element.hostData?.tables)
        ? ((element.hostData?.tables as Array<Record<string, unknown>>)
            .map((table) => ({
              name: String(table.name || ''),
              address: String(table.address || ''),
              headerAddress: String(table.headerAddress || ''),
              dataBodyAddress: String(table.dataBodyAddress || ''),
            }))
            .filter((table) => table.name))
        : [],
    }))
    .filter((sheet) => sheet.pairIndex >= 0 && sheet.sheetIndex >= 0);
}

function extractExcelCells(documentIR: DocumentIR): ExcelCellInfo[] {
  return documentIR.elements
    .filter((element) => element.type === 'cell')
    .map((element) => ({
      id: element.id,
      text: String(element.text || ''),
      pairIndex: Number(element.hostData?.pairIndex ?? -1),
      sheetIndex: Number(element.hostData?.sheetIndex ?? -1),
      sheetName: String(element.hostData?.sheetName || ''),
      sheetRole: (element.hostData?.sheetRole as 'mock' | 'data') || 'mock',
      rowIndex: Number(element.hostData?.rowIndex ?? -1),
      colIndex: Number(element.hostData?.colIndex ?? -1),
      formula: String(element.hostData?.formula || ''),
    }))
    .filter((cell) => cell.pairIndex >= 0 && cell.rowIndex >= 0 && cell.colIndex >= 0);
}

function recalculateDocumentStats(documentIR: DocumentIR): DocumentIR['stats'] {
  const sheetElements = documentIR.elements.filter((element) => element.type === 'sheet');
  const cellElements = documentIR.elements.filter((element) => element.type === 'cell');
  const tableCount = sheetElements.reduce((count, element) => {
    const tables = Array.isArray(element.hostData?.tables) ? element.hostData?.tables.length : 0;
    return count + tables;
  }, 0);
  const pairIndexes = new Set(
    sheetElements
      .map((element) => Number(element.hostData?.pairIndex ?? -1))
      .filter((pairIndex) => pairIndex >= 0)
  );

  return {
    ...documentIR.stats,
    sheetCount: sheetElements.length,
    sheetPairCount: pairIndexes.size,
    tableCount,
    cellCount: cellElements.length,
  };
}

function buildWorkbookSheetPairLookup(pairs: ExcelSheetPairState[]): Map<number, { pairIndex: number; sheetRole: 'mock' | 'data' }> {
  const lookup = new Map<number, { pairIndex: number; sheetRole: 'mock' | 'data' }>();

  pairs.forEach((pair) => {
    if (typeof pair.leftSheetIndex === 'number') {
      lookup.set(pair.leftSheetIndex, {
        pairIndex: pair.pairIndex,
        sheetRole: 'mock',
      });
    }
    if (typeof pair.rightSheetIndex === 'number') {
      lookup.set(pair.rightSheetIndex, {
        pairIndex: pair.pairIndex,
        sheetRole: 'data',
      });
    }
  });

  return lookup;
}

function buildExcelDocumentIRFromWorkbookSheets(
  workbookSheets: WorkbookSheetSummary[],
  selectedSheetIndexes: number[],
  configuredPairs: ExcelSheetPairState[]
): DocumentIR {
  const selectedSheetSet = new Set(selectedSheetIndexes);
  const pairLookup = buildWorkbookSheetPairLookup(configuredPairs);
  const elements: DocumentIR['elements'] = [];
  const anchors: DocumentIR['anchors'] = [];

  workbookSheets
    .filter((sheet) => selectedSheetSet.has(sheet.index))
    .sort((a, b) => a.index - b.index)
    .forEach((sheet) => {
      const pairMeta = pairLookup.get(sheet.index);
      const sheetRole = pairMeta?.sheetRole || (sheet.index % 2 === 0 ? 'mock' : 'data');
      const pairIndex = pairMeta?.pairIndex ?? -1;
      const sheetElementId = `excel-sheet-${sheet.index}`;

      elements.push({
        id: sheetElementId,
        type: 'sheet',
        text: sheet.name,
        hostData: {
          sheetIndex: sheet.index,
          sheetName: sheet.name,
          sheetRole,
          pairIndex,
          tableNames: sheet.tables.map((table) => table.name),
          tables: sheet.tables,
          address: sheet.address,
        },
      });

      for (let rowIndex = 0; rowIndex < sheet.values.length; rowIndex += 1) {
        const row = sheet.values[rowIndex] || [];
        for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
          const value = row[colIndex];
          const cellText = value == null ? '' : String(value);
          const cellAnchorId = `excel-range-${sheet.index}-${rowIndex}-${colIndex}`;

          elements.push({
            id: `excel-cell-${sheet.index}-${rowIndex}-${colIndex}`,
            type: 'cell',
            text: cellText,
            anchorIds: [cellAnchorId],
            hostData: {
              sheetIndex: sheet.index,
              sheetName: sheet.name,
              sheetRole,
              pairIndex,
              rowIndex,
              colIndex,
              formula: sheet.formulas[rowIndex]?.[colIndex] || '',
            },
          });

          anchors.push({
            id: cellAnchorId,
            type: 'excel-range',
            text: cellText,
            ref: {
              sheetIndex: sheet.index,
              sheetName: sheet.name,
              sheetRole,
              pairIndex,
              rowIndex,
              colIndex,
            },
          });
        }
      }
    });

  const documentIR: DocumentIR = {
    host: 'excel',
    metadata: {
      title: 'Excel Workbook Understanding',
    },
    elements,
    anchors,
    stats: {
      sheetCount: 0,
      sheetPairCount: 0,
      tableCount: 0,
      cellCount: 0,
    },
  };

  return {
    ...documentIR,
    stats: recalculateDocumentStats(documentIR),
  };
}

function buildDocumentIRSubset(
  documentIR: DocumentIR,
  includeElement: (element: DocumentIR['elements'][number]) => boolean
): DocumentIR {
  const elements = documentIR.elements.filter(includeElement);
  const anchorIds = new Set(elements.flatMap((element) => element.anchorIds || []));
  const anchors = documentIR.anchors.filter((anchor) => anchorIds.has(anchor.id));
  const subset: DocumentIR = {
    host: documentIR.host,
    metadata: { ...documentIR.metadata },
    elements,
    anchors,
    stats: documentIR.stats,
  };

  return {
    ...subset,
    stats: recalculateDocumentStats(subset),
  };
}

function buildExcelGlobalDataDocumentIR(documentIR: DocumentIR): DocumentIR {
  return buildDocumentIRSubset(documentIR, (element) => {
    if (element.type !== 'sheet' && element.type !== 'cell') {
      return false;
    }
    return element.hostData?.sheetRole === 'data';
  });
}

function buildExcelPairDocumentIR(documentIR: DocumentIR, pairIndex: number): DocumentIR {
  return buildDocumentIRSubset(documentIR, (element) => {
    const elementPairIndex = Number(element.hostData?.pairIndex ?? -1);
    return elementPairIndex === pairIndex;
  });
}

function findExcelLabel(
  rowIndex: number,
  colIndex: number,
  cellsByPosition: Map<string, ExcelCellInfo>,
  fallbackCellsByPosition: Map<string, ExcelCellInfo>
): string {
  for (let leftCol = colIndex - 1; leftCol >= 0; leftCol -= 1) {
    const key = `${rowIndex}:${leftCol}`;
    const labelCell = cellsByPosition.get(key) || fallbackCellsByPosition.get(key);
    const labelText = normalizeText(labelCell?.text);
    if (labelText) {
      return labelText;
    }
  }

  for (let upperRow = rowIndex - 1; upperRow >= 0; upperRow -= 1) {
    const key = `${upperRow}:${colIndex}`;
    const labelCell = cellsByPosition.get(key) || fallbackCellsByPosition.get(key);
    const labelText = normalizeText(labelCell?.text);
    if (labelText) {
      return labelText;
    }
  }

  return '';
}

function buildExcelPairDiffSummary(
  pairIndex: number,
  mockSheet: ExcelSheetInfo | undefined,
  dataSheet: ExcelSheetInfo | undefined,
  cells: ExcelCellInfo[]
): {
  summary: string;
  diffOverview: string;
  candidateFieldList: string;
  candidateCount: number;
  loopDetected: boolean;
} {
  const pairLabel = `${mockSheet?.name || '模板sheet'} ↔ ${dataSheet?.name || '数据sheet'}`;
  const mockCells = cells.filter((cell) => cell.pairIndex === pairIndex && cell.sheetRole === 'mock');
  const dataCells = cells.filter((cell) => cell.pairIndex === pairIndex && cell.sheetRole === 'data');
  const mockCellMap = new Map(mockCells.map((cell) => [`${cell.rowIndex}:${cell.colIndex}`, cell]));
  const dataCellMap = new Map(dataCells.map((cell) => [`${cell.rowIndex}:${cell.colIndex}`, cell]));
  const loopTableContexts = buildExcelLoopTableContexts(mockSheet, dataSheet);

  let candidateCount = 0;
  let looseFieldCount = 0;
  const candidateExamples: string[] = [];

  for (const dataCell of dataCells) {
    const dataText = normalizeText(dataCell.text);
    const mockCell = mockCellMap.get(`${dataCell.rowIndex}:${dataCell.colIndex}`);
    const mockText = normalizeText(mockCell?.text);

    if (!dataText) {
      continue;
    }

    if (!mockText) {
      candidateCount += 1;
      const loopTableContext = getExcelLoopTableContextForCell(dataCell, loopTableContexts);
      const label = loopTableContext
        ? getExcelLoopHeaderLabel(dataCell, loopTableContext, dataCellMap, mockCellMap)
        : findExcelLabel(dataCell.rowIndex, dataCell.colIndex, dataCellMap, mockCellMap);
      if (candidateExamples.length < 12) {
        if (loopTableContext) {
          continue;
        }
        looseFieldCount += 1;
        const valuePreview = dataText.length > 24 ? `${dataText.slice(0, 24)}...` : dataText;
        candidateExamples.push(
          `字段名称：${label || '未识别标签'}，示例值：${valuePreview}，位置：${toCellAddress(dataCell.rowIndex, dataCell.colIndex)}`
        );
      } else if (!loopTableContext) {
        looseFieldCount += 1;
      }
      continue;
    }
  }

  const loopDetected = [mockSheet, dataSheet].some((sheet) => (sheet?.tables.length || 0) > 0)
    || /明细|交付|付款|detail|delivery|payment/i.test(pairLabel);
  const loopPromptSummary = loopDetected
    ? buildExcelLoopPromptSummary(mockSheet, dataSheet, cells)
    : undefined;
  const loopTableCount = loopPromptSummary ? 1 : 0;
  const loopFieldCount = loopPromptSummary?.fieldCount || 0;
  const diffParts = [
    loopTableCount > 0 ? `${loopTableCount} 个明细表` : undefined,
    loopFieldCount > 0 ? `${loopFieldCount} 个明细字段` : undefined,
    looseFieldCount > 0 ? `${looseFieldCount} 个单独字段` : undefined,
  ].filter(Boolean);
  const diffOverview = `对照组 ${pairIndex + 1}: ${pairLabel}。${diffParts.length > 0 ? `${diffParts.join('，')}。` : '未提取到明确候选字段。'}`;
  const candidateFieldList = loopPromptSummary
    ? [
        '明细表:',
        loopPromptSummary.summary,
        candidateExamples.length > 0 ? '单独字段:' : undefined,
        candidateExamples.length > 0 ? candidateExamples.join('\n') : undefined,
      ].filter(Boolean).join('\n')
    : candidateExamples.length > 0
      ? candidateExamples.join('\n')
      : '未提取到明确候选字段。';

  return {
    summary: diffOverview,
    diffOverview,
    candidateFieldList,
    candidateCount,
    loopDetected,
  };
}

function buildExcelPairAnalysisInputs(documentIR: DocumentIR): ExcelPairAnalysisInput[] {
  const sheets = extractExcelSheets(documentIR);
  const cells = extractExcelCells(documentIR);
  const pairIndexes = Array.from(new Set(sheets.map((sheet) => sheet.pairIndex))).sort((a, b) => a - b);

  return pairIndexes.map((pairIndex) => {
    const pairSheets = sheets.filter((sheet) => sheet.pairIndex === pairIndex);
    const mockSheet = pairSheets.find((sheet) => sheet.sheetRole === 'mock');
    const dataSheet = pairSheets.find((sheet) => sheet.sheetRole === 'data');
    const pairLabel = `${mockSheet?.name || '模板sheet'} ↔ ${dataSheet?.name || '数据sheet'}`;
    const diff = buildExcelPairDiffSummary(pairIndex, mockSheet, dataSheet, cells);

    return {
      pairIndex,
      pairLabel,
      mockSheet,
      dataSheet,
      pairDocumentIR: buildExcelPairDocumentIR(documentIR, pairIndex),
      diffSummary: diff.summary,
      diffOverview: diff.diffOverview,
      candidateFieldList: diff.candidateFieldList,
      candidateCount: diff.candidateCount,
      loopDetected: diff.loopDetected,
    };
  });
}

function buildExcelHeuristicSuggestions(documentIR: DocumentIR): AISuggestion[] {
  if (documentIR.host !== 'excel') {
    return [];
  }

  const sheets = extractExcelSheets(documentIR);
  const cells = extractExcelCells(documentIR);
  const pairIndexes = Array.from(new Set(sheets.map((sheet) => sheet.pairIndex))).sort((a, b) => a - b);
  const suggestions: AISuggestion[] = [];
  const seenKeys = new Set<string>();

  for (const pairIndex of pairIndexes) {
    const pairSheets = sheets.filter((sheet) => sheet.pairIndex === pairIndex);
    const mockSheet = pairSheets.find((sheet) => sheet.sheetRole === 'mock');
    const dataSheet = pairSheets.find((sheet) => sheet.sheetRole === 'data');
    const pairLabel = `${mockSheet?.name || '模板sheet'} ↔ ${dataSheet?.name || '数据sheet'}`;

    if (!mockSheet && !dataSheet) {
      continue;
    }

    const isLoopSheet = pairSheets.some((sheet) => sheet.tables.length > 0) ||
      /明细|交付|付款|detail|delivery|payment/i.test(pairLabel);

    if (isLoopSheet) {
      const targetTable = mockSheet?.tables[0] || dataSheet?.tables[0];
      const tableName = targetTable?.name || dataSheet?.name || mockSheet?.name || `pair_${pairIndex}`;
      const arrayPath = buildExcelArrayPath(dataSheet?.name || mockSheet?.name || '');
      const loopAnchor: ExcelTableAnchor = {
        type: 'table',
        sheetName: mockSheet?.name || dataSheet?.name || '',
        sheetIndex: mockSheet?.sheetIndex ?? dataSheet?.sheetIndex,
        pairIndex,
        tableName,
        startAddress: stripSheetPrefix(targetTable?.headerAddress || targetTable?.address || ''),
        endAddress: stripSheetPrefix(targetTable?.dataBodyAddress || targetTable?.address || ''),
      };
      const loopColumnMappings = buildExcelColumnMappingsForTable(documentIR, loopAnchor, arrayPath);
      const loopKey = `loop:${arrayPath}:${pairIndex}`;

      if (!seenKeys.has(loopKey)) {
        suggestions.push({
          id: `excel-loop-${pairIndex}`,
          type: 'loop',
          elementPath: pairLabel,
          suggestedName: `{#${arrayPath}}{/${arrayPath}}`,
          originalText: tableName,
          confidence: 0.9,
          applied: false,
          context: `Excel 成对 sheet 循环表识别: ${pairLabel}`,
          details: {
            source: 'heuristic',
          description: `循环块 ${arrayPath} 对应“${tableName}”表格，建议从自然语言或结构化输入中提取多条记录后再渲染到模板表格。`,
            fieldType: 'loop',
            loopType: 'explicit',
            arrayPath,
            tableName,
            columnMappings: loopColumnMappings,
            chapter: dataSheet?.name || mockSheet?.name || `Sheet Pair ${pairIndex + 1}`,
          significance: `用于指导 AI 从自然语言中提取“${tableName}”对应的多条记录。例如用户提供多项采购明细、交付计划或付款节点时，应整理为数组 ${arrayPath} 后再渲染循环块。`,
            displayPosition: pairLabel,
            excelAnchor: loopAnchor,
          },
        });
        seenKeys.add(loopKey);
      }

      continue;
    }

    const mockCells = cells.filter((cell) => cell.pairIndex === pairIndex && cell.sheetRole === 'mock');
    const dataCells = cells.filter((cell) => cell.pairIndex === pairIndex && cell.sheetRole === 'data');
    const mockCellMap = new Map(mockCells.map((cell) => [`${cell.rowIndex}:${cell.colIndex}`, cell]));
    const dataCellMap = new Map(dataCells.map((cell) => [`${cell.rowIndex}:${cell.colIndex}`, cell]));

    for (const dataCell of dataCells) {
      const dataText = normalizeText(dataCell.text);
      if (!dataText) {
        continue;
      }

      const mockCell = mockCellMap.get(`${dataCell.rowIndex}:${dataCell.colIndex}`);
      const mockText = normalizeText(mockCell?.text);
      if (mockText || mockText === dataText) {
        continue;
      }

      const label = findExcelLabel(dataCell.rowIndex, dataCell.colIndex, dataCellMap, mockCellMap);
      const variablePath = buildExcelFieldName(label, dataCell.sheetName, dataCell.rowIndex, dataCell.colIndex);
      const suggestionKey = `var:${variablePath}:${pairIndex}:${dataCell.rowIndex}:${dataCell.colIndex}`;

      if (seenKeys.has(suggestionKey)) {
        continue;
      }

      const address = toCellAddress(dataCell.rowIndex, dataCell.colIndex);
      const targetSheet = mockSheet?.name || dataCell.sheetName;
      const targetSheetIndex = mockSheet?.sheetIndex ?? dataCell.sheetIndex;
      const inferredFieldType = inferExcelFieldTypeWithLabel(dataText, dataCell.formula, label || '');
      suggestions.push({
        id: `excel-var-${pairIndex}-${dataCell.rowIndex}-${dataCell.colIndex}`,
        type: 'variable',
        elementPath: `${targetSheet}!${address}`,
        suggestedName: `{${variablePath}}`,
        originalText: dataText,
        confidence: label ? 0.88 : 0.72,
        applied: false,
        context: label ? `${pairLabel} | 标签: ${label}` : `Excel 成对 sheet 差异识别: ${pairLabel}`,
        details: {
          source: 'heuristic',
          description: buildExcelHeuristicDescription(label, variablePath),
          chapter: targetSheet,
          significance: buildExcelExtractionHint(label, variablePath, inferredFieldType),
          displayPosition: `${targetSheet}!${address}`,
          context: label,
          fieldType: inferredFieldType,
          beforeBlank: label,
          afterBlank: '',
          excelAnchor: {
            type: 'cell',
            sheetName: targetSheet,
            sheetIndex: targetSheetIndex,
            pairIndex,
            address,
            rowIndex: dataCell.rowIndex,
            colIndex: dataCell.colIndex,
          },
        },
      });
      seenKeys.add(suggestionKey);
    }
  }

  return suggestions;
}

function annotateSuggestionSource(
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

function expandExcelLoopColumnSuggestions(suggestions: AISuggestion[]): AISuggestion[] {
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

function dedupeExcelArraySuggestions(suggestions: AISuggestion[]): AISuggestion[] {
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
  pair: ExcelPairAnalysisInput
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

function buildExcelPairPayload(
  pair: ExcelPairAnalysisInput,
  documentType: 'docx' | 'xlsx' | 'pptx',
  templateType: string,
  globalUnderstandingSummary: string
): StructuredAnalyzeRequest {
  return {
    host: 'excel',
    documentIR: pair.pairDocumentIR,
    documentContent: serializeDocument(pair.pairDocumentIR),
    documentType,
    templateType,
    context: buildExcelPairAnalysisContext(pair, templateType, globalUnderstandingSummary),
    analysisStage: 'excel-pair-analysis',
    pairLabel: pair.pairLabel,
    globalUnderstandingSummary,
    diffSummary: pair.diffSummary,
    diffOverview: pair.diffOverview,
    candidateFieldList: pair.candidateFieldList,
  };
}

function normalizeExcelPairSuggestions(
  pair: ExcelPairAnalysisInput,
  pairResponse: AnalyzeDocumentResult & { rawSuggestions?: AISuggestion[] }
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

function evaluateExcelPairAttempt(
  pair: ExcelPairAnalysisInput,
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

function scoreExcelPairAttempt(attempt: ExcelPairAttemptResult): number {
  let score = attempt.aiCallSucceeded ? 100 : -100;
  score += attempt.pairSuggestions.length * 10;
  score -= attempt.qualityIssues.length * 20;
  if (attempt.salvagedMalformedJson) {
    score -= 30;
  }
  return score;
}

function choosePreferredExcelPairAttempt(
  primaryAttempt: ExcelPairAttemptResult,
  retryAttempt?: ExcelPairAttemptResult
): ExcelPairAttemptResult {
  if (!retryAttempt) {
    return primaryAttempt;
  }

  if (retryAttempt.aiCallSucceeded && !retryAttempt.needsRetry) {
    return retryAttempt;
  }

  if (primaryAttempt.aiCallSucceeded && !primaryAttempt.needsRetry) {
    return primaryAttempt;
  }

  return scoreExcelPairAttempt(retryAttempt) >= scoreExcelPairAttempt(primaryAttempt)
    ? retryAttempt
    : primaryAttempt;
}

async function executeExcelPairAttempt(
  executor: ReturnType<typeof resolveAnalysisExecutor>,
  pair: ExcelPairAnalysisInput,
  documentType: 'docx' | 'xlsx' | 'pptx',
  templateType: string,
  globalUnderstandingSummary: string
): Promise<ExcelPairAttemptResult> {
  try {
    const pairResponse = await executor.analyze(
      buildExcelPairPayload(pair, documentType, templateType, globalUnderstandingSummary)
    );
    const pairSuggestions = normalizeExcelPairSuggestions(pair, pairResponse);
    const quality = evaluateExcelPairAttempt(
      pair,
      pairSuggestions,
      pairResponse.contextAnalysis as Record<string, unknown> | undefined
    );

    return {
      pairSuggestions,
      aiCallSucceeded: true,
      promptDebugSummary: pairResponse.contextAnalysis?.promptDebugSummary
        ? String(pairResponse.contextAnalysis.promptDebugSummary)
        : undefined,
      promptRequestText: pairResponse.contextAnalysis?.promptRequestText
        ? String(pairResponse.contextAnalysis.promptRequestText)
        : undefined,
      rawAiResponse: pairResponse.contextAnalysis?.rawAiResponse
        ? String(pairResponse.contextAnalysis.rawAiResponse)
        : undefined,
      salvagedMalformedJson: quality.salvagedMalformedJson,
      qualityIssues: quality.qualityIssues,
      needsRetry: quality.needsRetry,
    };
  } catch (error) {
    return {
      pairSuggestions: [],
      aiCallSucceeded: false,
      error: toErrorInfo(error),
      salvagedMalformedJson: false,
      qualityIssues: ['request-failed'],
      needsRetry: true,
    };
  }
}

function buildExcelGlobalUnderstandingContext(documentIR: DocumentIR, templateType: string): string {
  const sheetCount = documentIR.stats.sheetCount || 0;
  const cellCount = documentIR.stats.cellCount || 0;

  return `当前提供的是一份待理解的文档内容摘录，来源于 Excel 工作簿。请根据全部可见 sheet 的内容理解文档类型、业务目的、关键字段、各部分职责以及它们之间的关系。当前共有${sheetCount}个可见sheet、约${cellCount}个单元格，模板类型线索为 ${templateType}。`;
}

function buildExcelPairAnalysisContext(
  pair: ExcelPairAnalysisInput,
  templateType: string,
  globalUnderstandingSummary: string
): string {
  return `这是一份${templateType}类型的Excel成对sheet分析任务。请基于下面的全局真实数据理解结果，专注分析当前单个对照组的模板化需求，不要脱离该对照组生成无关变量。

【全局真实数据理解】
${globalUnderstandingSummary}

【当前对照组差异摘要】
${pair.diffOverview}

【当前对照组候选信息】
${pair.candidateFieldList}

【输出要求】
1. 只针对当前对照组输出参数化建议。
2. 如果当前对照组同时包含“明细表”和“单独字段”，两部分都必须分析，不能只关注表格。
3. “明细表”用于识别 loop 和对应列字段；“单独字段”用于识别独立的单值 variable。
4. 单独字段通常是标准、说明、条件、备注、条款等内容，容易遗漏，请优先逐条检查。
5. 如果存在表格、明细、交付、付款等跨行区域，优先识别为循环块。
6. 位置优先使用模板 sheet，不要照抄数据 sheet。
7. 输出参数名称、描述、类型，并尽量与全局理解中的数据模型保持一致。`;
}

function buildExcelGlobalUnderstandingSummary(response: {
  contextAnalysis?: Record<string, unknown>;
  rawSuggestions?: AISuggestion[];
  suggestions?: AISuggestion[];
}): string {
  const globalUnderstandingText = String(response.contextAnalysis?.globalUnderstandingText || '').trim();
  if (globalUnderstandingText) {
    return globalUnderstandingText;
  }

  const detectedTemplateType = String(response.contextAnalysis?.detectedTemplateType || 'unknown');
  const userIntent = String(response.contextAnalysis?.userIntent || '未提供');
  const globalBusinessSummary = String(response.contextAnalysis?.globalBusinessSummary || '').trim();
  const recommendedDataSchema = String(response.contextAnalysis?.recommendedDataSchema || '').trim();
  const namingPrinciples = Array.isArray(response.contextAnalysis?.namingPrinciples)
    ? (response.contextAnalysis?.namingPrinciples as unknown[])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join('、')
    : '';
  const keyEntities = Array.isArray(response.contextAnalysis?.keyEntities)
    ? (response.contextAnalysis?.keyEntities as unknown[])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join('、')
    : '';
  const candidateSuggestions = (response.rawSuggestions || response.suggestions || []).slice(0, 8);
  const suggestionSummary = candidateSuggestions.length > 0
    ? candidateSuggestions
        .map((suggestion) => {
          const name = 'suggestedName' in suggestion ? String(suggestion.suggestedName || '') : '';
          const original = 'originalText' in suggestion ? String(suggestion.originalText || '') : '';
          return [name, original].filter(Boolean).join(' <- ');
        })
        .filter(Boolean)
        .join('；')
    : '未返回候选参数';

  return `模板类型判断: ${detectedTemplateType}。业务目的: ${userIntent}。`
    + `${globalBusinessSummary ? `业务摘要: ${globalBusinessSummary}。` : ''}`
    + `${keyEntities ? `关键实体: ${keyEntities}。` : ''}`
    + `${recommendedDataSchema ? `建议数据模型: ${recommendedDataSchema}。` : ''}`
    + `${namingPrinciples ? `命名原则: ${namingPrinciples}。` : ''}`
    + `全局候选摘要: ${suggestionSummary}。`;
}

function summarizeSuggestionSources(suggestions: AISuggestion[]): {
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

export function enrichWordSuggestionAnchors(documentIR: DocumentIR, suggestions: AISuggestion[]): AISuggestion[] {
  const contentControlAnchors = documentIR.anchors.filter((anchor) => anchor.type === 'word-content-control');
  const tableCellAnchors = documentIR.anchors.filter(
    (anchor) => anchor.type === 'word-range' && anchor.ref?.anchorSource === 'table-cell'
  );

  return suggestions.map((suggestion) => {
    const originalText = normalizeText(suggestion.originalText);
    const contextText = normalizeText(suggestion.context || suggestion.details?.context || suggestion.elementPath);

    const exactContentControls = originalText
      ? contentControlAnchors.filter((anchor) => normalizeText(anchor.text) === originalText)
      : [];
    if (exactContentControls.length === 1) {
      return {
        ...suggestion,
        details: {
          ...suggestion.details,
          wordAnchor: {
            type: 'content-control',
            contentControlId: exactContentControls[0].ref.id as number,
          },
        },
      };
    }

    const contextualContentControls = contextText
      ? contentControlAnchors.filter((anchor) => {
          const anchorText = normalizeText(anchor.text);
          return anchorText && contextText.includes(anchorText);
        })
      : [];
    if (contextualContentControls.length === 1) {
      return {
        ...suggestion,
        details: {
          ...suggestion.details,
          wordAnchor: {
            type: 'content-control',
            contentControlId: contextualContentControls[0].ref.id as number,
          },
        },
      };
    }

    const exactTableCells = originalText
      ? tableCellAnchors.filter((anchor) => normalizeText(anchor.text) === originalText)
      : [];
    if (exactTableCells.length === 1) {
      return {
        ...suggestion,
        details: {
          ...suggestion.details,
          wordAnchor: {
            type: 'table-cell',
            tableIndex: exactTableCells[0].ref.tableIndex as number,
            rowIndex: exactTableCells[0].ref.rowIndex as number,
            cellIndex: exactTableCells[0].ref.cellIndex as number,
          },
        },
      };
    }

    const contextualTableCells = contextText
      ? tableCellAnchors.filter((anchor) => {
          const anchorText = normalizeText(anchor.text);
          return anchorText && contextText.includes(anchorText);
        })
      : [];
    if (contextualTableCells.length === 1) {
      return {
        ...suggestion,
        details: {
          ...suggestion.details,
          wordAnchor: {
            type: 'table-cell',
            tableIndex: contextualTableCells[0].ref.tableIndex as number,
            rowIndex: contextualTableCells[0].ref.rowIndex as number,
            cellIndex: contextualTableCells[0].ref.cellIndex as number,
          },
        },
      };
    }

    return suggestion;
  });
}

export async function analyzeDocumentWithAI(
  adapter: HostAdapter,
  options: AnalyzeDocumentOptions
): Promise<AnalyzeDocumentResult> {
  const documentIR = await adapter.extractDocument();
  const excelHeuristicSuggestions = adapter.host === 'excel'
    ? annotateSuggestionSource(buildExcelHeuristicSuggestions(documentIR), 'heuristic')
    : [];
  const documentContent = serializeDocument(documentIR);
  const documentType: 'docx' | 'xlsx' | 'pptx' =
    adapter.host === 'word' ? 'docx' : adapter.host === 'excel' ? 'xlsx' : 'pptx';

  const requestPayload = {
    host: adapter.host,
    documentIR,
    documentContent,
    documentType,
    templateType: options.templateType,
    skill: options.skill,
    context: buildDocumentContext(documentIR, options.templateType),
    underlineInfo: adapter.host === 'word' ? extractWordUnderlineInfo(documentIR) : undefined,
    paragraphFormats: adapter.host === 'word' ? extractWordParagraphFormats(documentIR) : undefined,
  } satisfies StructuredAnalyzeRequest;

  const executor = resolveAnalysisExecutor({
    apiBaseUrl: options.apiBaseUrl,
    useMultiStage: options.useMultiStage,
    requestedKind: options.analysisExecutor,
    thinking: options.thinking,
    aiOrchestratorBaseUrl: (options as AnalyzeDocumentOptions & { aiOrchestratorBaseUrl?: string }).aiOrchestratorBaseUrl,
    aiOrchestratorAuthToken: (options as AnalyzeDocumentOptions & { aiOrchestratorAuthToken?: string }).aiOrchestratorAuthToken,
  });
  const requestMode = executor.kind === 'chat'
    ? 'chat'
    : options.useMultiStage
      ? 'multi-stage'
      : 'direct';

  if (adapter.host === 'excel') {
    const pairInputs = buildExcelPairAnalysisInputs(documentIR);
    const globalDataDocumentIR = buildExcelGlobalDataDocumentIR(documentIR);
    const pairResults: Array<Record<string, unknown>> = [];
    let globalUnderstandingSummary = '全局真实数据理解暂不可用，按当前对照组局部分析。';
    let globalUnderstandingUsedAI = false;
    let usedCachedGlobalUnderstanding = false;
    let globalPromptDebugSummary: string | undefined;
    let globalPromptRequestText: string | undefined;
    let globalRawAiResponse: string | undefined;
    let globalUnderstandingError: Record<string, unknown> | undefined;

    if (options.excelGlobalUnderstandingCache?.summary) {
      globalUnderstandingSummary = options.excelGlobalUnderstandingCache.summary;
      usedCachedGlobalUnderstanding = true;
      globalPromptRequestText = options.excelGlobalUnderstandingCache.promptRequestText;
      globalPromptDebugSummary = options.excelGlobalUnderstandingCache.promptDebugSummary;
      globalRawAiResponse = options.excelGlobalUnderstandingCache.rawAiResponse;
    } else if (globalDataDocumentIR.elements.length > 0) {
      const globalUnderstandingPayload = {
        host: adapter.host,
        documentIR: globalDataDocumentIR,
        documentContent: serializeDocument(globalDataDocumentIR),
        documentType,
        templateType: options.templateType,
        context: buildExcelGlobalUnderstandingContext(globalDataDocumentIR, options.templateType),
        analysisStage: 'excel-global-understanding' as const,
      };

      try {
        const globalResponse = await executor.analyze(globalUnderstandingPayload);
        globalUnderstandingSummary = buildExcelGlobalUnderstandingSummary(globalResponse as any);
        globalUnderstandingUsedAI = true;
        globalPromptDebugSummary = globalResponse.contextAnalysis?.promptDebugSummary
          ? String(globalResponse.contextAnalysis.promptDebugSummary)
          : undefined;
        globalPromptRequestText = globalResponse.contextAnalysis?.promptRequestText
          ? String(globalResponse.contextAnalysis.promptRequestText)
          : undefined;
        globalRawAiResponse = globalResponse.contextAnalysis?.rawAiResponse
          ? String(globalResponse.contextAnalysis.rawAiResponse)
          : undefined;
      } catch (error) {
        globalUnderstandingSummary = '全局真实数据理解阶段未成功调用 AI，后续对照组分析将仅依赖局部差异与规则摘要。';
        globalUnderstandingError = toErrorInfo(error);
      }
    }

    const remotePairSuggestionsByIndex = new Map<number, AISuggestion[]>();
    const retryExecutor = executor.supportsThinking && options.thinking !== true
      ? resolveAnalysisExecutor({
          apiBaseUrl: options.apiBaseUrl,
          useMultiStage: options.useMultiStage,
          requestedKind: options.analysisExecutor,
          thinking: true,
          aiOrchestratorBaseUrl: options.aiOrchestratorBaseUrl,
          aiOrchestratorAuthToken: options.aiOrchestratorAuthToken,
        })
      : executor;
    let retriedPairCount = 0;

    for (const pair of pairInputs) {
      const firstAttempt = await executeExcelPairAttempt(
        executor,
        pair,
        documentType,
        options.templateType,
        globalUnderstandingSummary
      );

      let retryAttempt: ExcelPairAttemptResult | undefined;
      if (firstAttempt.needsRetry) {
        retriedPairCount += 1;
        retryAttempt = await executeExcelPairAttempt(
          retryExecutor,
          pair,
          documentType,
          options.templateType,
          globalUnderstandingSummary
        );
      }

      const finalAttempt = choosePreferredExcelPairAttempt(firstAttempt, retryAttempt);
      if (finalAttempt.pairSuggestions.length > 0) {
        remotePairSuggestionsByIndex.set(pair.pairIndex, finalAttempt.pairSuggestions);
      }

      pairResults.push({
        pairIndex: pair.pairIndex,
        pairLabel: pair.pairLabel,
        aiCallSucceeded: finalAttempt.aiCallSucceeded,
        candidateCount: pair.candidateCount,
        loopDetected: pair.loopDetected,
        suggestionCount: finalAttempt.pairSuggestions.length,
        promptDebugSummary: finalAttempt.promptDebugSummary,
        promptRequestText: finalAttempt.promptRequestText,
        rawAiResponse: finalAttempt.rawAiResponse,
        error: finalAttempt.error,
        salvagedMalformedJson: finalAttempt.salvagedMalformedJson,
        localRetryCount: retryAttempt ? 1 : 0,
        qualityIssues: finalAttempt.qualityIssues,
      });
    }

    const remotePairSuggestions = Array.from(remotePairSuggestionsByIndex.values()).flat();

    const finalSuggestions = remotePairSuggestions.length > 0
      ? dedupeExcelArraySuggestions(remotePairSuggestions)
      : dedupeExcelArraySuggestions(expandExcelLoopColumnSuggestions(excelHeuristicSuggestions));
    const summary = summarizeSuggestionSources(finalSuggestions);
    const succeededPairCount = pairResults.filter((pair) => pair.aiCallSucceeded === true).length;
    const aiCallCompleted = succeededPairCount > 0 || globalUnderstandingUsedAI;

    if (remotePairSuggestions.length === 0 && excelHeuristicSuggestions.length > 0) {
      return {
        documentIR,
        suggestions: excelHeuristicSuggestions,
        contextAnalysis: {
          requestMode: `excel-pair-loop-${requestMode}`,
          analysisExecutor: executor.kind,
          requestedAnalysisExecutor: executor.requestedKind,
          analysisExecutorFallbackReason: executor.fallbackReason,
          supportsThinking: executor.supportsThinking,
          requestedAI: true,
          aiCallSucceeded: aiCallCompleted,
          usedAI: aiCallCompleted,
          globalUnderstandingUsedAI,
          usedCachedGlobalUnderstanding,
          fallback: aiCallCompleted ? 'excel-heuristic-no-ai-suggestions' : 'excel-heuristic',
          resultSource: 'heuristic',
          sourceCounts: summarizeSuggestionSources(excelHeuristicSuggestions).sourceCounts,
          pairResults,
          descriptionOrigin:
            aiCallCompleted
              ? 'AI 已完成全局理解或对照组分析，但当前未返回可直接落地的结构化建议，因此结果列表来自 Excel 启发式规则。'
              : 'Excel 启发式规则生成。典型文案如“模板 sheet 留白、数据 sheet 有值，识别为可参数化字段”来自前端成对 sheet 差异识别，不是 AI 返回。',
          pipeline:
            options.excelGlobalUnderstandingCache?.summary
              ? '本次参数识别复用已缓存的全局文档理解结果，再逐个对照组调用 AI；当前未产出可直接落地的结构化建议，因此展示启发式建议。'
              : aiCallCompleted
                ? 'Office API 先读取全部参与分析的真实数据 sheet 做全局理解，再逐个对照组调用 AI；本次 AI 调用已成功完成，但未产出结构化建议，因此当前展示启发式建议。'
                : 'Office API 先读取全部参与分析的真实数据 sheet 做全局理解，再逐个对照组调用 AI；本次 AI 未成功返回对照组结果，因此回退为启发式建议。',
          promptDebugSummary: globalPromptDebugSummary,
          promptRequestText: globalPromptRequestText,
          rawAiResponse: globalRawAiResponse,
          globalUnderstandingError,
        },
      };
    }

    return {
      documentIR,
      suggestions: finalSuggestions,
      contextAnalysis: {
        requestMode: `excel-pair-loop-${requestMode}`,
        analysisExecutor: executor.kind,
        requestedAnalysisExecutor: executor.requestedKind,
        analysisExecutorFallbackReason: executor.fallbackReason,
        supportsThinking: executor.supportsThinking,
        requestedAI: true,
        aiCallSucceeded: succeededPairCount > 0 || globalUnderstandingUsedAI,
        usedAI: succeededPairCount > 0,
        globalUnderstandingUsedAI,
          usedCachedGlobalUnderstanding,
        resultSource: summary.resultSource,
        sourceCounts: summary.sourceCounts,
        pairResults,
        retriedPairCount,
        succeededPairCount,
        totalPairCount: pairInputs.length,
        descriptionOrigin:
          remotePairSuggestions.length > 0
            ? '当前结果优先使用逐对照组 AI 返回；由于本次已产出 AI 建议，启发式结果不再混入最终列表。'
            : '当前建议主要来自 Excel 启发式兜底结果。',
        pipeline:
          options.excelGlobalUnderstandingCache?.summary
            ? '本次参数识别复用已缓存的全局文档理解结果；随后对每个对照组单独传递全局理解、差异摘要和当前业务摘录，循环生成 suggestions。'
            : 'Office API 先读取全部参与分析的真实数据 sheet，生成整份工作簿的自然语言理解；再对每个对照组单独传递全局理解、差异摘要和当前业务摘录，循环生成 suggestions。',
        globalUnderstandingSummary,
        promptDebugSummary: globalPromptDebugSummary,
        promptRequestText: globalPromptRequestText,
        rawAiResponse: globalRawAiResponse,
        globalUnderstandingError,
      },
    };
  }

  let response;

  try {
    response = await executor.analyze(requestPayload);
  } catch (error) {
    throw error;
  }

  const remoteSuggestions = annotateSuggestionSource(response.rawSuggestions || response.suggestions, 'ai');
  const finalSuggestions =
    adapter.host === 'word'
      ? enrichWordSuggestionAnchors(documentIR, remoteSuggestions)
      : remoteSuggestions;
  const summary = summarizeSuggestionSources(finalSuggestions);

  return {
    documentIR,
    suggestions: finalSuggestions,
    templateConfig: response.templateConfig,
    contextAnalysis: {
      ...(response.contextAnalysis as Record<string, unknown> | undefined),
      requestMode,
      analysisExecutor: executor.kind,
      requestedAnalysisExecutor: executor.requestedKind,
      analysisExecutorFallbackReason: executor.fallbackReason,
      supportsThinking: executor.supportsThinking,
      requestedAI: true,
      aiCallSucceeded: true,
      usedAI: response.contextAnalysis?.usedAI ?? true,
      resultSource: summary.resultSource,
      sourceCounts: summary.sourceCounts,
      descriptionOrigin: '当前建议主要来自后端 AI 返回。',
    },
  };
}

export async function analyzeExcelWorkbookUnderstanding(
  options: AnalyzeDocumentOptions & {
    selectedSheetIndexes: number[];
    configuredPairs?: ExcelSheetPairState[];
  }
): Promise<AnalyzeExcelWorkbookUnderstandingResult> {
  if (options.selectedSheetIndexes.length === 0) {
    throw new Error('请至少选择一个 sheet 再执行文档理解');
  }

  const workbookSheets = (await OfficeHelper.Excel.getWorkbookSheets()) as WorkbookSheetSummary[];
  const documentIR = buildExcelDocumentIRFromWorkbookSheets(
    workbookSheets,
    options.selectedSheetIndexes,
    options.configuredPairs || []
  );

  const documentType: 'xlsx' = 'xlsx';
  const executor = resolveAnalysisExecutor({
    apiBaseUrl: options.apiBaseUrl,
    useMultiStage: false,
    requestedKind: options.analysisExecutor,
    thinking: options.thinking,
    aiOrchestratorBaseUrl: options.aiOrchestratorBaseUrl,
    aiOrchestratorAuthToken: options.aiOrchestratorAuthToken,
  });

  const requestPayload: StructuredAnalyzeRequest = {
    host: 'excel',
    documentIR,
    documentContent: JSON.stringify(documentIR),
    documentType,
    templateType: options.templateType,
    context: buildExcelGlobalUnderstandingContext(documentIR, options.templateType),
    analysisStage: 'excel-global-understanding',
  };

  const response = await executor.analyze(requestPayload);
  const summary = buildExcelGlobalUnderstandingSummary(response as {
    contextAnalysis?: Record<string, unknown>;
    rawSuggestions?: AISuggestion[];
    suggestions?: AISuggestion[];
  });

  return {
    documentIR,
    summary,
    contextAnalysis: {
      ...(response.contextAnalysis as Record<string, unknown> | undefined),
      analysisExecutor: executor.kind,
      requestedAnalysisExecutor: executor.requestedKind,
      supportsThinking: executor.supportsThinking,
      usedAI: true,
    },
  };
}
