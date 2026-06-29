import {
  WorkflowDocumentElement,
  WorkflowAnchor,
  WorkflowCandidateLocation,
  WorkflowCandidateLanguageRelation,
} from './workflow-assets';

import { safeText, numberOrUndefined } from './document-xml-parser';

import { normalizeLookupText, detectTextLanguageHint, isConcreteLanguageHint } from './workflow-parser-format';

import { inferSectionInfo } from './workflow-similarity';
import { isSimpleDocumentBilingualPair } from './workflow-language-profile';
export {
  buildMultiAnchorTableCellCompareInputs,
  buildSampleTableMatrices,
  buildTableCompareInputs,
  buildTemplateTableMatrices,
  isLikelyTableHeaderRow,
  isLikelyTableLabel,
  type WorkflowTableCompareInput,
} from './workflow-compare-table.helper';
export {
  buildCandidateSampleValue,
  computeCompareCandidateConfidence,
  describeCompareCandidateReason,
  shouldCreateCompareCandidate,
} from './workflow-compare-scoring.helper';

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
