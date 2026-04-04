import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Card, Button, Input, Space, Tag, Select, Modal, message } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  EyeOutlined,
  StopOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { sessionApi, Session } from '../api/session';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

// Session state type matching backend
type SessionState = 'IDLE' | 'RUNNING' | 'HUMAN_CONTROL' | 'CLOSED' | 'ERROR';

const SessionListPage: React.FC = () => {
  const { t } = useTranslation(['common', 'session']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<SessionState | undefined>();
  const [searchText, setSearchText] = useState('');

  const sessionsQuery = useQuery(
    ['sessions', { page, pageSize, status: statusFilter, search: searchText }],
    () => sessionApi.list({ page, pageSize, status: statusFilter, search: searchText })
  );

  const deleteMutation = useMutation(sessionApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['sessions']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const getStateColor = (state: SessionState) => {
    const colorMap: Record<SessionState, string> = {
      IDLE: 'default',
      RUNNING: 'processing',
      HUMAN_CONTROL: 'warning',
      CLOSED: 'default',
      ERROR: 'error',
    };
    return colorMap[state] || 'default';
  };

  const columns: ColumnsType<Session> = [
    {
      title: t('session:sessionId'),
      dataIndex: 'id',
      key: 'id',
      width: 120,
      ellipsis: true,
      render: (id: string) => <span style={{ fontSize: 11 }}>{id.substring(0, 8)}...</span>,
    },
    {
      title: t('session:template'),
      dataIndex: 'template_id',
      key: 'template_id',
      width: 120,
      ellipsis: true,
      render: (templateId: string) => templateId ? <span style={{ fontSize: 11 }}>{templateId.substring(0, 8)}...</span> : '-',
    },
    {
      title: t('session:sessionStatus'),
      dataIndex: 'state',
      key: 'state',
      render: (state: SessionState) => (
        <Tag color={getStateColor(state)}>{state}</Tag>
      ),
    },
    {
      title: t('session:owner'),
      dataIndex: 'user_id',
      key: 'user_id',
      width: 120,
      ellipsis: true,
      render: (userId: string) => <span style={{ fontSize: 11 }}>{userId ? userId.substring(0, 8) + '...' : '-'}</span>,
    },
    {
      title: t('session:startTime'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (createdAt: number) => createdAt ? new Date(createdAt).toLocaleString() : '-',
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/sessions/${record.id}`)}
          >
            {t('session:viewSession')}
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            {t('common:delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const stateOptions: SessionState[] = ['IDLE', 'RUNNING', 'HUMAN_CONTROL', 'CLOSED', 'ERROR'];

  return (
    <div>
      <div className="page-title">{t('session:sessionList')}</div>

      <Card bordered={false}>
        <Space style={{ marginBottom: 20, width: '100%', justifyContent: 'space-between' }}>
          <Space size={12}>
            <Input
              placeholder={t('common:search')}
              prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
            <Select
              placeholder={t('template:filterByStatus')}
              style={{ width: 160 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              allowClear
            >
              {stateOptions.map((state) => (
                <Option key={state} value={state}>
                  {state}
                </Option>
              ))}
            </Select>
          </Space>
          <Space size={12}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => sessionsQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/sessions/new')}
            >
              {t('session:startSession')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={sessionsQuery.data?.sessions || []}
          rowKey="id"
          loading={sessionsQuery.isLoading}
          pagination={{
            current: page,
            pageSize,
            total: sessionsQuery.data?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => t('common:pagination.total', { total }),
            onChange: (newPage, newPageSize) => {
              setPage(newPage);
              setPageSize(newPageSize);
            },
          }}
        />
      </Card>
    </div>
  );
};

export default SessionListPage;