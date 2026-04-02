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
import { sessionApi, Session, SessionStatus } from '../api/session';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

const SessionListPage: React.FC = () => {
  const { t } = useTranslation(['common', 'session']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<SessionStatus | undefined>();
  const [searchText, setSearchText] = useState('');

  const sessionsQuery = useQuery(
    ['sessions', { page, pageSize, status: statusFilter, search: searchText }],
    () => sessionApi.list({ page, pageSize, status: statusFilter, search: searchText })
  );

  const stopMutation = useMutation(sessionApi.stop, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['sessions']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const deleteMutation = useMutation(sessionApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['sessions']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const handleStop = (id: string) => {
    stopMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const columns: ColumnsType<Session> = [
    {
      title: t('session:sessionId'),
      dataIndex: 'id',
      key: 'id',
      width: 120,
      ellipsis: true,
    },
    {
      title: t('session:sessionName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => name || '-',
    },
    {
      title: t('session:sessionType'),
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag>{type}</Tag>,
    },
    {
      title: t('session:sessionStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (status: SessionStatus) => {
        const colorMap: Record<SessionStatus, string> = {
          pending: 'default',
          running: 'processing',
          completed: 'success',
          failed: 'error',
          canceled: 'warning',
          paused: 'orange',
        };
        return (
          <Tag color={colorMap[status]}>
            {t(`session:status${status.charAt(0).toUpperCase() + status.slice(1)}`)}
          </Tag>
        );
      },
    },
    {
      title: t('session:template'),
      dataIndex: ['template', 'name'],
      key: 'template',
      render: (name: string) => name || '-',
    },
    {
      title: t('session:owner'),
      dataIndex: ['owner', 'username'],
      key: 'owner',
    },
    {
      title: t('session:startTime'),
      dataIndex: 'startTime',
      key: 'startTime',
      render: (time: string) => time ? new Date(time).toLocaleString() : '-',
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 200,
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
          {record.status === 'running' && (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => handleStop(record.id)}
            >
              {t('session:stopSession')}
            </Button>
          )}
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

  const statusOptions: SessionStatus[] = ['pending', 'running', 'completed', 'failed', 'canceled', 'paused'];

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
              {statusOptions.map((status) => (
                <Option key={status} value={status}>
                  {t(`session:status${status.charAt(0).toUpperCase() + status.slice(1)}`)}
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
              onClick={() => navigate('/recorder')}
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