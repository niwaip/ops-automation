import type { AISuggestion } from '../../../../app/store';
import { normalizeTextValue } from './chat-analysis-suggestion.common';
import type { StructuredAnalyzeRequest } from './types';

function clampConfidence(value: unknown): number {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return 0.75;
  }
  return Math.max(0, Math.min(1, numeric));
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function sanitizeArrayPath(value: string): string {
  return value
    .replace(/[{}]/g, '')
    .replace(/(\[(?:i)?\])+$/g, '')
    .trim();
}

function extractVariableArrayPath(value: string): string {
  const normalized = value.replace(/[{}]/g, '').trim();
  const match = normalized.match(
    /^(d\.[A-Za-z_][A-Za-z0-9_.]*)\[(?:i)?\]\.[A-Za-z_][A-Za-z0-9_]*$/
  );
  return match?.[1] || '';
}

function normalizeLoopMarker(arrayPath: string): string {
  const normalized = sanitizeArrayPath(arrayPath);
  if (!normalized) {
    return '{#d.rows}{/d.rows}';
  }
  return `{#${normalized}}{/${normalized}}`;
}

function normalizeVariableMarker(value: string, fallbackPath = 'd.textValue'): string {
  const normalized = value.trim();
  if (!normalized) {
    return `{${fallbackPath}}`;
  }
  const unwrapped =
    normalized.startsWith('{') && normalized.endsWith('}')
      ? normalized.slice(1, -1).trim()
      : normalized;
  const candidate = containsCjk(unwrapped) ? fallbackPath : unwrapped;

  if (/^[A-Za-z_][A-Za-z0-9_[\].]*$/.test(candidate)) {
    return `{${candidate}}`;
  }
  return `{${fallbackPath}}`;
}

function inferSuggestionType(
  record: Record<string, unknown>,
  details: Record<string, unknown>
): AISuggestion['type'] {
  const rawType = normalizeTextValue(record.type)?.toLowerCase();
  const fieldType = normalizeTextValue(details.fieldType)?.toLowerCase();
  const suggestedName = normalizeTextValue(record.suggestedName) || '';

  if (rawType === 'loop' || fieldType === 'loop' || suggestedName.includes('{#')) {
    return 'loop';
  }

  return 'variable';
}

function buildDefaultDescription(
  request: StructuredAnalyzeRequest,
  suggestionType: AISuggestion['type']
): string {
  if (request.analysisStage === 'excel-pair-analysis') {
    return suggestionType === 'loop'
      ? `AI 根据 ${request.pairLabel || '当前对照组'} 的表格/跨行差异识别为循环块`
      : `AI 根据 ${request.pairLabel || '当前对照组'} 的留白与真实值差异识别为参数字段`;
  }

  if (request.analysisStage === 'word-section-analysis') {
    return suggestionType === 'loop'
      ? `AI 根据 ${request.pairLabel || '当前章节'} 的明细结构识别为循环块`
      : `AI 根据 ${request.pairLabel || '当前章节'} 的语义内容识别为参数字段`;
  }

  if (request.analysisStage === 'excel-global-understanding') {
    return 'AI 生成的全局真实数据理解摘要';
  }

  return suggestionType === 'loop' ? 'AI 识别为循环块' : 'AI 识别为参数字段';
}

function getRecordString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = normalizeTextValue(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function buildFallbackChapterFromLabel(request: StructuredAnalyzeRequest): string | undefined {
  return request.analysisStage === 'excel-pair-analysis' ||
    request.analysisStage === 'word-section-analysis'
    ? request.pairLabel
    : undefined;
}

function buildDetailedFallbackDescription(
  label: string,
  suggestionType: AISuggestion['type']
): string {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return suggestionType === 'loop' ? 'AI 识别出的循环数据区域' : 'AI 识别出的业务参数';
  }
  return suggestionType === 'loop'
    ? `${normalizedLabel}对应重复记录或表格明细区域，可在渲染时按数组数据循环展开`
    : `${normalizedLabel}是当前文档中的业务参数，用于在模板渲染时填充对应位置`;
}

