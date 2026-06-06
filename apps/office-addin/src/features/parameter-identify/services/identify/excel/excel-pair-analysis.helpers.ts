import type { DocumentIR } from '../../../../../host/adapters/document-ir';
import type { StructuredAnalyzeRequest } from '../../analysis-executor';
import { serializeDocument } from '../common/document-serialize';
import { extractExcelCells, extractExcelSheets } from './excel-heuristic';
import type { ExcelCellInfo, ExcelSheetInfo } from './excel-heuristic';

export interface ExcelPairAnalysisInput {
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

interface ExcelLoopTableContext {
  sheetName: string;
  tableName: string;
  headerRange: NonNullable<ReturnType<typeof parseA1Range>>;
  bodyRange: ReturnType<typeof parseA1Range>;
  firstDataRowIndex: number;
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

function columnNameToIndex(columnName: string): number {
  let result = 0;
  const normalized = columnName.toUpperCase();
  for (let index = 0; index < normalized.length; index += 1) {
    result = result * 26 + (normalized.charCodeAt(index) - 64);
  }
  return Math.max(result - 1, 0);
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

function buildDocumentIRSubset(
  documentIR: DocumentIR,
  includeElement: (element: DocumentIR['elements'][number]) => boolean
): DocumentIR {
  const elements = documentIR.elements.filter(includeElement);
  const anchorIds = new Set(elements.flatMap((element) => element.anchorIds || []));

  return {
    ...documentIR,
    elements,
    anchors: documentIR.anchors.filter((anchor) => anchorIds.has(anchor.id)),
  };
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
  const mockCellMap = new Map(mockCells.map((cell) => [`${cell.rowIndex}:${cell.colIndex}`, cell] as const));
  const dataCellMap = new Map(dataCells.map((cell) => [`${cell.rowIndex}:${cell.colIndex}`, cell] as const));
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

export function buildExcelPairAnalysisInputs(documentIR: DocumentIR): ExcelPairAnalysisInput[] {
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

export function buildExcelPairPayload(
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

export function buildExcelPairAnalysisContext(
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
