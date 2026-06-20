import React from 'react';
import { Button, Collapse, Descriptions, Input, Select, Tag, Typography } from 'antd';
import type { TemplateStep, TemplateStepExecutionPolicy } from '@/api/template';

const { Text } = Typography;
const { Panel } = Collapse;

interface TemplateStepsTabProps {
  steps: TemplateStep[];
  isEditMode: boolean;
  jsonBlockStyle: React.CSSProperties;
  onAddStep: () => void;
  onDeleteStep: (index: number) => void;
  onUpdateStepField: (
    index: number,
    key: 'action' | 'step_id' | 'execution_policy',
    value: string
  ) => void;
}

const STEP_POLICY_OPTIONS: Array<{
  value: TemplateStepExecutionPolicy;
  label: string;
  color: string;
}> = [
  { value: 'auto_execute', label: '自动执行', color: 'green' },
  { value: 'require_confirmation', label: '需确认', color: 'gold' },
  { value: 'require_takeover', label: '人工接管', color: 'orange' },
  { value: 'forbid_in_replay', label: '禁止回放', color: 'red' },
];

const TemplateStepsTab: React.FC<TemplateStepsTabProps> = ({
  steps,
  isEditMode,
  jsonBlockStyle,
  onAddStep,
  onDeleteStep,
  onUpdateStepField,
}) => (
  <>
    {isEditMode && (
      <Button type="dashed" onClick={onAddStep} block style={{ marginBottom: 16 }}>
        + 添加步骤
      </Button>
    )}
    <Collapse accordion>
      {steps.map((step, index) => (
        <Panel
          header={
            isEditMode ? (
              <Input
                value={step.action}
                onChange={(event) => onUpdateStepField(index, 'action', event.target.value)}
                onClick={(event) => event.stopPropagation()}
                style={{ width: '80%' }}
                placeholder="步骤动作"
              />
            ) : (
              `Step ${index + 1}: ${step.action}`
            )
          }
          key={index}
          extra={
            isEditMode ? (
              <Button
                size="small"
                danger
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteStep(index);
                }}
              >
                删除
              </Button>
            ) : undefined
          }
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label="步骤 ID">
              {isEditMode ? (
                <Input
                  value={step.step_id}
                  onChange={(event) => onUpdateStepField(index, 'step_id', event.target.value)}
                  placeholder="步骤 ID"
                />
              ) : (
                step.step_id
              )}
            </Descriptions.Item>
            <Descriptions.Item label="动作">
              {isEditMode ? (
                <Input
                  value={step.action}
                  onChange={(event) => onUpdateStepField(index, 'action', event.target.value)}
                />
              ) : (
                step.action
              )}
            </Descriptions.Item>
            {step.locator && (
              <Descriptions.Item label="选择器">
                <Tag>{step.locator.type}</Tag>
                <Text code>{step.locator.value}</Text>
              </Descriptions.Item>
            )}
            {step.params && Object.keys(step.params).length > 0 && (
              <Descriptions.Item label="参数">
                <pre style={jsonBlockStyle}>{JSON.stringify(step.params, null, 2)}</pre>
              </Descriptions.Item>
            )}
            {step.wait && (
              <Descriptions.Item label="等待">
                <Tag>{step.wait.type}</Tag>
                {step.wait.value}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="执行策略">
              {isEditMode ? (
                <Select
                  value={step.execution_policy || 'auto_execute'}
                  style={{ width: 160 }}
                  options={STEP_POLICY_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={(value) => onUpdateStepField(index, 'execution_policy', value)}
                />
              ) : (
                <Tag
                  color={
                    STEP_POLICY_OPTIONS.find(
                      (option) => option.value === (step.execution_policy || 'auto_execute')
                    )?.color || 'default'
                  }
                >
                  {STEP_POLICY_OPTIONS.find(
                    (option) => option.value === (step.execution_policy || 'auto_execute')
                  )?.label || step.execution_policy || '自动执行'}
                </Tag>
              )}
            </Descriptions.Item>
            {step.retry && (
              <Descriptions.Item label="重试">
                {step.retry.max_attempts} attempts, {step.retry.delay_ms}ms delay
              </Descriptions.Item>
            )}
          </Descriptions>
        </Panel>
      ))}
    </Collapse>
  </>
);

export default TemplateStepsTab;
