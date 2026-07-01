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

import {
  buildCompareCandidateLocation,
  buildCompareCandidateLanguageRelation,
  buildTemplateTableMatrices,
  buildTableCompareInputs,
  shouldCreateCompareCandidate,
  describeCompareCandidateReason,
  buildCandidateSampleValue,
  computeCompareCandidateConfidence,
} from './workflow-compare-candidate.helper';
import { buildCompareSectionContexts } from './workflow-compare-summary';

export async function buildCompareCandidates(
  templateDocumentIr: WorkflowDocumentIR,
  fields: WorkflowAnalyzeFieldResult[],
  sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
  sourceLanguage: string,
  assets: WorkflowResolvedAssets,
  matchFieldDictionaryFn: (
    text: string,
    assets: WorkflowResolvedAssets
  ) => WorkflowFieldDictionaryEntry | undefined,
  extractFieldValueFn: (fieldId: string, userInput: string, overrideValue: unknown) => unknown
): Promise<WorkflowCompareCandidateBuildResult> {
  const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
  const anchors = Array.isArray(templateDocumentIr.anchors) ? templateDocumentIr.anchors : [];
  const warnings: string[] = [];
  const sampleText = await extractSampleTextRich(sampleDocument?.contentBase64, warnings);
  const sectionContexts = buildCompareSectionContexts(elements, sampleText);
  const sectionContextMap = new Map(sectionContexts.map((section) => [section.sectionId, section]));
  const templateTableMatrices = buildTemplateTableMatrices(elements);
  const sampleTableMatrices = await extractSampleTableMatrices(sampleDocument?.contentBase64);
  const shortTableCellTexts = new Set(
    elements
      .filter((element) => safeText(element.type) === 'cell')
      .map((element) => safeText(element.text))
      .filter((text) => Boolean(text) && text.length <= 40)
      .map((text) => normalizeLookupText(text))
  );
  const blockElements = elements.filter(
    (element) =>
      ['paragraph', 'table', 'cell'].includes(String(element.type || '')) &&
      Boolean(safeText(element.text))
  );
  const candidates: WorkflowFieldCandidate[] = [];
  const seenKeys = new Set<string>();

  for (const element of blockElements) {
    const templateText = safeText(element.text);
    if (
      safeText(element.type) === 'paragraph' &&
      templateText.length <= 40 &&
      shortTableCellTexts.has(normalizeLookupText(templateText))
    ) {
      continue;
    }
    const sectionInfo = inferSectionInfo(elements, element.id, templateText);
    const sectionContext = sectionContextMap.get(sectionInfo.sectionId);
    const matchedField = fields.find((field) =>
      (field.sourceBindings || []).some((binding) => safeText(binding.blockId) === element.id)
    );
    const scopedSampleText = safeText(sectionContext?.sampleText) || sampleText;
    const tableCompareInputs = buildTableCompareInputs(
      element,
      templateTableMatrices,
      sampleTableMatrices
    );
    if (tableCompareInputs?.skip) {
      continue;
    }
    const languageRelation = buildCompareCandidateLanguageRelation(
      elements,
      element,
      sectionInfo.sectionId
    );
    const compareInputs: Array<{
      compareSegment: string;
      anchorText?: string;
      sampleValue?: string;
      matchText?: string;
      probeTexts?: string[];
      dictionaryText?: string;
      dedupeHint?: string;
    }> = tableCompareInputs?.inputs?.length
      ? tableCompareInputs.inputs
      : buildTextCompareInputs(elements, sectionInfo.sectionId, templateText, languageRelation);

    for (const compareInput of compareInputs) {
      const compareSegment = compareInput.compareSegment;
      if (element.id === sectionInfo.sectionId && isLikelySectionHeading(compareSegment)) {
        continue;
      }
      const anchorText =
        safeText(compareInput.anchorText) ||
        extractAnchorPrefix(compareSegment.replace(/^[\s_＿\-—.·]+/u, '').trim());
      const dictionaryHint = matchFieldDictionaryFn(
        safeText(compareInput.dictionaryText) || anchorText || templateText,
        assets
      );
      const compactCompareBlock = isCompactCompareBlock(compareSegment);
      const keepUnnamedCandidate = shouldKeepCompareCandidateUnnamed(compareSegment);
      const compareLabels = extractCompareLabels(compareSegment);
      const includeSectionTitleProbe = !(
        languageRelation?.mode === 'adjacent_bilingual_block' &&
        compareLabels.length < 2 &&
        hasCompareFieldShape(compareSegment)
      );
      const probeTexts = [
        ...(includeSectionTitleProbe ? [sectionInfo.sectionTitle] : []),
        anchorText,
        ...(compareInput.probeTexts || []),
        matchedField?.fieldId,
        ...(compactCompareBlock ? [compareSegment.slice(0, 64)] : []),
      ];
      const directMatchText =
        safeText(compareInput.matchText) ||
        findDirectCompareMatch(scopedSampleText, compareSegment, anchorText) ||
        findDirectCompareMatch(sampleText, compareSegment, anchorText);
      const matchText =
        safeText(compareInput.matchText) ||
        directMatchText ||
        extractLooseCandidateContext(scopedSampleText, probeTexts) ||
        extractLooseCandidateContext(sampleText, probeTexts);

      if (
        !shouldCreateCompareCandidate(
          compareSegment,
          anchorText,
          matchText,
          matchedField,
          dictionaryHint
        )
      ) {
        continue;
      }

      const fieldIdHint = keepUnnamedCandidate
        ? undefined
        : matchedField?.fieldId || dictionaryHint?.fieldId;
      const fieldTypeHint = keepUnnamedCandidate
        ? undefined
        : matchedField?.type || dictionaryHint?.type;
      const generationPolicyHint = keepUnnamedCandidate
        ? 'section_text_compare_first'
        : matchedField?.policy || dictionaryHint?.policy || 'section_text_compare_first';
      const sampleValue =
        safeText(compareInput.sampleValue) ||
        buildCandidateSampleValue(
          anchorText,
          compareSegment,
          matchText,
          matchedField,
          sourceLanguage
        );
      const segmentText =
        compareSegment.slice(0, 240) || [anchorText, sampleValue].filter(Boolean).join('');
      const dedupeKey = [
        normalizeLookupText(sectionInfo.sectionTitle),
        normalizeLookupText(anchorText),
        normalizeLookupText(sampleValue),
        normalizeLookupText(segmentText.slice(0, 64)),
        safeText(compareInput.dedupeHint),
      ].join('|');
      if (seenKeys.has(dedupeKey)) {
        continue;
      }
      seenKeys.add(dedupeKey);

      candidates.push({
        candidateId: `fc_${candidates.length + 1}`,
        sourceBlockId: element.id,
        anchorText:
          anchorText ||
          inferRecognitionBlockTitle(compareSegment, String(element.type || 'paragraph')),
        sampleValue,
        segmentText,
        sectionId: sectionInfo.sectionId,
        sectionTitle: sectionInfo.sectionTitle,
        fieldTypeHint,
        generationPolicyHint,
        confidence: computeCompareCandidateConfidence(
          matchText,
          keepUnnamedCandidate ? undefined : matchedField,
          dictionaryHint
        ),
        fieldIdHint,
        matchText: matchText || undefined,
        matchReason: describeCompareCandidateReason(
          matchText,
          keepUnnamedCandidate ? undefined : matchedField,
          dictionaryHint,
          Boolean(safeText(sectionContext?.sampleText))
        ),
        compareMode: sectionContext?.compareMode || 'structure_only',
        sectionMatchScore: sectionContext?.sampleMatchScore || 0,
        location: buildCompareCandidateLocation(element, anchors),
        languageRelation,
      });
    }
  }

  if (candidates.length > 0) {
    return {
      candidates,
      sectionContexts,
      warnings,
    };
  }

  return {
    candidates: fields.map((field, index) => {
      const sourceBinding = field.sourceBindings?.[0];
      const sourceBlockId = safeText(sourceBinding?.blockId) || `block-${index + 1}`;
      const sourceElement = elements.find((element) => element.id === sourceBlockId);
      const sectionInfo = inferSectionInfo(
        elements,
        sourceBlockId,
        sourceElement?.text || sourceBinding?.anchor?.prefix || field.fieldId
      );
      const normalizedSegmentText =
        safeText(sourceElement?.text) || safeText(sourceBinding?.anchor?.prefix) || field.fieldId;
      const anchorText =
        extractAnchorPrefix(normalizedSegmentText.replace(/^[\s_＿\-—.·]+/u, '').trim()) ||
        field.fieldId;
      const sampleValue = safeText(
        field.sample?.[sourceLanguage] ||
          field.sample?.zh ||
          extractFieldValueFn(field.fieldId, sampleText, undefined)
      );
      const segmentText =
        normalizedSegmentText || [anchorText, sampleValue].filter(Boolean).join('');

      return {
        candidateId: `fc_${index + 1}`,
        sourceBlockId,
        anchorText,
        sampleValue,
        segmentText,
        sectionId: sectionInfo.sectionId,
        sectionTitle: sectionInfo.sectionTitle,
        fieldTypeHint: field.type,
        generationPolicyHint: field.policy || 'rule_fallback',
        confidence: field.confidence,
        fieldIdHint: field.fieldId,
        location: sourceElement ? buildCompareCandidateLocation(sourceElement, anchors) : undefined,
        languageRelation: sourceElement
          ? buildCompareCandidateLanguageRelation(elements, sourceElement, sectionInfo.sectionId)
          : undefined,
      };
    }),
    sectionContexts,
    warnings,
  };
}
