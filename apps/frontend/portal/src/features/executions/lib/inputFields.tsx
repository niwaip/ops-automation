import { Input, InputNumber, Switch } from 'antd';

export interface RequiredInputField {
  name: string;
  type: string;
  description?: string;
  display_name?: string;
  group_label?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
  needs_confirmation?: boolean;
}

export const renderRequiredInputField = (
  field: RequiredInputField,
  options?: {
    jsonPlaceholder?: string;
    textPlaceholderPrefix?: string;
    treatArrayAsJson?: boolean;
  },
) => {
  const normalizedType = field.type.toLowerCase();
  const treatArrayAsJson = options?.treatArrayAsJson ?? false;
  const isJsonLike = normalizedType === 'object' || normalizedType === 'json' || (treatArrayAsJson && normalizedType === 'array');

  if (normalizedType === 'number' || normalizedType === 'integer') {
    return <InputNumber style={{ width: '100%' }} />;
  }

  if (normalizedType === 'boolean') {
    return <Switch />;
  }

  if (isJsonLike) {
    return <Input.TextArea rows={4} placeholder={options?.jsonPlaceholder || '请输入 JSON 字符串'} />;
  }

  return <Input placeholder={field.description || `${options?.textPlaceholderPrefix || '请输入'} ${field.name}`} />;
};

export const normalizeRequiredInputValues = (
  values: Record<string, unknown>,
  requiredInputs: RequiredInputField[],
  options?: {
    treatArrayAsJson?: boolean;
  },
) => {
  const treatArrayAsJson = options?.treatArrayAsJson ?? false;

  return requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
    const rawValue = values[field.name];
    if (rawValue === undefined) {
      return acc;
    }

    const normalizedType = field.type.toLowerCase();
    const isJsonLike = normalizedType === 'object' || normalizedType === 'json' || (treatArrayAsJson && normalizedType === 'array');
    if (isJsonLike && typeof rawValue === 'string') {
      acc[field.name] = JSON.parse(rawValue);
      return acc;
    }

    acc[field.name] = rawValue;
    return acc;
  }, {});
};
