import { Input, InputNumber, Select, Switch } from 'antd';
import type { SkillParamsSchema } from '@/api/skill';

export type SchemaField = {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  defaultValue?: unknown;
  enum?: Array<string | number>;
};

export const getTypeTagColor = (type: string) => {
  const normalizedType = type.toLowerCase();
  if (normalizedType === 'boolean') return 'green';
  if (normalizedType === 'number' || normalizedType === 'integer') return 'blue';
  if (normalizedType === 'object' || normalizedType === 'json') return 'purple';
  return 'default';
};

export const getSchemaFields = (schema?: SkillParamsSchema): SchemaField[] => {
  if (!schema?.properties) return [];
  const requiredFields = new Set(schema.required || []);
  return Object.entries(schema.properties).map(([name, config]) => ({
    name,
    type: config?.type || 'string',
    description: config?.description,
    required: requiredFields.has(name) || Boolean(config?.required),
    defaultValue: config?.default,
    enum: config?.enum,
  }));
};

export const getInitialInputValues = (fields: SchemaField[]): Record<string, unknown> =>
  fields.reduce<Record<string, unknown>>((acc, field) => {
    if (field.defaultValue === undefined) {
      if (field.type === 'boolean') acc[field.name] = false;
      return acc;
    }
    if (field.type === 'object' || field.type === 'json') {
      acc[field.name] = typeof field.defaultValue === 'string'
        ? field.defaultValue
        : JSON.stringify(field.defaultValue, null, 2);
      return acc;
    }
    acc[field.name] = field.defaultValue;
    return acc;
  }, {});

export const renderInputField = (field: SchemaField) => {
  const normalizedType = field.type.toLowerCase();
  if (Array.isArray(field.enum) && field.enum.length > 0) {
    return <Select style={{ width: '100%' }} allowClear placeholder={field.description || `请选择 ${field.name}`} options={field.enum.map((value) => ({ label: String(value), value }))} />;
  }
  if (normalizedType === 'number' || normalizedType === 'integer') {
    return <InputNumber style={{ width: '100%' }} placeholder={`请输入 ${field.name}`} />;
  }
  if (normalizedType === 'boolean') return <Switch />;
  if (normalizedType === 'object' || normalizedType === 'json') {
    return <Input.TextArea rows={6} placeholder="请输入 JSON 字符串" />;
  }
  return <Input placeholder={field.description || `请输入 ${field.name}`} />;
};

export const normalizeInputValues = (
  values: Record<string, unknown>,
  fields: SchemaField[]
): Record<string, unknown> =>
  fields.reduce<Record<string, unknown>>((acc, field) => {
    const rawValue = values[field.name];
    if (rawValue === undefined || rawValue === null || rawValue === '') return acc;
    const normalizedType = field.type.toLowerCase();
    if ((normalizedType === 'object' || normalizedType === 'json') && typeof rawValue === 'string') {
      acc[field.name] = JSON.parse(rawValue);
      return acc;
    }
    acc[field.name] = rawValue;
    return acc;
  }, {});
