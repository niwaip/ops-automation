import { DocumentIR } from '../../../../host/adapters/document-ir';
import {
  collectOfficeHeadingCandidates,
  collectSpecialRuleHeadingCandidates,
  collectWordSectionParagraphsFromDocumentIr,
  deriveWordSectionsFromParagraphs,
  formatWordHeadingSource,
  WordSectionDetectorOptions,
} from './detector';

export function buildWordDocumentStructureDebugText(templateDocumentIr: DocumentIR | Record<string, any> | null): string {
  const paragraphs = collectWordSectionParagraphsFromDocumentIr(templateDocumentIr);
  const elements = Array.isArray(templateDocumentIr?.elements)
    ? templateDocumentIr.elements as Array<Record<string, any>>
    : [];
  const tables = elements.filter((element) => element?.type === 'table');

  return [
    '【完整文档结构】',
    `段落数: ${paragraphs.length} | 表格数: ${tables.length}`,
    '',
    '【段落】',
    paragraphs.map((paragraph) => {
      const format = paragraph.format || {};
      return [
        `#${paragraph.paragraphIndex}`,
        `styleBuiltIn=${JSON.stringify(String(format.styleBuiltIn || ''))}`,
        `style=${JSON.stringify(String(format.style || ''))}`,
        `isListItem=${Boolean(format.isListItem) ? 'yes' : 'no'}`,
        `listLevel=${typeof format.listLevel === 'number' ? format.listLevel : '-'}`,
        `listString=${JSON.stringify(String(format.listString || ''))}`,
        `listId=${typeof format.listId === 'number' ? format.listId : '-'}`,
        `fontSize=${String(format.fontSize || '') || '-'}`,
        `bold=${Boolean(format.isBold) ? 'yes' : 'no'}`,
        `isTitle=${Boolean(format.isTitle) ? 'yes' : 'no'}`,
        `align=${String(format.alignment || '') || '-'}`,
        `text=${JSON.stringify(paragraph.text)}`,
      ].join(' | ');
    }).join('\n') || '无',
    '',
    '【表格】',
    tables.map((table: Record<string, any>, index: number) =>
      `table#${index} | text=${JSON.stringify(String(table.text || ''))}`
    ).join('\n') || '无',
  ].join('\n');
}

export function buildWordChapterDetectionDebugText(
  templateDocumentIr: DocumentIR | Record<string, any> | null,
  options?: WordSectionDetectorOptions
): string {
  const paragraphs = collectWordSectionParagraphsFromDocumentIr(templateDocumentIr);
  const officeCandidates = collectOfficeHeadingCandidates(paragraphs);
  const specialCandidates = collectSpecialRuleHeadingCandidates(paragraphs, options);
  const sections = deriveWordSectionsFromParagraphs(paragraphs, options);
  const officeCandidateMap = new Map<number, Array<{ level: number }>>();
  const specialCandidateMap = new Map<number, Array<{ level: number }>>();

  officeCandidates.forEach((candidate) => {
    const current = officeCandidateMap.get(candidate.paragraphIndex) || [];
    current.push(candidate);
    officeCandidateMap.set(candidate.paragraphIndex, current);
  });
  specialCandidates.forEach((candidate) => {
    const current = specialCandidateMap.get(candidate.paragraphIndex) || [];
    current.push(candidate);
    specialCandidateMap.set(candidate.paragraphIndex, current);
  });

  return [
    '【章节判定明细】',
    `段落数: ${paragraphs.length}`,
    `Office API 标题候选数: ${officeCandidates.length}`,
    `特别规则标题候选数: ${specialCandidates.length}`,
    `最终章节数: ${sections.length}`,
    '',
    '【逐段判定】',
    paragraphs.map((paragraph) => {
      const officeItems = officeCandidateMap.get(paragraph.paragraphIndex) || [];
      const specialItems = specialCandidateMap.get(paragraph.paragraphIndex) || [];
      return [
        `#${paragraph.paragraphIndex}`,
        `office=${officeItems.map((item) => `L${item.level}`).join('/') || '-'}`,
        `special=${specialItems.map((item) => `L${item.level}`).join('/') || '-'}`,
        `styleBuiltIn=${JSON.stringify(String(paragraph.format?.styleBuiltIn || ''))}`,
        `style=${JSON.stringify(String(paragraph.format?.style || ''))}`,
        `isListItem=${Boolean(paragraph.format?.isListItem) ? 'yes' : 'no'}`,
        `listLevel=${typeof paragraph.format?.listLevel === 'number' ? paragraph.format?.listLevel : '-'}`,
        `listString=${JSON.stringify(String(paragraph.format?.listString || ''))}`,
        `text=${JSON.stringify(paragraph.text)}`,
      ].join(' | ');
    }).join('\n') || '无',
    '',
    '【最终章节】',
    sections.map((section, index) => [
      `${index + 1}. ${section.sectionTitle}`,
      `type=${section.regionType || 'chapter'}`,
      `source=${formatWordHeadingSource(section.detectionSource)}`,
      `range=#${section.startParagraphIndex}-#${section.endParagraphIndex}`,
      `headings=${section.headingTexts.map((text) => JSON.stringify(text)).join(' / ') || '-'}`,
    ].join(' | ')).join('\n') || '无',
  ].join('\n');
}