function buildDetailedFallbackSignificance(
  label: string,
  request: StructuredAnalyzeRequest,
  suggestionType: AISuggestion['type']
): string {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return suggestionType === 'loop'
      ? `用于 ${request.pairLabel || '当前对照组'} 的循环渲染`
      : `用于 ${request.pairLabel || '当前对照组'} 的字段渲染`;
  }
  return suggestionType === 'loop'
    ? `${normalizedLabel}用于承载重复明细、计划或节点数据，渲染时应从业务输入中提取数组并逐项展开。`
    : `${normalizedLabel}用于文档定点渲染，可从自然语言、表单输入或业务系统字段中提取并回填到模板。`;
}

function buildRuleBasedDescription(
  label: string,
  fieldType: string | undefined,
  mappingRule: string | undefined,
  remark: string | undefined,
  suggestionType: AISuggestion['type']
): string {
  const normalizedLabel = label.trim();
  if (remark) {
    return `${normalizedLabel || '该字段'}：${remark}`;
  }
  if (mappingRule) {
    return `${normalizedLabel || '该字段'}在模板中按规则映射到对应填写位置：${mappingRule}`;
  }
  if (normalizedLabel) {
    return suggestionType === 'loop'
      ? `${normalizedLabel}对应重复数据区域，需要按数组内容循环渲染`
      : `${normalizedLabel}是需要从业务输入中提取并回填到模板中的${fieldType || '业务'}字段`;
  }
  return suggestionType === 'loop' ? 'AI 识别出的循环数据区域' : 'AI 识别出的业务参数';
}

function buildRuleBasedSignificance(
  label: string,
  mappingRule: string | undefined,
  remark: string | undefined,
  validation: string | undefined,
  request: StructuredAnalyzeRequest,
  suggestionType: AISuggestion['type']
): string {
  const normalizedLabel = label.trim();
  const segments = [
    remark,
    mappingRule ? `映射规则：${mappingRule}` : undefined,
    validation ? `校验要求：${validation}` : undefined,
  ].filter(Boolean);

  if (segments.length > 0) {
    return `${normalizedLabel || '该参数'}用于模板渲染。${segments.join('；')}`;
  }

  if (!normalizedLabel) {
    return suggestionType === 'loop'
      ? `用于 ${request.pairLabel || '当前对照组'} 的循环渲染`
      : `用于 ${request.pairLabel || '当前对照组'} 的字段渲染`;
  }

  return suggestionType === 'loop'
    ? `${normalizedLabel}用于承载重复明细、计划或节点数据，渲染时应从业务输入中提取数组并逐项展开。`
    : `${normalizedLabel}用于文档定点渲染，可从自然语言、表单输入或业务系统字段中提取并回填到模板。`;
}

function buildExcelFallbackDescription(
  label: string,
  variablePath: string,
  suggestionType: AISuggestion['type']
): string {
  const normalizedLabel = label.trim();
  if (normalizedLabel) {
    return suggestionType === 'loop'
      ? `循环块 ${variablePath} 对应“${normalizedLabel}”表格，建议从自然语言或结构化输入中提取多条记录后再渲染到模板表格。`
      : `参数 ${variablePath} 对应“${normalizedLabel}”，建议在渲染前先从用户自然语言、表单或业务上下文中抽取该值。`;
  }
  return suggestionType === 'loop'
    ? `循环块 ${variablePath} 来自成对 sheet 差异，建议在渲染前从用户输入或上下文中提取数组数据。`
    : `参数 ${variablePath} 来自成对 sheet 差异，建议在渲染前从用户输入或上下文中补足该字段值。`;
}

function buildExcelFallbackSignificance(
  label: string,
  variablePath: string,
  fieldType: string,
  suggestionType: AISuggestion['type'],
  request: StructuredAnalyzeRequest
): string {
  const normalizedLabel = label.trim();
  if (suggestionType === 'loop') {
    return normalizedLabel
      ? `用于指导 AI 从自然语言中提取“${normalizedLabel}”对应的多条记录。例如用户提供多项采购明细、交付计划或付款节点时，应整理为数组 ${variablePath} 后再渲染循环块。`
      : `用于 ${request.pairLabel || '当前对照组'} 的循环渲染。应从业务输入中提取数组并逐项展开至 ${variablePath}。`;
  }

  if (normalizedLabel) {
    if (fieldType === 'date') {
      return `用于从自然语言中提取日期类参数，并将识别到的日期值赋值给 ${variablePath}。`;
    }
    if (fieldType === 'number' || fieldType === 'percent') {
      return `用于从自然语言中提取数值类参数，并将识别到的数值赋值给 ${variablePath}。`;
    }
    return `用于从自然语言或结构化输入中提取“${normalizedLabel}”的值，并赋值给 ${variablePath}。`;
  }
  return `用于从自然语言或结构化输入中提取对应值，并赋值给 ${variablePath}。`;
}

