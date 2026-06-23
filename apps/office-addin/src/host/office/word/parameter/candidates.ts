import { TemplateFieldCandidate } from '../../../../api/carbone-api';
import { normalizeWordLookupText } from '../shared/text';
import type { WordDetectedParam } from './types';

function getWordParamPriority(param: WordDetectedParam): number {
  if (param.sourceType === 'underline') {
    return 3;
  }
  if (param.sourceType === 'table-cell') {
    return 2;
  }
  return 1;
}

function areWordParamRangesOverlapping(left: WordDetectedParam, right: WordDetectedParam): boolean {
  if (left.sourceType === 'table-cell' || right.sourceType === 'table-cell') {
    return false;
  }

  const leftStart = Math.min(left.start, left.end);
  const leftEnd = Math.max(left.start, left.end);
  const rightStart = Math.min(right.start, right.end);
  const rightEnd = Math.max(right.start, right.end);

  if (leftEnd === leftStart || rightEnd === rightStart) {
    return Math.abs(leftStart - rightStart) <= 2;
  }

  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function shouldTreatAsSameWordParam(left: WordDetectedParam, right: WordDetectedParam): boolean {
  if (left.sourceType === 'table-cell' || right.sourceType === 'table-cell') {
    return false;
  }
  if (left.paragraphIndex !== right.paragraphIndex) {
    return false;
  }
  if (normalizeWordLookupText(left.paramName) !== normalizeWordLookupText(right.paramName)) {
    return false;
  }

  return areWordParamRangesOverlapping(left, right);
}

export function dedupeDetectedWordParams(params: WordDetectedParam[]): WordDetectedParam[] {
  const seenKeys = new Set<string>();
  const uniqueByExactKey = params.filter((param) => {
    const key =
      param.sourceType === 'table-cell'
        ? `${param.sourceType}|${param.tableIndex}|${param.rowIndex}|${param.cellIndex}|${
            param.underlineType === 'table-loop-column'
              ? `${param.id}|${param.languageHint || ''}`
              : normalizeWordLookupText(param.paramName)
          }`
        : `${param.sourceType}|${param.paragraphIndex}|${param.start}|${param.end}|${normalizeWordLookupText(param.paramName)}`;
    if (seenKeys.has(key)) {
      return false;
    }
    seenKeys.add(key);
    return true;
  });

  const dedupedParams: WordDetectedParam[] = [];
  uniqueByExactKey.forEach((param) => {
    const existingIndex = dedupedParams.findIndex((current) =>
      shouldTreatAsSameWordParam(current, param)
    );
    if (existingIndex < 0) {
      dedupedParams.push(param);
      return;
    }

    if (getWordParamPriority(param) > getWordParamPriority(dedupedParams[existingIndex])) {
      dedupedParams[existingIndex] = param;
    }
  });

  return dedupedParams;
}

export function buildWordRuleCandidate(param: WordDetectedParam): TemplateFieldCandidate | null {
  if (param.sourceType === 'label-only' && param.start >= param.end) {
    return null;
  }

  if (param.sourceType === 'table-cell') {
    const isLoopTable = param.underlineType === 'table-loop-column';
    const isRightLabelFallback = param.underlineType === 'table-cell-right-label';
    const isTopLabelFallback = param.underlineType === 'table-cell-top-label';
    return {
      candidateId: `fe-word-${param.id}`,
      sourceBlockId:
        param.sourceBlockId || `word-cell-${param.tableIndex}-${param.rowIndex}-${param.cellIndex}`,
      anchorText: param.anchorText,
      localAnchorText: param.localAnchorText,
      parameterSlot: param.parameterSlot,
      sampleValue: param.sampleValue || '',
      segmentText:
        param.paragraphText || `${param.anchorText}\t${param.rawText || '______________'}`,
      sectionId: `word-table-${param.tableIndex}`,
      sectionTitle: `表格 ${(param.tableIndex || 0) + 1}`,
      confidence: isLoopTable
        ? 0.88
        : isRightLabelFallback
          ? 0.72
          : isTopLabelFallback
            ? 0.8
            : 0.84,
      matchReason: isLoopTable
        ? '前端表格规则: 标准表格列标题'
        : isRightLabelFallback
          ? '前端表格规则: 左侧缺失时取右侧标签'
          : isTopLabelFallback
            ? '前端表格规则: 上方标题映射空白单元格'
            : '前端表格规则: 空白单元格优先取左侧标签',
      compareMode: 'structure_only',
      sectionMatchScore: 0,
      location: {
        blockType: 'cell',
        tableIndex: param.tableIndex,
        rowIndex: param.rowIndex,
        cellIndex: param.cellIndex,
      },
      languageRelation: param.languageHint
        ? {
            mode: 'single_language',
            currentLanguageHint: param.languageHint,
          }
        : undefined,
    };
  }

  return {
    candidateId: `fe-word-${param.id}`,
    sourceBlockId: param.sourceBlockId || `word-paragraph-${param.paragraphIndex}`,
    anchorText: param.anchorText,
    localAnchorText: param.localAnchorText,
    parameterSlot: param.parameterSlot,
    sampleValue: param.sampleValue || '',
    segmentText: param.paragraphText || param.anchorText,
    sectionId: `word-paragraph-${param.paragraphIndex}`,
    sectionTitle: `段落 ${param.paragraphIndex + 1}`,
    confidence: param.sourceType === 'underline' ? 0.82 : 0.76,
    matchReason:
      param.sourceType === 'underline'
        ? '前端下划线规则: 下划线或空格占位'
        : '前端冒号规则: 冒号后空白占位',
    compareMode: 'structure_only',
    sectionMatchScore: 0,
    location: {
      blockType: 'paragraph',
      paragraphIndex: param.paragraphIndex,
      anchorStart: param.start,
      anchorEnd: param.end,
    },
  };
}
