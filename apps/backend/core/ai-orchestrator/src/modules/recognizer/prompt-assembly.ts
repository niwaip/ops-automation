import { createHash } from 'crypto';
import { DocumentGuideContext, RecognizeParamsDTO } from '../../interfaces';
import { PromptAssembly } from '../../client/llm-client';

export interface PromptAssemblyProperty {
  type: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  extractionPrompt?: string;
  semanticRole?: string;
  extractionHints?: string[];
}

const DEFAULT_GUIDE_BUDGET = {
  maxGuideChars: 2000,
  maxExampleChars: 1200,
};

export function buildPromptAssembly(params: {
  templateName: string;
  properties: Record<string, PromptAssemblyProperty>;
  dto: RecognizeParamsDTO;
  guideContext?: DocumentGuideContext;
  normalizePromptDefaultValue: (value: unknown) => unknown;
}): PromptAssembly {
  const staticSystem = buildStaticContractSection();
  const skillContext = buildSkillKnowledgeSection(
    params.templateName,
    params.properties,
    params.guideContext,
    params.normalizePromptDefaultValue,
  );
  const dynamicUser = buildDynamicUserContextSection(params.dto, params.guideContext);

  return {
    staticSystem,
    skillContext,
    dynamicUser,
    promptCacheKey: buildPromptCacheKey(params.templateName, params.properties, params.guideContext),
  };
}

function buildStaticContractSection(): string {
  return [
    '你是一个参数提取助手。',
    '任务：根据用户输入提取 JSON 参数。',
    '规则：只提取当前输入中明确提供、或能从当前输入直接定位依据的值。',
    '禁止根据常见业务惯例、行业默认值、模板示例、历史经验或通常应该如此来脑补任何参数。',
    '如果缺少依据，请省略该字段，不要猜。',
    '返回 JSON，格式包含 params、confidence、field_confidences、uncertain_fields。',
  ].join('\n');
}

