import { Button, Space, Table, Tag } from 'antd';
import React from 'react';
import type { HabitLearningRun } from '@/api/habitLearning';

export const HabitRunsPanel: React.FC<{
  runs: HabitLearningRun[];
  loading: boolean;
  running: boolean;
  onRunNow: () => void;
}> = ({ runs, loading, running, onRunNow }) => (
  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Button type="primary" loading={running} onClick={onRunNow}>立即生成候选</Button>
    <Table
      rowKey="id"
      loading={loading}
      dataSource={runs}
      pagination={false}
      columns={[
        { title: '开始时间', dataIndex: 'startedAt', render: (value: string) => new Date(value).toLocaleString() },
        { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'succeeded' ? 'green' : value === 'failed' ? 'red' : 'blue'}>{value}</Tag> },
        { title: '策略', dataIndex: 'policyVersion' },
        { title: '用户数', dataIndex: 'processedUsers' },
        { title: '新增候选', dataIndex: 'candidateCount' },
        { title: '错误', dataIndex: 'errorSummary', render: (value?: string) => value || '-' },
      ]}
    />
  </Space>
);

