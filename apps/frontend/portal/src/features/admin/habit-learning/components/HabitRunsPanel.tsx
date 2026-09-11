import { Button, Card, Table, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import React from 'react';
import type { HabitLearningRun } from '@/api/habitLearning';

const { Text } = Typography;

const formatRunStatus = (status: string) => {
  switch (status) {
    case 'succeeded':
      return <Tag color="success" icon={<CheckCircleOutlined />}>批次成功</Tag>;
    case 'failed':
      return <Tag color="error" icon={<CloseCircleOutlined />}>失败</Tag>;
    case 'running':
      return <Tag color="processing" icon={<SyncOutlined spin />}>执行中</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
};

export const HabitRunsPanel: React.FC<{
  runs: HabitLearningRun[];
  loading: boolean;
  running: boolean;
  onRunNow: () => void;
}> = ({ runs, loading, running, onRunNow }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <Card size="small">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Text strong style={{ fontSize: 15 }}>习惯学习离线跑批调度</Text>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            系统默认在<b>每日凌晨 02:30</b> 自动执行日常扫描，分析最近保存的多步工作流并自动激活。您也可以在此随时手动发起一次批次提炼。
          </div>
        </div>
        <Button
          type="primary"
          icon={<ReloadOutlined spin={running} />}
          loading={running}
          onClick={onRunNow}
          size="middle"
        >
          立即生成候选 (Run Now)
        </Button>
      </div>
    </Card>

    <Card size="small" title="历史调度记录">
      <Table
        rowKey="id"
        loading={loading}
        dataSource={runs}
        pagination={{ pageSize: 10 }}
        size="small"
        columns={[
          {
            title: '开始时间',
            dataIndex: 'startedAt',
            width: 170,
            render: (value: string) => new Date(value).toLocaleString(),
          },
          {
            title: '运行状态',
            dataIndex: 'status',
            width: 120,
            render: (value: string) => formatRunStatus(value),
          },
          {
            title: '扫描用户数',
            dataIndex: 'processedUsers',
            width: 110,
            render: (cnt: number) => <span>{cnt} 位用户</span>,
          },
          {
            title: '提炼出候选数',
            dataIndex: 'candidateCount',
            width: 120,
            render: (cnt: number) => <Tag color={cnt > 0 ? 'blue' : 'default'}>{cnt} 个候选</Tag>,
          },
          {
            title: '策略版本',
            dataIndex: 'policyVersion',
            width: 140,
            render: (v: string) => <code>{v}</code>,
          },
          {
            title: '执行耗时/完成时间',
            dataIndex: 'completedAt',
            render: (val?: string, row?: HabitLearningRun) => {
              if (!val) return '-';
              const start = new Date(row?.startedAt || 0).getTime();
              const end = new Date(val).getTime();
              const diffSec = Math.max(0, Math.round((end - start) / 1000));
              return `${new Date(val).toLocaleTimeString()} (耗时 ${diffSec}s)`;
            },
          },
          {
            title: '异常摘要',
            dataIndex: 'errorSummary',
            render: (value?: string) => (value ? <Text type="danger">{value}</Text> : <Text type="secondary">-</Text>),
          },
        ]}
      />
    </Card>
  </div>
);
