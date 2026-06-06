import {
  WorkflowDocumentElement,
  WorkflowCandidateLanguageRelation,
} from './workflow-assets';

import {
  safeText,
  hasBlankPlaceholder,
  extractPlaceholderMatcher,
  isLikelySectionHeading,
} from './document-xml-parser';
import {
  normalizeLookupText,
  hasCompareFieldShape,
  extractAnchorPrefix,
  inferRecognitionBlockTitle,
} from './workflow-parser-format';

export function inferSectionInfo(
  elements: WorkflowDocumentElement[],
  sourceBlockId: string,
  fallbackText: string,
): { sectionId: string; sectionTitle: string } {
  const currentIndex = elements.findIndex((element) => element.id === sourceBlockId);
  const fallbackTitle = inferRecognitionBlockTitle(safeText(fallbackText), 'section');
  if (currentIndex < 0) {
    return {
      sectionId: sourceBlockId || fallbackTitle,
      sectionTitle: fallbackTitle,
    };
  }

  for (let index = currentIndex; index >= 0; index -= 1) {
    const currentElement = elements[index];
    const text = safeText(currentElement?.text);
    if (!text) {
      continue;
    }
    if (isLikelySectionHeading(text, currentElement)) {
      return {
        sectionId: currentElement.id,
        sectionTitle: inferRecognitionBlockTitle(text, currentElement.type),
      };
    }
  }

  return {
    sectionId: sourceBlockId,
    sectionTitle: fallbackTitle,
  };
}


export function splitSampleTextIntoChunks(sampleText: string): string[] {
  const normalizedSampleText = safeText(sampleText);
  if (!normalizedSampleText) {
    return [];
  }

  const paragraphChunks = normalizedSampleText
    .split(/\n\s*\n+/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const lines = normalizedSampleText
    .split(/[\r\n]+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 160);

  const lineWindows: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const window = lines.slice(index, index + 4).join('\n').trim();
    if (window) {
      lineWindows.push(window);
    }
  }

  return Array.from(new Set([...paragraphChunks, ...lineWindows])).slice(0, 240);
}

export function buildFallbackSectionHints(elements: WorkflowDocumentElement[]): string[] {
  const headingHints = elements
    .filter((element) => ['paragraph', 'table', 'cell'].includes(String(element.type || '')))
    .filter((element) => isLikelySectionHeading(safeText(element.text), element))
    .map((element) => safeText(element.text))
    .slice(0, 6);
  if (headingHints.length > 0) {
    return headingHints;
  }
  return elements
    .filter((element) => element.type === 'paragraph')
    .map((element) => safeText(element.text))
    .filter((text) => Boolean(text) && text.length <= 40)
    .slice(0, 6);
}

