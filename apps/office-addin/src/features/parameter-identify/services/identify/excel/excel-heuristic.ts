import { DocumentIR } from '../../../../../host/adapters/document-ir';
import { AISuggestion } from '../../../../../app/store';

export interface ExcelSheetInfo {
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

export interface ExcelCellInfo {
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

type ExcelColumnMapping = NonNullable<NonNullable<AISuggestion['details']>['columnMappings']>[number];
type ExcelTableAnchor = {
  type: 'table';
  sheetName: string;
  sheetIndex?: number;
  pairIndex?: number;
  tableName?: string;
  startAddress?: string;
  endAddress?: string;
};

export function normalizeExcelText(value: unknown): string {
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
  return normalizeExcelText(sheetName)
    .replace(/[_\s-]*(模板|模版|数据)$/u, '')
    .trim();
}

function buildAsciiIdentifier(value: string, fallback: string): string {
  const normalized = normalizeExcelText(value)
    .replace(/['"`]/g, '')
    .replace(/[，。；：、,.!?:()[\]{}<>《》【】（）/\-]+/g, ' ')
    .replace(/[^\x00-\x7F]+/g, ' ')
    .replace(/\s+/g, '');

  return normalized || fallback;
}

function mapExcelSheetFieldGroup(sheetName: string): string {
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
  const normalizedSheet = stripExcelSheetRoleSuffix(sheetName);
  const asciiName = buildAsciiIdentifier(normalizedSheet, '');
  return asciiName ? `d.${asciiName}List` : 'd.rows';
}

function stripSheetPrefix(address: string): string {
  const normalized = normalizeExcelText(address).replace(/\$/g, '');
  const bangIndex = normalized.lastIndexOf('!');
  return bangIndex >= 0 ? normalized.slice(bangIndex + 1) : normalized;
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
    const labelText = normalizeExcelText(labelCell?.text);
    if (labelText) {
      return labelText;
    }
  }

  for (let upperRow = rowIndex - 1; upperRow >= 0; upperRow -= 1) {
    const key = `${upperRow}:${colIndex}`;
    const labelCell = cellsByPosition.get(key) || fallbackCellsByPosition.get(key);
    const labelText = normalizeExcelText(labelCell?.text);
    if (labelText) {
      return labelText;
    }
  }

  return '';
}

function inferExcelFieldType(value: string, formula: string): string {
  const normalizedValue = normalizeExcelText(value);
  const normalizedFormula = normalizeExcelText(formula);

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

export function inferExcelFieldTypeWithLabel(value: string, formula: string, _label: string): string {
  return inferExcelFieldType(value, formula);
}

export function buildExcelExtractionHint(label: string, variablePath: string, fieldType: string): string {
  const normalizedLabel = normalizeExcelText(label);

  if (fieldType === 'date') {
    return `用于从自然语言中提取日期类参数，并将识别到的日期值赋值给 ${variablePath}。`;
  }
  if (fieldType === 'number' || fieldType === 'percent') {
    return `用于从自然语言中提取数值类参数，并将识别到的数值赋值给 ${variablePath}。`;
  }

  return `用于从自然语言或结构化输入中提取“${normalizedLabel || variablePath}”的值，并赋值给 ${variablePath}。`;
}

export function buildExcelHeuristicDescription(label: string, variablePath: string): string {
  if (label) {
    return `参数 ${variablePath} 对应“${label}”，建议在渲染前先从用户自然语言、表单或业务上下文中抽取该值。`;
  }

  return `参数 ${variablePath} 来自成对 sheet 差异，建议在渲染前从用户输入或上下文中补足该字段值。`;
}

export function extractExcelSheets(documentIR: DocumentIR): ExcelSheetInfo[] {
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

export function extractExcelCells(documentIR: DocumentIR): ExcelCellInfo[] {
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

export function buildExcelHeuristicSuggestions(
  documentIR: DocumentIR,
  helpers: {
    buildExcelColumnMappingsForTable: (
      document: DocumentIR,
      tableAnchor: ExcelTableAnchor,
      arrayPath: string
    ) => ExcelColumnMapping[] | undefined;
  }
): AISuggestion[] {
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

    const isLoopSheet = pairSheets.some((sheet) => sheet.tables.length > 0)
      || /明细|交付|付款|detail|delivery|payment/i.test(pairLabel);

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
      const loopColumnMappings = helpers.buildExcelColumnMappingsForTable(documentIR, loopAnchor, arrayPath);
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
      const dataText = normalizeExcelText(dataCell.text);
      if (!dataText) {
        continue;
      }

      const mockCell = mockCellMap.get(`${dataCell.rowIndex}:${dataCell.colIndex}`);
      const mockText = normalizeExcelText(mockCell?.text);
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
