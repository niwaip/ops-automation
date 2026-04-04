import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Tag, Button, Space, Typography, message, Spin, Popconfirm, List, Collapse, Image, Empty } from 'antd';
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
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { sessionApi, Session, StepResult } from '../api/session';

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

  const stepsQuery = useQuery(
    ['session-steps', id],
    () => sessionApi.getStepResults(id!),
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
  const steps = stepsQuery.data || [];

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
              onClick={() => window.open(session.endpoints!.novnc, '_blank')}
            >
              新窗口打开
            </Button>
          }
        >
          <div style={{ width: '100%', height: 600, border: '1px solid #d9d9d9', borderRadius: 4, background: '#1e1e1e' }}>
            <iframe
              src={`${session.endpoints.novnc}?autoconnect=true&resize=scale`}
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
          <List
            dataSource={steps}
            renderItem={(step: StepResult, index: number) => (
              <List.Item
                key={step.step_id}
                style={{
                  background: step.success ? '#f6ffed' : '#fff2f0',
                  borderRadius: 8,
                  marginBottom: 8,
                  padding: 12,
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
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {step.step_id}
                      </Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </Text>
                  </Space>

                  {/* Error message */}
                  {step.error && (
                    <div style={{ background: '#fff1f0', padding: 8, borderRadius: 4 }}>
                      <Text type="danger">{step.error}</Text>
                    </div>
                  )}

                  {/* Success message */}
                  {step.message && step.success && (
                    <div style={{ background: '#f6ffed', padding: 8, borderRadius: 4 }}>
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
                            <pre
                              style={{
                                background: '#f5f5f5',
                                padding: 8,
                                borderRadius: 4,
                                fontSize: 11,
                                maxHeight: 200,
                                overflow: 'auto',
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
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
                            <pre
                              style={{
                                background: '#f5f5f5',
                                padding: 8,
                                borderRadius: 4,
                                fontSize: 11,
                                maxHeight: 200,
                                overflow: 'auto',
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {step.html}
                            </pre>
                          ),
                        },
                      ]}
                    />
                  )}
                </Space>
              </List.Item>
            )}
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
                onClick={() => window.open(session.endpoints!.novnc, '_blank')}
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