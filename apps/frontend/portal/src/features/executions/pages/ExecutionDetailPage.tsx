import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Spin, Alert, Typography } from 'antd';
import { useExecutionDetailQueries } from '../detail/hooks/useExecutionDetailQueries';
import { ExecutionHeaderSection } from '../detail/components/ExecutionHeaderSection';
import { EXECUTION_STATUS_COLORS, EXECUTION_STATUS_LABELS_ZH } from '@/shared/lib/executionStatusMeta';
import InlineRecoveryPanel from '@/features/executions/shared/InlineRecoveryPanel';

const { Text } = Typography;

export const ExecutionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { execution, isLoading, refetch } = useExecutionDetailQueries(id);

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

      <Card title="输入与结果数据" style={{ marginBottom: 16 }}>
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
