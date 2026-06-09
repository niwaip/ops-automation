import type { DocumentGuideContext } from '../interfaces';
import type {
  ParamsSchema,
  SkillRuntimeMetadata,
} from '../modules/react-engine/interfaces';

type BuildDocumentGuideInput = {
  enabled?: boolean;
  skillName?: string;
  description?: string;
  goal?: string;
  expectedResult?: string;
  outputParams?: Record<string, unknown>;
  paramsSchema?: ParamsSchema;
  runtimeMetadata?: SkillRuntimeMetadata;
};

const readText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const summarizeSchema = (paramsSchema?: ParamsSchema, limit = 18): string[] => {
  return Object.entries(paramsSchema?.properties || {})
    .slice(0, limit)
    .map(([name, schema]) => {
      const description = readText(schema?.description);
      const type = readText(schema?.type) || 'string';
      return description
        ? `- ${name} [${type}]：${description}`
        : `- ${name} [${type}]`;
    });
};

const summarizeHints = (
  runtimeMetadata?: SkillRuntimeMetadata,
  limit = 12,
): string[] => {
  const hints: string[] = [];
  const mappingHints = Array.isArray(runtimeMetadata?.mappingHints)
    ? runtimeMetadata?.mappingHints
    : [];
  const extractionRules = Array.isArray(runtimeMetadata?.extractionRules)
    ? runtimeMetadata?.extractionRules
    : [];

  mappingHints.slice(0, limit).forEach((item) => {
    const record = item as Record<string, unknown>;
    const parameter = readText(record.parameter);
    const description = readText(record.description);
    const example = readText(record.example);
    if (!parameter) {
      return;
    }
    const suffix = [
      description ? `说明：${description}` : undefined,
      example ? `示例：${example}` : undefined,
    ].filter(Boolean).join('；');
    hints.push(suffix ? `${parameter} -> ${suffix}` : parameter);
  });

  extractionRules.slice(0, Math.max(0, limit - hints.length)).forEach((item) => {
    const record = item as Record<string, unknown>;
    const parameter = readText(record.parameter);
    const fallbackStrategy = readText(record.fallbackStrategy);
    if (!parameter) {
      return;
    }
    hints.push(
      fallbackStrategy
        ? `${parameter} -> 缺失时：${fallbackStrategy}`
        : parameter,
    );
  });

  return hints;
};

export const buildDocumentGuideContext = (
  input: BuildDocumentGuideInput,
): DocumentGuideContext | undefined => {
  if (input.enabled === false) {
    return undefined;
  }
  const runtimeMetadata = input.runtimeMetadata;
  const guideMarkdown = readText(runtimeMetadata?.skillGuideMarkdown);
  const paramCollectionGuidance = readText(runtimeMetadata?.paramCollectionGuidance);
  const validationRules = readText(runtimeMetadata?.validationRules);
  const outputExample = parseRecord(runtimeMetadata?.dataExampleJson) || input.outputParams;

  const overviewParts = [
    readText(runtimeMetadata?.matchSummary),
    readText(input.description),
    readText(input.goal),
    readText(input.expectedResult),
    (() => {
      const source = runtimeMetadata?.sourceTemplate;
      const fileName = readText(source?.fileName);
      const templateId = readText(source?.templateId);
      const variableCount = source?.variableCount;
      const segments = [
        fileName ? `模板文件：${fileName}` : undefined,
        templateId ? `模板ID：${templateId}` : undefined,
        typeof variableCount === 'number' ? `参数数：${variableCount}` : undefined,
      ].filter(Boolean);
      return segments.length > 0 ? segments.join('，') : undefined;
    })(),
  ].filter(Boolean) as string[];

  const schemaSummary = summarizeSchema(input.paramsSchema);
  const extractionHints = summarizeHints(runtimeMetadata);
  const synthesizedGuide = schemaSummary.length > 0
    ? [
        '请优先依据字段用途、业务分组和示例结构识别参数，再输出当前步骤要求的扁平字段键名。',
        '参数概览：',
        ...schemaSummary,
      ].join('\n')
    : undefined;

  if (
    overviewParts.length === 0
    && !guideMarkdown
    && !paramCollectionGuidance
    && !validationRules
    && !outputExample
    && !synthesizedGuide
    && extractionHints.length === 0
  ) {
    return undefined;
  }

  return {
    mode: 'document_skill',
    templateOverview: overviewParts.join('\n'),
    guideMarkdown,
    paramCollectionGuidance: paramCollectionGuidance || synthesizedGuide,
    validationRules,
    outputExample,
    extractionHints,
    sourceTemplate: runtimeMetadata?.sourceTemplate,
  };
};
