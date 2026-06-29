import { WorkflowDocumentElement } from './workflow-assets';
import {
  safeText,
  numberOrUndefined,
  getElementHostData,
  isLikelySectionHeading,
  isBlankTableTemplateCell,
  splitTableCellLines,
  classifyTemplateTableStructure,
  findNearestLeftTableLabel,
  findNearestRightTableLabel,
  extractTableCellCompareAnchors,
  extractTableCellSampleValueByAnchor,
} from './document-xml-parser';

export type WorkflowTableCompareInput = {
  compareSegment: string;
  anchorText?: string;
  sampleValue?: string;
  matchText?: string;
  probeTexts?: string[];
  dictionaryText?: string;
  dedupeHint?: string;
};

export function isLikelyTableHeaderRow(row: string[]): boolean {
  const cells = row.map((cell) => safeText(cell)).filter(Boolean);
  if (cells.length < 2) {
    return false;
  }
  return cells.every(
    (cell) => isLikelyTableLabel(cell) && !/[:：]/u.test(cell) && !safeText(cell).includes('______')
  );
}

export function isLikelyTableLabel(text: string): boolean {
  const normalizedText = safeText(text).replace(/[：:]$/u, '');
  if (!normalizedText) {
    return false;
  }
  if (normalizedText.length > 32) {
    return false;
  }
  if (safeText(normalizedText).includes('______') || isLikelySectionHeading(normalizedText)) {
    return false;
  }
  if (/[。；;]/u.test(normalizedText)) {
    return false;
  }
  return true;
}

export function buildTemplateTableMatrices(
  elements: WorkflowDocumentElement[]
): Map<number, string[][]> {
  const tableMap = new Map<number, string[][]>();

  for (const element of elements) {
    if (safeText(element.type) !== 'cell') {
      continue;
    }
    const hostData = getElementHostData(element);
    const tableIndex = numberOrUndefined(hostData.tableIndex);
    const rowIndex = numberOrUndefined(hostData.rowIndex);
    const cellIndex = numberOrUndefined(hostData.cellIndex);
    if (tableIndex === undefined || rowIndex === undefined || cellIndex === undefined) {
      continue;
    }
    const table = tableMap.get(tableIndex) || [];
    const row = table[rowIndex] || [];
    row[cellIndex] = safeText(element.text);
    table[rowIndex] = row;
    tableMap.set(tableIndex, table);
  }

  for (const element of elements) {
    if (safeText(element.type) !== 'table') {
      continue;
    }
    const hostData = getElementHostData(element);
    const tableIndex = numberOrUndefined(hostData.index ?? hostData.tableIndex);
    if (tableIndex === undefined || tableMap.has(tableIndex)) {
      continue;
    }
    const content = hostData.content;
    if (!Array.isArray(content)) {
      continue;
    }
    const rows = content
      .map((row) => (Array.isArray(row) ? row.map((cell) => safeText(cell)) : []))
      .filter((row) => row.length > 0);
    if (rows.length > 0) {
      tableMap.set(tableIndex, rows);
    }
  }

  return tableMap;
}

export function buildSampleTableMatrices(sampleText: string): string[][][] {
  const lines = String(sampleText || '')
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s+|\s+$/gu, ''));
  const tables: string[][][] = [];
  let currentTable: string[][] = [];

  for (const line of lines) {
    if (!line) {
      if (currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
      }
      continue;
    }
    if (!line.includes('\t')) {
      if (currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
      }
      continue;
    }
    const row = line.split('\t').map((cell) => safeText(cell));
    if (row.some(Boolean)) {
      currentTable.push(row);
    }
  }

  if (currentTable.length > 0) {
    tables.push(currentTable);
  }

  return tables;
}

export function buildMultiAnchorTableCellCompareInputs(
  templateCellText: string,
  sampleCellValue: string,
  rowText: string,
  sampleRowText: string
): WorkflowTableCompareInput[] {
  const anchors = extractTableCellCompareAnchors(templateCellText);
  if (anchors.length < 2) {
    return [];
  }

  return anchors.map((anchor, index) => ({
    compareSegment: `${anchor}\t${templateCellText || '______________'}`,
    anchorText: anchor,
    sampleValue: extractTableCellSampleValueByAnchor(sampleCellValue, anchors, index),
    matchText: sampleRowText || undefined,
    probeTexts: [anchor, templateCellText, rowText],
    dictionaryText: anchor,
    dedupeHint: `multi-anchor:${index}`,
  }));
}

