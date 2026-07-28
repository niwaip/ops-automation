import { createHash } from 'crypto';
import { DocumentGuideContext, RecognizeParamsDTO } from '../../interfaces';
import { PromptAssembly } from '../../client/llm-client';

export interface PromptAssemblyProperty {
  type: string;
  description?: string;
  displayName?: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: Array<string | number>;
  exampleValue?: unknown;
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
    params.normalizePromptDefaultValue
  );
  const dynamicUser = buildDynamicUserContextSection(params.dto, params.guideContext);

  return {
    staticSystem,
    skillContext,
    dynamicUser,
    promptCacheKey: buildPromptCacheKey(
      params.templateName,
      params.properties,
      params.guideContext
    ),
  };
}

function buildStaticContractSection(): string {
  return [
    '你是一个智能工作流参数提取助手。',
    '任务：结合已识别工作流的输入参数定义（含字段路径、名称、类型、描述、显示名、枚举值与提取提示），对用户自然语言输入进行深度语义分析并提取 JSON 参数。',
    '【提取与转换规则】：',
    '1. 语义提取与同义词映射：根据参数定义的 description、displayName、enum 和 extractionPrompt，自动识别用户输入中的同义词、中英文转换、简称或缩写（例如：用户输入 "weibo" 或 "微博" 映射至平台字段；"10条" 或 "前10" 解析为数量/条数字段 10）。',
    '2. 类型转换与规范化：根据参数定义的 type (如 number, date, string, boolean)，将自然语言表述转换为对应标准数据类型（例如 "10条" 提取为数字 10；日期表述转化为标准日期；枚举表述转化为对应 Schema 枚举 Key）。',
    '3. 依据要求：只提取在用户输入或上下文中具有明确语义依据的参数。禁止根据常见业务惯例、行业默认值、模板示例、历史经验或通常应该如此来脑补任何参数。缺少依据的字段直接省略，不要猜测或伪造无关的默认占位符。不要为了让任务继续执行而伪造占位值（如（待补充）、N/A、TBD、0、空数组）。',
    '4. 缺失字段处理：如果用户要求“直接生成”“端对端”“不要追问”，但当前输入仍缺少关键字段，仍然只返回已确认字段；缺失字段交由后续多轮问询补齐。抽取英文或混合语言句子时，只保留字段本身的值，不要把 is、are、in bilingual layout、contract、please generate 等说明性残句带入字段值。',
    '5. 输出格式：返回纯 JSON 对象，顶层只保留本轮新识别或被用户明确修正的参数键值。不要输出 params、confidence、field_confidences、uncertain_fields、notes、explanation。如果本轮没有任何新增或更正的参数，返回空对象 {}。',

  ].join('\n');
}



function buildSkillKnowledgeSection(
  templateName: string,
  properties: Record<string, PromptAssemblyProperty>,
  guideContext: DocumentGuideContext | undefined,
  normalizePromptDefaultValue: (value: unknown) => unknown
): string {
  const entries = Object.entries(properties);
  const requiredEntries = entries.filter(([, schema]) => schema.required === true);
  const optionalEntries = entries.filter(([, schema]) => schema.required !== true);
  const isDocumentGuide = guideContext?.mode === 'document_skill';
  const guideSections = isDocumentGuide
    ? [
        guideContext?.templateOverview ? `文档概述：\n${guideContext.templateOverview}` : undefined,
        guideContext?.paramCollectionGuidance
          ? `参数识别指导：\n${guideContext.paramCollectionGuidance}`
          : undefined,
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
      ]
        .filter(Boolean)
        .join('\n\n')
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
  guideContext?: DocumentGuideContext
): string {
  const sections: string[] = [];
  const context =
    dto.context && typeof dto.context === 'object'
      ? (dto.context as Record<string, unknown>)
      : undefined;

  if (context?.mode === 'waiting_input_resume') {
    sections.push('[本轮模式]\n补充缺失参数');
    if (typeof context.original_objective === 'string' && context.original_objective.trim()) {
      sections.push(`[原始任务]\n${context.original_objective.trim()}`);
    }
    const missing = Array.isArray(context.missing_inputs)
      ? context.missing_inputs.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : [];
    if (missing.length > 0) {
      sections.push(`[当前仍缺失字段]\n${missing.join('、')}`);
    }
    const collected = serializeCollectedContext(context.already_collected);
    if (collected) {
      sections.push(`[已确认参数]\n${collected}`);
    }
    sections.push(
      [
        '[本轮输出要求]',
        '优先只返回当前仍缺失字段在本轮用户输入中新增确认的值。',
        '不要重复返回已确认参数；如果用户本轮明确纠正了已确认参数，可以返回该字段以覆盖旧值。',
        '最终只返回字段键值 JSON，不要附加解释。',
      ].join('\n')
    );
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
    sections.push(
      [
        '注意：如果是文档模板，请结合文档概述、参数用途和示例结构理解业务语义，但最终返回仍必须使用扁平字段键名。',
        '注意：禁止把 Carbone 模板变量语法（如 {d.xxx}、{#...}、{/...}）写进 JSON key；key 必须与 paramsSchema 中的字段路径完全一致，且不应包含 { 或 }。',
        '注意：如果关键字段缺失、只有低置信度候选值、或数组行信息不完整，请不要硬补占位值；只返回当前可确认字段，让系统在下一轮继续追问。',
      ].join('\n')
    );
  }
  return sections.join('\n\n');
}

function formatParamLine(
  name: string,
  schema: PromptAssemblyProperty,
  normalizePromptDefaultValue: (value: unknown) => unknown
): string {
  const displayNameStr = schema.displayName ? ` [${schema.displayName}]` : '';
  const normalizedDefaultValue = normalizePromptDefaultValue(schema.default);
  const defaultStr =
    normalizedDefaultValue !== undefined ? ` (默认值: ${normalizedDefaultValue})` : '';
  const enumStr =
    Array.isArray(schema.enum) && schema.enum.length > 0
      ? ` (可选枚举值: ${schema.enum.join('、')})`
      : '';
  const hintStr = schema.extractionPrompt ? `；提取提示：${schema.extractionPrompt}` : '';
  const semanticRoleStr = schema.semanticRole ? `；语义角色：${schema.semanticRole}` : '';
  const semanticHintsStr =
    Array.isArray(schema.extractionHints) && schema.extractionHints.length > 0
      ? `；语义提示：${schema.extractionHints.join('、')}`
      : '';
  const exampleStr =
    schema.exampleValue !== undefined
      ? `；示例: ${JSON.stringify(schema.exampleValue)}`
      : '';
  return `- ${name}${displayNameStr}: ${schema.type}${schema.description ? ` - ${schema.description}` : ''}${defaultStr}${enumStr}${exampleStr}${hintStr}${semanticRoleStr}${semanticHintsStr}`;
}


function truncateText(value: string, maxChars: number, suffix: string): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}${suffix}` : value;
}

function buildPromptCacheKey(
  templateName: string,
  properties: Record<string, PromptAssemblyProperty>,
  guideContext?: DocumentGuideContext
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
