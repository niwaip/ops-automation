import React from 'react';
import { Form, Space, Input, Button } from 'antd';
import { asPlainRecord } from '../utils/workflowEditHelpers';

export interface WorkflowHttpTemplateMapEditorProps {
  selectedStepIndexForConfig: number | null;
  selectedStepHttpConfig: Record<string, any>;
  field:
    | 'queryTemplate'
    | 'headersTemplate'
    | 'jsonTemplate'
    | 'dataTemplate'
    | 'responseFieldMappings';
  label: string;
  tip: string;
  renderTipLabel: (label: string, tip: string) => React.ReactNode;
  updateHttpRequestTemplateMap: (
    stepIndex: number,
    field:
      | 'queryTemplate'
      | 'headersTemplate'
      | 'jsonTemplate'
      | 'dataTemplate'
      | 'responseFieldMappings',
    value: Record<string, string>
  ) => void;
}

export const WorkflowHttpTemplateMapEditor: React.FC<WorkflowHttpTemplateMapEditorProps> = ({
  selectedStepIndexForConfig,
  selectedStepHttpConfig,
  field,
  label,
  tip,
  renderTipLabel,
  updateHttpRequestTemplateMap,
}) => {
  if (selectedStepIndexForConfig === null) {
    return null;
  }
  const mapValue = asPlainRecord(selectedStepHttpConfig[field]);
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
                updateHttpRequestTemplateMap(selectedStepIndexForConfig, field, nextMap);
              }}
              style={{ width: 110, flexShrink: 0 }}
            />
            <Input
              size="small"
              value={typeof value === 'string' ? value : JSON.stringify(value)}
              placeholder="值，可用 {city}"
              onChange={(e) => {
                updateHttpRequestTemplateMap(selectedStepIndexForConfig, field, {
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
                updateHttpRequestTemplateMap(selectedStepIndexForConfig, field, nextMap);
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
            updateHttpRequestTemplateMap(selectedStepIndexForConfig, field, {
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
