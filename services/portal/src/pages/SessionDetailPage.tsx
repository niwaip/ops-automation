import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Typography, Tabs, message, Spin } from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { sessionApi } from '../api/session';

const { Title } = Typography;
const { TabPane } = Tabs;

const SessionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation(['common', 'session']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery(
    ['session', id],
    () => sessionApi.getById(id!),
    { enabled: !!id }
  );

  const logsQuery = useQuery(
    ['session-logs', id],
    () => sessionApi.getLogs(id!),
    { enabled: !!id }
  );

  const startMutation = useMutation(sessionApi.start, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['session', id]);
    },
  });

  const pauseMutation = useMutation(sessionApi.pause, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['session', id]);
    },
  });

  const resumeMutation = useMutation(sessionApi.resume, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['session', id]);
    },
  });

  const stopMutation = useMutation(sessionApi.stop, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['session', id]);
    },
  });

  const session = sessionQuery.data;

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'default',
      running: 'processing',
      completed: 'success',
      failed: 'error',
      canceled: 'warning',
      paused: 'orange',
    };
    return colorMap[status] || 'default';
  };

  if (sessionQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!session) {
    return (
      <Card>
        <Title level={4}>{t('common:noData')}</Title>
        <Button onClick={() => navigate('/sessions')}>
          <ArrowLeftOutlined /> {t('session:sessionList')}
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/sessions')}>
          <ArrowLeftOutlined /> {t('session:sessionList')}
        </Button>
      </Space>

      <Card
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span>
              {t('session:sessionDetail')} - {session.name || session.id}
            </span>
            <Space>
              {session.status === 'pending' && (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => startMutation.mutate(session.id)}
                >
                  {t('session:startSession')}
                </Button>
              )}
              {session.status === 'running' && (
                <>
                  <Button
                    icon={<PauseCircleOutlined />}
                    onClick={() => pauseMutation.mutate(session.id)}
                  >
                    {t('session:pauseSession')}
                  </Button>
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => stopMutation.mutate(session.id)}
                  >
                    {t('session:stopSession')}
                  </Button>
                </>
              )}
              {session.status === 'paused' && (
                <>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={() => resumeMutation.mutate(session.id)}
                  >
                    {t('session:resumeSession')}
                  </Button>
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => stopMutation.mutate(session.id)}
                  >
                    {t('session:stopSession')}
                  </Button>
                </>
              )}
              <Button icon={<ReloadOutlined />} onClick={() => sessionQuery.refetch()}>
                {t('common:refresh')}
              </Button>
            </Space>
          </Space>
        }
      >
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label={t('session:sessionId')}>{session.id}</Descriptions.Item>
          <Descriptions.Item label={t('session:sessionName')}>
            {session.name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('session:sessionStatus')}>
            <Tag color={getStatusColor(session.status)}>
              {t(`session:status${session.status.charAt(0).toUpperCase() + session.status.slice(1)}`)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('session:sessionType')}>
            <Tag>{session.type}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('session:template')}>
            {session.template?.name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('session:owner')}>
            {session.owner?.username || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('session:browser')}>
            {session.browser}
          </Descriptions.Item>
          <Descriptions.Item label={t('session:viewport')}>
            {session.viewport?.width} x {session.viewport?.height}
          </Descriptions.Item>
          <Descriptions.Item label={t('session:startTime')}>
            {session.startTime ? new Date(session.startTime).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('session:endTime')}>
            {session.endTime ? new Date(session.endTime).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('session:duration')}>
            {session.duration ? `${session.duration} ms` : '-'}
          </Descriptions.Item>
          {session.error && (
            <Descriptions.Item label="Error">
              <span style={{ color: '#ff4d4f' }}>{session.error}</span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Tabs defaultActiveKey="live">
          {session.noVncUrl && (
            <TabPane tab={t('session:liveView')} key="live">
              <div style={{ width: '100%', height: 600, border: '1px solid #d9d9d9', borderRadius: 4 }}>
                <iframe
                  src={session.noVncUrl}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="noVNC"
                />
              </div>
            </TabPane>
          )}
          <TabPane tab={t('session:sessionLogs')} key="logs">
            <pre
              style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: 16,
                borderRadius: 4,
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              {logsQuery.data?.join('\n') || t('common:noData')}
            </pre>
          </TabPane>
          {session.videoUrl && (
            <TabPane tab={t('session:sessionVideo')} key="video">
              <video
                src={session.videoUrl}
                controls
                style={{ width: '100%', maxHeight: 600 }}
              />
            </TabPane>
          )}
          {session.screenshots?.length > 0 && (
            <TabPane tab={t('session:sessionScreenshot')} key="screenshots">
              <Space direction="vertical" style={{ width: '100%' }}>
                {session.screenshots.map((url, index) => (
                  <img
                    key={index}
                    src={url}
                    alt={`Screenshot ${index + 1}`}
                    style={{ maxWidth: '100%', borderRadius: 4 }}
                  />
                ))}
              </Space>
            </TabPane>
          )}
        </Tabs>
      </Card>
    </div>
  );
};

export default SessionDetailPage;