export function splitTemplateTextIntoCompareSegments(templateText: string): string[] {
  const normalizedTemplateText = safeText(templateText);
  if (!normalizedTemplateText) {
    return [];
  }

  const lineSegments = normalizedTemplateText
    .split(/[\r\n]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const sentenceGroups = lineSegments.flatMap((segment) => {
    if (!hasCompareFieldShape(segment)) {
      return [segment];
    }

    const splitSentences = segment
      .split(/[。；]/u)
      .map((item) => item.trim())
      .filter(Boolean);
    const compareSentences = splitSentences.filter((item) => hasCompareFieldShape(item));
    const compareLabelCount = extractCompareLabels(segment).length;
    const hasMultipleCompareUnits = compareLabelCount >= 2
      || (segment.match(/[_＿]{2,}|\(\s*\)|（\s*）/gu) || []).length >= 2;

    if (hasMultipleCompareUnits || compareSentences.length <= 1) {
      return [segment];
    }

    return compareSentences;
  });

  return Array.from(new Set(sentenceGroups)).slice(0, 8);
}

export function buildTextCompareInputs(
  elements: WorkflowDocumentElement[],
  sectionId: string,
  templateText: string,
  languageRelation?: WorkflowCandidateLanguageRelation,
): Array<{
  compareSegment: string;
  anchorText?: string;
  sampleValue?: string;
  matchText?: string;
  probeTexts?: string[];
  dictionaryText?: string;
}> {
  const compareSegments = splitTemplateTextIntoCompareSegments(templateText);
  const bilingualPeerText = findAdjacentBilingualPeerText(elements, sectionId, languageRelation);
  const bilingualPeerLabels = extractCompareLabels(bilingualPeerText);

  return compareSegments.map((compareSegment) => {
    const labels = extractCompareLabels(compareSegment);
    const hasMultipleLabels = labels.length >= 2;
    const comparePeerLabels = hasMultipleLabels ? bilingualPeerLabels : [];
    const comparePeerText = hasMultipleLabels ? bilingualPeerText : '';
    return {
      compareSegment,
      anchorText: labels[0] || extractAnchorPrefix(compareSegment.replace(/^[\s_＿\-—.·]+/u, '').trim()),
      probeTexts: [
        ...labels,
        ...comparePeerLabels,
        compareSegment,
        comparePeerText,
      ].filter((value): value is string => Boolean(safeText(value))),
      dictionaryText: hasMultipleLabels ? '' : (labels[0] || compareSegment),
    };
  });
}

export function findBestSectionSampleChunk(
  sampleChunks: string[],
  probes: Array<string | undefined>,
): { chunk: string; score: number } {
  if (sampleChunks.length === 0) {
    return { chunk: '', score: 0 };
  }

  const effectiveProbes = Array.from(new Set(
    probes
      .map((probe) => safeText(probe))
      .filter((probe) => probe.length >= 2)
  ));
  if (effectiveProbes.length === 0) {
    return { chunk: '', score: 0 };
  }

  let bestChunk = '';
  let bestScore = 0;
  for (const chunk of sampleChunks) {
    const score = scoreLooseTextMatch(chunk, effectiveProbes);
    if (score > bestScore) {
      bestScore = score;
      bestChunk = chunk;
    }
  }

  return {
    chunk: bestChunk,
    score: bestScore,
  };
}

export function findDirectCompareMatch(sampleText: string, templateText: string, anchorText: string): string {
  const normalizedSampleText = safeText(sampleText);
  if (!normalizedSampleText) {
    return '';
  }

  const lines = normalizedSampleText
    .split(/[\r\n]+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 400);

  const normalizedAnchor = normalizeLookupText(anchorText.replace(/[：:]$/u, ''));
  if (normalizedAnchor) {
    const anchorLine = lines.find((line) => normalizeLookupText(line).includes(normalizedAnchor));
    if (anchorLine) {
      return anchorLine;
    }
  }

  const placeholderMatcher = extractPlaceholderMatcher(templateText);
  if (placeholderMatcher) {
    const alignedLine = lines.find((line) => {
      const normalizedLine = normalizeLookupText(line);
      return (
        (!placeholderMatcher.prefix || normalizedLine.includes(normalizeLookupText(placeholderMatcher.prefix)))
        && (!placeholderMatcher.suffix || normalizedLine.includes(normalizeLookupText(placeholderMatcher.suffix)))
      );
    });
    if (alignedLine) {
      return alignedLine;
    }
  }

  return '';
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

export function findAdjacentBilingualPeerText(
  elements: WorkflowDocumentElement[],
  sectionId: string,
  languageRelation?: WorkflowCandidateLanguageRelation,
): string {
  if (languageRelation?.mode !== 'adjacent_bilingual_block' || !languageRelation.peerBlockId) {
    return '';
  }

  const peerElement = elements.find((item) => item.id === languageRelation.peerBlockId);
  if (!peerElement) {
    return '';
  }

  const peerSectionId = inferSectionInfo(elements, peerElement.id, safeText(peerElement.text)).sectionId;
  if (peerSectionId !== sectionId) {
    return '';
  }

  return safeText(peerElement.text);
}

export function extractLooseCandidateContext(sampleText: string, probes: Array<string | undefined>): string {
  const normalizedSampleText = safeText(sampleText);
  if (!normalizedSampleText) {
    return '';
  }

  const effectiveProbes = Array.from(new Set(
    probes
      .map((probe) => safeText(probe))
      .filter((probe) => probe.length >= 2)
      .flatMap((probe) => {
        const variants = [probe];
        if (probe.length > 24) {
          variants.push(probe.slice(0, 24));
        }
        if (probe.length > 12) {
          variants.push(probe.slice(0, 12));
        }
        return variants;
      })
  ));
  if (effectiveProbes.length === 0) {
    return '';
  }

  const chunks = normalizedSampleText
    .split(/[\r\n]+|[。；;]/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 400);

  let bestChunk = '';
  let bestScore = 0;
  for (const chunk of chunks) {
    const score = scoreLooseTextMatch(chunk, effectiveProbes);
    if (score > bestScore) {
      bestScore = score;
      bestChunk = chunk;
    }
  }

  return bestScore >= 10 ? bestChunk.slice(0, 240) : '';
}

export function scoreLooseTextMatch(chunk: string, probes: string[]): number {
  const normalizedChunk = normalizeLookupText(chunk);
  if (!normalizedChunk) {
    return 0;
  }

  let score = 0;
  for (const probe of probes) {
    const normalizedProbe = normalizeLookupText(probe);
    if (!normalizedProbe) {
      continue;
    }
    if (normalizedChunk.includes(normalizedProbe)) {
      score += Math.min(24, normalizedProbe.length) + 6;
      continue;
    }
    const overlap = computeLooseBigramOverlap(normalizedChunk, normalizedProbe);
    if (overlap > 0) {
      score += overlap * 2;
    }
  }
  return score;
}

export function computeLooseBigramOverlap(left: string, right: string): number {
  if (left.length < 2 || right.length < 2) {
    return 0;
  }
  const leftBigrams = new Set<string>();
  for (let index = 0; index < left.length - 1; index += 1) {
    leftBigrams.add(left.slice(index, index + 2));
  }
  let overlap = 0;
  const seen = new Set<string>();
  for (let index = 0; index < right.length - 1; index += 1) {
    const gram = right.slice(index, index + 2);
    if (seen.has(gram)) {
      continue;
    }
    seen.add(gram);
    if (leftBigrams.has(gram)) {
      overlap += 1;
    }
  }
  return overlap;
}

export function shouldIncludeSectionCompareProbe(text: string): boolean {
  const normalizedText = safeText(text);
  if (!normalizedText) {
    return false;
  }
  if (isLikelySectionHeading(normalizedText)) {
    return true;
  }
  if (hasCompareFieldShape(normalizedText)) {
    return isCompactCompareBlock(normalizedText);
  }
  return normalizedText.length <= 28;
}

export function isCompactCompareBlock(text: string): boolean {
  const normalizedText = safeText(text);
  if (!normalizedText) {
    return false;
  }
  const lineCount = normalizedText.split(/\n+/u).filter(Boolean).length;
  if (lineCount > 2) {
    return false;
  }
  if (normalizedText.length > 72 && !hasBlankPlaceholder(normalizedText)) {
    return false;
  }
  return true;
}

export function isLikelyNarrativeCompareText(text: string): boolean {
  const normalizedText = safeText(text);
  if (!normalizedText) {
    return false;
  }
  if (hasBlankPlaceholder(normalizedText) || /【|】|\(\s*\)|（\s*）/u.test(normalizedText)) {
    return false;
  }
  const sentencePunctuationCount = (normalizedText.match(/[，,。；;]/gu) || []).length;
  if (normalizedText.length >= 44 && sentencePunctuationCount >= 2) {
    return true;
  }
  if (normalizedText.length >= 88) {
    return true;
  }
  return false;
}

export function shouldKeepCompareCandidateUnnamed(text: string): boolean {
  const normalizedText = safeText(text);
  if (!normalizedText) {
    return false;
  }
  if (extractCompareLabels(normalizedText).length >= 2) {
    return true;
  }
  return hasBlankPlaceholder(normalizedText)
    && !/[:：]/u.test(normalizedText)
    && normalizedText.length >= 24;
}
