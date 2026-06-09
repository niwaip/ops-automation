import JSZip from 'jszip';

export interface WorkflowDocumentElement {
  id: string;
  type: string;
  text?: string;
  anchorIds?: string[];
  hostData?: Record<string, unknown>;
}

export interface WorkflowAnchor {
  id: string;
  type: string;
  text?: string;
  ref?: Record<string, unknown>;
}

export interface WorkflowCandidateLocation {
  blockType?: string;
  paragraphIndex?: number;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
  contentControlId?: number;
  anchorStart?: number;
  anchorEnd?: number;
}

export function safeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function hasBlankPlaceholder(text: string): boolean {
  const normalized = safeText(text);
  return /[_＿]{2,}|\s{4,}/u.test(normalized);
}

export function getElementHostData(element: WorkflowDocumentElement): Record<string, unknown> {
  return element.hostData && typeof element.hostData === 'object'
    ? element.hostData as Record<string, unknown>
    : {};
}

export function getElementFormat(element?: WorkflowDocumentElement): {
  fontSize?: number;
  isBold?: boolean;
  alignment?: string;
  isTitle?: boolean;
} {
  const format = element?.hostData?.format;
  if (!format || typeof format !== 'object') {
    return {};
  }
  return format as {
    fontSize?: number;
    isBold?: boolean;
    alignment?: string;
    isTitle?: boolean;
  };
}

export function isLikelyDocumentTitle(text: string, element?: WorkflowDocumentElement): boolean {
  const normalizedText = safeText(text);
  if (!normalizedText || hasBlankPlaceholder(normalizedText)) {
    return false;
  }

  const format = getElementFormat(element);
  const looksLikeContractTitle = /合同|协议|契約|契约/u.test(normalizedText)
    && !/[:：，。,.;；]/u.test(normalizedText)
    && normalizedText.length <= 40;
  const looksLikeStyledTitle = (format.isTitle || format.alignment === 'center')
    && !/[:：]/u.test(normalizedText)
    && normalizedText.length <= 40;

  return looksLikeContractTitle || looksLikeStyledTitle;
}

export function isLikelySectionHeading(text: string, element?: WorkflowDocumentElement): boolean {
  const normalizedText = safeText(text);
  if (!normalizedText) {
    return false;
  }
  if (hasBlankPlaceholder(normalizedText)) {
    return false;
  }
  if (isLikelyDocumentTitle(normalizedText, element)) {
    return true;
  }
  if (/^[一二三四五六七八九十百]+、/u.test(normalizedText)) {
    return true;
  }
  if (/^[(（]?[一二三四五六七八九十百0-9]+[)）][^。\n]{0,40}$/u.test(normalizedText)) {
    return true;
  }
  if (/^[0-9]+[、.．]/u.test(normalizedText)) {
    return true;
  }
  if (/^第[一二三四五六七八九十0-9]+[章节条]/u.test(normalizedText)) {
    return true;
  }
  if (/[:：]|[_＿]{2,}|【|】|\(\s*\)|（\s*）/u.test(normalizedText)) {
    return false;
  }
  const format = getElementFormat(element);
  if ((format.isBold || (format.fontSize || 0) >= 14) && normalizedText.length <= 32) {
    return true;
  }
  return false;
}

export function isLikelyTableLabel(text: string): boolean {
  const normalizedText = safeText(text).replace(/[：:]$/u, '');
  if (!normalizedText) {
    return false;
  }
  if (normalizedText.length > 32) {
    return false;
  }
  if (hasBlankPlaceholder(normalizedText) || isLikelySectionHeading(normalizedText)) {
    return false;
  }
  if (/[。；;]/u.test(normalizedText)) {
    return false;
  }
  return true;
}

export function isLikelyTableHeaderRow(row: string[]): boolean {
  const cells = row
    .map((cell) => safeText(cell))
    .filter(Boolean);
  if (cells.length < 2) {
    return false;
  }
  return cells.every((cell) =>
    isLikelyTableLabel(cell)
    && !/[:：]/u.test(cell)
    && !hasBlankPlaceholder(cell)
  );
}

export function isBlankTableTemplateCell(text: string | undefined): boolean {
  const normalizedText = safeText(text);
  return !normalizedText || hasBlankPlaceholder(normalizedText);
}

