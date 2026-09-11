import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Space,
  Spin,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useExecutionDetailQueries } from '../detail/hooks/useExecutionDetailQueries';
import { skillApi } from '@/api/skill';
import { capabilityReleaseApi } from '@/api/capabilities';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/lib/executionStatusMeta';
import InlineRecoveryPanel from '@/features/executions/shared/InlineRecoveryPanel';
import { formatDuration, getStepStatusColor } from '@/features/executions/list/listView';
import { StepOutputViewer } from '@/features/executions/shared/StepOutputViewer';
import { ExecutionStatusBanner } from '../list/components/ExecutionStatusBanner';
import { extractExecutionDownloadUrl, resolveExecutionNormalizedResult } from '@ops/user-core';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';
import { ExecutionTraceTab } from '../detail/components/ExecutionTraceTab';

const { Title, Text } = Typography;

const formatDateTime = (val?: string) =>
  val ? new Date(val).toLocaleString() : '-';

export const ExecutionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryTab = searchParams.get('tab') as 'steps' | 'trace' | 'result' | 'input' | 'meta' | null;
  const [activeTab, setActiveTab] = useState<'steps' | 'trace' | 'result' | 'input' | 'meta'>(
    queryTab && ['steps', 'trace', 'result', 'input', 'meta'].includes(queryTab) ? queryTab : 'steps'
  );

  const { execution, isLoading, refetch, steps, isStepsLoading } =
    useExecutionDetailQueries(id);

  // 技能名称映射
  const { data: skillsData } = useQuery(['skills-name-map'], () => skillApi.list(), { staleTime: 60000 });
  const { data: releasesData } = useQuery(['published-skills-name-map'], () => capabilityReleaseApi.listReleaseCenter(), { staleTime: 60000 });

  const skillDisplayName: string = useMemo(() => {
    if (!execution?.skillId) return '-';
    const releaseMatch = (releasesData?.releases || []).find((r) => r.publishedSkillId === execution.skillId);
    if (releaseMatch?.sourceName || releaseMatch?.sourceId) {
      return (releaseMatch.sourceName || releaseMatch.sourceId) || '-';
    }
    const skillMatch = (skillsData?.skills || []).find((s) => s.id === execution.skillId);
    if (skillMatch?.name) {
      return skillMatch.name;
    }
    return execution.skillId || '-';
  }, [execution?.skillId, releasesData?.releases, skillsData?.skills]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="加载执行现场与步骤流..." />
      </div>
    );
  }

  if (!execution) {
    return (
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Alert
          type="error"
          message="未找到该执行记录"
          description={`执行 ID: ${id || '未知'}`}
          action={
            <Button type="primary" onClick={() => navigate('/executions')}>
              返回列表
            </Button>
          }
        />
      </div>
    );
  }

  const sortedSteps = steps ? [...steps].sort((a, b) => a.stepIndex - b.stepIndex) : [];
  const currentStep = execution.currentStepId
    ? sortedSteps.find((s) => s.id === execution.currentStepId)
    : undefined;

  const normalizedResult = resolveExecutionNormalizedResult(execution);
  const downloadUrl = extractExecutionDownloadUrl(execution);
  const resolvedDownloadUrl = downloadUrl ? replaceLocalhostWithCurrentHost(downloadUrl) : undefined;

  const rawInput = (execution as any).input || (execution as any).inputs || {};
  const rawResult = execution.resultJson || (execution as any).output || {};

  const handleCopy = (content: string, label: string) => {
    navigator.clipboard.writeText(content).then(() => {
      message.success(`已复制 ${label} 到剪贴板`);
    });
  };

  return (
    <div style={{ padding: '20px 24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* 1. 顶部操作栏与标题 */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 14,
          border: '1px solid var(--bg-secondary)',
          background: 'var(--bg-card)',
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Space size="middle" align="center">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/executions')}
            >
              返回列表
            </Button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Title level={4} style={{ margin: 0 }}>
                  {skillDisplayName}
                </Title>
                <Tag
                  color={EXECUTION_STATUS_COLORS[execution.status] || 'default'}
                  style={{ fontSize: 12, padding: '2px 8px' }}
                >
                  {EXECUTION_STATUS_LABELS_ZH[execution.status] || execution.status}
                </Tag>
              </div>
              <Space size={12} style={{ marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ID: <Text code copyable={{ text: execution.id }}>{execution.id}</Text>
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  开始时间: {formatDateTime(execution.startedAt || execution.createdAt)}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  耗时: {formatDuration(execution)}
                </Text>
              </Space>
            </div>
          </Space>
          <Button
            icon={<ReloadOutlined spin={isStepsLoading} />}
            onClick={() => void refetch()}
          >
            刷新状态
          </Button>
        </div>
      </Card>

      {/* 2. 状态态势与故障排查 Banner */}
      <div style={{ marginBottom: 16 }}>
        <ExecutionStatusBanner
          execution={execution}
          skillDisplayName={skillDisplayName}
          currentStep={currentStep}
        />
      </div>

      {/* 3. 内联自愈恢复面板 */}
      <div style={{ marginBottom: 16 }}>
        <InlineRecoveryPanel
          executionId={execution.id}
          executionStatus={execution.status}
          currentStepId={execution.currentStepId}
        />
      </div>

      {/* 4. 主内容 Tabs */}
      <Card
        style={{
          borderRadius: 14,
          border: '1px solid var(--bg-secondary)',
          background: 'var(--bg-card)',
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as any)}
          items={[
            {
              key: 'steps',
              label: `执行步骤与现场 (${sortedSteps.length} 步)`,
              children: (
                <div style={{ marginTop: 8 }}>
                  {isStepsLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                      <Spin tip="加载步骤数据..." />
                    </div>
                  ) : sortedSteps.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无步骤现场数据" />
                  ) : (
                    <Timeline
                      items={sortedSteps.map((step) => {
                        const hasOutput = step.outputJson && Object.keys(step.outputJson).length > 0;
                        const hasError = Boolean(step.errorMessage);

                        return {
                          color: getStepStatusColor(step.status),
                          children: (
                            <Card
                              size="small"
                              style={{
                                borderRadius: 10,
                                border: hasError
                                  ? '1px solid rgba(255, 77, 79, 0.4)'
                                  : '1px solid var(--bg-secondary)',
                                background: hasError
                                  ? 'rgba(255, 77, 79, 0.04)'
                                  : 'var(--bg-card)',
                                marginBottom: 12,
                              }}
                            >
                              {/* 步骤头部 */}
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  flexWrap: 'wrap',
                                  gap: 8,
                                  marginBottom: 6,
                                }}
                              >
                                <Space size={8} wrap>
                                  <Text strong style={{ fontSize: 13 }}>
                                    {`步骤 ${step.stepIndex + 1}`}
                                  </Text>
                                  <Text style={{ fontSize: 13, fontWeight: 500 }}>
                                    {step.name || step.action || step.type || '-'}
                                  </Text>
                                  {step.action && step.action !== step.name && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      [{step.action}]
                                    </Text>
                                  )}
                                </Space>
                                <Tag color={getStepStatusColor(step.status)} style={{ marginInlineEnd: 0 }}>
                                  {step.status}
                                </Tag>
                              </div>

                              {/* 时间 */}
                              <div style={{ marginBottom: hasOutput || hasError ? 8 : 0 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  开始：{formatDateTime(step.startedAt)}　结束：{formatDateTime(step.endedAt)}
                                </Text>
                              </div>

                              {/* 错误告警 */}
                              {hasError && (
                                <Alert
                                  type="error"
                                  showIcon
                                  message="步骤执行中断"
                                  description={step.errorMessage}
                                  style={{ marginBottom: 10, borderRadius: 8 }}
                                />
                              )}

                              {/* 步骤产物 / 动作现场 */}
                              {hasOutput && (
                                <StepOutputViewer
                                  outputJson={step.outputJson}
                                  stepName={step.name}
                                  stepAction={step.action}
                                />
                              )}
                            </Card>
                          ),
                        };
                      })}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'trace',
              label: '链路追踪与耗时',
              children: (
                <div style={{ marginTop: 8 }}>
                  <ExecutionTraceTab execution={execution} steps={steps} />
                </div>
              ),
            },
            {
              key: 'result',
              label: '最终产物与结果',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
                  {resolvedDownloadUrl && (
                    <Alert
                      type="success"
                      showIcon
                      icon={<DownloadOutlined />}
                      message="产物文件已生成"
                      description={
                        <Button
                          type="primary"
                          size="small"
                          icon={<DownloadOutlined />}
                          href={resolvedDownloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginTop: 6 }}
                        >
                          点击下载结果产物文件
                        </Button>
                      }
                      style={{ borderRadius: 10 }}
                    />
                  )}
                  {normalizedResult?.summary && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        border: '1px solid var(--bg-secondary)',
                        background: 'var(--bg-secondary)',
                      }}
                    >
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>结果摘要：</Text>
                      <Text>{normalizedResult.summary}</Text>
                    </div>
                  )}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text strong>执行返回数据 (Output / Result JSON):</Text>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(JSON.stringify(rawResult, null, 2), '结果 JSON')}
                      >
                        复制 JSON
                      </Button>
                    </div>
                    <pre
                      style={{
                        background: 'var(--bg-secondary)',
                        padding: 14,
                        borderRadius: 8,
                        fontSize: 12,
                        maxHeight: 400,
                        overflow: 'auto',
                        border: '1px solid var(--border-color, rgba(140, 140, 140, 0.2))',
                      }}
                    >
                      {JSON.stringify(rawResult, null, 2)}
                    </pre>
                  </div>
                </Space>
              ),
            },
            {
              key: 'input',
              label: '触发参数与输入',
              children: (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong>指令参数 (Input JSON):</Text>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(JSON.stringify(rawInput, null, 2), '输入 JSON')}
                    >
                      复制 JSON
                    </Button>
                  </div>
                  <pre
                    style={{
                      background: 'var(--bg-secondary)',
                      padding: 14,
                      borderRadius: 8,
                      fontSize: 12,
                      maxHeight: 400,
                      overflow: 'auto',
                      border: '1px solid var(--border-color, rgba(140, 140, 140, 0.2))',
                    }}
                  >
                    {JSON.stringify(rawInput, null, 2)}
                  </pre>
                </div>
              ),
            },
            {
              key: 'meta',
              label: '基础元数据与环境',
              children: (
                <div style={{ marginTop: 8 }}>
                  <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
                    <Descriptions.Item label="工单 ID">
                      <Text copyable={{ text: execution.id }}>{execution.id}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="所属技能">
                      {skillDisplayName} ({execution.skillId || '-'})
                    </Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Tag color={EXECUTION_STATUS_COLORS[execution.status] || 'default'}>
                        {EXECUTION_STATUS_LABELS_ZH[execution.status] || execution.status}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="风险级别">
                      {execution.riskLevel || 'normal'}
                    </Descriptions.Item>
                    <Descriptions.Item label="运行时环境">
                      {execution.runtimeType || 'default'}
                    </Descriptions.Item>
                    <Descriptions.Item label="会话 ID (Session)">
                      {execution.runtimeSessionId || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="创建时间">
                      {formatDateTime(execution.createdAt)}
                    </Descriptions.Item>
                    <Descriptions.Item label="开始时间">
                      {formatDateTime(execution.startedAt)}
                    </Descriptions.Item>
                    <Descriptions.Item label="结束时间">
                      {formatDateTime(execution.endedAt)}
                    </Descriptions.Item>
                    <Descriptions.Item label="当前步骤 ID">
                      {execution.currentStepId || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="当前阶段 Key">
                      {execution.currentPhaseKey || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="耗时">
                      {formatDuration(execution)}
                    </Descriptions.Item>
                    {execution.failureReason && (
                      <Descriptions.Item label="失败原因" span={3}>
                        <Text type="danger">{execution.failureReason}</Text>
                      </Descriptions.Item>
                    )}
                    {execution.takeoverReason && (
                      <Descriptions.Item label="接管原因" span={3}>
                        <Text type="warning">{execution.takeoverReason}</Text>
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default ExecutionDetailPage;