export function buildTableCompareInputs(
  element: WorkflowDocumentElement,
  templateTableMatrices: Map<number, string[][]>,
  sampleTableMatrices: string[][][]
): {
  skip: boolean;
  inputs: WorkflowTableCompareInput[];
} | null {
  if (safeText(element.type) !== 'cell') {
    return null;
  }

  const hostData = getElementHostData(element);
  const tableIndex = numberOrUndefined(hostData.tableIndex);
  const rowIndex = numberOrUndefined(hostData.rowIndex);
  const cellIndex = numberOrUndefined(hostData.cellIndex);
  if (tableIndex === undefined || rowIndex === undefined || cellIndex === undefined) {
    return null;
  }

  const templateTable = templateTableMatrices.get(tableIndex);
  if (!templateTable || templateTable.length === 0) {
    return null;
  }

  const row = templateTable[rowIndex] || [];
  const currentText = safeText(row[cellIndex] ?? element.text);
  const sampleTable = sampleTableMatrices[tableIndex] || [];
  const sampleRow = sampleTable[rowIndex] || [];
  const sampleCellValue = safeText(sampleRow[cellIndex]);
  const sampleRowText = sampleRow.filter(Boolean).join('\t');
  const rowText = row.filter(Boolean).join('\t');
  const tableStructure = classifyTemplateTableStructure(templateTable);

  if (tableStructure.kind === 'standard_loop') {
    if (rowIndex === 0 || rowIndex !== tableStructure.templateRowIndex) {
      return { skip: true, inputs: [] };
    }
    const headerLabel = safeText(tableStructure.headerRow[cellIndex]);
    if (!headerLabel || !isBlankTableTemplateCell(currentText)) {
      return { skip: true, inputs: [] };
    }
    const headerAnchors = extractTableCellCompareAnchors(headerLabel);
    const effectiveAnchors = headerAnchors.length > 0 ? headerAnchors : [headerLabel];
    return {
      skip: false,
      inputs: effectiveAnchors.map((anchorText, anchorIndex) => ({
        compareSegment: `${anchorText}\t${currentText || '______________'}`,
        anchorText,
        sampleValue: extractTableCellSampleValueByAnchor(
          sampleCellValue,
          effectiveAnchors,
          anchorIndex
        ),
        matchText: sampleRowText || undefined,
        probeTexts: [
          anchorText,
          headerLabel,
          rowText,
          tableStructure.headerRow.filter(Boolean).join('\t'),
        ],
        dictionaryText: anchorText,
        dedupeHint: `standard-loop:${tableIndex}:${rowIndex}:${cellIndex}:${anchorIndex}`,
      })),
    };
  }

  if (rowIndex === 0 && isLikelyTableHeaderRow(row)) {
    return { skip: true, inputs: [] };
  }

  if (!isBlankTableTemplateCell(currentText)) {
    return { skip: true, inputs: [] };
  }

  const inlineCellInputs = buildMultiAnchorTableCellCompareInputs(
    currentText,
    sampleCellValue,
    rowText,
    sampleRowText
  );
  if (inlineCellInputs.length > 0) {
    return {
      skip: false,
      inputs: inlineCellInputs,
    };
  }

  const leftLabel = findNearestLeftTableLabel(row, cellIndex);
  if (leftLabel) {
    return {
      skip: false,
      inputs: [
        {
          compareSegment: `${leftLabel}\t${currentText || '______________'}`,
          anchorText: leftLabel,
          sampleValue: sampleCellValue,
          matchText: sampleRowText || undefined,
          probeTexts: [leftLabel, rowText],
          dictionaryText: leftLabel,
        },
      ],
    };
  }

  const rightLabelCell = findNearestRightTableLabel(row, cellIndex);
  if (rightLabelCell) {
    const multiAnchorInputs = buildMultiAnchorTableCellCompareInputs(
      rightLabelCell.text,
      sampleCellValue,
      rowText,
      sampleRowText
    );
    if (multiAnchorInputs.length > 0) {
      return {
        skip: false,
        inputs: multiAnchorInputs.map((input) => ({
          ...input,
          compareSegment: `${input.anchorText || rightLabelCell.text}\t${currentText || '______________'}`,
        })),
      };
    }

    const titleLines = splitTableCellLines(rightLabelCell.text);
    const sampleLines = splitTableCellLines(sampleCellValue);
    return {
      skip: false,
      inputs: titleLines.map((title, index) => ({
        compareSegment: `${title}\t${currentText || '______________'}`,
        anchorText: title,
        sampleValue: sampleLines[index] || sampleLines[0] || sampleCellValue,
        matchText: sampleRowText || undefined,
        probeTexts: [title, rightLabelCell.text, rowText],
        dictionaryText: title,
        dedupeHint: `right-label:${tableIndex}:${rowIndex}:${cellIndex}:${rightLabelCell.cellIndex}:${index}`,
      })),
    };
  }

  return null;
}
