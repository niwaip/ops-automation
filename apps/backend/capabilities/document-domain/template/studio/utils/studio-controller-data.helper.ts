import type { TemplateResponse } from '../studio.types';

type TemplateInfoLike = {
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
};

type SampleDataEngine = {
  generateSampleDataFromConfig: (
    config: Record<string, any>,
    rows: number,
    includeExamples: boolean
  ) => Record<string, any>;
  generateSampleData: (templateInfo: TemplateInfoLike, rows: number) => Record<string, any>;
};

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePathSegments(pathValue: string): Array<string | number> {
  const segments: Array<string | number> = [];
  const matches = pathValue.match(/[^.[\]]+|\[(\d+)\]/g) || [];

  for (const match of matches) {
    if (match.startsWith('[') && match.endsWith(']')) {
      segments.push(Number(match.slice(1, -1)));
    } else {
      segments.push(match);
    }
  }

  return segments;
}

function mergeObjects(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeObjects(target[key], value);
    } else {
      target[key] = value;
    }
  }

  return target;
}

function setNestedValue(target: Record<string, any>, pathValue: string, value: unknown): void {
  const segments = parsePathSegments(pathValue);
  if (segments.length === 0) {
    return;
  }

  let current: any = target;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;
    const nextSegment = segments[i + 1];

    if (isLast) {
      if (typeof segment === 'number') {
        if (!Array.isArray(current)) {
          return;
        }
        current[segment] = value;
      } else {
        current[segment] = value;
      }
      return;
    }

    const containerShouldBeArray = typeof nextSegment === 'number';
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        return;
      }
      if (current[segment] === undefined) {
        current[segment] = containerShouldBeArray ? [] : {};
      }
      current = current[segment];
    } else {
      if (current[segment] === undefined) {
        current[segment] = containerShouldBeArray ? [] : {};
      }
      current = current[segment];
    }
  }
}

function normalizeRenderValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (isPlainObject(item) ? normalizeStudioRenderData(item) : item));
  }
  if (isPlainObject(value)) {
    return normalizeStudioRenderData(value);
  }
  return value;
}

function getPreviewSeedDataFromSkill(skill: any): Record<string, any> | null {
  const raw = skill?.dataExampleJson;
  if (!raw) {
    return null;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isPlainObject(raw) ? raw : null;
}

function countDeclaredVariables(meta: TemplateResponse): number {
  return Array.isArray(meta.variables) ? meta.variables.length : 0;
}

function hasUsableTemplateConfig(config: Record<string, any>): boolean {
  return (
    Array.isArray(config.variableMappings) ||
    Array.isArray(config.tableLoops) ||
    Array.isArray(config.combinedVariables) ||
    Array.isArray(config.mappings)
  );
}

export function normalizeStudioRenderData(data: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  const arrayGroups = new Map<string, Record<string, unknown>>();

  for (const [key, value] of Object.entries(data || {})) {
    if (key === 'd' && isPlainObject(value)) {
      mergeObjects(normalized, normalizeStudioRenderData(value));
      continue;
    }

    if (key.includes('[]')) {
      const [rawPrefix, rawSuffix] = key.split('[]', 2);
      const prefix = rawPrefix.replace(/\.$/, '').trim();
      const suffix = String(rawSuffix || '')
        .replace(/^\./, '')
        .trim();
      if (prefix && suffix) {
        const entry = arrayGroups.get(prefix) || {};
        entry[suffix] = normalizeRenderValue(value);
        arrayGroups.set(prefix, entry);
        continue;
      }
    }

    if (key.includes('.')) {
      normalized[key] = normalizeRenderValue(value);
      continue;
    }

    if (isPlainObject(value)) {
      const existing = normalized[key];
      if (isPlainObject(existing)) {
        mergeObjects(existing, normalizeStudioRenderData(value));
      } else {
        normalized[key] = normalizeStudioRenderData(value);
      }
      continue;
    }

    normalized[key] = value;
  }

  for (const [prefix, fields] of arrayGroups.entries()) {
    const fieldEntries = Object.entries(fields);
    if (fieldEntries.length === 0) {
      continue;
    }

    const maxLen = fieldEntries.reduce((acc, [, raw]) => {
      if (Array.isArray(raw)) {
        return Math.max(acc, raw.length);
      }
      return Math.max(acc, 1);
    }, 0);

    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < maxLen; i += 1) {
      const row: Record<string, unknown> = {};
      for (const [fieldPath, raw] of fieldEntries) {
        const valueAtIndex = Array.isArray(raw) ? raw[i] : i === 0 ? raw : undefined;
        if (valueAtIndex === undefined) {
          continue;
        }
        row[fieldPath] = valueAtIndex;
      }
      rows.push(row);
    }

    normalized[prefix] = rows;
  }

  return normalized;
}

