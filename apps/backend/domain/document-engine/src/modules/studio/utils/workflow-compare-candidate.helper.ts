import {
  WorkflowDocumentIR,
  WorkflowDocumentElement,
  WorkflowAnchor,
  WorkflowLanguageProfile,
  WorkflowTemplateFieldSpec,
  WorkflowFieldDictionaryEntry,
  WorkflowTermEntry,
  WorkflowEnumItem,
  WorkflowResolvedAssets,
  WorkflowAnalyzeFieldResult,
  WorkflowCandidateLocation,
  WorkflowCandidateLanguageRelation,
  WorkflowFieldCandidate,
  WorkflowCompareResult,
  WorkflowCompareSectionContext,
  WorkflowCompareCandidateBuildResult,
} from './workflow-assets';

import {
  safeText,
  escapeRegExp,
  numberOrUndefined,
  getElementHostData,
  isLikelyDocumentTitle,
  isLikelySectionHeading,
  isBlankTableTemplateCell,
  splitTableCellLines,
  extractPlaceholderSampleValue,
  extractSampleTableMatrices,
  classifyTemplateTableStructure,
  findNearestLeftTableLabel,
  findNearestRightTableLabel,
  extractTableCellCompareAnchors,
  extractTableCellSampleValueByAnchor,
} from './document-xml-parser';

import {
  normalizeLookupText,
  detectTextLanguageHint,
  isConcreteLanguageHint,
  hasCompareFieldShape,
  extractAnchorPrefix,
  inferRecognitionBlockTitle,
} from './workflow-parser-format';

import {
  splitSampleTextIntoChunks,
  buildTextCompareInputs,
  findBestSectionSampleChunk,
  findDirectCompareMatch,
  extractCompareLabels,
  extractLooseCandidateContext,
  shouldIncludeSectionCompareProbe,
  isCompactCompareBlock,
  isLikelyNarrativeCompareText,
  shouldKeepCompareCandidateUnnamed,
  inferSectionInfo,
  scoreLooseTextMatch,
} from './workflow-similarity';

import { extractSampleTextRich } from './workflow-xml-text';

import { normalizeConfidence, findTermMatch } from './workflow-discover';
import { isSimpleDocumentBilingualPair } from './workflow-language-profile';

