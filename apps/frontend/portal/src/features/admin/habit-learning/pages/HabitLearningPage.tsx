import { Alert, Card, message, Table, Tabs, Typography } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import {
  habitLearningApi,
  type HabitCandidate,
  type HabitLearningOverview,
  type HabitLearningRun,
  type HabitLearningStatus,
  type RoutingDiagnostics,
} from '@/api/habitLearning';
import { HabitCandidatesPanel } from '../components/HabitCandidatesPanel';
import { HabitRunsPanel } from '../components/HabitRunsPanel';
import { HabitStatusCards } from '../components/HabitStatusCards';
import { RoutingDiagnosticsPanel } from '../components/RoutingDiagnosticsPanel';

const reasonLabels: Record<string, string> = {
  answer_incorrect: '回答内容不正确',
  wrong_skill_or_workflow: '匹配错技能或工作流',
  missing_step: '缺少执行步骤',
  wrong_parameters: '参数或默认值错误',
  wrong_output_format: '输出格式不符合预期',
  execution_failed: '执行失败',
  unsafe_or_unexpected_side_effect: '不安全或意外副作用',
  other: '其他',
};

const HabitLearningPage: React.FC = () => {
  const [overview, setOverview] = useState<HabitLearningOverview>();
  const [status, setStatus] = useState<HabitLearningStatus>();
  const [candidates, setCandidates] = useState<HabitCandidate[]>([]);
  const [runs, setRuns] = useState<HabitLearningRun[]>([]);
  const [diagnostics, setDiagnostics] = useState<RoutingDiagnostics>();
  const [loading, setLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [running, setRunning] = useState(false);
  const [actingId, setActingId] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setIsError(false);
    try {
      const [nextOverview, nextStatus, nextCandidates, nextRuns, nextDiagnostics] =
        await Promise.all([
          habitLearningApi.getOverview(),
          habitLearningApi.getStatus(),
          habitLearningApi.getCandidates(),
          habitLearningApi.getRuns(),
          habitLearningApi.getRoutingDiagnostics(),
        ]);
      setOverview(nextOverview);
      setStatus(nextStatus);
      setCandidates(nextCandidates.candidates);
      setRuns(nextRuns.runs);
      setDiagnostics(nextDiagnostics);
    } catch {
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      await habitLearningApi.runNow();
      void message.success('候选生成批次已完成');
      await load();
    } catch {
      void message.error('候选生成失败');
    } finally {
      setRunning(false);
    }
  };

  const govern = async (
    candidate: HabitCandidate,
    action: 'hold' | 'reject' | 'rollback',
  ) => {
    setActingId(candidate.id);
    try {
      await habitLearningApi.governCandidate(candidate.id, action);
      void message.success('治理状态已更新');
      await load();
    } catch {
      void message.error('治理操作失败');
    } finally {
      setActingId(undefined);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3}>习惯学习</Typography.Title>
      <Typography.Paragraph type="secondary">
        固定流程优先；用户私有路由候选由 AI 审查后自动生效，Embedding 与 Rerank 保持禁用。
      </Typography.Paragraph>
      <Alert
        showIcon
        type={status?.activationEnabled ? 'success' : 'warning'}
        message={status?.activationEnabled ? '用户路由 AI 自动审核已启用' : '用户路由自动生效已暂停'}
        description="AI 复用保存工作流精确版本的审查结论，不需要管理员逐条审批，也不会执行第二次 Bark、邮件或发布；管理员仅负责观察、暂停和回滚。"
        style={{ marginBottom: 16 }}
      />
      {isError ? <Alert showIcon type="error" message="无法加载习惯学习数据" style={{ marginBottom: 16 }} /> : null}
      <HabitStatusCards overview={overview} status={status} />
      <Tabs
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'candidates',
            label: '候选习惯',
            children: (
              <HabitCandidatesPanel
                candidates={candidates}
                loading={loading}
                actingId={actingId}
                onAction={(candidate, action) => void govern(candidate, action)}
              />
            ),
          },
          {
            key: 'feedback',
            label: '评价分析',
            children: (
              <Card title="负向评价原因">
                <Table
                  rowKey="reasonCode"
                  loading={loading}
                  pagination={false}
                  dataSource={overview?.feedback.negativeReasons || []}
                  columns={[
                    { title: '原因', dataIndex: 'reasonCode', render: (value: string) => reasonLabels[value] || value },
                    { title: '数量', dataIndex: 'count', width: 120 },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'routing',
            label: '路由诊断',
            children: <RoutingDiagnosticsPanel diagnostics={diagnostics} loading={loading} />,
          },
          {
            key: 'runs',
            label: '运行批次',
            children: <HabitRunsPanel runs={runs} loading={loading} running={running} onRunNow={() => void runNow()} />,
          },
        ]}
      />
    </div>
  );
};

export default HabitLearningPage;
