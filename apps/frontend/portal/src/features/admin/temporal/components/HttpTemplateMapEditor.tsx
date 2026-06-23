import React from 'react';
import { Form, Space, Input, Button } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { asPlainRecord } from '../pages/TemporalPage.utils';

export interface HttpTemplateMapEditorProps {
  field:
    | 'queryTemplate'
    | 'headersTemplate'
    | 'jsonTemplate'
    | 'dataTemplate'
    | 'responseFieldMappings';
  label: string;
  tip: string;
  value: Record<string, any> | undefined;
  onChange: (field: string, nextMap: Record<string, string>) => void;
}

const renderTipLabel = (label: string, tip: string) => (
  <Space size={4}>
    <span>{label}</span>
    <Tooltip title={tip}>
      <InfoCircleOutlined style={{ color: 'var(--text-light)' }} />
    </Tooltip>
  </Space>
);

export const HttpTemplateMapEditor: React.FC<HttpTemplateMapEditorProps> = ({
  field,
  label,
  tip,
  value: rawValue,
  onChange,
}) => {
  const mapValue = asPlainRecord(rawValue);
  const entries = Object.entries(mapValue);

  return (
    <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 10 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={6}>
        {entries.map(([key, value]) => (
          <div key={`${field}-${key}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Input
              size="small"
              value={key}
              placeholder="键"
              onChange={(e) => {
                const nextMap = { ...mapValue };
                const nextKey = e.target.value;
                delete nextMap[key];
                if (nextKey.trim()) {
                  nextMap[nextKey] = String(value ?? '');
                }
                onChange(field, nextMap);
              }}
              style={{ width: 110, flexShrink: 0 }}
            />
            <Input
              size="small"
              value={typeof value === 'string' ? value : JSON.stringify(value)}
              placeholder="值，可用 {city}"
              onChange={(e) => {
                onChange(field, {
                  ...mapValue,
                  [key]: e.target.value,
                });
              }}
              style={{ flex: 1 }}
            />
            <Button
              size="small"
              danger
              type="text"
              onClick={() => {
                const nextMap = { ...mapValue };
                delete nextMap[key];
                onChange(field, nextMap);
              }}
            >
              ×
            </Button>
          </div>
        ))}
        <Button
          size="small"
          type="dashed"
          onClick={() => {
            onChange(field, {
              ...mapValue,
              [`key_${entries.length + 1}`]: '',
            });
          }}
        >
          + 添加
        </Button>
      </Space>
    </Form.Item>
  );
};
