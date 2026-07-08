import React from 'react';
import { Input, InputNumber, Switch } from 'antd';
import type { RequiredInputField } from '@/features/executions/lib/inputFields';

interface ExecutionRequiredInputFieldProps {
  field: RequiredInputField;
  jsonPlaceholder?: string;
  textPlaceholderPrefix?: string;
  treatArrayAsJson?: boolean;
}

const ExecutionRequiredInputField: React.FC<ExecutionRequiredInputFieldProps> = ({
  field,
  jsonPlaceholder,
  textPlaceholderPrefix,
  treatArrayAsJson = false,
}) => {
  const normalizedType = field.type.toLowerCase();
  const isJsonLike =
    normalizedType === 'object' ||
    normalizedType === 'json' ||
    (treatArrayAsJson && normalizedType === 'array');

  if (normalizedType === 'number' || normalizedType === 'integer') {
    return <InputNumber style={{ width: '100%' }} />;
  }

  if (normalizedType === 'boolean') {
    return <Switch />;
  }

  if (isJsonLike) {
    return <Input.TextArea rows={4} placeholder={jsonPlaceholder || '请输入 JSON 字符串'} />;
  }

  return (
    <Input
      placeholder={field.description || `${textPlaceholderPrefix || '请输入'} ${field.name}`}
    />
  );
};

export default ExecutionRequiredInputField;
