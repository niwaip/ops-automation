import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Statistic, Table, Tag, Space, Button, Typography } from 'antd';
import {
  FileTextOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { executionApi, ExecutionDto, ExecutionStatus } from '../api/execution';
import { templateApi } from '../api/template';

const DashboardPage: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { Text } = Typography;

  const recentExecutionsQuery = useQuery(
    ['dashboard-executions-recent'],
    () => executionApi.list({ page: 1, pageSize: 5 })
  );

  const executionsTotalQuery = useQuery(
    ['dashboard-executions-total'],
    () => executionApi.list({ page: 1, pageSize: 1 })
  );
  const runningExecutionsQuery = useQuery(
    ['dashboard-executions-running'],
    () => executionApi.list({ page: 1, pageSize: 1, status: 'running' })
  );
  const pendingApprovalExecutionsQuery = useQuery(
    ['dashboard-executions-pending-approval'],
    () => executionApi.list({ page: 1, pageSize: 1, status: 'pending_approval' })
  );
  const templatesStatsQuery = useQuery(['templates-stats'], () => templateApi.list());

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
    draft: t('executionStatusDraft'),
    queued: t('executionStatusQueued'),
    running: t('executionStatusRunning'),
    waiting_input: t('executionStatusWaitingInput'),
    pending_approval: t('executionStatusPendingApproval'),
    human_control: t('executionStatusHumanControl'),
    paused: t('executionStatusPaused'),
    succeeded: t('executionStatusSucceeded'),
    failed: t('executionStatusFailed'),
    cancelled: t('executionStatusCancelled'),
    rolled_back: t('executionStatusRolledBack'),
  };

  const executionColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      ellipsis: true,
      render: (id: string) => <span style={{ fontSize: 11 }}>{id.substring(0, 8)}...</span>,
    },
    {
      title: 'Skill ID',
      dataIndex: 'skillId',
      key: 'skillId',
      width: 180,
      ellipsis: true,
      render: (skillId: string) => <Text ellipsis={{ tooltip: skillId }}>{skillId}</Text>,
    },
    {
      title: t('status'),
      dataIndex: 'status',
      key: 'status',
      width: 160,
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
      title: t('createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (createdAt: string) => new Date(createdAt).toLocaleString(),
    },
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="page-title" style={{ marginBottom: 0 }}>
          {t('dashboard')}
        </div>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={() => navigate('/executions/new')}
        >
          {t('newExecution')}
        </Button>
      </Space>

      <Row gutter={[24, 24]} style={{ marginTop: 0 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card card-gradient-1 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('executions')}
              value={executionsTotalQuery.data?.total || 0}
              prefix={<PlayCircleOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card card-gradient-2 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('executionStatusRunning')}
              value={runningExecutionsQuery.data?.total || 0}
              prefix={<ThunderboltOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card card-gradient-3 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('executionStatusPendingApproval')}
              value={pendingApprovalExecutionsQuery.data?.total || 0}
              prefix={<ClockCircleOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card card-gradient-4 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('templates')}
              value={templatesStatsQuery.data?.total || 0}
              prefix={<FileTextOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t('recentExecutions')}</span>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => recentExecutionsQuery.refetch()}
              style={{
                borderRadius: 8,
                fontWeight: 500,
              }}
            >
              {t('refresh')}
            </Button>
          </Space>
        }
        style={{ marginTop: 24 }}
        variant="borderless"
      >
        <Table
          columns={executionColumns}
          dataSource={recentExecutionsQuery.data?.data || []}
          rowKey="id"
          loading={recentExecutionsQuery.isLoading}
          pagination={false}
          size="middle"
          onRow={(record: ExecutionDto) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate(`/executions/${record.id}`),
          })}
        />
      </Card>
    </div>
  );
};

export default DashboardPage;
