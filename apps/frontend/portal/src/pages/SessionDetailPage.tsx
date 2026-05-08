import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Tag, Button, Space, Typography, message, Spin, Popconfirm, Collapse, Image, Empty, Tabs, Select, Timeline, theme as antdTheme } from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CameraOutlined,
  FileTextOutlined,
  CodeOutlined,
  ClockCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'react-query';
import { sessionApi, StepResult } from '../api/session';
import { templateApi } from '../api/template';

const { Title, Text } = Typography;

const isTerminalSessionState = (state?: string): boolean => state === 'CLOSED' || state === 'ERROR';

const formatSessionTime = (timestamp?: number): string => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

// Transform localhost URLs to use VITE_HOST_IP for LAN access
const transformLocalhostUrl = (url: string | undefined): string => {
  if (!url) return url || '';
  const hostIp = import.meta.env.VITE_HOST_IP;
  if (hostIp && url.includes('localhost')) {
    return url.replace(/http:\/\/localhost:/, `http://${hostIp}:`);
  }
  return url;
};

const SessionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation(['common', 'session']);
  const navigate = useNavigate();
  const { token } = antdTheme.useToken();

  const sessionQuery = useQuery(
    ['session', id],
    () => sessionApi.getById(id!),
    {
      enabled: !!id,
      refetchInterval: (data) => (isTerminalSessionState(data?.state) ? false : 3000),
    }
  );

  const stepsQuery = useQuery(
    ['session-steps', id],
    () => sessionApi.getStepResults(id!),
    {
      enabled: !!id,
      refetchInterval: () => (isTerminalSessionState(sessionQuery.data?.state) ? false : 3000),
    }
  );
  const session = sessionQuery.data;

  const templateDetailQuery = useQuery(
    ['template-brief', session?.template_id],
    () => templateApi.getById(session!.template_id!),
    {
      enabled: Boolean(session?.template_id),
    },
  );

  const templateSessionHistoryQuery = useQuery(
    ['template-session-history', sessionQuery.data?.template_id],
    async () => {
      const templateId = sessionQuery.data?.template_id;
      if (!templateId) {
        return [];
      }
      const result = await sessionApi.list({ page: 1, pageSize: 200 });
      return (result.sessions || [])
        .filter((item) => item.template_id === templateId)
        .sort((a, b) => Number(b.last_activity || b.created_at || 0) - Number(a.last_activity || a.created_at || 0));
    },
    {
      enabled: Boolean(sessionQuery.data?.template_id),
    },
  );

  const deleteMutation = useMutation(sessionApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      navigate('/templates');
    },
  });

  const steps = stepsQuery.data || [];
  const jsonBlockStyle: React.CSSProperties = {
    background: token.colorFillAlter,
    color: token.colorText,
    border: `1px solid ${token.colorBorderSecondary}`,
    padding: 8,
    borderRadius: 4,
    fontSize: 11,
    maxHeight: 200,
    overflow: 'auto',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

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

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'screenshot':
        return <CameraOutlined />;
      case 'wait':
        return <ClockCircleOutlined />;
      case 'navigate':
        return <PlayCircleOutlined />;
      case 'click':
        return <FileTextOutlined />;
      case 'fill':
        return <CodeOutlined />;
      default:
        return <FileTextOutlined />;
    }
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
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeftOutlined /> {t('session:sessionList')}
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeftOutlined /> {t('session:sessionList')}
        </Button>
      </Space>

      {/* Status Card */}
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
              <Button icon={<ReloadOutlined />} onClick={() => {
                sessionQuery.refetch();
                stepsQuery.refetch();
              }}>
                {t('common:refresh')}
              </Button>
              <Popconfirm
                title={t('common:confirmDelete')}
                onConfirm={() => deleteMutation.mutate(session.id)}
              >
                <Button danger icon={<StopOutlined />}>
                  删除会话
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Space size={8}>
              <Text type="secondary">模板:</Text>
              <Text strong>{templateDetailQuery.data?.name || session.template_id || '-'}</Text>
            </Space>
            {session.template_id ? (
              <Space size={8}>
                <Text type="secondary">历史会话:</Text>
                <Select
                  size="small"
                  style={{ minWidth: 420 }}
                  loading={templateSessionHistoryQuery.isLoading}
                  value={session.id}
                  onChange={(nextSessionId) => {
                    if (nextSessionId !== session.id) {
                      navigate(`/sessions/${nextSessionId}`);
                    }
                  }}
                  options={(templateSessionHistoryQuery.data || []).map((item) => ({
                    value: item.id,
                    label: `${item.state} · ${formatSessionTime(item.last_activity || item.created_at)}`,
                  }))}
                />
              </Space>
            ) : null}
          </div>
          {session.step_index !== undefined && (
            <div>
              <Text type="secondary">Step: </Text>
              <Text>{session.step_index + 1} {session.current_step ? `(${session.current_step})` : ''}</Text>
            </div>
          )}
          {/* Execution Parameters Display */}
          {session.params && Object.keys(session.params).filter(k => k !== 'schedule').length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{t('session:params')}: </Text>
              <Card
                size="small"
                style={{
                  background: token.colorFillAlter,
                  borderRadius: 8,
                  marginTop: 4,
                  borderColor: token.colorBorderSecondary,
                }}
              >
                {Object.entries(session.params)
                  .filter(([key]) => key !== 'schedule')
                  .map(([key, value]) => (
                    <div key={key} style={{ marginBottom: 4 }}>
                      <Text code>{key}</Text>: <Text strong>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</Text>
                    </div>
                  ))}
              </Card>
            </div>
          )}
        </Space>
      </Card>

      {/* Real-time noVNC View - Show during execution */}
      {(session.state === 'RUNNING' || session.state === 'IDLE') && session.endpoints?.novnc && (
        <Card
          style={{ marginTop: 16 }}
          title={
            <Space>
              <EyeOutlined />
              实时画面
              <Tag color="processing">执行中</Tag>
            </Space>
          }
          extra={
            <Button
              type="link"
              onClick={() => window.open(transformLocalhostUrl(session.endpoints!.novnc), '_blank')}
            >
              新窗口打开
            </Button>
          }
        >
          <div style={{ width: '100%', height: 600, border: '1px solid #d9d9d9', borderRadius: 4, background: '#1e1e1e' }}>
            <iframe
              src={`${transformLocalhostUrl(session.endpoints.novnc)}?autoconnect=true&resize=scale`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="noVNC"
            />
          </div>
        </Card>
      )}

      {/* Step Results Card */}
      <Card
        style={{ marginTop: 16 }}
        title={
          <Space>
            <FileTextOutlined />
            执行步骤结果
            <Tag color={steps.length > 0 ? 'processing' : 'default'}>
              {steps.length} 步
            </Tag>
          </Space>
        }
      >
        {steps.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={session.state === 'RUNNING' ? '正在执行中...' : '暂无步骤结果'}
          />
        ) : (
          <Timeline
            items={steps.map((step: StepResult, index: number) => ({
              color: step.success ? 'green' : 'red',
              dot: step.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />,
              children: (
                <Card
                  size="small"
                  style={{
                    background: step.success ? 'rgba(16, 185, 129, 0.10)' : 'rgba(239, 68, 68, 0.10)',
                    border: `1px solid ${step.success ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)'}`,
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <Tag color={step.success ? 'success' : 'error'}>
                        {step.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                      </Tag>
                      <Tag color="blue">{index + 1}</Tag>
                      <Space size="small">
                        {getActionIcon(step.action)}
                        <Text strong>{step.action}</Text>
                      </Space>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </Text>
                  </Space>

                  {/* Error message */}
                  {step.error && (
                    <div
                      style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.24)',
                        padding: 8,
                        borderRadius: 4,
                      }}
                    >
                      <Text type="danger">{step.error}</Text>
                    </div>
                  )}

                  {/* Success message */}
                  {step.message && step.success && (
                    <div
                      style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.24)',
                        padding: 8,
                        borderRadius: 4,
                      }}
                    >
                      <Text type="success">{step.message}</Text>
                    </div>
                  )}

                  {/* Screenshot result */}
                  {step.screenshot && (
                    <Collapse
                      size="small"
                      ghost
                      items={[
                        {
                          key: 'screenshot',
                          label: (
                            <Space>
                              <CameraOutlined />
                              <Text>截图</Text>
                            </Space>
                          ),
                          children: (
                            <div style={{ textAlign: 'center' }}>
                              <Image
                                src={step.screenshot.startsWith('data:')
                                  ? step.screenshot
                                  : `data:image/png;base64,${step.screenshot}`}
                                alt="Screenshot"
                                style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 4 }}
                              />
                            </div>
                          ),
                        },
                      ]}
                    />
                  )}

                  {/* Text result */}
                  {step.text && (
                    <Collapse
                      size="small"
                      ghost
                      items={[
                        {
                          key: 'text',
                          label: (
                            <Space>
                              <FileTextOutlined />
                              <Text>文本内容</Text>
                            </Space>
                          ),
                          children: (
                            <pre style={jsonBlockStyle}>
                              {step.text}
                            </pre>
                          ),
                        },
                      ]}
                    />
                  )}

                  {/* HTML result */}
                  {step.html && (
                    <Collapse
                      size="small"
                      ghost
                      items={[
                        {
                          key: 'html',
                          label: (
                            <Space>
                              <CodeOutlined />
                              <Text>HTML</Text>
                            </Space>
                          ),
                          children: (
                            <Tabs
                              size="small"
                              items={[
                                {
                                  key: 'preview',
                                  label: '预览',
                                  children: (
                                    <div
                                      style={{
                                        border: `1px solid ${token.colorBorderSecondary}`,
                                        borderRadius: 4,
                                        overflow: 'hidden',
                                        background: token.colorBgContainer,
                                      }}
                                    >
                                      <iframe
                                        srcDoc={step.html}
                                        sandbox=""
                                        title={`${step.step_id}-html-preview`}
                                        style={{
                                          width: '100%',
                                          height: 420,
                                          border: 'none',
                                          background: '#fff',
                                        }}
                                      />
                                    </div>
                                  ),
                                },
                                {
                                  key: 'source',
                                  label: '源码',
                                  children: (
                                    <pre style={jsonBlockStyle}>
                                      {step.html}
                                    </pre>
                                  ),
                                },
                              ]}
                            />
                          ),
                        },
                      ]}
                    />
                  )}
                  </Space>
                </Card>
              ),
            }))}
          />
        )}
      </Card>

      {/* Connection Info - Only show after execution completed */}
      {session.endpoints && (session.state === 'CLOSED' || session.state === 'ERROR') && (
        <Card style={{ marginTop: 16 }} title="Connection Info">
          <Space direction="vertical">
            <div>
              <Text type="secondary">noVNC: </Text>
              <Button
                type="link"
                size="small"
                onClick={() => window.open(transformLocalhostUrl(session.endpoints!.novnc), '_blank')}
              >
                Open noVNC
              </Button>
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