function toAsciiIdentifier(value: string): string {
  const tokens = value
    .replace(/\[\]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return '';
  }

  const [first, ...rest] = tokens;
  const normalizedFirst = first.toLowerCase();
  const normalizedRest = rest.map(
    (token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  );
  const combined = [normalizedFirst, ...normalizedRest].join('');
  return /^[A-Za-z_]/.test(combined) ? combined : `v${combined}`;
}

function inferSemanticIdentifier(label: string, suggestionType: AISuggestion['type']): string {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return suggestionType === 'loop' ? 'items' : '';
  }

  return toAsciiIdentifier(normalizedLabel);
}

function buildFallbackSuggestedNameWithArrayPath(
  label: string,
  arrayPath: string,
  index: number,
  suggestionType: AISuggestion['type']
): string {
  const sanitizedArrayPath = sanitizeArrayPath(arrayPath);
  const semanticIdentifier = inferSemanticIdentifier(label, suggestionType);

  if (suggestionType === 'loop') {
    if (sanitizedArrayPath) {
      return sanitizedArrayPath;
    }
    return semanticIdentifier ? `d.${semanticIdentifier}` : 'd.items';
  }

  const fallbackLeaf = semanticIdentifier || `value${index + 1}`;
  if (sanitizedArrayPath) {
    return `${sanitizedArrayPath}[].${fallbackLeaf}`;
  }
  return fallbackLeaf.startsWith('d.') ? fallbackLeaf : `d.${fallbackLeaf}`;
}