function buildSkillKnowledgeSection(
  templateName: string,
  properties: Record<string, PromptAssemblyProperty>,
  guideContext: DocumentGuideContext | undefined,
  normalizePromptDefaultValue: (value: unknown) => unknown,
): string {
  const entries = Object.entries(properties);
  const requiredEntries = entries.filter(([, schema]) => schema.required === true);
  const optionalEntries = entries.filter(([, schema]) => schema.required !== true);
  const isDocumentGuide = guideContext?.mode === 'document_skill';
  const guideSections = isDocumentGuide
    ? [
        guideContext?.templateOverview ? `文档概述：\n${guideContext.templateOverview}` : undefined,
        guideContext?.paramCollectionGuidance ? `参数识别指导：\n${guideContext.paramCollectionGuidance}` : undefined,
        guideContext?.guideMarkdown
          ? `模板指南摘要：\n${truncateText(guideContext.guideMarkdown, DEFAULT_GUIDE_BUDGET.maxGuideChars, '\n...（模板指南已截断，以上为关键部分）')}`
          : undefined,
        guideContext?.validationRules ? `校验规则：\n${guideContext.validationRules}` : undefined,
        Array.isArray(guideContext?.extractionHints) && guideContext.extractionHints.length > 0
          ? `补充提示：\n${guideContext.extractionHints.map((item) => `- ${item}`).join('\n')}`
          : undefined,
        guideContext?.outputExample
          ? `示例 JSON（仅帮助理解业务结构）：\n${truncateText(JSON.stringify(guideContext.outputExample, null, 2), DEFAULT_GUIDE_BUDGET.maxExampleChars, '\n...（示例已截断）')}`
          : undefined,
      ].filter(Boolean).join('\n\n')
    : '';

  const arrayOutputRule = Object.keys(properties).some((name) => name.includes('[]'))
    ? '对于数组字段，请按字段路径返回数组值，并保持同一行的数组索引顺序一致；如果只提供一组信息，也必须返回单元素数组。'
    : undefined;

  return [
    `模版：${templateName}`,
    requiredEntries.length > 0
      ? `【必须提取】（没有依据则留空，不要猜）\n${requiredEntries.map(([name, schema]) => formatParamLine(name, schema, normalizePromptDefaultValue)).join('\n')}`
      : undefined,
    optionalEntries.length > 0
      ? `【按需提取】（有则提取，无则省略）\n${optionalEntries.map(([name, schema]) => formatParamLine(name, schema, normalizePromptDefaultValue)).join('\n')}`
      : undefined,
    guideSections || undefined,
    arrayOutputRule,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildDynamicUserContextSection(
  dto: RecognizeParamsDTO,
  guideContext?: DocumentGuideContext,
): string {
  const sections: string[] = [];
  const context = dto.context && typeof dto.context === 'object'
    ? dto.context as Record<string, unknown>
    : undefined;

  if (context?.mode === 'waiting_input_resume') {
    sections.push('[本轮模式]\n补充缺失参数');
    if (typeof context.original_objective === 'string' && context.original_objective.trim()) {
      sections.push(`[原始任务]\n${context.original_objective.trim()}`);
    }
    const missing = Array.isArray(context.missing_inputs)
      ? context.missing_inputs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    if (missing.length > 0) {
      sections.push(`[当前仍缺失字段]\n${missing.join('、')}`);
    }
    const collected = serializeCollectedContext(context.already_collected);
    if (collected) {
      sections.push(`[已确认参数]\n${collected}`);
    }
  } else if (context) {
    const lines = Object.entries(context)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}: ${formatContextValue(value)}`);
    if (lines.length > 0) {
      sections.push(`[补充上下文]\n${lines.join('\n')}`);
    }
  }

  sections.push(`[本轮用户输入]\n${dto.user_input}`);
  if (guideContext?.mode === 'document_skill') {
    sections.push('注意：如果是文档模板，请结合文档概述、参数用途和示例结构理解业务语义，但最终返回仍必须使用扁平字段键名。');
  }
  return sections.join('\n\n');
}

function formatParamLine(
  name: string,
  schema: PromptAssemblyProperty,
  normalizePromptDefaultValue: (value: unknown) => unknown,
): string {
  const normalizedDefaultValue = normalizePromptDefaultValue(schema.default);
  const defaultStr = normalizedDefaultValue !== undefined ? ` (默认值: ${normalizedDefaultValue})` : '';
  const hintStr = schema.extractionPrompt ? `；提取提示：${schema.extractionPrompt}` : '';
  const semanticRoleStr = schema.semanticRole ? `；语义角色：${schema.semanticRole}` : '';
  const semanticHintsStr = Array.isArray(schema.extractionHints) && schema.extractionHints.length > 0
    ? `；语义提示：${schema.extractionHints.join('、')}`
    : '';
  return `- ${name}: ${schema.type}${schema.description ? ` - ${schema.description}` : ''}${defaultStr}${hintStr}${semanticRoleStr}${semanticHintsStr}`;
}

function truncateText(value: string, maxChars: number, suffix: string): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}${suffix}` : value;
}

function buildPromptCacheKey(
  templateName: string,
  properties: Record<string, PromptAssemblyProperty>,
  guideContext?: DocumentGuideContext,
): string {
  const seed = JSON.stringify({
    templateName,
    properties,
    guideContext: guideContext
      ? {
          templateOverview: guideContext.templateOverview,
          paramCollectionGuidance: guideContext.paramCollectionGuidance,
          validationRules: guideContext.validationRules,
          extractionHints: guideContext.extractionHints,
          sourceTemplate: guideContext.sourceTemplate,
        }
      : undefined,
  });
  return `recognizer:${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function serializeCollectedContext(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  const lines = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined && item !== null && item !== '')
    .slice(0, 20)
    .map(([key, item]) => `${key} = ${formatContextValue(item)}`);
  return lines.join('\n');
}

function formatContextValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}