export function hasNonEmptyStudioSampleData(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length > 0;
}

export function buildHydratedStudioSkillSampleData(skill: any): Record<string, any> | null {
  const seedData = getPreviewSeedDataFromSkill(skill);
  const generatedData = generateStudioSimulatedData(skill);

  if (seedData && hasNonEmptyStudioSampleData(generatedData)) {
    const merged = normalizeStudioRenderData(JSON.parse(JSON.stringify(seedData)));
    mergeObjects(merged, generatedData);
    return merged;
  }

  if (seedData) {
    return normalizeStudioRenderData(seedData);
  }

  return hasNonEmptyStudioSampleData(generatedData) ? generatedData : null;
}

export function extractStudioLoopsFromMeta(
  meta: Record<string, any>
): Array<{ arrayPath: string }> {
  const seen = new Set<string>();
  const loops: Array<{ arrayPath: string }> = [];
  const addLoop = (arrayPath: unknown) => {
    if (typeof arrayPath !== 'string') {
      return;
    }
    const normalized = arrayPath.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    loops.push({ arrayPath: normalized });
  };

  const configs = [meta.templateConfig, meta.config];
  for (const config of configs) {
    if (!isPlainObject(config)) {
      continue;
    }

    if (Array.isArray(config.tableLoops)) {
      for (const loop of config.tableLoops) {
        if (isPlainObject(loop)) {
          addLoop(loop.arrayPath);
        }
      }
    }

    if (Array.isArray(config.loops)) {
      for (const loop of config.loops) {
        if (typeof loop === 'string') {
          addLoop(loop);
        } else if (isPlainObject(loop)) {
          addLoop(loop.arrayPath);
        }
      }
    }
  }

  if (Array.isArray(meta.suggestions)) {
    for (const suggestion of meta.suggestions) {
      if (!isPlainObject(suggestion) || suggestion.type !== 'loop') {
        continue;
      }
      if (isPlainObject(suggestion.details)) {
        addLoop(suggestion.details.arrayPath);
      }
    }
  }

  return loops;
}

export async function generateStudioTemplateSampleData(input: {
  meta: TemplateResponse;
  templateInfo: TemplateInfoLike;
  config: Record<string, any>;
  rowCount: number;
  engine: SampleDataEngine;
  getSkillWithDbFallback: (id: string) => Promise<Record<string, unknown> | null>;
}): Promise<Record<string, any>> {
  const { meta, templateInfo, config, rowCount, engine, getSkillWithDbFallback } = input;

  if (config && Object.keys(config).length > 0 && hasUsableTemplateConfig(config)) {
    return engine.generateSampleDataFromConfig(
      config,
      config.tableLoops?.[0]?.dataRowCount || rowCount,
      true
    );
  }

  const parsedSampleData = engine.generateSampleData(templateInfo, rowCount);
  const parsedVariableCount = Array.isArray(templateInfo.variables)
    ? templateInfo.variables.length
    : 0;
  const declaredVariableCount = countDeclaredVariables(meta);
  const hasComparableCoverage =
    declaredVariableCount === 0 || parsedVariableCount >= declaredVariableCount;

  if (hasNonEmptyStudioSampleData(parsedSampleData) && hasComparableCoverage) {
    return parsedSampleData;
  }

  if (typeof meta.skillId === 'string') {
    const skill = await getSkillWithDbFallback(meta.skillId);
    if (skill) {
      const seedData = buildHydratedStudioSkillSampleData(skill);
      if (seedData) {
        return seedData;
      }

      const simulatedData = generateStudioSimulatedData(skill);
      if (hasNonEmptyStudioSampleData(simulatedData)) {
        return simulatedData;
      }
    }
  }

  return parsedSampleData;
}

