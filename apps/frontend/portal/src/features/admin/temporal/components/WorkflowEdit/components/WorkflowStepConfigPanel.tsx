import React from 'react';
import { Card, Form, Collapse, Typography, Alert } from 'antd';

const { Text } = Typography;
const { Panel } = Collapse;

export interface WorkflowStepConfigPanelProps {
  selectedStepIndexForConfig: number | null;
  selectedStep: any;
  stepConfigActiveKeys: string[];
  setStepConfigActiveKeys: React.Dispatch<React.SetStateAction<string[]>>;
  renderTipLabel: (title: string, tip: string) => React.ReactNode;
  renderStepDurationField: (field: any, label: string, tip: string, options?: any) => React.ReactNode;
  SECTION_CARD_STYLE: React.CSSProperties;
  TWO_COLUMN_GRID_STYLE: React.CSSProperties;
  children?: React.ReactNode;
}

export const WorkflowStepConfigPanel: React.FC<WorkflowStepConfigPanelProps> = ({
  selectedStepIndexForConfig,
  selectedStep,
  stepConfigActiveKeys,
  setStepConfigActiveKeys,
  renderTipLabel,
  renderStepDurationField,
  SECTION_CARD_STYLE,
  TWO_COLUMN_GRID_STYLE,
  children,
}) => {
  return (
    <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 12 } }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        步骤配置
      </Text>
      {selectedStepIndexForConfig !== null && selectedStep ? (
        <Card
          size="small"
          style={{ ...SECTION_CARD_STYLE, background: 'var(--bg-card)' }}
          styles={{ body: { padding: 14 } }}
        >
          <Form layout="vertical" size="small">
            {selectedStep.type === 'activity' && (
              <Collapse
                size="small"
                activeKey={stepConfigActiveKeys}
                onChange={(keys) =>
                  setStepConfigActiveKeys(
                    Array.isArray(keys) ? keys.map(String) : [String(keys)]
                  )
                }
              >
                <Panel
                  header={renderTipLabel(
                    '步骤执行控制',
                    '默认只开启单次执行超时。按 Temporal 常见实践，单次执行超时默认开启；整体完成超时用于约束排队+重试总时长，心跳超时仅适合 Activity 内显式上报 heartbeat 的长任务，默认关闭。'
                  )}
                  key="execution-control"
                >
                  <div style={TWO_COLUMN_GRID_STYLE}>
                    <div>
                      {renderStepDurationField(
                        'startToCloseTimeout',
                        '单次执行超时',
                        '限制当前步骤里这次工作单元执行时长。默认单位为秒，可切换为分或小时。'
                      )}
                    </div>
                    <div>
                      {renderStepDurationField(
                        'scheduleToCloseTimeout',
                        '整体完成超时',
                        '限制该步骤从调度到最终完成的总时长，包含排队、执行和重试。默认单位为秒，可切换为分或小时。',
                        { canDisable: true }
                      )}
                    </div>
                    <div>
                      {renderStepDurationField(
                        'heartbeatTimeout',
                        '心跳超时',
                        '长耗时工作单元可通过心跳汇报存活；超时表示长时间未汇报。默认单位为秒，可切换为分或小时。',
                        { canDisable: true }
                      )}
                    </div>
                  </div>
                </Panel>
                {children}
              </Collapse>
            )}
          </Form>
        </Card>
      ) : (
        <Alert message="点击中间步骤选择配置" type="info" showIcon />
      )}
    </Card>
  );
};
