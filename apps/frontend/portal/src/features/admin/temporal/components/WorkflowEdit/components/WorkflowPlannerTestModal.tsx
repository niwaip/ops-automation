import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Space,
  Typography,
  Card,
  Tag,
  Alert,
  Spin,
  Input,
  message,
  Progress,
} from 'antd';
import {
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  ArrowRightOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import {
  workflowAuthoringApi,
  TestPlannerMatchingResponse,
} from '@/api/workflow-authoring';

const { Text } = Typography;

export interface WorkflowPlannerTestModalProps {
  visible: boolean;
  onClose: () => void;
  workflowName: string;
  description: string;
  inputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
  outputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export const WorkflowPlannerTestModal: React.FC<WorkflowPlannerTestModalProps> = ({
  visible,
  onClose,
  workflowName,
  description,
  inputParams,
  outputParams,
}) => {
  const [loading, setLoading] = useState(false);
  const [testResponse, setTestResponse] = useState<TestPlannerMatchingResponse | null>(null);
  const [customQueryInput, setCustomQueryInput] = useState('');
  const [additionalQueries, setAdditionalQueries] = useState<string[]>([]);

  const runTests = async (customQueriesToRun?: string[]) => {
    if (!workflowName) {
      message.warning('请先输入工作流名称');
      return;
    }
    setLoading(true);
    try {
      const queriesToTest = customQueriesToRun || additionalQueries;
      const res = await workflowAuthoringApi.testPlannerMatching({
        candidateSkill: {
          name: workflowName,
          description: description || workflowName,
          inputParams,
          outputParams,
        },
        testQueries: queriesToTest.length > 0 ? queriesToTest : undefined,
        includeDefaultCombos: true,
      });
      setTestResponse(res);
    } catch (err: any) {
      message.error(`规划器仿真测试失败: ${err?.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      runTests();
    } else {
      setTestResponse(null);
      setCustomQueryInput('');
      setAdditionalQueries([]);
    }
  }, [visible]);

  const handleAddCustomQuery = () => {
    const trimmed = customQueryInput.trim();
    if (!trimmed) return;
    const nextList = [...additionalQueries, trimmed];
    setAdditionalQueries(nextList);
    setCustomQueryInput('');
    runTests(nextList);
  };

  return (
    <Modal
      title={
        <Space>
          <ExperimentOutlined style={{ color: '#52c41a' }} />
          <span>规划器意图匹配与 DAG 仿真测试</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={840}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button
          key="rerun"
          type="primary"
          icon={<ReloadOutlined />}
          onClick={() => runTests()}
          loading={loading}
        >
          重新运行仿真
        </Button>,
      ]}
    >
      <div style={{ minHeight: 320, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Alert
          type="info"
          showIcon
          message="规划器实时仿真环境"
          description="将当前编辑中的工作流（名称、描述、输入输出参数）即时注入确定性任务规划器 (Deterministic Topology Planner)，测试常用单步与多步组合指令能否被大模型准确识别、置信度是否达标及 DAG 拓扑是否正确生成。"
        />

        {/* Custom query input bar */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            placeholder="输入自定义自然语言指令进行测试（如：打开指定知乎专栏网页并进行总结）..."
            value={customQueryInput}
            onChange={(e) => setCustomQueryInput(e.target.value)}
            onPressEnter={handleAddCustomQuery}
          />
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleAddCustomQuery}
            disabled={!customQueryInput.trim() || loading}
          >
            测试该指令
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="规划器正在对测试用例进行 DAG 拓扑推断与参数绑定..." />
          </div>
        ) : testResponse ? (
          <>
            {/* Summary Statistics */}
            <Card size="small" style={{ background: 'var(--bg-secondary, #fafafa)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <Space size={16}>
                  <Text strong>测试汇总：</Text>
                  <Tag color="blue">共 {testResponse.summary.total} 个用例</Tag>
                  <Tag color="green" icon={<CheckCircleOutlined />}>
                    通过: {testResponse.summary.passed}
                  </Tag>
                  {testResponse.summary.failed > 0 && (
                    <Tag color="red" icon={<CloseCircleOutlined />}>
                      未匹配: {testResponse.summary.failed}
                    </Tag>
                  )}
                </Space>
                <div style={{ width: 140 }}>
                  <Progress
                    percent={Math.round(testResponse.summary.passRate * 100)}
                    size="small"
                    status={testResponse.summary.failed === 0 ? 'success' : 'normal'}
                  />
                </div>
              </div>
            </Card>

            {/* Test Results List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {testResponse.results.map((item, idx) => (
                <Card
                  key={idx}
                  size="small"
                  style={{
                    borderColor: item.decision === 'matched' ? '#b7eb8f' : '#ffa39e',
                    background: item.decision === 'matched' ? '#f6ffed' : '#fff1f0',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <Space>
                        <Tag
                          color={
                            item.queryType === 'single_step'
                              ? 'cyan'
                              : item.queryType === 'multi_step'
                                ? 'purple'
                                : 'geekblue'
                          }
                        >
                          {item.queryType === 'single_step'
                            ? '单步测试'
                            : item.queryType === 'multi_step'
                              ? '组合流程'
                              : '自定义测试'}
                        </Tag>
                        <Text strong style={{ fontSize: 13 }}>
                          "{item.query}"
                        </Text>
                      </Space>

                      <Space>
                        {item.decision === 'matched' ? (
                          <Tag color="success" icon={<CheckCircleOutlined />}>
                            匹配成功 (置信度: {item.confidence})
                          </Tag>
                        ) : (
                          <Tag color="error" icon={<CloseCircleOutlined />}>
                            未匹配 (置信度: {item.confidence})
                          </Tag>
                        )}
                      </Space>
                    </div>

                    {/* Reason */}
                    <div style={{ fontSize: 12, color: 'var(--text-secondary, #666)' }}>
                      <Text type="secondary">决策说明: </Text>
                      {item.reason}
                    </div>

                    {/* DAG Sequence */}
                    {item.plannedNodes && item.plannedNodes.length > 0 && (
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.8)',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid #d9d9d9',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          <NodeIndexOutlined style={{ marginRight: 4 }} />
                          生成拓扑节点序列 ({item.plannedNodes.length} 步):
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          {item.plannedNodes.map((node, nodeIdx) => (
                            <React.Fragment key={node.ref}>
                              <div
                                style={{
                                  padding: '2px 8px',
                                  background: node.kind === 'skill' ? '#e6f4ff' : '#f9f0ff',
                                  border: `1px solid ${node.kind === 'skill' ? '#91caff' : '#d3adf7'}`,
                                  borderRadius: 4,
                                  fontSize: 12,
                                }}
                              >
                                <span style={{ fontWeight: 600, marginRight: 4 }}>{node.ref}:</span>
                                <span>{node.displayName}</span>
                                {node.boundParams && Object.keys(node.boundParams).length > 0 && (
                                  <span style={{ marginLeft: 6, color: '#1677ff', fontSize: 11 }}>
                                    ({Object.keys(node.boundParams).join(', ')})
                                  </span>
                                )}
                              </div>
                              {nodeIdx < item.plannedNodes!.length - 1 && (
                                <ArrowRightOutlined style={{ fontSize: 10, color: '#8c8c8c' }} />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
};