export function generateStudioExampleValue(fieldType: string, name: string): string {
  const normalizedName = String(name || '')
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .replace(/^d\./, '')
    .toLowerCase();

  const exactPatterns: Array<[RegExp, string]> = [
    [/(^|\.)(seq|serialno|serialnumber|lineno)$/, '1'],
    [/(^|\.)(materialcode|itemcode|productcode|sku|code)$/, 'RB-6A-001'],
    [/(^|\.)(devicename|productname|itemname|goodsname)$/, '工业机器人'],
    [/(^|\.)(model|spec|specification)$/, 'XR-600'],
    [/(^|\.)(unit)$/, '台'],
    [/(^|\.)(quantity|qty|count|num)$/, '4'],
    [/(^|\.)(unitprice|price)$/, '185,000.00'],
    [/(^|\.)(subtotal|amount|total)$/, '740,000.00'],
    [/(^|\.)(contractno|contractnumber)$/, 'PC-2026-001'],
    [/(^|\.)(projectname)$/, '智能制造产线升级项目'],
  ];

  for (const [pattern, value] of exactPatterns) {
    if (pattern.test(normalizedName)) {
      return value;
    }
  }

  switch (fieldType) {
    case 'date':
      return '2026-05-10';
    case 'amount':
    case 'number':
      return fieldType === 'number' ? '4' : '740,000.00';
    case 'phone':
      return '13800138000';
    case 'email':
      return 'procurement@example.com';
    case 'address':
      return '北京市朝阳区望京东路 1 号';
    case 'name':
      return '北京智造科技有限公司';
    default:
      if (name.includes('金额') || name.includes('价格')) return '740,000.00';
      if (name.includes('日期') || name.includes('时间')) return '2026-05-10';
      if (name.includes('电话') || name.includes('手机')) return '13800138000';
      if (name.includes('地址')) return '北京市朝阳区望京东路 1 号';
      if (name.includes('名称') || name.includes('姓名')) return '北京智造科技有限公司';
      return `示例${name}`;
  }
}

export function generateStudioAIInstructions(
  templateType: string,
  variables: any[],
  description?: string
): string {
  const varList = variables
    .map((variable) => `- **${variable.name}**: ${variable.aiHint || variable.meaning || '填写对应值'}`)
    .join('\n');
  const exampleData = variables
    .slice(0, 5)
    .map((variable) => `  "${variable.name}": "${variable.example}"`)
    .join(',\n');

  return `# ${templateType}模板AI使用指南

## 模板概述
${description || '这是一个模板，用于生成标准化文档。'}

## 变量列表
${varList}

## 数据处理规则
1. **日期格式**: 使用 YYYY年MM月DD日 格式
2. **金额格式**: 保留两位小数，使用千分位分隔
3. **文本内容**: 直接填充，无需特殊处理

## AI处理流程
1. 接收用户提供的原始数据
2. 根据字段映射规则解析数据
3. 按格式要求处理特殊字段（日期、金额等）
4. 使用处理后的数据渲染模板
5. 输出最终文档供用户下载

## 示例数据结构
{ "d": {
${exampleData}
} }
`;
}

export function coerceStudioSkillExampleValue(
  rawValue: unknown,
  fieldType?: string
): unknown {
  const normalizedType = String(fieldType || '').toLowerCase();
  if (rawValue === null || rawValue === undefined) {
    return rawValue;
  }

  if (normalizedType === 'boolean') {
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }
    const normalized = String(rawValue).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', '是'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', '否'].includes(normalized)) {
      return false;
    }
    return Boolean(rawValue);
  }

  if (normalizedType === 'number' || normalizedType === 'amount') {
    if (typeof rawValue === 'number') {
      return rawValue;
    }
    const normalized = String(rawValue).replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : rawValue;
  }

  if (normalizedType === 'date') {
    if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
      return rawValue.toISOString().slice(0, 10);
    }
    const normalized = String(rawValue).trim();
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString().slice(0, 10);
  }

  return rawValue;
}

export function generateStudioSimulatedData(skill: any): any {
  const data: any = {};
  const variables = skill.parameters || skill.parameterization?.variables || [];

  for (const variable of variables) {
    const rawExampleValue =
      variable.example ??
      generateStudioExampleValue(variable.dataType || variable.fieldType, variable.name);
    const exampleValue = coerceStudioSkillExampleValue(
      rawExampleValue,
      variable.dataType || variable.fieldType
    );

    let varPath = variable.name;
    varPath = varPath.replace(/^\{/, '').replace(/\}$/, '');
    varPath = varPath.replace(/^([cdt])\./, '');
    varPath = varPath.replace(/\[\]/g, '[0]');

    if (varPath && (varPath.includes('.') || varPath.includes('['))) {
      setNestedValue(data, varPath, exampleValue);
    } else {
      data[varPath || variable.name] = exampleValue;
    }
  }

  return data;
}
