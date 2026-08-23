import { Button, Space, Table, Tag } from 'antd';
import React from 'react';
import type { HabitCandidate } from '@/api/habitLearning';

interface Props {
  candidates: HabitCandidate[];
  loading: boolean;
  actingId?: string;
  onAction: (candidate: HabitCandidate, action: 'hold' | 'reject' | 'rollback') => void;
}

export const HabitCandidatesPanel: React.FC<Props> = ({
  candidates,
  loading,
  actingId,
  onAction,
}) => (
  <Table
    rowKey="id"
    loading={loading}
    dataSource={candidates}
    pagination={{ pageSize: 20 }}
    columns={[
      { title: '匿名用户', dataIndex: 'userKey', width: 130 },
      { title: '类型', dataIndex: 'kind', width: 150 },
      {
        title: '固定流程',
        dataIndex: 'workflowName',
        render: (value: string | undefined, row) => value ? `${value} · v${row.savedVersion}` : '-',
      },
      {
        title: '风险',
        dataIndex: 'riskLevel',
        width: 130,
        render: (value: string) => <Tag color={value === 'external_commit' ? 'orange' : 'blue'}>{value}</Tag>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: (value: string) => <Tag>{value}</Tag>,
      },
      {
        title: '操作',
        width: 300,
        render: (_, row) => (
          <Space>
            <Button size="small" loading={actingId === row.id} onClick={() => onAction(row, 'hold')}>Hold</Button>
            <Button size="small" danger onClick={() => onAction(row, 'reject')}>拒绝</Button>
            {row.status === 'active' ? (
              <Button size="small" onClick={() => onAction(row, 'rollback')}>回滚</Button>
            ) : null}
          </Space>
        ),
      },
    ]}
  />
);