export function findNearestLeftTableLabel(row: string[], cellIndex: number): string {
  return row
    .slice(0, cellIndex)
    .map((cell) => safeText(cell))
    .reverse()
    .find((cell) => isLikelyTableLabel(cell)) || '';
}

export function findNearestRightTableLabel(
  row: string[],
  cellIndex: number,
): { text: string; cellIndex: number } | undefined {
  for (let index = cellIndex + 1; index < row.length; index += 1) {
    const text = safeText(row[index]);
    if (!text) {
      continue;
    }
    return { text, cellIndex: index };
  }
  return undefined;
}

export function splitTableCellLines(text: string): string[] {
  const normalizedText = safeText(text);
  if (!normalizedText) {
    return [];
  }
  return normalizedText
    .split(/\r?\n/u)
    .map((line) => safeText(line))
    .filter(Boolean);
}

export function extractCompareLabels(text: string): string[] {
  const normalizedText = safeText(text);
  if (!normalizedText) {
    return [];
  }

  return Array.from(new Set(
    Array.from(normalizedText.matchAll(/([^，,。；;\n\t]{1,24}[:：])/gu))
      .map((match) => safeText(match[1]))
      .filter((label) => Boolean(label) && !hasBlankPlaceholder(label))
  )).slice(0, 6);
}

export function extractWordTableCellText(cellXml: string): string {
  return cellXml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\S\r\n\t]+/g, ' ')
    .split(/\n+/u)
    .map((line) => safeText(line))
    .filter(Boolean)
    .join('\n');
}

export function isStandardLoopTable(templateTable: string[][]): boolean {
  if (templateTable.length < 2) {
    return false;
  }
  const headerRow = templateTable[0] || [];
  if (headerRow.length < 2) {
    return false;
  }
  const normalizedHeaders = headerRow.map((cell) => safeText(cell));
  if (normalizedHeaders.some((cell) => !cell) || !isLikelyTableHeaderRow(normalizedHeaders)) {
    return false;
  }

  return templateTable.slice(1).every((row) => {
    const width = Math.max(headerRow.length, row.length);
    if (width === 0) {
      return false;
    }
    for (let index = 0; index < width; index += 1) {
      if (!isBlankTableTemplateCell(row[index])) {
        return false;
      }
    }
    return true;
  });
}

export function classifyTemplateTableStructure(
  templateTable: string[][],
): { kind: 'standard_loop'; templateRowIndex: number; headerRow: string[] } | { kind: 'generic' } {
  if (isStandardLoopTable(templateTable)) {
    return {
      kind: 'standard_loop',
      templateRowIndex: 1,
      headerRow: templateTable[0] || [],
    };
  }
  return { kind: 'generic' };
}

export function extractTableCellCompareAnchors(text: string): string[] {
  const labels = extractCompareLabels(text);
  if (labels.length >= 2) {
    return labels;
  }

  const lines = splitTableCellLines(text);
  if (lines.length >= 2) {
    return lines;
  }

  return [];
}

export function extractTableCellSampleValueByAnchor(
  sampleCellText: string,
  anchors: string[],
  anchorIndex: number,
): string {
  const normalizedSampleText = safeText(sampleCellText);
  if (!normalizedSampleText) {
    return '';
  }

  const sampleLines = splitTableCellLines(normalizedSampleText);
  if (sampleLines.length === anchors.length && sampleLines.length > 1) {
    const pairedLine = sampleLines[anchorIndex] || '';
    for (const anchorPattern of Array.from(new Set([
      escapeRegExp(safeText(anchors[anchorIndex])),
      escapeRegExp(safeText(anchors[anchorIndex]).replace(/[：:]$/u, '').trim()),
    ].filter(Boolean)))) {
      const matched = pairedLine.match(new RegExp(`^${anchorPattern}[：:]?\\s*(.*)$`, 'u'));
      const value = safeText(matched?.[1]);
      if (value) {
        return value;
      }
    }
    return pairedLine;
  }

  const anchor = safeText(anchors[anchorIndex]);
  if (!anchor) {
    return sampleLines[anchorIndex] || sampleLines[0] || normalizedSampleText;
  }

  const nextAnchors = anchors
    .slice(anchorIndex + 1)
    .map((item) => safeText(item))
    .filter(Boolean)
    .map((item) => escapeRegExp(item));
  const suffixPattern = nextAnchors.length > 0
    ? `(?=${nextAnchors.join('|')})`
    : '$';
  const anchorPatterns = Array.from(new Set([
    escapeRegExp(anchor),
    escapeRegExp(anchor.replace(/[：:]$/u, '').trim()),
  ].filter(Boolean)));

  for (const anchorPattern of anchorPatterns) {
    const matcher = new RegExp(`${anchorPattern}[：:]?\\s*(.{1,160}?)\\s*${suffixPattern}`, 'u');
    const matched = normalizedSampleText.match(matcher);
    const value = safeText(matched?.[1]);
    if (value) {
      return value;
    }
  }

  return sampleLines[anchorIndex] || sampleLines[0] || normalizedSampleText;
}

