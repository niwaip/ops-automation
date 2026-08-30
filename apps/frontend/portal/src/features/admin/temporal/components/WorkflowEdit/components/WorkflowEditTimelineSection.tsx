import React from 'react';
import {
  Card,
  Space,
  Button,
  Tooltip,
  Input,
  Timeline,
  Alert,
  Tag,
  Row,
  Col,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  SearchOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

export interface WorkflowEditTimelineSectionProps {
  resourceSidebarCollapsed: boolean;
  setResourceSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  RESOURCE_SIDEBAR_WIDTH: number;
  COLLAPSED_SIDEBAR_WIDTH: number;
  SECTION_CARD_STYLE: React.CSSProperties;
  stepsSidebarCollapsed: boolean;
  setStepsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  handleAddStep: () => void;
  activityResources: any[];
  handleAddActivityFromPool: (activity: any) => void;
  workflowDsl: any;
  selectedStepIndexForConfig: number | null;
  setSelectedStepIndexForConfig: (idx: number | null) => void;
  syncWorkflowInputParamsFromSteps: () => void;
  handleUpdateStep: (index: number, field: string, value: any) => void;
  handleRemoveStep: (index: number) => void;
  resolveStepActivity: (step: any) => any;
  isStructuredTransformActivity: (activity: any, step: any) => boolean;
  handleOpenActivitySelector: (index: number) => void;
  children: React.ReactNode;
}

export const WorkflowEditTimelineSection: React.FC<WorkflowEditTimelineSectionProps> = ({
  resourceSidebarCollapsed,
  setResourceSidebarCollapsed,
  RESOURCE_SIDEBAR_WIDTH,
  COLLAPSED_SIDEBAR_WIDTH,
  SECTION_CARD_STYLE,
  stepsSidebarCollapsed,
  setStepsSidebarCollapsed,
  handleAddStep,
  activityResources,
  handleAddActivityFromPool,
  workflowDsl,
  selectedStepIndexForConfig,
  setSelectedStepIndexForConfig,
  syncWorkflowInputParamsFromSteps,
  handleUpdateStep,
  handleRemoveStep,
  resolveStepActivity,
  isStructuredTransformActivity,
  handleOpenActivitySelector,
  children,
}) => {
  const browserLogicalPlan = workflowDsl?.sourceContext?.browserLogicalPlan;
  const controlPlaneSteps = Array.isArray(browserLogicalPlan?.steps)
    ? browserLogicalPlan.steps.filter((step: any) => step.type !== 'browser_activity')
    : [];
  const totalLogicalSteps =
    Number(browserLogicalPlan?.totalStepCount) ||
    workflowDsl.steps.length + controlPlaneSteps.length;
  return (
    <Row gutter={12} align="top" wrap={false}>
      <Col
        flex={`${resourceSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : RESOURCE_SIDEBAR_WIDTH}px`}
        style={{ transition: 'all 0.24s ease', minWidth: 0 }}
      >
        <Card
          size="small"
          style={{
            ...SECTION_CARD_STYLE,
            height: '100%',
            overflow: 'hidden',
            transition: 'all 0.24s ease',
          }}
          styles={{ body: { padding: resourceSidebarCollapsed ? 6 : 12 } }}
        >
          <Space
            direction="vertical"
            style={{ width: '100%' }}
            size={resourceSidebarCollapsed ? 8 : 10}
          >
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              {!resourceSidebarCollapsed && <Text strong>工作单元资源池</Text>}
              <Tooltip
                title={resourceSidebarCollapsed ? '展开工作单元资源池' : '收起工作单元资源池'}
              >
                <Button
                  size="small"
                  type="text"
                  icon={<ApiOutlined />}
                  onClick={() => setResourceSidebarCollapsed((prev) => !prev)}
                />
              </Tooltip>
            </Space>
            {resourceSidebarCollapsed ? (
              <div
                style={{
                  minHeight: 420,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Tooltip title="工作单元资源池，点击图标展开">
                  <Button
                    type="text"
                    icon={<ApiOutlined style={{ fontSize: 18 }} />}
                    onClick={() => setResourceSidebarCollapsed(false)}
                  />
                </Tooltip>
              </div>
            ) : (
              <>
                <Input
                  placeholder="搜索工作单元..."
                  prefix={<SearchOutlined />}
                  style={{ marginBottom: 8 }}
                  allowClear
                />
                <div
                  style={{
                    maxHeight: 400,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    paddingRight: 2,
                  }}
                >
                  {activityResources.map((activity) => {
                    const isAdded = (workflowDsl.steps || []).some(
                      (s: any) =>
                        (s.activityRef && s.activityRef === activity.ref) ||
                        s.activityName === activity.name
                    );
                    return (
                      <Card
                        key={activity.ref}
                        hoverable
                        size="small"
                        style={{
                          marginBottom: 6,
                          cursor: 'pointer',
                          background: isAdded ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                          border: isAdded
                            ? '1px solid rgba(16, 185, 129, 0.4)'
                            : '1px solid var(--bg-secondary)',
                        }}
                        onClick={() => !isAdded && handleAddActivityFromPool(activity)}
                      >
                        <Space wrap size={[6, 6]}>
                          <Tag
                            color={
                              activity.handler === 'api'
                                ? 'green'
                                : activity.handler === 'script'
                                  ? 'orange'
                                  : 'blue'
                            }
                          >
                            {(activity.handler || '').toUpperCase()}
                          </Tag>
                          {activity.source === 'builtin' ? <Tag color="gold">内置</Tag> : null}
                          <Text
                            strong={!isAdded}
                            type={isAdded ? 'secondary' : undefined}
                            style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}
                          >
                            {activity.name}
                          </Text>
                          {isAdded && <Tag color="green">已添加</Tag>}
                        </Space>
                      </Card>
                    );
                  })}
                  {activityResources.length === 0 && (
                    <Alert message="暂无已验证的工作单元" type="warning" showIcon />
                  )}
                </div>
              </>
            )}
          </Space>
        </Card>
      </Col>

      <Col flex="280px" style={{ minWidth: 0 }}>
        <Card
          size="small"
          style={{
            ...SECTION_CARD_STYLE,
            height: '100%',
            overflow: 'hidden',
            transition: 'all 0.24s ease',
          }}
          styles={{ body: { padding: stepsSidebarCollapsed ? 6 : 12 } }}
        >
          <Space
            direction="vertical"
            style={{ width: '100%' }}
            size={stepsSidebarCollapsed ? 8 : 10}
          >
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              {!stepsSidebarCollapsed && <Text strong>流程节点（{totalLogicalSteps}）</Text>}
              <Space size={4}>
                {!stepsSidebarCollapsed && (
                  <Button
                    icon={<PlusOutlined />}
                    size="small"
                    style={{ minWidth: 92 }}
                    onClick={handleAddStep}
                  >
                    添加步骤
                  </Button>
                )}
                <Tooltip title={stepsSidebarCollapsed ? '展开流程步骤' : '收起流程步骤'}>
                  <Button
                    size="small"
                    type="text"
                    icon={<ThunderboltOutlined />}
                    onClick={() => setStepsSidebarCollapsed((prev) => !prev)}
                  />
                </Tooltip>
              </Space>
            </Space>
            {stepsSidebarCollapsed ? (
              <div
                style={{
                  minHeight: 420,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Tooltip title={`流程节点（${totalLogicalSteps}），点击图标展开`}>
                  <Button
                    type="text"
                    icon={<ThunderboltOutlined style={{ fontSize: 18 }} />}
                    onClick={() => setStepsSidebarCollapsed(false)}
                  />
                </Tooltip>
              </div>
            ) : workflowDsl.steps.length === 0 ? (
              <Alert message="从左侧勾选工作单元或点击添加步骤" type="info" showIcon />
            ) : (
              <Timeline>
                {workflowDsl.steps.map((step: any, index: number) => (
                  <Timeline.Item
                    key={step.id}
                    color={selectedStepIndexForConfig === index ? 'green' : 'blue'}
                    dot={selectedStepIndexForConfig === index ? <CheckCircleOutlined /> : undefined}
                  >
                    <Card
                      hoverable
                      size="small"
                      style={{
                        marginBottom: 6,
                        cursor: 'pointer',
                        background:
                          selectedStepIndexForConfig === index
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'var(--bg-card)',
                        border:
                          selectedStepIndexForConfig === index
                            ? '2px solid rgba(16, 185, 129, 0.6)'
                            : '1px solid var(--bg-secondary)',
                      }}
                      onClick={() => {
                        setSelectedStepIndexForConfig(index);
                        syncWorkflowInputParamsFromSteps();
                      }}
                    >
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Input
                            value={step.name}
                            onChange={(e) => handleUpdateStep(index, 'name', e.target.value)}
                            placeholder="步骤名称"
                            style={{ width: 120 }}
                            size="small"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Space size="small">
                            <Button
                              icon={<DeleteOutlined />}
                              danger
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveStep(index);
                              }}
                            />
                          </Space>
                        </Space>
                        {step.type === 'activity' && (
                          <Space>
                            <Tag color="green">
                              {resolveStepActivity(step)?.name || step.activityName || '未选择'}
                            </Tag>
                            {step.activityRef?.startsWith('builtin:') ? (
                              <Tag color="gold">内置</Tag>
                            ) : null}
                            {isStructuredTransformActivity(resolveStepActivity(step), step) ? (
                              <Tag color="purple">结构化转换</Tag>
                            ) : null}
                            <Button
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenActivitySelector(index);
                              }}
                            >
                              更换
                            </Button>
                          </Space>
                        )}
                      </Space>
                    </Card>
                  </Timeline.Item>
                ))}
                {controlPlaneSteps.map((step: any, index: number) => (
                  <Timeline.Item
                    key={`control-plane:${step.id || index}`}
                    color="purple"
                    dot={<RobotOutlined />}
                  >
                    <Card
                      size="small"
                      style={{
                        marginBottom: 6,
                        background: 'rgba(139, 92, 246, 0.08)',
                        border: '1px solid rgba(139, 92, 246, 0.35)',
                      }}
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Text strong>{step.name || step.id}</Text>
                        <Space wrap size={4}>
                          <Tag color="purple">
                            {step.type === 'llm_operation' ? 'LLM 后处理' : '工作流后处理'}
                          </Tag>
                          <Tag>控制面执行</Tag>
                        </Space>
                        {Array.isArray(step.dependsOn) && step.dependsOn.length > 0 ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            依赖: {step.dependsOn.join(', ')}
                          </Text>
                        ) : null}
                      </Space>
                    </Card>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </Space>
        </Card>
      </Col>

      <Col flex="auto" style={{ minWidth: 0, transition: 'all 0.24s ease' }}>
        {children}
      </Col>
    </Row>
  );
};