export function normalizeChatSuggestions(
  value: unknown,
  request: StructuredAnalyzeRequest
): AISuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const wordSectionCandidateMap = new Map(
    (request.wordSectionCandidates || []).map((candidate) => [candidate.candidateId, candidate])
  );

  return value
    .map((item, index) => {
      const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const details = (
        record.details && typeof record.details === 'object' ? record.details : {}
      ) as Record<string, unknown>;
      const suggestionType = inferSuggestionType(record, details);
      const fallbackLabel =
        getRecordString(record, ['label', 'fieldName', '字段']) ||
        normalizeTextValue(details.context) ||
        normalizeTextValue(record.originalText) ||
        '';
      const fallbackAddress = getRecordString(record, ['address', 'elementPath', '地址']);
      const fallbackFieldType = getRecordString(record, ['fieldTypeGuess', 'dataType', '字段类型']);
      const fallbackRemark = getRecordString(record, ['remark', '备注']);
      const fallbackMappingRule = getRecordString(record, ['mappingRule', '映射规则']);
      const fallbackValue = getRecordString(record, ['value', 'fieldValue', '原始值']);
      const fallbackValidation =
        record.validation && typeof record.validation === 'object'
          ? JSON.stringify(record.validation)
          : getRecordString(record, ['validation', '校验规则']);
      const rawSuggestedName = normalizeTextValue(record.suggestedName);
      const arrayPath = normalizeTextValue(details.arrayPath);

      const isAiProvidedValidSuggestedName =
        rawSuggestedName &&
        /^[a-zA-Z_][a-zA-Z0-9_[\]{}.]*$/.test(rawSuggestedName) &&
        !containsCjk(rawSuggestedName);

      let fallbackSuggestedName: string;
      if (isAiProvidedValidSuggestedName) {
        fallbackSuggestedName = rawSuggestedName.replace(/[{}]/g, '');
      } else {
        fallbackSuggestedName =
          buildFallbackSuggestedNameWithArrayPath(
            fallbackLabel,
            arrayPath || '',
            index,
            suggestionType
          ) || 'd.textValue';
      }

      const normalizedLoopArrayPath = sanitizeArrayPath(
        containsCjk(arrayPath || rawSuggestedName || '')
          ? fallbackSuggestedName
          : arrayPath || rawSuggestedName || fallbackSuggestedName || 'd.rows'
      );
      const normalizedSuggestedName =
        suggestionType === 'loop'
          ? normalizeLoopMarker(normalizedLoopArrayPath)
          : normalizeVariableMarker(
              rawSuggestedName || fallbackSuggestedName,
              fallbackSuggestedName
            );

      const normalizedVariableArrayPath = isAiProvidedValidSuggestedName
        ? extractVariableArrayPath(rawSuggestedName)
        : containsCjk(arrayPath || '')
          ? extractVariableArrayPath(fallbackSuggestedName)
          : sanitizeArrayPath(arrayPath || extractVariableArrayPath(normalizedSuggestedName));

      const variablePath =
        suggestionType === 'loop'
          ? normalizedLoopArrayPath
          : isAiProvidedValidSuggestedName
            ? rawSuggestedName.replace(/[{}]/g, '')
            : containsCjk(rawSuggestedName || '')
              ? fallbackSuggestedName.replace(/[{}]/g, '')
              : (rawSuggestedName || fallbackSuggestedName).replace(/[{}]/g, '');

      const chapter =
        normalizeTextValue(details.chapter) ||
        buildFallbackChapterFromLabel(request) ||
        (request.analysisStage === 'excel-pair-analysis' ? request.pairLabel : undefined);
      const displayPosition =
        normalizeTextValue(details.displayPosition) ||
        normalizeTextValue(record.elementPath) ||
        fallbackAddress ||
        request.pairLabel ||
        'AI 识别位置';
      const context =
        normalizeTextValue(record.context) ||
        normalizeTextValue(details.context) ||
        (fallbackLabel ? `标签=${fallbackLabel}` : undefined) ||
        request.diffSummary ||
        request.context;
      const fieldType =
        normalizeTextValue(details.fieldType) ||
        fallbackFieldType ||
        (suggestionType === 'loop' ? 'loop' : 'text');
      const candidateId =
        normalizeTextValue(details.candidateId) || normalizeTextValue(record.candidateId);
      const matchedCandidate = candidateId ? wordSectionCandidateMap.get(candidateId) : undefined;
      const sampleValue =
        normalizeTextValue(details.sampleValue) ||
        getRecordString(record, ['sampleValue', 'sample', '示例值', '样本值']) ||
        normalizeTextValue(matchedCandidate?.sampleValue);

      return {
        id: String(record.id || `chat-suggestion-${index}`),
        type: suggestionType,
        elementPath: normalizeTextValue(record.elementPath) || fallbackAddress || displayPosition,
        suggestedName: normalizedSuggestedName,
        originalText:
          normalizeTextValue(record.originalText) ||
          fallbackValue ||
          (suggestionType === 'loop' ? arrayPath || 'd.rows' : ''),
        confidence: clampConfidence(record.confidence),
        applied: Boolean(record.applied ?? false),
        context,
        details: {
          source: 'ai',
          description:
            normalizeTextValue(details.description) ||
            (request.host === 'excel'
              ? buildExcelFallbackDescription(fallbackLabel, variablePath, suggestionType)
              : buildDetailedFallbackDescription(fallbackLabel, suggestionType)) ||
            buildRuleBasedDescription(
              fallbackLabel,
              fieldType,
              fallbackMappingRule,
              fallbackRemark,
              suggestionType
            ) ||
            buildDefaultDescription(request, suggestionType),
          formatter: normalizeTextValue(details.formatter),
          loopType: details.loopType === 'implicit' ? 'implicit' : 'explicit',
          arrayPath:
            suggestionType === 'loop' ? normalizedLoopArrayPath : normalizedVariableArrayPath,
          tableName: normalizeTextValue(details.tableName),
          context,
          chapter,
          significance:
            normalizeTextValue(details.significance) ||
            (request.host === 'excel'
              ? buildExcelFallbackSignificance(
                  fallbackLabel,
                  variablePath,
                  fieldType,
                  suggestionType,
                  request
                )
              : buildDetailedFallbackSignificance(fallbackLabel, request, suggestionType)) ||
            buildRuleBasedSignificance(
              fallbackLabel,
              fallbackMappingRule,
              fallbackRemark,
              fallbackValidation,
              request,
              suggestionType
            ) ||
            (request.analysisStage === 'excel-pair-analysis'
              ? `来自 ${request.pairLabel || '当前对照组'} 的 AI 分析结果`
              : '来自 AI 的分析结果'),
          sampleValue,
          displayPosition,
          beforeBlank: normalizeTextValue(details.beforeBlank),
          afterBlank: normalizeTextValue(details.afterBlank),
          fieldType,
          candidateId,
        },
      } satisfies AISuggestion;
    })
    .filter(
      (suggestion) => suggestion.suggestedName || suggestion.originalText || suggestion.elementPath
    );
}
