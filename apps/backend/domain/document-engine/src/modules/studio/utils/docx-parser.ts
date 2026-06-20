import * as fs from 'fs';
import JSZip from 'jszip';
import { DocumentStructure, DocumentElement } from '../document-structure.service';

/**
 * 解析DOCX文档结构
 */
export async function parseDocxStructure(filePath: string): Promise<DocumentStructure> {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');

  if (!documentFile) {
    throw new Error('Invalid DOCX file: document.xml not found');
  }

  // 简单解析，返回基本结构
  const xmlContent = await documentFile.async('text');
  return parseXmlToStructure(xmlContent);
}

/**
 * 解析XML到结构
 */
export function parseXmlToStructure(xmlContent: string): DocumentStructure {
  const elements: DocumentElement[] = [];

  // 提取表格
  const tablePattern = /<w:tbl[^>]*>([\s\S]*?)<\/w:tbl>/g;
  let tableMatch;
  let tableIndex = 0;

  while ((tableMatch = tablePattern.exec(xmlContent)) !== null) {
    const tableContent = tableMatch[1];
    const rows = extractTableRows(tableContent);

    if (rows.length > 0) {
      const headerRow = rows[0].join(' | ');
      const dataRows = rows.slice(1).map((r) => r.join(' | '));

      elements.push({
        id: `table-${tableIndex}`,
        type: 'table',
        content: headerRow,
        text: `[表格] ${headerRow}`,
        xpath: `/w:document/w:body/w:tbl[${tableIndex}]`,
        index: tableIndex,
        headerRow,
        dataRows: dataRows.slice(0, 3),
        tableHeaders: rows[0].map((text, i) => ({ text, index: i })),
        tableRows: rows.map((cells, i) => ({
          cells,
          hasPreserve: false,
          isHeader: i === 0,
        })),
      });
      tableIndex++;
    }
  }

  // 提取图片
  const imagePattern = /<wp:docPr[^>]*descr="([^"]*)"[^>]*>/g;
  let imageMatch;
  let imageIndex = 0;

  while ((imageMatch = imagePattern.exec(xmlContent)) !== null) {
    elements.push({
      id: `image-${imageIndex}`,
      type: 'image',
      content: imageMatch[1] || 'Image',
      text: `[图片] ${imageMatch[1] || 'Image'}`,
      xpath: `/w:document/w:body/w:p/w:r/w:drawing[${imageIndex}]`,
      index: imageIndex,
      altText: imageMatch[1],
    });
    imageIndex++;
  }

  return { elements, styles: {}, namespaces: {} };
}

/**
 * 提取表格行
 */
export function extractTableRows(tableContent: string): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(tableContent)) !== null) {
    const rowContent = rowMatch[1];
    const cells = extractRowCells(rowContent);
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * 提取行单元格
 */
export function extractRowCells(rowContent: string): string[] {
  const cells: string[] = [];
  const cellPattern = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
  let cellMatch;

  while ((cellMatch = cellPattern.exec(rowContent)) !== null) {
    const cellContent = cellMatch[1];
    const text = extractCellText(cellContent);
    cells.push(text.trim());
  }

  return cells;
}

/**
 * 提取单元格文本
 */
export function extractCellText(cellContent: string): string {
  const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let text = '';
  let match;

  while ((match = textPattern.exec(cellContent)) !== null) {
    text += match[1];
  }

  return text;
}
