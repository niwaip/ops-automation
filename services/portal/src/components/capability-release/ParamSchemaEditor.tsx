import React from 'react';
import { Alert, Button, Card, DatePicker, Input, InputNumber, Select, Space, Switch, Typography } from 'antd';
import { DeleteOutlined, DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { TextArea } = Input;

export interface ParamSchemaFieldDraft {
  id: string;
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue: string;
  extractionPrompt: string;
  enumValues: string[];
}

interface ParamSchemaEditorProps {
  fields: ParamSchemaFieldDraft[];
  errors: string[];
  schemaPreview: Record<string, unknown>;
  onAddField: () => void;
  onRemoveField: (id: string) => void;
  onMoveField: (id: string, direction: 'up' | 'down') => void;
  onChangeField: (id: string, patch: Partial<ParamSchemaFieldDraft>) => void;
}

const previewStyle: React.CSSProperties = {
  margin: 0,
  maxHeight: 220,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
};

const renderDefaultValueInput = (
  field: ParamSchemaFieldDraft,
  onChangeField: ParamSchemaEditorProps['onChangeField'],
) => {
  if (field.type === 'boolean') {
    return (
      <Space>
        <Switch
          checked={field.defaultValue === 'true'}
          onChange={(checked) => onChangeField(field.id, { defaultValue: checked ? 'true' : 'false' })}
        />
        <Text type="secondary">默认值布尔开关</Text>
      </Space>
    );
  }

  if (field.type === 'array' || field.type === 'object') {
    return (
      <TextArea
        rows={3}
        placeholder={field.type === 'array' ? '默认值 JSON，例如 ["a", "b"]' : '默认值 JSON，例如 {"city":"shanghai"}'}
        value={field.defaultValue}
        onChange={(event) => onChangeField(field.id, { defaultValue: event.target.value })}
        spellCheck={false}
        style={{ fontFamily: 'monospace' }}
      />
    );
  }

  if (field.type === 'number') {
    const parsed = field.defaultValue.trim() ? Number(field.defaultValue) : null;
    return (
      <InputNumber
        style={{ width: '100%' }}
        placeholder="默认值，例如 10"
        value={parsed !== null && !Number.isNaN(parsed) ? parsed : null}
        onChange={(value) => onChangeField(field.id, { defaultValue: value === null ? '' : String(value) })}
      />
    );
  }

  if (field.type === 'date') {
    return (
      <DatePicker
        style={{ width: '100%' }}
        value={null}
        placeholder="选择默认日期后会写入 YYYY-MM-DD"
        onChange={(_value, dateString) =>
          onChangeField(field.id, {
            defaultValue: Array.isArray(dateString) ? dateString[0] || '' : dateString || '',
          })
        }
      />
    );
  }

  return (
    <Input
      placeholder={
        field.type === 'number'
          ? '默认值，例如 10'
          : field.type === 'date'
            ? '默认值，例如 2026-04-25'
            : '默认值，可选'
      }
      value={field.defaultValue}
      onChange={(event) => onChangeField(field.id, { defaultValue: event.target.value })}
    />
  );
};

const ParamSchemaEditor: React.FC<ParamSchemaEditorProps> = ({
  fields,
  errors,
  schemaPreview,
  onAddField,
  onRemoveField,
  onMoveField,
  onChangeField,
}) => {
  return (
    <Card
      size="small"
      title="参数定义"
      extra={
        <Button size="small" icon={<PlusOutlined />} onClick={onAddField}>
          添加参数
        </Button>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {fields.length > 0 ? (
          fields.map((field, index) => (
            <Card
              key={field.id}
              size="small"
              type="inner"
              title={`参数 ${index + 1}`}
              extra={
                <Space size="small">
                  <Button
                    size="small"
                    type="text"
                    icon={<UpOutlined />}
                    disabled={index === 0}
                    onClick={() => onMoveField(field.id, 'up')}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<DownOutlined />}
                    disabled={index === fields.length - 1}
                    onClick={() => onMoveField(field.id, 'down')}
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => onRemoveField(field.id)}
                  />
                </Space>
              }
            >
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Input
                  placeholder="字段名，例如 city"
                  value={field.name}
                  onChange={(event) => onChangeField(field.id, { name: event.target.value })}
                />
                <Select
                  value={field.type}
                  onChange={(value) => onChangeField(field.id, { type: value })}
                  options={[
                    { label: 'string', value: 'string' },
                    { label: 'number', value: 'number' },
                    { label: 'boolean', value: 'boolean' },
                    { label: 'date', value: 'date' },
                    { label: 'array', value: 'array' },
                    { label: 'object', value: 'object' },
                  ]}
                />
                <Input
                  placeholder="参数描述"
                  value={field.description}
                  onChange={(event) => onChangeField(field.id, { description: event.target.value })}
                />
                <Select
                  mode="tags"
                  tokenSeparators={[',']}
                  placeholder="枚举值，可选"
                  value={field.enumValues}
                  onChange={(value) => onChangeField(field.id, { enumValues: value })}
                  options={field.enumValues.map((item) => ({ label: item, value: item }))}
                />
                {renderDefaultValueInput(field, onChangeField)}
                <TextArea
                  rows={2}
                  placeholder="提取提示 extractionPrompt，可选"
                  value={field.extractionPrompt}
                  onChange={(event) => onChangeField(field.id, { extractionPrompt: event.target.value })}
                />
                <Space>
                  <Switch
                    checked={field.required}
                    onChange={(checked) => onChangeField(field.id, { required: checked })}
                  />
                  <Text type="secondary">{field.required ? '必填参数' : '选填参数'}</Text>
                </Space>
              </Space>
            </Card>
          ))
        ) : (
          <Text type="secondary">暂无参数定义，点击“添加参数”开始配置。</Text>
        )}

        {errors.length > 0 && (
          <Alert
            type="error"
            showIcon
            message={errors[0]}
            description={errors.slice(1).join('；') || undefined}
          />
        )}

        <pre style={previewStyle}>{JSON.stringify(schemaPreview, null, 2)}</pre>
      </Space>
    </Card>
  );
};

export default ParamSchemaEditor;
