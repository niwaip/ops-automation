
export type InspectorSelection =
  | { type: 'meta' }
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'step'; stepIndex: number; stepId: string };

export type EditorViewMode = 'graph' | 'list' | 'json';

export interface ParamFieldItem {
  key: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  defaultValue?: any;
}

/**
 * 将 paramsSchema 对象解析为可视化参数字段列表
 */
export const parseSchemaToFields = (schema: Record<string, any> | null | undefined): ParamFieldItem[] => {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  // 支持 standard json schema format: { type: 'object', properties: { ... }, required: [...] }
  const properties = schema.properties || (schema.type === 'object' ? {} : schema);
  const requiredList: string[] = Array.isArray(schema.required) ? schema.required : [];

  return Object.entries(properties).map(([name, def]: [string, any], index) => {
    const isObj = def && typeof def === 'object';
    const type = isObj && def.type ? def.type : 'string';
    const description = isObj && def.description ? String(def.description) : '';
    const isRequired = requiredList.includes(name) || (isObj && Boolean(def.required));
    const defaultValue = isObj ? def.default : undefined;

    return {
      key: `${name}_${index}`,
      name,
      type: ['string', 'number', 'boolean', 'object', 'array'].includes(type) ? type : 'string',
      description,
      required: isRequired,
      defaultValue,
    };
  });
};

/**
 * 将可视化参数字段列表序列化回 paramsSchema 对象
 */
export const buildFieldsToSchema = (fields: ParamFieldItem[]): Record<string, any> | undefined => {
  if (!fields || fields.length === 0) {
    return undefined;
  }

  const properties: Record<string, any> = {};
  const required: string[] = [];

  fields.forEach((field) => {
    const trimmedName = field.name.trim();
    if (!trimmedName) return;

    properties[trimmedName] = {
      type: field.type,
      description: field.description || '',
    };
    if (field.defaultValue !== undefined && field.defaultValue !== '') {
      properties[trimmedName].default = field.defaultValue;
    }
    if (field.required) {
      required.push(trimmedName);
    }
  });

  if (Object.keys(properties).length === 0) {
    return undefined;
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
};
