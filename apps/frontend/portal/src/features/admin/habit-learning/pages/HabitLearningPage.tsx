import { Alert, Badge, message, Space, Tabs, Tag, Typography } from 'antd';
import {
  AppstoreOutlined,
  CommentOutlined,
  DashboardOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
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
import { HabitFeedbackPanel } from '../components/HabitFeedbackPanel';
import { HabitRunsPanel } from '../components/HabitRunsPanel';
import { HabitStatusCards } from '../components/HabitStatusCards';
import { RoutingDiagnosticsPanel } from '../components/RoutingDiagnosticsPanel';

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
      void message.success('候选提炼批次已成功完成');
      await load();
    } catch {
      void message.error('候选提炼批次执行失败');
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

  const candidateCount = candidates.length || 0;

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1600, margin: '0 auto' }}>
      {/* 紧凑单行页面头部 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space align="center" size="middle">
          <Typography.Title level={4} style={{ margin: 0, color: 'var(--text-primary)' }}>
            习惯学习与经验路由
          </Typography.Title>
          <Tag color={status?.activationEnabled ? 'success' : 'warning'}>
            {status?.activationEnabled ? 'AI 自动审核已开启' : '自动生效已暂停'}
          </Tag>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          已沉淀 <b>{status?.habitCounts?.active || 0}</b> 个生效习惯 · 0-Token 极速直通
        </Typography.Text>
      </div>

      {isError ? (
        <Alert
          showIcon
          type="error"
          message="无法加载习惯学习数据，请检查服务连通性"
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {/* 统一 Portal 风格的数据卡片 */}
      <HabitStatusCards overview={overview} status={status} />

      <Tabs
        style={{ marginTop: 8 }}
        type="card"
        items={[
          {
            key: 'candidates',
            label: (
              <span>
                <AppstoreOutlined /> 习惯卡片流
                <Badge
                  count={candidateCount}
                  overflowCount={99}
                  style={{ marginLeft: 8, backgroundColor: '#1677ff' }}
                />
              </span>
            ),
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
            key: 'routing',
            label: (
              <span>
                <DashboardOutlined /> 路由效益与诊断
              </span>
            ),
            children: <RoutingDiagnosticsPanel diagnostics={diagnostics} loading={loading} />,
          },
          {
            key: 'feedback',
            label: (
              <span>
                <CommentOutlined /> 用户评价与安全闭环
              </span>
            ),
            children: <HabitFeedbackPanel overview={overview} loading={loading} />,
          },
          {
            key: 'runs',
            label: (
              <span>
                <HistoryOutlined /> 离线调度记录
              </span>
            ),
            children: (
              <HabitRunsPanel
                runs={runs}
                loading={loading}
                running={running}
                onRunNow={() => void runNow()}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

export default HabitLearningPage;
