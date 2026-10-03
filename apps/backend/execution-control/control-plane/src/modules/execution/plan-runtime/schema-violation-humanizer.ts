/**
 * Generic schema violation humanizer.
 * Derives human-friendly error messages entirely from JSON Schema standard metadata
 * (title, description, type, enum, etc.) and Ajv validation keywords.
 * Contains ZERO domain-specific hardcoded property names.
 */

export interface SchemaViolationErrorItem {
  path: string;
  message: string;
  keyword?: string;
  params?: Record<string, unknown>;
}

export interface SchemaViolationItem {
  field: string;
  fieldLabel: string;
  description?: string;
  message: string;
  keyword?: string;
}

export interface FormatSchemaViolationOptions {
  errors: SchemaViolationErrorItem[];
  schema?: Record<string, any>;
  step?: {
    id?: string;
    name?: string;
    planNodeId?: string;
    title?: string;
    capabilityId?: string;
  };
  kind: 'input' | 'output';
}

export interface FormatSchemaViolationResult {
  technicalMessage: string;
  friendlyMessage: string;
  violations: SchemaViolationItem[];
}

function resolvePropertyMetadata(
  schema: Record<string, any> | undefined,
  fieldPath: string,
  keyword?: string,
  params?: Record<string, unknown>
): { field: string; title?: string; description?: string } {
  let field = '';
  if (keyword === 'required' && typeof params?.missingProperty === 'string') {
    field = params.missingProperty;
  } else if (keyword === 'additionalProperties' && typeof params?.additionalProperty === 'string') {
    field = params.additionalProperty;
  } else {
    const segments = fieldPath.split('/').filter(Boolean);
    field = segments[segments.length - 1] || '';
  }

  if (!schema || typeof schema !== 'object') {
    return { field };
  }

  // Lookup in schema.properties
  const propDef = schema.properties?.[field];
  if (propDef && typeof propDef === 'object') {
    return {
      field,
      title:
        typeof propDef.title === 'string' && propDef.title.trim()
          ? propDef.title.trim()
          : undefined,
      description:
        typeof propDef.description === 'string' && propDef.description.trim()
          ? propDef.description.trim()
          : undefined,
    };
  }

  return { field };
}

function getDisplayLabel(field: string, title?: string): string {
  if (!field && !title) return '未命名参数';
  if (title && field && title !== field) {
    return `${title} (${field})`;
  }
  return title || field;
}

function buildFriendlyViolationMessage(
  keyword: string | undefined,
  displayLabel: string,
  params: Record<string, unknown> | undefined,
  rawMessage: string,
  description?: string
): string {
  const descSuffix = description ? `（说明：${description}）` : '';

  switch (keyword) {
    case 'required':
      return `缺少必填参数【${displayLabel}】${descSuffix}`;
    case 'type': {
      const expectedType = params?.type ? String(params.type) : '指定类型';
      return `参数【${displayLabel}】类型不符，期望为 ${expectedType}`;
    }
    case 'enum': {
      const allowed = Array.isArray(params?.allowedValues)
        ? params.allowedValues.map((v) => JSON.stringify(v)).join(', ')
        : '';
      return `参数【${displayLabel}】取值无效${allowed ? `，有效可选值为: ${allowed}` : ''}`;
    }
    case 'format': {
      const expectedFormat = params?.format ? String(params.format) : '指定格式';
      return `参数【${displayLabel}】格式不符（要求格式：${expectedFormat}）`;
    }
    case 'minimum': {
      const limit = params?.limit !== undefined ? String(params.limit) : '';
      return `参数【${displayLabel}】数值过小，最小值为 ${limit}`;
    }
    case 'maximum': {
      const limit = params?.limit !== undefined ? String(params.limit) : '';
      return `参数【${displayLabel}】数值过大，最大值为 ${limit}`;
    }
    case 'minLength': {
      const limit = params?.limit !== undefined ? String(params.limit) : '';
      return `参数【${displayLabel}】长度不足，最小长度为 ${limit}`;
    }
    case 'maxLength': {
      const limit = params?.limit !== undefined ? String(params.limit) : '';
      return `参数【${displayLabel}】长度超出，最大长度为 ${limit}`;
    }
    case 'pattern':
      return `参数【${displayLabel}】格式不符合规则要求`;
    case 'additionalProperties': {
      const extra = params?.additionalProperty ? String(params.additionalProperty) : displayLabel;
      return `包含未定义的额外参数【${extra}】`;
    }
    default:
      return `参数【${displayLabel}】校验未通过: ${rawMessage}`;
  }
}

function getStepLabel(step?: {
  name?: string;
  planNodeId?: string;
  id?: string;
  title?: string;
}): string {
  if (step?.title && step.title.trim()) {
    return `步骤「${step.title.trim()}」`;
  }
  if (step?.name && step.name.trim() && step.name !== step.planNodeId) {
    return `步骤「${step.name.trim()}」`;
  }
  if (step?.planNodeId) {
    return `节点「${step.planNodeId}」`;
  }
  return '当前步骤';
}

export function formatSchemaViolation(
  options: FormatSchemaViolationOptions
): FormatSchemaViolationResult {
  const { errors, schema, step, kind } = options;
  const stepLabel = getStepLabel(step);
  const violations: SchemaViolationItem[] = [];

  for (const err of errors) {
    const meta = resolvePropertyMetadata(schema, err.path, err.keyword, err.params);
    const displayLabel = getDisplayLabel(meta.field, meta.title);
    const message = buildFriendlyViolationMessage(
      err.keyword,
      displayLabel,
      err.params,
      err.message,
      meta.description
    );
    violations.push({
      field: meta.field,
      fieldLabel: displayLabel,
      description: meta.description,
      message,
      keyword: err.keyword,
    });
  }

  const prefix =
    kind === 'input'
      ? `${stepLabel}输入参数校验未通过：`
      : `${stepLabel}输出结果校验未通过：`;

  let friendlyMessage = '';
  if (violations.length === 0) {
    friendlyMessage = `${prefix}契约格式不匹配。`;
  } else if (violations.length === 1) {
    friendlyMessage = `${prefix}${violations[0].message}。`;
  } else {
    friendlyMessage = `${prefix}${violations.map((v, idx) => `${idx + 1}. ${v.message}`).join('；')}。`;
  }

  const codePrefix = kind === 'input' ? 'INPUT_SCHEMA_VIOLATION' : 'OUTPUT_SCHEMA_VIOLATION';
  const nodeId = step?.planNodeId || step?.id || 'unknown';
  const errMsgs = errors
    .map((e) => `${e.path}${e.keyword ? ` (${e.keyword})` : ''}: ${e.message}`)
    .join('; ');
  const technicalMessage = `${codePrefix} for node '${nodeId}': ${errMsgs}`;

  return {
    technicalMessage,
    friendlyMessage,
    violations,
  };
}
