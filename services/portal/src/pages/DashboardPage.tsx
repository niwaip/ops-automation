import React from 'react';
import { Card, Col, Row, Statistic, Table, Typography, Tag, Space, Button } from 'antd';
import {
  DesktopOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { sessionApi } from '../api/session';
import { templateApi } from '../api/template';

const { Title } = Typography;

const DashboardPage: React.FC = () => {
  const { t } = useTranslation(['common', 'session', 'template']);

  // Fetch recent sessions
  const sessionsQuery = useQuery(
    ['sessions', { page: 1, pageSize: 5 }],
    () => sessionApi.list({ page: 1, pageSize: 5 })
  );

  // Fetch stats
  const sessionsStatsQuery = useQuery(['sessions-stats'], () => sessionApi.list());
  const templatesStatsQuery = useQuery(['templates-stats'], () => templateApi.list());

  const sessionColumns = [
    {
      title: t('session:sessionId'),
      dataIndex: 'id',
      key: 'id',
      width: 100,
      ellipsis: true,
    },
    {
      title: t('session:sessionName'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('session:sessionStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          pending: 'default',
          running: 'processing',
          completed: 'success',
          failed: 'error',
          canceled: 'warning',
          paused: 'orange',
        };
        return <Tag color={colorMap[status] || 'default'}>{t(`session:status${status.charAt(0).toUpperCase() + status.slice(1)}`)}</Tag>;
      },
    },
    {
      title: t('session:owner'),
      dataIndex: ['owner', 'username'],
      key: 'owner',
    },
    {
      title: t('common:createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
  ];

  const getStatusCounts = () => {
    const sessions = sessionsStatsQuery.data?.sessions || [];
    return {
      total: sessions.length,
      running: sessions.filter((s) => s.status === 'running').length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      pending: sessions.filter((s) => s.status === 'pending').length,
    };
  };

  const statusCounts = getStatusCounts();

  return (
    <div>
      <Title level={4}>{t('dashboard')}</Title>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('sessions')}
              value={statusCounts.total}
              prefix={<DesktopOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('session:statusRunning')}
              value={statusCounts.running}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('session:statusCompleted')}
              value={statusCounts.completed}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title={t('templates')}
              value={templatesStatsQuery.data?.total || 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span>{t('sessions')}</span>
            <Button icon={<ReloadOutlined />} onClick={() => sessionsQuery.refetch()}>
              {t('refresh')}
            </Button>
          </Space>
        }
        style={{ marginTop: 24 }}
      >
        <Table
          columns={sessionColumns}
          dataSource={sessionsQuery.data?.sessions || []}
          rowKey="id"
          loading={sessionsQuery.isLoading}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
};

export default DashboardPage;