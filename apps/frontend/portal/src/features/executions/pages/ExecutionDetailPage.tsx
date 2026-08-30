import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Spin,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useExecutionDetailQueries } from '../detail/hooks/useExecutionDetailQueries';
import { ExecutionHeaderSection } from '../detail/components/ExecutionHeaderSection';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/lib/executionStatusMeta';
import InlineRecoveryPanel from '@/features/executions/shared/InlineRecoveryPanel';
import { getStepStatusColor } from '@/features/executions/list/listView';
import { StepOutputViewer } from '@/features/executions/shared/StepOutputViewer';

const { Text } = Typography;

const formatDateTime = (val?: string) =>
  val ? new Date(val).toLocaleString() : '-';

export const ExecutionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { execution, isLoading, refetch, steps, isStepsLoading } =
    useExecutionDetailQueries(id);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="加载执行详情..." />
      </div>
    );
  }

  if (!execution) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="未找到该执行记录"
          description={`执行 ID: ${id || '未知'}`}
          action={
            <Button type="primary" onClick={() => navigate('/portal/executions')}>
              返回列表
            </Button>
          }
        />
      </div>
    );
  }

  const sortedSteps = steps ? [...steps].sort((a, b) => a.stepIndex - b.stepIndex) : [];

  return (
    <div style={{ padding: 24 }}>
      <ExecutionHeaderSection
        execution={execution}
        onBack={() => navigate('/portal/executions')}
        onRefresh={() => void refetch()}
      />

      <Card title="基本概览" style={{ marginBottom: 16 }}>
        <Descriptions column={3} size="small" bordered>
          <Descriptions.Item label="状态">
            <Tag color={EXECUTION_STATUS_COLORS[execution.status] || 'default'}>
              {EXECUTION_STATUS_LABELS_ZH[execution.status] || execution.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Skill ID">
            <Text code>{execution.skillId || '-'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="当前步骤">
            {execution.currentStepId || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {new Date(execution.createdAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="开始时间">
            {execution.startedAt ? new Date(execution.startedAt).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="结束时间">
            {execution.endedAt ? new Date(execution.endedAt).toLocaleString() : '-'}
          </Descriptions.Item>
          {execution.failureReason && (
            <Descriptions.Item label="失败原因" span={3}>
              <Text type="danger">{execution.failureReason}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <InlineRecoveryPanel
        executionId={execution.id}
        executionStatus={execution.status}
        currentStepId={execution.currentStepId}
      />

      {/* 执行步骤详情 */}
      <Card
        title={`执行步骤 (${sortedSteps.length} 步)`}
        style={{ marginBottom: 16 }}
        extra={
          isStepsLoading ? <Spin size="small" /> : null
        }
      >
        {isStepsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <Spin tip="加载步骤数据..." />
          </div>
        ) : sortedSteps.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无步骤数据" />
        ) : (
          <Timeline
            items={sortedSteps.map((step) => {
              const hasOutput =
                step.outputJson && Object.keys(step.outputJson).length > 0;
              const hasError = Boolean(step.errorMessage);

              return {
                color: getStepStatusColor(step.status),
                children: (
                  <Card
                    size="small"
                    style={{
                      borderRadius: 10,
                      border: '1px solid var(--bg-secondary)',
                      background: 'var(--bg-card)',
                      marginBottom: 8,
                    }}
                  >
                    {/* 步骤头部：序号、名称、状态 */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text strong>{`步骤 ${step.stepIndex + 1}`}</Text>
                        <Text>{step.name || step.action || step.type || '-'}</Text>
                        {step.action && step.action !== step.name && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            [{step.action}]
                          </Text>
                        )}
                      </div>
                      <Tag color={getStepStatusColor(step.status)}>{step.status}</Tag>
                    </div>

                    {/* 时间信息 */}
                    <div style={{ marginBottom: hasOutput || hasError ? 8 : 0 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        开始：{formatDateTime(step.startedAt)}
                        {'　'}
                        结束：{formatDateTime(step.endedAt)}
                      </Text>
                    </div>

                    {/* 错误信息 */}
                    {hasError && (
                      <Alert
                        type="error"
                        showIcon
                        message="步骤执行失败"
                        description={step.errorMessage}
                        style={{ marginBottom: 8 }}
                      />
                    )}

                    {/* 步骤输出：优先展示截图、正文与动作 */}
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
      </Card>

      {/* 整体执行结果 */}
      <Card title="输入与整体结果数据" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Text strong>输入参数 (Input):</Text>
          <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 6, fontSize: 12, marginTop: 8, maxHeight: 180, overflow: 'auto' }}>
            {JSON.stringify((execution as any).input || (execution as any).inputs || {}, null, 2)}
          </pre>
        </div>
        <div>
          <Text strong>执行结果 (Output / Result):</Text>
          <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 6, fontSize: 12, marginTop: 8, maxHeight: 240, overflow: 'auto' }}>
            {JSON.stringify(execution.resultJson || (execution as any).output || {}, null, 2)}
          </pre>
        </div>
      </Card>
    </div>
  );
};

export default ExecutionDetailPage;
