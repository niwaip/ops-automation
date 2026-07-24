import React from 'react';
import { Modal, Space, Card, Row, Col, Typography, Tag, Button, Collapse } from 'antd';
import { ThunderboltOutlined, PlayCircleOutlined, CodeOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Panel } = Collapse;

export interface WorkflowDetailModalProps {
  visible: boolean;
  onCancel: () => void;
  selectedWorkflow: any | null;
  SECTION_CARD_STYLE: React.CSSProperties;
  resolveWorkflowSourceSkillId: (wf: any) => string | null;
  handleCreateExecutionFromWorkflow: () => void;
  creatingExecutionWorkflowId: string | null;
  getActivitySourceMeta: (step: any) => any;
}

export const WorkflowDetailModal: React.FC<WorkflowDetailModalProps> = ({
  visible,
  onCancel,
  selectedWorkflow,
  SECTION_CARD_STYLE,
  resolveWorkflowSourceSkillId,
  handleCreateExecutionFromWorkflow,
  creatingExecutionWorkflowId,
  getActivitySourceMeta,
}) => {
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
                  <Tag color={selectedWorkflow.isActive ? 'green' : 'default'}>
                    {selectedWorkflow.isActive ? '已启用' : '已禁用'}
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
          <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 14 } }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center">
              <Space direction="vertical" size={0}>
                <Text strong>执行记录</Text>
                <Text type="secondary">
                  {resolveWorkflowSourceSkillId(selectedWorkflow)
                    ? `已关联 Skill: ${resolveWorkflowSourceSkillId(selectedWorkflow)}`
                    : '当前工作流未关联 Skill，无法直接创建 executions 记录'}
                </Text>
              </Space>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleCreateExecutionFromWorkflow}
                loading={creatingExecutionWorkflowId === selectedWorkflow.id}
                disabled={!resolveWorkflowSourceSkillId(selectedWorkflow)}
              >
                创建执行记录
              </Button>
            </Space>
          </Card>
          <Collapse defaultActiveKey={['workflow', 'activities']} ghost>
            <Panel
              header={
                <Text>
                  <ThunderboltOutlined /> 步骤引用
                </Text>
              }
              key="steps"
            >
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                {(selectedWorkflow.workflowDsl?.steps || []).map((step: any, index: number) => {
                  const sourceMeta = getActivitySourceMeta(step);
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
                          {step.type === 'activity' ? (
                            <Tag color={sourceMeta.color}>{sourceMeta.label}</Tag>
                          ) : (
                            <Tag>{step.type}</Tag>
                          )}
                        </Space>
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
