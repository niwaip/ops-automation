import React from 'react';
import { Input, InputNumber, Select, Switch } from 'antd';
import type { RequiredInputField } from '@/features/executions/create/lib/inputFields';

export interface ExecutionRequiredInputFieldProps {
  field: RequiredInputField;
  value?: unknown;
  checked?: boolean;
  onChange?: (value: unknown) => void;
  jsonPlaceholder?: string;
  textPlaceholderPrefix?: string;
  treatArrayAsJson?: boolean;
  disabled?: boolean;
  id?: string;
}

const ExecutionRequiredInputField: React.FC<ExecutionRequiredInputFieldProps> = ({
  field,
  value,
  checked,
  onChange,
  jsonPlaceholder,
  textPlaceholderPrefix,
  treatArrayAsJson = false,
  disabled,
  id,
}) => {
  const normalizedType = field.type.toLowerCase();
  const isJsonLike =
    normalizedType === 'object' ||
    normalizedType === 'json' ||
    (treatArrayAsJson && normalizedType === 'array');

  if (normalizedType === 'number' || normalizedType === 'integer') {
    const numValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))
        ? Number(value)
        : undefined;

    return (
      <InputNumber
        id={id}
        disabled={disabled}
        style={{ width: '100%' }}
        value={numValue}
        onChange={(val) => onChange?.(val)}
      />
    );
  }

  if (normalizedType === 'boolean') {
    return (
      <Switch
        id={id}
        disabled={disabled}
        checked={checked !== undefined ? checked : Boolean(value)}
        onChange={(checkedVal) => onChange?.(checkedVal)}
      />
    );
  }

  if (isJsonLike) {
    const stringValue =
      typeof value === 'object' && value !== null
        ? JSON.stringify(value, null, 2)
        : typeof value === 'string'
        ? value
        : '';

    return (
      <Input.TextArea
        id={id}
        disabled={disabled}
        rows={4}
        placeholder={jsonPlaceholder || '请输入 JSON 字符串'}
        value={stringValue}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  }

  if (Array.isArray(field.enum) && field.enum.length > 0) {
    return (
      <Select
        id={id}
        disabled={disabled}
        style={{ width: '100%' }}
        allowClear
        value={value as any}
        onChange={(val) => onChange?.(val)}
      >
        {field.enum.map((val) => (
          <Select.Option key={String(val)} value={val}>
            {String(val)}
          </Select.Option>
        ))}
      </Select>
    );
  }

  const textValue =
    typeof value === 'string'
      ? value
      : value !== undefined && value !== null
      ? String(value)
      : '';

  return (
    <Input
      id={id}
      disabled={disabled}
      placeholder={field.description || `${textPlaceholderPrefix || '请输入'} ${field.name}`}
      value={textValue}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
};

export default ExecutionRequiredInputField;
