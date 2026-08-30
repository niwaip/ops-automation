import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Tag,
  Button,
  Space,
  Typography,
  message,
  Spin,
  Popconfirm,
  Collapse,
  Image,
  Empty,
  Select,
  Timeline,
  theme as antdTheme,
} from 'antd';
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
import { sessionApi, StepResult } from '@/api/session';
import { templateApi } from '@/api/template';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';

const { Title, Text } = Typography;

const isTerminalSessionState = (state?: string): boolean => state === 'CLOSED' || state === 'ERROR';

const formatSessionTime = (timestamp?: number): string => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

const transformLocalhostUrl = (url: string | undefined): string => {
  return replaceLocalhostWithCurrentHost(url) || '';
};

const isCliOutput = (value?: string): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.includes('### Result') ||
    trimmed.includes('### Ran Playwright code') ||
    trimmed.includes('### Events') ||
    trimmed.startsWith('- Page URL:')
  );
};

const cleanHtmlSourceForDisplay = (html: string): string => {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
    .replace(/<textarea\b[^>]*(?:display:\s*none|display:none|_css)[^>]*>[\s\S]*?<\/textarea>/gi, '')
    .replace(/<textarea\b[^>]*id=["'][^"']*css[^"']*["'][^>]*>[\s\S]*?<\/textarea>/gi, '')
    .replace(/<input\b[^>]*type=["']hidden["'][^>]*>/gi, '')
    .trim();
};

const extractGenuineHtml = (rawHtml?: string): string | undefined => {
  if (!rawHtml || !rawHtml.trim()) {
    return undefined;
  }
  const trimmed = rawHtml.trim();

  let htmlCandidate: string | undefined;
  if (isCliOutput(trimmed)) {
    const match = trimmed.match(
      /### Result\s*\n?([\s\S]*?)(?:\n### Ran Playwright code|\n### |\n```|$)/
    );
    const candidate = match && typeof match[1] === 'string' ? match[1].trim() : trimmed;
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string' && /<[a-z!/][\s\S]*>/i.test(parsed.trim())) {
        htmlCandidate = parsed.trim();
      }
    } catch {
      const unquoted =
        (candidate.startsWith('"') && candidate.endsWith('"')) ||
        (candidate.startsWith("'") && candidate.endsWith("'"))
          ? candidate.slice(1, -1).trim()
          : candidate;
      if (/<[a-z!/][\s\S]*>/i.test(unquoted)) {
        htmlCandidate = unquoted;
      }
    }
  } else if (/<[a-z!/][\s\S]*>/i.test(trimmed)) {
    htmlCandidate = trimmed;
  }

  if (htmlCandidate) {
    const cleaned = cleanHtmlSourceForDisplay(htmlCandidate);
    return cleaned.length > 0 ? cleaned : htmlCandidate;
  }

  return undefined;
};

const cleanTextContentForDisplay = (text?: string): string | undefined => {
  if (!text || !text.trim()) return undefined;
  if (isCliOutput(text)) return undefined;

  let cleaned = text.trim();

  // Cut off noise footers
  const noiseFooters = [
    '滚动到底部自动加载更多',
    '本站服务器由',
    '出海云服务器',
    '全站飙升榜',
    '反馈建议',
    '请作者喝奶茶',
    '热榜会员',
    '服务协议',
    '京ICP备'
  ];

  for (const footer of noiseFooters) {
    const idx = cleaned.indexOf(footer);
    if (idx !== -1) {
      cleaned = cleaned.slice(0, idx).trim();
    }
  }

  // Remove reaction count badges / emojis / isolated buttons
  cleaned = cleaned
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\+[0-9]+$/.test(trimmed)) return false;
      if (/^[😂👍❤️🔥]+$/.test(trimmed)) return false;
      if (['换一换', '展开', '收起', '分享', '点赞', '收藏', '关注'].includes(trimmed)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
};

const getCleanStepMessage = (message?: string): string | undefined => {
  if (!message || !message.trim()) {
    return undefined;
  }
  const trimmed = message.trim();
  if (isCliOutput(trimmed)) {
    return undefined;
  }
  return trimmed;
};

const getStepExecutionLog = (step: {
  message?: string;
  text?: string;
  html?: string;
}): string | undefined => {
  for (const candidate of [step.message, step.text, step.html]) {
    if (candidate && isCliOutput(candidate)) {
      return candidate.trim();
    }
  }
  return undefined;
};

const getBlockingPresentation = (
  mode?: 'confirmation' | 'takeover' | 'forbidden'
): { label: string; color: string } | null => {
  if (mode === 'confirmation') {
    return { label: '等待确认', color: 'gold' };
  }
  if (mode === 'takeover') {
    return { label: '人工接管', color: 'orange' };
  }
  if (mode === 'forbidden') {
    return { label: '禁止回放', color: 'red' };
  }
  return null;
};

const SessionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation(['common', 'session']);
  const navigate = useNavigate();
  const { token } = antdTheme.useToken();

  const sessionQuery = useQuery(['session', id], () => sessionApi.getById(id!), {
    enabled: !!id,
    refetchInterval: (data) => (isTerminalSessionState(data?.state) ? false : 3000),
  });

  const stepsQuery = useQuery(['session-steps', id], () => sessionApi.getStepResults(id!), {
    enabled: !!id,
    refetchInterval: () => (isTerminalSessionState(sessionQuery.data?.state) ? false : 3000),
  });
  const session = sessionQuery.data;

  const templateDetailQuery = useQuery(
    ['template-brief', session?.template_id],
    () => templateApi.getById(session!.template_id!),
    {
      enabled: Boolean(session?.template_id),
    }
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
        .sort(
          (a, b) =>
            Number(b.last_activity || b.created_at || 0) -
            Number(a.last_activity || a.created_at || 0)
        );
    },
    {
      enabled: Boolean(sessionQuery.data?.template_id),
    }
  );

  const deleteMutation = useMutation(sessionApi.delete, {
    onSuccess: () => {
      void message.success(t('common:success'));
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
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}
      >
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

  const sessionBlocking = getBlockingPresentation(session.blocking_mode);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeftOutlined /> {t('session:sessionList')}
        </Button>
      </Space>

      <Card
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <span>{t('session:sessionDetail')}</span>
              <Tag color={getStateColor(session.state)}>{session.state}</Tag>
              <Tag color={getControlModeColor(session.control_mode)}>{session.control_mode}</Tag>
              {session.frozen && <Tag color="red">FROZEN</Tag>}
              {sessionBlocking && <Tag color={sessionBlocking.color}>{sessionBlocking.label}</Tag>}
            </Space>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  void sessionQuery.refetch();
                  void stepsQuery.refetch();
                }}
              >
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
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
              <Text>
                {session.step_index + 1} {session.current_step ? `(${session.current_step})` : ''}
              </Text>
            </div>
          )}
          {sessionBlocking && (
            <div
              style={{
                background:
                  session.blocking_mode === 'forbidden'
                    ? 'rgba(239, 68, 68, 0.10)'
                    : 'rgba(245, 158, 11, 0.10)',
                border:
                  session.blocking_mode === 'forbidden'
                    ? '1px solid rgba(239, 68, 68, 0.24)'
                    : '1px solid rgba(245, 158, 11, 0.24)',
                padding: 10,
                borderRadius: 8,
              }}
            >
              <Space size="small" wrap>
                <Tag color={sessionBlocking.color}>{sessionBlocking.label}</Tag>
                <Text>{session.blocking_reason || '当前会话在此步骤被策略阻塞'}</Text>
              </Space>
            </div>
          )}
          {session.params &&
            Object.keys(session.params).filter((k) => k !== 'schedule').length > 0 && (
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
                        <Text code>{key}</Text>:{' '}
                        <Text strong>
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </Text>
                      </div>
                    ))}
                </Card>
              </div>
            )}
        </Space>
      </Card>

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
          <div
            style={{
              width: '100%',
              height: 600,
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              background: '#1e1e1e',
            }}
          >
            <iframe
              src={`${transformLocalhostUrl(session.endpoints.novnc)}?autoconnect=true&resize=scale`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="noVNC"
            />
          </div>
        </Card>
      )}

      <Card
        style={{ marginTop: 16 }}
        title={
          <Space>
            <FileTextOutlined />
            执行步骤结果
            <Tag color={steps.length > 0 ? 'processing' : 'default'}>{steps.length} 步</Tag>
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
            items={steps.map((step: StepResult, index: number) => {
              const cleanMessage = getCleanStepMessage(step.message);
              const genuineHtml = extractGenuineHtml(step.html);
              const rawLog = getStepExecutionLog(step);
              const rawTextCandidate =
                step.text && !isCliOutput(step.text) ? step.text.trim() : undefined;
              const nonCliText =
                cleanTextContentForDisplay(rawTextCandidate) || rawTextCandidate;

              return {
                color: step.success ? 'green' : 'red',
                dot: step.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />,
                children: (
                  <Card
                    size="small"
                    style={{
                      background: step.success
                        ? 'rgba(16, 185, 129, 0.10)'
                        : 'rgba(239, 68, 68, 0.10)',
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
                          {step.confirmation_required && <Tag color="gold">等待确认</Tag>}
                          {step.takeover && <Tag color="orange">人工接管</Tag>}
                          {step.replay_forbidden && <Tag color="red">禁止回放</Tag>}
                          <Space size="small">
                            {getActionIcon(step.action)}
                            <Text strong>{step.action}</Text>
                          </Space>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {new Date(step.timestamp).toLocaleTimeString()}
                        </Text>
                      </Space>

                      {step.error && (
                        <div
                          style={{
                            background: step.confirmation_required
                              ? 'rgba(245, 158, 11, 0.12)'
                              : step.takeover
                                ? 'rgba(249, 115, 22, 0.12)'
                                : 'rgba(239, 68, 68, 0.12)',
                            border: step.confirmation_required
                              ? '1px solid rgba(245, 158, 11, 0.24)'
                              : step.takeover
                                ? '1px solid rgba(249, 115, 22, 0.24)'
                                : '1px solid rgba(239, 68, 68, 0.24)',
                            padding: 8,
                            borderRadius: 4,
                          }}
                        >
                          <Text type="danger">{step.error}</Text>
                          {(step.confirmation_reason ||
                            step.takeover_reason ||
                            step.replay_forbidden_reason) && (
                            <div style={{ marginTop: 4 }}>
                              <Text type="secondary">
                                {step.confirmation_reason ||
                                  step.takeover_reason ||
                                  step.replay_forbidden_reason}
                              </Text>
                            </div>
                          )}
                        </div>
                      )}

                      {cleanMessage && step.success && (
                        <div
                          style={{
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.24)',
                            padding: 8,
                            borderRadius: 4,
                          }}
                        >
                          <Text type="success">{cleanMessage}</Text>
                        </div>
                      )}

                      {step.screenshot && (
                        <Collapse
                          size="small"
                          ghost
                          defaultActiveKey={['screenshot']}
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
                                    src={
                                      step.screenshot.startsWith('data:')
                                        ? step.screenshot
                                        : `data:image/png;base64,${step.screenshot}`
                                    }
                                    alt="Screenshot"
                                    style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 4 }}
                                  />
                                </div>
                              ),
                            },
                          ]}
                        />
                      )}

                      {nonCliText && (
                        <Collapse
                          size="small"
                          ghost
                          defaultActiveKey={['text']}
                          items={[
                            {
                              key: 'text',
                              label: (
                                <Space>
                                  <FileTextOutlined />
                                  <Text strong>提取正文内容</Text>
                                </Space>
                              ),
                              children: (
                                <pre
                                  style={{
                                    ...jsonBlockStyle,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    fontFamily: 'inherit',
                                    fontSize: 13,
                                    lineHeight: 1.6,
                                  }}
                                >
                                  {nonCliText}
                                </pre>
                              ),
                            },
                          ]}
                        />
                      )}

                      {genuineHtml && (
                        <Collapse
                          size="small"
                          ghost
                          items={[
                            {
                              key: 'html',
                              label: (
                                <Space>
                                  <CodeOutlined />
                                  <Text>HTML 源码</Text>
                                </Space>
                              ),
                              children: <pre style={jsonBlockStyle}>{genuineHtml}</pre>,
                            },
                          ]}
                        />
                      )}

                      {rawLog && (
                        <Collapse
                          size="small"
                          ghost
                          items={[
                            {
                              key: 'log',
                              label: (
                                <Space>
                                  <CodeOutlined />
                                  <Text type="secondary">执行日志</Text>
                                </Space>
                              ),
                              children: <pre style={jsonBlockStyle}>{rawLog}</pre>,
                            },
                          ]}
                        />
                      )}
                    </Space>
                  </Card>
                ),
              };
            })}
          />
        )}
      </Card>

      {session.endpoints && (session.state === 'CLOSED' || session.state === 'ERROR') && (
        <Card style={{ marginTop: 16 }} title="Connection Info">
          <Space direction="vertical">
            <div>
              <Text type="secondary">noVNC: </Text>
              <Button
                type="link"
                size="small"
                onClick={() =>
                  window.open(transformLocalhostUrl(session.endpoints!.novnc), '_blank')
                }
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
