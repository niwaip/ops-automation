import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Statistic, Table, Tag, Space, Button } from 'antd';
import {
  DesktopOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { sessionApi } from '../api/session';
import { templateApi } from '../api/template';

const DashboardPage: React.FC = () => {
  const { t } = useTranslation(['common', 'session', 'template']);
  const navigate = useNavigate();

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
      render: (id: string) => <span style={{ fontSize: 11 }}>{id.substring(0, 8)}...</span>,
    },
    {
      title: t('session:template'),
      dataIndex: 'template_id',
      key: 'template_id',
      width: 100,
      ellipsis: true,
      render: (templateId: string) => templateId ? <span style={{ fontSize: 11 }}>{templateId.substring(0, 8)}...</span> : '-',
    },
    {
      title: t('session:sessionStatus'),
      dataIndex: 'state',
      key: 'state',
      render: (state: string) => {
        const colorMap: Record<string, string> = {
          IDLE: 'default',
          RUNNING: 'processing',
          HUMAN_CONTROL: 'warning',
          CLOSED: 'default',
          ERROR: 'error',
        };
        return <Tag color={colorMap[state] || 'default'}>{state}</Tag>;
      },
    },
    {
      title: t('session:owner'),
      dataIndex: 'user_id',
      key: 'user_id',
      width: 100,
      ellipsis: true,
      render: (userId: string) => <span style={{ fontSize: 11 }}>{userId.substring(0, 8)}...</span>,
    },
    {
      title: t('common:createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (createdAt: number) => new Date(createdAt).toLocaleString(),
    },
  ];

  const getStatusCounts = () => {
    const sessions = sessionsStatsQuery.data?.sessions || [];
    return {
      total: sessions.length,
      running: sessions.filter((s: any) => s.state === 'RUNNING').length,
      completed: sessions.filter((s: any) => s.state === 'CLOSED').length,
      pending: sessions.filter((s: any) => s.state === 'IDLE').length,
    };
  };

  const statusCounts = getStatusCounts();

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="page-title" style={{ marginBottom: 0 }}>
          {t('dashboard')}
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/sessions/new')}
        >
          {t('newSession')}
        </Button>
      </Space>

      <Row gutter={[24, 24]} style={{ marginTop: 0 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card card-gradient-1 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('sessions')}
              value={statusCounts.total}
              prefix={<DesktopOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card card-gradient-2 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('session:statusRunning')}
              value={statusCounts.running}
              prefix={<ThunderboltOutlined style={{ opacity: 0.9 }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card card-gradient-3 animate-fade-in-up" variant="borderless">
            <Statistic
              title={t('session:statusCompleted')}
              value={statusCounts.completed}
              prefix={<CheckCircleOutlined style={{ opacity: 0.9 }} />}
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
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t('sessions')}</span>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => sessionsQuery.refetch()}
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
          columns={sessionColumns}
          dataSource={sessionsQuery.data?.sessions || []}
          rowKey="id"
          loading={sessionsQuery.isLoading}
          pagination={false}
          size="middle"
        />
      </Card>
    </div>
  );
};

export default DashboardPage;
