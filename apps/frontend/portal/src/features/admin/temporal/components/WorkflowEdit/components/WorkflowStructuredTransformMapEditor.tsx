import React from 'react';
import { Form, Space, Input, Button } from 'antd';
import type { StructuredTransformStepConfig } from '../utils/workflowEditHelpers';
import { asPlainRecord } from '../utils/workflowEditHelpers';

export interface WorkflowStructuredTransformMapEditorProps {
  selectedStepIndexForConfig: number | null;
  selectedStepStructuredTransformConfig: Record<string, any>;
  label: string;
  tip: string;
  renderTipLabel: (label: string, tip: string) => React.ReactNode;
  updateStepStructuredTransformConfig: (
    stepIndex: number,
    config: Partial<StructuredTransformStepConfig>
  ) => void;
}

export const WorkflowStructuredTransformMapEditor: React.FC<
  WorkflowStructuredTransformMapEditorProps
> = ({
  selectedStepIndexForConfig,
  selectedStepStructuredTransformConfig,
  label,
  tip,
  renderTipLabel,
  updateStepStructuredTransformConfig,
}) => {
  if (selectedStepIndexForConfig === null) {
    return null;
  }
  const mapValue = asPlainRecord(selectedStepStructuredTransformConfig.fieldMappings);
  const entries = Object.entries(mapValue);
  return (
    <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 10 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={6}>
        {entries.map(([key, value]) => (
          <div
            key={`structured-transform-field-${key}`}
            style={{ display: 'flex', gap: 6, alignItems: 'center' }}
          >
            <Input
              size="small"
              value={key}
              placeholder="输出字段"
              onChange={(e) => {
                const nextMap = { ...mapValue };
                const nextKey = e.target.value;
                delete nextMap[key];
                if (nextKey.trim()) {
                  nextMap[nextKey] = String(value ?? '');
                }
                updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                  fieldMappings: nextMap,
                });
              }}
              style={{ width: 140, flexShrink: 0 }}
            />
            <Input
              size="small"
              value={typeof value === 'string' ? value : JSON.stringify(value)}
              placeholder="来源路径或模版变量"
              onChange={(e) => {
                updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                  fieldMappings: {
                    ...mapValue,
                    [key]: e.target.value,
                  },
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
                updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                  fieldMappings: nextMap,
                });
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
            updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
              fieldMappings: {
                ...mapValue,
                [`field_${entries.length + 1}`]: '',
              },
            });
          }}
        >
          + 添加
        </Button>
      </Space>
    </Form.Item>
  );
};