export function isLikelyTableHeaderRow(row: string[]): boolean {
  const cells = row.map((cell) => safeText(cell)).filter(Boolean);
  if (cells.length < 2) {
    return false;
  }
  return cells.every(
    (cell) => isLikelyTableLabel(cell) && !/[:：]/u.test(cell) && !safeText(cell).includes('______') // approximate hasBlankPlaceholder
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

export function buildCompareCandidateLocation(
  element: WorkflowDocumentElement,
  anchors: WorkflowAnchor[]
): WorkflowCandidateLocation | undefined {
  const hostData =
    element.hostData && typeof element.hostData === 'object'
      ? (element.hostData as Record<string, unknown>)
      : {};
  const anchor = resolveCandidateAnchor(element, anchors);
  const anchorRef =
    anchor?.ref && typeof anchor.ref === 'object' ? (anchor.ref as Record<string, unknown>) : {};
  const location: WorkflowCandidateLocation = {
    blockType: safeText(element.type) || undefined,
    paragraphIndex: numberOrUndefined(hostData.index ?? anchorRef.paragraphIndex),
    tableIndex: numberOrUndefined(hostData.tableIndex ?? anchorRef.tableIndex),
    rowIndex: numberOrUndefined(hostData.rowIndex ?? anchorRef.rowIndex),
    cellIndex: numberOrUndefined(hostData.cellIndex ?? anchorRef.cellIndex),
    contentControlId: numberOrUndefined(hostData.id ?? anchorRef.id),
    anchorStart: numberOrUndefined(anchorRef.start),
    anchorEnd: numberOrUndefined(anchorRef.end),
  };

  return Object.values(location).some((value) => value !== undefined) ? location : undefined;
}

export function resolveCandidateAnchor(
  element: WorkflowDocumentElement,
  anchors: WorkflowAnchor[]
): WorkflowAnchor | undefined {
  const anchorIds = Array.isArray(element.anchorIds) ? element.anchorIds : [];
  for (const anchorId of anchorIds) {
    const matchedAnchor = anchors.find((anchor) => anchor.id === anchorId);
    if (matchedAnchor) {
      return matchedAnchor;
    }
  }

  const hostData =
    element.hostData && typeof element.hostData === 'object'
      ? (element.hostData as Record<string, unknown>)
      : {};
  const normalizedText = normalizeLookupText(safeText(element.text));
  if (!normalizedText) {
    return undefined;
  }

  return anchors.find((anchor) => {
    const ref =
      anchor.ref && typeof anchor.ref === 'object' ? (anchor.ref as Record<string, unknown>) : {};
    const anchorParagraphText = normalizeLookupText(safeText(ref.paragraphText));
    if (anchorParagraphText && anchorParagraphText === normalizedText) {
      return true;
    }
    const sameTableCell =
      numberOrUndefined(ref.tableIndex) === numberOrUndefined(hostData.tableIndex) &&
      numberOrUndefined(ref.rowIndex) === numberOrUndefined(hostData.rowIndex) &&
      numberOrUndefined(ref.cellIndex) === numberOrUndefined(hostData.cellIndex) &&
      numberOrUndefined(ref.tableIndex) !== undefined;
    return sameTableCell;
  });
}

export function buildCompareCandidateLanguageRelation(
  elements: WorkflowDocumentElement[],
  element: WorkflowDocumentElement,
  sectionId: string
): WorkflowCandidateLanguageRelation | undefined {
  const currentLanguageHint = detectTextLanguageHint(safeText(element.text));
  if (currentLanguageHint === 'mixed') {
    return {
      mode: 'same_block_mixed_language',
      currentLanguageHint,
    };
  }

  const currentIndex = elements.findIndex((item) => item.id === element.id);
  if (currentIndex >= 0) {
    const nearbyBlocks = [elements[currentIndex - 1], elements[currentIndex + 1]]
      .filter((item): item is WorkflowDocumentElement => Boolean(item))
      .filter((item) => ['paragraph', 'table', 'cell'].includes(String(item.type || '')))
      .filter(
        (item) => inferSectionInfo(elements, item.id, safeText(item.text)).sectionId === sectionId
      );

    for (const nearbyBlock of nearbyBlocks) {
      const peerLanguageHint = detectTextLanguageHint(safeText(nearbyBlock.text));
      if (
        isConcreteLanguageHint(currentLanguageHint) &&
        isConcreteLanguageHint(peerLanguageHint) &&
        currentLanguageHint !== peerLanguageHint &&
        isSimpleDocumentBilingualPair(currentLanguageHint, peerLanguageHint)
      ) {
        return {
          mode: 'adjacent_bilingual_block',
          currentLanguageHint,
          peerBlockId: nearbyBlock.id,
          peerLanguageHint,
        };
      }
    }
  }

  if (isConcreteLanguageHint(currentLanguageHint)) {
    return {
      mode: 'single_language',
      currentLanguageHint,
    };
  }

  return {
    mode: 'unknown',
    currentLanguageHint,
  };
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
): Array<{
  compareSegment: string;
  anchorText?: string;
  sampleValue?: string;
  matchText?: string;
  probeTexts?: string[];
  dictionaryText?: string;
  dedupeHint?: string;
}> {
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
  inputs: Array<{
    compareSegment: string;
    anchorText?: string;
    sampleValue?: string;
    matchText?: string;
    probeTexts?: string[];
    dictionaryText?: string;
    dedupeHint?: string;
  }>;
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

export function shouldCreateCompareCandidate(
  templateText: string,
  anchorText: string,
  matchText: string,
  matchedField?: WorkflowAnalyzeFieldResult,
  dictionaryHint?: WorkflowFieldDictionaryEntry
): boolean {
  const normalizedTemplateText = safeText(templateText);
  const hasCompareShape = hasCompareFieldShape(normalizedTemplateText);
  const compactCompareBlock = isCompactCompareBlock(normalizedTemplateText);
  const likelyNarrative = isLikelyNarrativeCompareText(normalizedTemplateText);

  if (isLikelySectionHeading(normalizedTemplateText) && !matchedField && !dictionaryHint) {
    return false;
  }
  if (matchedField) {
    return true;
  }

  if (!hasCompareShape) {
    return Boolean(dictionaryHint && compactCompareBlock && !likelyNarrative);
  }

  if (!compactCompareBlock || likelyNarrative) {
    return false;
  }

  if (matchText) {
    return true;
  }

  if (dictionaryHint) {
    return true;
  }

  return Boolean(safeText(anchorText));
}

export function describeCompareCandidateReason(
  matchText: string,
  matchedField?: WorkflowAnalyzeFieldResult,
  dictionaryHint?: WorkflowFieldDictionaryEntry,
  matchedInSection = false
): string {
  if (matchText && matchedField) {
    return matchedInSection ? '章节文本宽松命中 + 规则候选关联' : '全文宽松命中 + 规则候选关联';
  }
  if (matchText && dictionaryHint) {
    return matchedInSection ? '章节文本宽松命中 + 词典辅助提示' : '全文宽松命中 + 词典辅助提示';
  }
  if (matchText) {
    return matchedInSection ? '章节文本宽松命中' : '全文宽松命中';
  }
  if (matchedField) {
    return '规则候选关联';
  }
  if (dictionaryHint) {
    return '词典提示兜底';
  }
  return '结构特征兜底';
}

export function buildCandidateSampleValue(
  anchorText: string,
  templateText: string,
  matchText: string,
  matchedField: WorkflowAnalyzeFieldResult | undefined,
  sourceLanguage: string
): string {
  const snippet = safeText(matchText).replace(/\s+/g, ' ').trim();
  if (!snippet) {
    const fieldSample = safeText(
      matchedField?.sample?.[sourceLanguage] || matchedField?.sample?.zh
    );
    return fieldSample;
  }
  const placeholderValue = extractPlaceholderSampleValue(templateText, snippet);
  if (placeholderValue) {
    return placeholderValue.slice(0, 80);
  }
  const normalizedAnchor = safeText(anchorText).replace(/[：:]$/u, '');
  if (normalizedAnchor) {
    const directMatch = snippet.match(
      new RegExp(`${escapeRegExp(normalizedAnchor)}[：:]?\\s*([^\\n]{1,80})`, 'u')
    );
    const directValue = safeText(directMatch?.[1]);
    if (directValue) {
      return directValue.slice(0, 80);
    }
  }
  const colonValue = safeText(snippet.match(/[：:]\s*([^\n]{1,80})/u)?.[1]);
  if (colonValue) {
    return colonValue.slice(0, 80);
  }
  return snippet
    .split(/[。；;]/u)[0]
    .slice(0, 80)
    .trim();
}

export function computeCompareCandidateConfidence(
  matchText: string,
  matchedField?: WorkflowAnalyzeFieldResult,
  dictionaryHint?: WorkflowFieldDictionaryEntry
): number {
  const normalizedMatchText = safeText(matchText);
  const looseMatchScore = normalizedMatchText
    ? scoreLooseTextMatch(
        normalizedMatchText,
        [
          safeText(matchedField?.fieldId),
          safeText(matchedField?.sample?.zh),
          safeText(dictionaryHint?.fieldId),
          safeText(dictionaryHint?.description),
        ].filter(Boolean)
      )
    : 0;

  let confidence = normalizedMatchText ? 0.46 : 0.24;
  if (normalizedMatchText) {
    confidence += Math.min(0.18, looseMatchScore * 0.18);
  }
  if (matchedField) {
    confidence += 0.26;
    confidence = Math.max(confidence, normalizeConfidence(matchedField.confidence, confidence));
  }
  if (dictionaryHint) {
    confidence += matchedField ? 0.08 : 0.18;
  }
  if (normalizedMatchText && matchedField && dictionaryHint) {
    confidence += 0.04;
  }

  return normalizeConfidence(confidence, 0.72);
}
