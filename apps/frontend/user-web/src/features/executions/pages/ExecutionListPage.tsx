import { Button, Card, Table, Tag, Typography, Space } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
  summarizeExecutionListResult,
  sortExecutionsByRecent,
  type ExecutionDto,
} from '@ops/user-core';
import { executionApi } from '../../../api';

export function ExecutionListPage() {
  const navigate = useNavigate();
  const { data, isLoading, isFetching, refetch } = useQuery(['user-web-executions'], () =>
    executionApi.list({ page: 1, pageSize: 50 })
  );

  const rows = useMemo(() => sortExecutionsByRecent(data?.data || []), [data?.data]);

  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            执行列表
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            当前页面由 user-web 独立承载，并直接复用 user-core 的类型、状态和 API 封装。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/executions/new')}
          >
            创建执行
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void refetch()} loading={isFetching}>
            刷新
          </Button>
        </Space>
      </Space>
      <Table<ExecutionDto>
        rowKey="id"
        loading={isLoading}
        dataSource={rows}
        pagination={false}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => navigate(`/executions/${record.id}`),
        })}
        columns={[
          {
            title: '执行 ID',
            dataIndex: 'id',
            key: 'id',
            render: (value: string) => <Typography.Text copyable>{value}</Typography.Text>,
          },
          { title: '技能', dataIndex: 'skillId', key: 'skillId' },
          {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: (status: ExecutionDto['status']) => (
              <Tag color={EXECUTION_STATUS_COLORS[status]}>
                {EXECUTION_STATUS_LABELS_ZH[status]}
              </Tag>
            ),
          },
          {
            title: '创建时间',
            key: 'createdAt',
            render: (_, record) => new Date(record.startedAt || record.createdAt).toLocaleString(),
          },
          {
            title: '结果摘要',
            key: 'resultSummary',
            render: (_, record) => summarizeExecutionListResult(record),
          },
        ]}
      />
    </Card>
  );
}
