import React from 'react';
import { Card, Form, Space, Switch, InputNumber } from 'antd';
import type { WorkflowDsl } from '@/api/temporal';

export interface WorkflowExecutionConfigSectionProps {
  workflowDsl: WorkflowDsl;
  setWorkflowDsl: React.Dispatch<React.SetStateAction<WorkflowDsl>>;
  renderWorkflowDurationField: (
    fieldName: 'workflowExecutionTimeout' | 'workflowRunTimeout' | 'workflowTaskTimeout',
    label: string,
    tip: string,
    enabled: boolean,
    placeholder: string
  ) => React.ReactNode;
  renderTipLabel: (label: string, tip: string) => React.ReactNode;
  SECTION_CARD_STYLE: React.CSSProperties;
  SECTION_CARD_BODY_STYLE: React.CSSProperties;
}

export const WorkflowExecutionConfigSection: React.FC<WorkflowExecutionConfigSectionProps> = ({
  workflowDsl,
  setWorkflowDsl,
  renderWorkflowDurationField,
  renderTipLabel,
  SECTION_CARD_STYLE,
  SECTION_CARD_BODY_STYLE,
}) => {
  return (
    <Card
      title="执行配置"
      size="small"
      style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }}
      styles={{ body: SECTION_CARD_BODY_STYLE }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: 8,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {renderWorkflowDurationField(
            'workflowExecutionTimeout',
            '执行超时',
            'Execution Timeout 是整个工作流从开始到彻底结束的总上限，包含重试和 Continue-As-New。默认单位为秒，可切换为分或小时。',
            !!workflowDsl.workflowExecutionTimeout,
            '10m'
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renderWorkflowDurationField(
            'workflowRunTimeout',
            '运行超时',
            'Run Timeout 只限制当前这一轮运行实例，不覆盖整个 Workflow Execution。默认单位为秒，可切换为分或小时。',
            !!workflowDsl.workflowRunTimeout,
            '5m'
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renderWorkflowDurationField(
            'workflowTaskTimeout',
            '任务超时',
            'Task Timeout 是 Worker 每次处理一小段工作流决策代码的时间上限，主要用于探测 Worker 卡住或异常。默认单位为秒，可切换为分或小时。',
            !!workflowDsl.workflowTaskTimeout,
            '10s'
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Form.Item
            label={renderTipLabel(
              '默认工作单元重试次数',
              '未单独覆盖时，工作流内工作单元的默认最大重试次数。'
            )}
            style={{ marginBottom: 0 }}
          >
            <Space size={8}>
              <Switch
                checked={
                  workflowDsl.defaultActivityRetryPolicy?.maxRetries !== undefined &&
                  workflowDsl.defaultActivityRetryPolicy?.maxRetries !== null
                }
                onChange={(checked) =>
                  setWorkflowDsl({
                    ...workflowDsl,
                    defaultActivityRetryPolicy: {
                      ...workflowDsl.defaultActivityRetryPolicy,
                      maxRetries: checked ? 3 : undefined,
                    },
                  })
                }
              />
              <InputNumber
                size="small"
                min={0}
                disabled={
                  workflowDsl.defaultActivityRetryPolicy?.maxRetries === undefined ||
                  workflowDsl.defaultActivityRetryPolicy?.maxRetries === null
                }
                value={workflowDsl.defaultActivityRetryPolicy?.maxRetries ?? 3}
                onChange={(value) =>
                  setWorkflowDsl({
                    ...workflowDsl,
                    defaultActivityRetryPolicy: {
                      ...workflowDsl.defaultActivityRetryPolicy,
                      maxRetries: value ?? 3,
                    },
                  })
                }
                style={{ width: 88 }}
              />
            </Space>
          </Form.Item>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Form.Item
            label={renderTipLabel('退避系数', '指数退避系数，默认 2.0。')}
            style={{ marginBottom: 0 }}
          >
            <Space size={8}>
              <Switch
                checked={
                  workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient !== undefined
                }
                onChange={(checked) =>
                  setWorkflowDsl({
                    ...workflowDsl,
                    defaultActivityRetryPolicy: {
                      ...workflowDsl.defaultActivityRetryPolicy,
                      backoffCoefficient: checked ? 2.0 : undefined,
                    },
                  })
                }
              />
              <InputNumber
                size="small"
                min={0}
                step={0.1}
                disabled={
                  workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient === undefined
                }
                value={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient ?? 2.0}
                onChange={(value) =>
                  setWorkflowDsl({
                    ...workflowDsl,
                    defaultActivityRetryPolicy: {
                      ...workflowDsl.defaultActivityRetryPolicy,
                      backoffCoefficient: value ?? 2.0,
                    },
                  })
                }
                style={{ width: 88 }}
              />
            </Space>
          </Form.Item>
        </div>
      </div>
    </Card>
  );
};
