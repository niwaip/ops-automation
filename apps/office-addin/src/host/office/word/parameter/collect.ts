import { Anchor, DocumentElement, DocumentIR } from '../../../../host/adapters/document-ir';
import type { WordParagraphLike, WordTableCellLike, WordUnderlineLike } from './types';
import { normalizeWordLookupText, safeWordRuleText } from '../shared/text';

export function getWordDocumentElements(
  documentIr: DocumentIR | Record<string, any> | null | undefined
): DocumentElement[] {
  return Array.isArray(documentIr?.elements) ? (documentIr.elements as DocumentElement[]) : [];
}

export function getWordDocumentAnchors(
  documentIr: DocumentIR | Record<string, any> | null | undefined
): Anchor[] {
  return Array.isArray(documentIr?.anchors) ? (documentIr.anchors as Anchor[]) : [];
}

export function toFiniteNumber(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function collectWordParagraphs(
  documentIr: DocumentIR | Record<string, any> | null | undefined
): WordParagraphLike[] {
  const paragraphs = getWordDocumentElements(documentIr)
    .filter((element) => element.type === 'paragraph')
    .reduce<WordParagraphLike[]>((result, element) => {
      const paragraphIndex = toFiniteNumber(element.hostData?.index);
      if (paragraphIndex === null) {
        return result;
      }
      result.push({
        id: element.id,
        index: paragraphIndex,
        text: String(element.text || ''),
        format:
          typeof element.hostData?.format === 'object'
            ? (element.hostData.format as Record<string, unknown>)
            : undefined,
      });
      return result;
    }, []);

  return paragraphs.sort((left, right) => left.index - right.index);
}

export function collectWordUnderlines(
  documentIr: DocumentIR | Record<string, any> | null | undefined
): WordUnderlineLike[] {
  const underlines = getWordDocumentAnchors(documentIr)
    .filter((anchor) => anchor.type === 'word-range')
    .reduce<WordUnderlineLike[]>((result, anchor) => {
      const paragraphIndex = toFiniteNumber(anchor.ref?.paragraphIndex);
      const start = toFiniteNumber(anchor.ref?.start);
      const end = toFiniteNumber(anchor.ref?.end);
      if (paragraphIndex === null || start === null || end === null) {
        return result;
      }
      result.push({
        text: String(anchor.text || ''),
        underlineType: String(anchor.ref?.underlineType || ''),
        paragraphIndex,
        paragraphText: String(anchor.ref?.paragraphText || ''),
        position: { start, end },
      });
      return result;
    }, []);

  return underlines.sort(
    (left, right) =>
      left.paragraphIndex - right.paragraphIndex || left.position.start - right.position.start
  );
}

export function collectWordTableCells(
  documentIr: DocumentIR | Record<string, any> | null | undefined
): WordTableCellLike[] {
  const tableCells = getWordDocumentElements(documentIr)
    .filter((element) => element.type === 'cell')
    .reduce<WordTableCellLike[]>((result, element) => {
      const tableIndex = toFiniteNumber(element.hostData?.tableIndex);
      const rowIndex = toFiniteNumber(element.hostData?.rowIndex);
      const cellIndex = toFiniteNumber(element.hostData?.cellIndex);
      if (tableIndex === null || rowIndex === null || cellIndex === null) {
        return result;
      }
      result.push({
        sourceBlockId: element.id,
        text: safeWordRuleText(element.text),
        tableIndex,
        rowIndex,
        cellIndex,
      });
      return result;
    }, []);

  return tableCells.sort(
    (left, right) =>
      left.tableIndex - right.tableIndex ||
      left.rowIndex - right.rowIndex ||
      left.cellIndex - right.cellIndex
  );
}

export function isParagraphLikelyInsideWordTable(
  paragraphText: string,
  tableCells: WordTableCellLike[]
): boolean {
  const normalizedParagraph = normalizeWordLookupText(paragraphText);
  if (!normalizedParagraph || normalizedParagraph.length > 48) {
    return false;
  }

  const normalizedTableTexts = tableCells
    .map((cell) => normalizeWordLookupText(String(cell.text || '')))
    .filter(Boolean);

  return normalizedTableTexts.some(
    (cellText) =>
      cellText === normalizedParagraph ||
      cellText.includes(normalizedParagraph) ||
      normalizedParagraph.includes(cellText)
  );
}