export function extractPlaceholderMatcher(text: string): { prefix: string; suffix: string } | undefined {
  const normalized = safeText(text);
  if (!normalized) {
    return undefined;
  }
  const match = normalized.match(/^(.*?)(?:[_＿]{2,}|\s{4,})(.*)$/u);
  if (!match) {
    return undefined;
  }
  return {
    prefix: safeText(match[1]).slice(-32),
    suffix: safeText(match[2]).slice(0, 32),
  };
}

export function extractPlaceholderSampleValue(templateText: string, sampleText: string): string {
  const matcher = extractPlaceholderMatcher(templateText);
  const normalizedSampleText = safeText(sampleText);
  if (!matcher || !normalizedSampleText) {
    return '';
  }

  if (matcher.prefix && matcher.suffix) {
    const pattern = new RegExp(
      `${escapeRegExp(matcher.prefix)}\\s*(.{1,80}?)\\s*${escapeRegExp(matcher.suffix)}`,
      'u',
    );
    const matched = normalizedSampleText.match(pattern);
    const value = safeText(matched?.[1]);
    if (value) {
      return value;
    }
  }

  if (matcher.prefix) {
    const pattern = new RegExp(`${escapeRegExp(matcher.prefix)}\\s*(.{1,80})`, 'u');
    const matched = normalizedSampleText.match(pattern);
    const value = safeText(matched?.[1])
      .split(/[，。；\n]/u)[0]
      ?.trim();
    if (value) {
      return value;
    }
  }

  return '';
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
    const row = line
      .split('\t')
      .map((cell) => safeText(cell));
    if (row.some(Boolean)) {
      currentTable.push(row);
    }
  }

  if (currentTable.length > 0) {
    tables.push(currentTable);
  }

  return tables;
}

export function extractTableMatricesFromWordXml(xml: string): string[][][] {
  const tables: string[][][] = [];
  const tableMatches = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/gu) || [];

  for (const tableXml of tableMatches) {
    const rows: string[][] = [];
    const rowMatches = tableXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/gu) || [];
    for (const rowXml of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/gu) || [];
      for (const cellXml of cellMatches) {
        const cellText = extractWordTableCellText(cellXml);
        cells.push(cellText);
      }
      if (cells.some(Boolean)) {
        rows.push(cells);
      }
    }
    if (rows.length > 0) {
      tables.push(rows);
    }
  }

  return tables;
}

export async function extractSampleTableMatrices(contentBase64: string | undefined): Promise<string[][][]> {
  if (!contentBase64) {
    return [];
  }

  try {
    const base64 = contentBase64.replace(/^base64:/, '');
    const buffer = Buffer.from(base64, 'base64');
    const header = buffer.subarray(0, 2).toString('utf-8');

    if (header === 'PK') {
      const zip = await JSZip.loadAsync(buffer);
      const documentFile = zip.file('word/document.xml');
      if (documentFile) {
        const xml = await documentFile.async('text');
        return extractTableMatricesFromWordXml(xml);
      }
    }

    const text = buffer.toString('utf-8');
    if (text.includes('<w:t')) {
      return extractTableMatricesFromWordXml(text);
    }

    return buildSampleTableMatrices(text);
  } catch {
    return [];
  }
}
