import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Tag, Button, Space, Typography, message, Spin, Popconfirm } from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { sessionApi, Session } from '../api/session';

const { Title, Text } = Typography;

const SessionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation(['common', 'session']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery(
    ['session', id],
    () => sessionApi.getById(id!),
    {
      enabled: !!id,
      refetchInterval: 3000, // Auto refresh every 3 seconds
    }
  );

  const deleteMutation = useMutation(sessionApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      navigate('/sessions');
    },
  });

  const session = sessionQuery.data;

  const getStateColor = (state: string) => {
    const colorMap: Record<string, string> = {
      IDLE: 'default',
      RUNNING: 'processing',
      HUMAN_CONTROL: 'warning',
      CLOSED: 'default',
      ERROR: 'error',
    };
    return colorMap[state] || 'default';
  };

  const getControlModeColor = (mode: string) => {
    return mode === 'AGENT_RUNNING' ? 'blue' : 'orange';
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

      {/* Status Card - Simplified */}
      <Card
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <span>{t('session:sessionDetail')}</span>
              <Tag color={getStateColor(session.state)}>{session.state}</Tag>
              <Tag color={getControlModeColor(session.control_mode)}>{session.control_mode}</Tag>
              {session.frozen && <Tag color="red">FROZEN</Tag>}
            </Space>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => sessionQuery.refetch()}>
                {t('common:refresh')}
              </Button>
              <Popconfirm
                title={t('common:confirmDelete')}
                onConfirm={() => deleteMutation.mutate(session.id)}
              >
                <Button danger icon={<StopOutlined />}>
                  {t('session:closeSession')}
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div>
            <Text type="secondary">{t('session:sessionId')}: </Text>
            <Text code>{session.id}</Text>
          </div>
          <div>
            <Text type="secondary">{t('session:template')}: </Text>
            <Text>{session.template_id || '-'}</Text>
          </div>
          {session.step_index !== undefined && (
            <div>
              <Text type="secondary">Step: </Text>
              <Text>{session.step_index + 1} {session.current_step ? `(${session.current_step})` : ''}</Text>
            </div>
          )}
          {session.params && Object.keys(session.params).length > 0 && (
            <div>
              <Text type="secondary">{t('session:params')}: </Text>
              <Text code>{JSON.stringify(session.params)}</Text>
            </div>
          )}
        </Space>
      </Card>

      {/* noVNC View */}
      {session.endpoints?.novnc && (
        <Card
          style={{ marginTop: 16 }}
          title={
            <Space>
              <EyeOutlined />
              {t('session:liveView')}
            </Space>
          }
          extra={
            <Button
              type="link"
              onClick={() => window.open(session.endpoints!.novnc, '_blank')}
            >
              Open in new tab
            </Button>
          }
        >
          <div style={{ width: '100%', height: 800, border: '1px solid #d9d9d9', borderRadius: 4, background: '#1e1e1e' }}>
            <iframe
              src={`${session.endpoints.novnc}?autoconnect=true&resize=scale`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="noVNC"
            />
          </div>
        </Card>
      )}

      {/* Endpoints Info */}
      {session.endpoints && (
        <Card style={{ marginTop: 16 }} title="Connection Info">
          <Space direction="vertical">
            <div>
              <Text type="secondary">noVNC: </Text>
              <Text code>{session.endpoints.novnc}</Text>
            </div>
            <div>
              <Text type="secondary">CDP: </Text>
              <Text code>{session.endpoints.cdp}</Text>
            </div>
            {session.endpoints.vnc && (
              <div>
                <Text type="secondary">VNC: </Text>
                <Text code>{session.endpoints.vnc}</Text>
              </div>
            )}
          </Space>
        </Card>
      )}
    </div>
  );
};

export default SessionDetailPage;