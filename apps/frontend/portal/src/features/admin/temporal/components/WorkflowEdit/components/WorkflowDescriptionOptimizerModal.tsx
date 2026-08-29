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
  Divider,
  Progress,
} from 'antd';
import {
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  CopyOutlined,
  BulbOutlined,
  ExperimentOutlined,
  ArrowRightOutlined,
  NodeIndexOutlined,
  PlayCircleOutlined,
  AimOutlined,
} from '@ant-design/icons';
import {
  workflowAuthoringApi,
  OptimizeDescriptionResponse,
  TestPlannerMatchingResponse,
  FailedTestQueryFeedback,
} from '@/api/workflow-authoring';

const { Text } = Typography;

export interface WorkflowDescriptionOptimizerModalProps {
  visible: boolean;
  onClose: () => void;
  workflowName: string;
  currentDescription: string;
  inputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
  outputParams?: Record<string, unknown> | Array<Record<string, unknown>>;
  steps?: any[];
  onApply: (optimizedDescription: string) => void;
}

export const WorkflowDescriptionOptimizerModal: React.FC<
  WorkflowDescriptionOptimizerModalProps
> = ({
  visible,
  onClose,
  workflowName,
  currentDescription,
  inputParams,
  outputParams,
  steps,
  onApply,
}) => {
  const [loadingOptimize, setLoadingOptimize] = useState(false);
  const [loadingTest, setLoadingTest] = useState(false);
  const [result, setResult] = useState<OptimizeDescriptionResponse | null>(null);
  const [editedDescription, setEditedDescription] = useState('');
  const [testResponse, setTestResponse] = useState<TestPlannerMatchingResponse | null>(null);
  const [customQueryInput, setCustomQueryInput] = useState('');
  const [additionalQueries, setAdditionalQueries] = useState<string[]>([]);

  const failedTestItems =
    testResponse?.results.filter((r) => r.decision === 'no_match') || [];

  const runSimulationTest = async (
    descToTest?: string,
    sampleQueries?: { singleStep: string[]; multiStep: string[] },
    extraQueries?: string[]
  ) => {
    if (!workflowName) return;
    const targetDesc = (descToTest ?? editedDescription).trim();
    if (!targetDesc) {
      message.warning('请先输入或生成描述后再进行测试');
      return;
    }
    setLoadingTest(true);
    try {
      const queriesSource = sampleQueries || result?.sampleQueries;
      const explicitQueries = [
        ...(queriesSource ? [...queriesSource.singleStep, ...queriesSource.multiStep] : []),
        ...(extraQueries || additionalQueries),
      ];

      const res = await workflowAuthoringApi.testPlannerMatching({
        candidateSkill: {
          name: workflowName,
          description: targetDesc,
          inputParams,
          outputParams,
        },
        testQueries: explicitQueries.length > 0 ? explicitQueries : undefined,
        includeDefaultCombos: true,
      });
      setTestResponse(res);
      message.success('规划器仿真测试完成');
    } catch (err: any) {
      message.error(`规划器仿真测试失败: ${err?.message || '未知错误'}`);
    } finally {
      setLoadingTest(false);
    }
  };

  const fetchOptimizationOnly = async (includePreviousFailures = false) => {
    if (!workflowName) {
      message.warning('请先输入工作流名称');
      return;
    }
    setLoadingOptimize(true);

    let previousFailures: FailedTestQueryFeedback[] | undefined = undefined;
    if (includePreviousFailures && failedTestItems.length > 0) {
      previousFailures = failedTestItems.map((item) => ({
        query: item.query,
        decision: item.decision,
        confidence: item.confidence,
        reason: item.reason,
        executionError: item.executionError,
      }));
    }

    try {
      const stepsSummary = (steps || []).map(
        (s) => s.name || s.activityName || s.type || '步骤'
      );
      const optRes = await workflowAuthoringApi.optimizeDescription({
        name: workflowName,
        description: currentDescription,
        inputParams,
        outputParams,
        stepsSummary,
        previousFailures,
      });
      setResult(optRes);
      setEditedDescription(optRes.optimizedDescription);
      if (includePreviousFailures && previousFailures) {
        message.success('已结合上一轮测试失败原因，针对性重新生成描述！');
      }
    } catch (err: any) {
      message.error(`优化生成失败: ${err?.message || '未知错误'}`);
    } finally {
      setLoadingOptimize(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchOptimizationOnly(false);
    } else {
      setResult(null);
      setEditedDescription('');
      setTestResponse(null);
      setCustomQueryInput('');
      setAdditionalQueries([]);
    }
  }, [visible]);

  const handleApply = () => {
    if (!editedDescription.trim()) {
      message.warning('描述内容不能为空');
      return;
    }
    onApply(editedDescription.trim());
    message.success('已应用优化后的描述');
    onClose();
  };

  const handleCopy = () => {
    if (!editedDescription) return;
    navigator.clipboard.writeText(editedDescription);
    message.success('已复制到剪贴板');
  };

  const handleAddCustomQuery = () => {
    const trimmed = customQueryInput.trim();
    if (!trimmed) return;
    const nextList = [...additionalQueries, trimmed];
    setAdditionalQueries(nextList);
    setCustomQueryInput('');
    runSimulationTest(editedDescription.trim(), result?.sampleQueries, nextList);
  };

  return (
    <Modal
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#1677ff' }} />
          <span>AI 优化工作流描述与规划器真实 DAG 仿真验证</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={860}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="retry-desc"
          icon={<ReloadOutlined />}
          onClick={() => fetchOptimizationOnly(failedTestItems.length > 0)}
          loading={loadingOptimize}
        >
          {failedTestItems.length > 0 ? '结合测试失败针对性重生成' : '重新生成描述'}
        </Button>,
        <Button
          key="run-test"
          icon={<ExperimentOutlined />}
          onClick={() => runSimulationTest()}
          loading={loadingTest}
          disabled={!editedDescription.trim() || loadingOptimize}
          style={{ color: '#52c41a', borderColor: '#52c41a' }}
        >
          手动运行规划器测试
        </Button>,
        <Button
          key="apply"
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={handleApply}
          disabled={!editedDescription.trim() || loadingOptimize}
        >
          应用到工作流描述
        </Button>,
      ]}
    >
      <div style={{ minHeight: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Alert
          type="info"
          showIcon
          message="AI 优化与真实环境 DAG 仿真测试"
          description="系统基于当前工作流输入输出生成精炼描述。规划器仿真测试会加载所有已发布的公开技能（如 Bark 推送、Markdown 生成等），以与真实生产 DAG 规划 100% 相同的环境进行多步拓扑推断。若有测试未通过，系统将把失败信息作为反馈，针对性修正描述。"
        />

        {loadingOptimize ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin tip="AI 正在分析工作流输入输出并生成精简描述..." />
          </div>
        ) : result ? (
          <>
            {/* Section 1: Optimized Description */}
            <Card
              size="small"
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <BulbOutlined style={{ color: '#1677ff' }} />
                    <span style={{ fontWeight: 600 }}>优化后的描述 (可直接在下方修改)</span>
                  </Space>
                  <Space>
                    <Button type="link" size="small" icon={<CopyOutlined />} onClick={handleCopy}>
                      复制
                    </Button>
                  </Space>
                </div>
              }
              style={{ borderColor: '#91caff' }}
            >
              <Input.TextArea
                rows={2}
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="AI 优化生成的描述..."
                style={{ fontSize: 13, lineHeight: '1.6' }}
              />

              {result.addressedFailures && result.addressedFailures.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Space wrap size={[8, 4]}>
                    <Text strong style={{ fontSize: 12, color: '#52c41a' }}>
                      <AimOutlined /> 针对性修复:
                    </Text>
                    {result.addressedFailures.map((item, idx) => (
                      <Tag key={idx} color="green" style={{ fontSize: 11 }}>
                        {item}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}

              {result.keyPoints && result.keyPoints.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Space wrap size={[8, 4]}>
                    <Text strong style={{ fontSize: 12 }}>
                      🎯 优化亮点:
                    </Text>
                    {result.keyPoints.map((point, idx) => (
                      <Tag key={idx} color="geekblue" style={{ fontSize: 11 }}>
                        {point}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}
            </Card>

            <Divider style={{ margin: '4px 0' }}>
              <Space>
                <ExperimentOutlined style={{ color: '#52c41a' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>规划器匹配仿真测试（含所有公开技能候补）</span>
              </Space>
            </Divider>

            {/* Section 2: Planner Simulation Benchmark (Manual Trigger) */}
            {loadingTest ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <Spin tip="正在调用规划器执行 DAG 拓扑推断与参数绑定仿真..." />
              </div>
            ) : testResponse ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Summary Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    background: 'var(--bg-secondary, #fafafa)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border-color, #f0f0f0)',
                  }}
                >
                  <Space size={12}>
                    <Text strong style={{ fontSize: 13 }}>测试汇总：</Text>
                    <Tag color="blue">共 {testResponse.summary.total} 个用例</Tag>
                    <Tag color="green" icon={<CheckCircleOutlined />}>
                      匹配成功: {testResponse.summary.passed}
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

                {/* Custom Query Input */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    size="small"
                    placeholder="输入自定义指令追加测试（如：打开特定网页并进行要点总结）..."
                    value={customQueryInput}
                    onChange={(e) => setCustomQueryInput(e.target.value)}
                    onPressEnter={handleAddCustomQuery}
                  />
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleAddCustomQuery}
                    disabled={!customQueryInput.trim() || loadingTest}
                  >
                    测试该指令
                  </Button>
                </div>

                {/* Results List */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    maxHeight: 260,
                    overflowY: 'auto',
                    paddingRight: 4,
                  }}
                >
                  {testResponse.results.map((item, idx) => (
                    <Card
                      key={idx}
                      size="small"
                      style={{
                        borderColor: item.decision === 'matched' ? '#b7eb8f' : '#ffa39e',
                        background: item.decision === 'matched' ? '#f6ffed' : '#fff1f0',
                      }}
                      styles={{ body: { padding: '10px 14px' } }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                                ? '单步'
                                : item.queryType === 'multi_step'
                                  ? '组合流程'
                                  : '自定义'}
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

                        <div style={{ fontSize: 12, color: 'var(--text-secondary, #666)' }}>
                          <Text type="secondary">决策: </Text>
                          {item.reason}
                        </div>

                        {item.plannedNodes && item.plannedNodes.length > 0 && (
                          <div
                            style={{
                              background: 'rgba(255, 255, 255, 0.85)',
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: '1px solid #e8e8e8',
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#595959' }}>
                              <NodeIndexOutlined style={{ marginRight: 4 }} />
                              生成 DAG 节点拓扑 ({item.plannedNodes.length} 步):
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                              {item.plannedNodes.map((node, nodeIdx) => (
                                <React.Fragment key={node.ref}>
                                  <div
                                    style={{
                                      padding: '1px 6px',
                                      background: node.kind === 'skill' ? '#e6f4ff' : '#f9f0ff',
                                      border: `1px solid ${node.kind === 'skill' ? '#91caff' : '#d3adf7'}`,
                                      borderRadius: 4,
                                      fontSize: 11,
                                    }}
                                  >
                                    <span style={{ fontWeight: 600, marginRight: 4 }}>{node.ref}:</span>
                                    <span>{node.displayName}</span>
                                    {node.boundParams && Object.keys(node.boundParams).length > 0 && (
                                      <span style={{ marginLeft: 4, color: '#1677ff', fontSize: 10 }}>
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
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  background: 'var(--bg-secondary, #fafafa)',
                  borderRadius: 8,
                  border: '1px dashed var(--border-color, #d9d9d9)',
                }}
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Text type="secondary">
                    描述已生成。您可以先按需微调描述内容，然后点击下方按钮手动测试规划器的匹配效果：
                  </Text>
                  <div>
                    <Button
                      type="primary"
                      ghost
                      icon={<ExperimentOutlined />}
                      onClick={() => runSimulationTest()}
                      loading={loadingTest}
                      disabled={!editedDescription.trim()}
                    >
                      手动运行规划器测试（全技能候选池）
                    </Button>
                  </div>
                </Space>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
};
