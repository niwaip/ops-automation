/**
 * ExecutionListPage
 * List all executions with filtering and pagination
 * Phase 4: Portal Execution views
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Typography, Select, Input } from 'antd';
import {
  SearchOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { executionApi, ExecutionDto, ExecutionStatus } from '../api/execution';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const statusColors: Record<ExecutionStatus, string> = {
  draft: 'default',
  queued: 'default',
  running: 'processing',
  waiting_input: 'warning',
  pending_approval: 'warning',
  human_control: 'error',
  paused: 'default',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'default',
  rolled_back: 'default',
};

const statusLabels: Record<ExecutionStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  running: 'Running',
  waiting_input: 'Waiting Input',
  pending_approval: 'Pending Approval',
  human_control: 'Human Control',
  paused: 'Paused',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rolled_back: 'Rolled Back',
};

const ExecutionListPage: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | undefined>();
  const [searchText, setSearchText] = useState('');

  // Fetch executions
  const { data, isLoading, isFetching, refetch } = useQuery(
    ['executions', page, pageSize, statusFilter],
    () => executionApi.list({ page, pageSize, status: statusFilter }),
    { keepPreviousData: true }
  );

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id: string) => (
        <Text copyable={{ text: id }} ellipsis={{ tooltip: id }}>
          {id.slice(0, 8)}...
        </Text>
      ),
    },
    {
      title: 'Skill ID',
      dataIndex: 'skillId',
      key: 'skillId',
      width: 120,
      render: (skillId: string) => (
        <Text ellipsis={{ tooltip: skillId }}>{skillId}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: ExecutionStatus) => (
        <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
      ),
    },
    {
      title: 'Risk Level',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 100,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Started',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 160,
      render: (date?: string) => date ? new Date(date).toLocaleString() : '-',
    },
    {
      title: 'Ended',
      dataIndex: 'endedAt',
      key: 'endedAt',
      width: 160,
      render: (date?: string) => date ? new Date(date).toLocaleString() : '-',
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_: unknown, record: ExecutionDto) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/executions/${record.id}`)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 24 }} wrap>
        <div>
          <Title level={2}>Executions</Title>
          <Text type="secondary">View and manage skill execution history</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/executions/new')}>
            {t('newExecution')}
          </Button>
        </Space>
      </Space>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Search by ID or skill..."
            prefix={<SearchOutlined />}
            style={{ width: 200 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <Select
            placeholder="Status"
            style={{ width: 150 }}
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
          >
            <Select.Option value="draft">Draft</Select.Option>
            <Select.Option value="queued">Queued</Select.Option>
            <Select.Option value="running">Running</Select.Option>
            <Select.Option value="waiting_input">Waiting Input</Select.Option>
            <Select.Option value="pending_approval">Pending Approval</Select.Option>
            <Select.Option value="human_control">Human Control</Select.Option>
            <Select.Option value="paused">Paused</Select.Option>
            <Select.Option value="succeeded">Succeeded</Select.Option>
            <Select.Option value="failed">Failed</Select.Option>
            <Select.Option value="cancelled">Cancelled</Select.Option>
            <Select.Option value="rolled_back">Rolled Back</Select.Option>
          </Select>
        </Space>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={data?.data}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: data?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} executions`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1000 }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate(`/executions/${record.id}`),
          })}
        />
      </Card>
    </div>
  );
};

export default ExecutionListPage;
