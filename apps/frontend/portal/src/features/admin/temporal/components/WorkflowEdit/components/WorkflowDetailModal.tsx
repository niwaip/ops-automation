import React from 'react';
import { Modal, Space, Card, Row, Col, Typography, Tag, Collapse } from 'antd';
import { ThunderboltOutlined, CodeOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Panel } = Collapse;

export interface WorkflowDetailModalProps {
  visible: boolean;
  onCancel: () => void;
  selectedWorkflow: any | null;
  SECTION_CARD_STYLE: React.CSSProperties;
  getActivitySourceMeta: (step: any) => any;
}

export const WorkflowDetailModal: React.FC<WorkflowDetailModalProps> = ({
  visible,
  onCancel,
  selectedWorkflow,
  SECTION_CARD_STYLE,
  getActivitySourceMeta,
}) => {
  const temporalSteps = selectedWorkflow?.workflowDsl?.steps || [];
  const browserLogicalPlan = selectedWorkflow?.workflowDsl?.sourceContext?.browserLogicalPlan;
  const displayedSteps =
    Array.isArray(browserLogicalPlan?.steps) && browserLogicalPlan.steps.length > 0
      ? browserLogicalPlan.steps
      : temporalSteps.map((step: any) => ({
          ...step,
          workflowStepId: step.id,
          type: step.type === 'activity' ? 'browser_activity' : step.type,
          dependsOn: [],
        }));
  return (
    <Modal
      title={
        <Space size={8}>
          <ThunderboltOutlined style={{ color: 'var(--primary-color)' }} />
          <span>工作流详情</span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={920}
    >
      {selectedWorkflow && (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 14 } }}>
            <Row gutter={[12, 10]}>
              <Col span={12}>
                <Text>
                  <strong>显示名称:</strong>{' '}
                  {selectedWorkflow.workflowDsl?.workflowDefnName ||
                    selectedWorkflow.workflowDsl?.name ||
                    selectedWorkflow.name}
                </Text>
              </Col>
              <Col span={12}>
                <Text>
                  <strong>类名:</strong>{' '}
                  <Tag color="geekblue">
                    {selectedWorkflow.workflowDsl?.workflowClassName ||
                      `${(selectedWorkflow.workflowDsl?.name || selectedWorkflow.name || 'Custom').replace(/\s+/g, '')}Workflow`}
                  </Tag>
                </Text>
              </Col>
              <Col span={12}>
                <Text>
                  <strong>Task Queue:</strong> <Tag color="blue">{selectedWorkflow.taskQueue}</Tag>
                </Text>
              </Col>
              <Col span={12}>
                <Text>
                  <strong>状态:</strong>{' '}
                  <Tag
                    color={
                      !selectedWorkflow.deployedAt
                        ? 'default'
                        : selectedWorkflow.isActive
                          ? 'green'
                          : 'orange'
                    }
                  >
                    {!selectedWorkflow.deployedAt
                      ? '未发布'
                      : selectedWorkflow.isActive
                        ? '已发布'
                        : '已停用'}
                  </Tag>
                </Text>
              </Col>
              <Col span={24}>
                <Text>
                  <strong>描述:</strong> {selectedWorkflow.description || '无'}
                </Text>
              </Col>
            </Row>
          </Card>
          <Collapse defaultActiveKey={['steps']} ghost>
            <Panel
              header={
                <Text>
                  <ThunderboltOutlined /> 步骤引用
                </Text>
              }
              key="steps"
            >
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                {displayedSteps.map((step: any, index: number) => {
                  const temporalStep = temporalSteps.find(
                    (candidate: any) => candidate.id === (step.workflowStepId || step.id)
                  );
                  const sourceMeta = getActivitySourceMeta(temporalStep || step);
                  return (
                    <Card
                      key={step.id || index}
                      size="small"
                      style={{
                        borderRadius: 10,
                        border: '1px solid var(--bg-secondary)',
                        background: 'var(--bg-card)',
                      }}
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space wrap>
                          <Tag color="green">步骤 {index + 1}</Tag>
                          <Text strong>{step.name || `步骤 ${index + 1}`}</Text>
                          {step.type === 'browser_activity' || step.type === 'activity' ? (
                            <Tag color={sourceMeta.color}>{sourceMeta.label}</Tag>
                          ) : step.type === 'llm_operation' ? (
                            <Tag color="purple">控制面 LLM Operation</Tag>
                          ) : step.type === 'workflow_skill' ? (
                            <Tag color="cyan">控制面工作流</Tag>
                          ) : (
                            <Tag>{step.type}</Tag>
                          )}
                        </Space>
                        {Array.isArray(step.dependsOn) && step.dependsOn.length > 0 ? (
                          <Text type="secondary">依赖: {step.dependsOn.join(', ')}</Text>
                        ) : null}
                      </Space>
                    </Card>
                  );
                })}
              </Space>
            </Panel>
            <Panel
              header={
                <Text>
                  <CodeOutlined /> Workflow DSL
                </Text>
              }
              key="workflow"
            >
              <pre
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  padding: 16,
                  borderRadius: 10,
                  maxHeight: 320,
                  overflow: 'auto',
                  fontSize: 12,
                }}
              >
                {JSON.stringify(selectedWorkflow.workflowDsl, null, 2)}
              </pre>
            </Panel>
          </Collapse>
        </Space>
      )}
    </Modal>
  );
};
