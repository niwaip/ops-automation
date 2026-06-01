import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
  theme as antdTheme,
} from 'antd';
import {
  ArrowLeftOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { apiClient } from '@/shared/api/http/client';

const { Title, Text, Paragraph } = Typography;

type RecorderDebugBackend = 'cli' | 'chrome-devtools' | 'mcp';
type RecorderDebugTurnRole = 'user' | 'assistant' | 'system';

interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  locator?: {
    strategy?: string;
    value?: string;
    expression?: string;
    role?: string;
    name?: string;
  };
}

interface RecorderDebugObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  headings: string[];
  links: string[];
  suggestedParameters: Array<{
    name: string;
    label: string;
    required: boolean;
    reason: string;
  }>;
  snapshotPath?: string;
}

interface BrowserExecuteResponse {
  success?: boolean;
  message?: string;
  results?: Array<Record<string, unknown>>;
  steps?: Array<Record<string, unknown>>;
  executedCommands?: MCPCommand[];
}

interface RecorderDebugExportArtifacts {
  script?: string;
  guidance?: string;
  skillDraft?: {
    name?: string;
    description?: string;
    invocation?: string;
    parameterOnly?: boolean;
    parameters?: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>;
    outputs?: Array<{
      name: string;
      description: string;
      location: string;
    }>;
    usageNotes?: string[];
    usageMarkdown?: string;
    publishPayload?: Record<string, unknown>;
    executionPlan?: {
      backend?: RecorderDebugBackend;
      runtimeSessionId?: string;
      commands?: MCPCommand[];
    };
    commands?: MCPCommand[];
  };
}

interface RecorderDebugTurn {
  role: RecorderDebugTurnRole;
  content: string;
  timestamp: string;
  commands?: MCPCommand[];
  execution?: BrowserExecuteResponse;
  observation?: RecorderDebugObservation;
  exportArtifacts?: RecorderDebugExportArtifacts;
}

interface RecorderDebugSession {
  sessionId: string;
  runtimeSessionId: string;
  backend: RecorderDebugBackend;
  browserInitialized: boolean;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
  history: RecorderDebugTurn[];
  executedCommands: MCPCommand[];
  createdAt: string;
  updatedAt: string;
}

const formatTimestamp = (value?: string): string => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

const roleColorMap: Record<RecorderDebugTurnRole, string> = {
  user: 'blue',
  assistant: 'purple',
  system: 'default',
};

const backendLabelMap: Record<RecorderDebugBackend, string> = {
  cli: 'Playwright CLI',
  'chrome-devtools': 'Chrome DevTools CLI',
  mcp: 'MCP',
};

const CodeBlock: React.FC<{ value: unknown }> = ({ value }) => {
  const { token } = antdTheme.useToken();

  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 8,
        background: token.colorFillAlter,
        border: `1px solid ${token.colorBorderSecondary}`,
        color: token.colorText,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {typeof value === 'string' ? value : formatJson(value)}
    </pre>
  );
};

const ObservationSummaryCard: React.FC<{
  title: string;
  observation: RecorderDebugObservation;
}> = ({ title, observation }) => (
  <Card size="small" title={title}>
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="页面 URL">{observation.currentPageUrl || '-'}</Descriptions.Item>
        <Descriptions.Item label="页面标题">{observation.title || '-'}</Descriptions.Item>
        <Descriptions.Item label="快照路径">{observation.snapshotPath || '-'}</Descriptions.Item>
      </Descriptions>
      {observation.suggestedParameters.length > 0 ? (
        <div>
          <Text strong>建议参数</Text>
          <div style={{ marginTop: 8 }}>
            <Space wrap>
              {observation.suggestedParameters.map((parameter) => (
                <Tag key={`${parameter.name}-${parameter.label}`} color={parameter.required ? 'processing' : 'default'}>
                  {parameter.name}
                </Tag>
              ))}
            </Space>
          </div>
        </div>
      ) : null}
      <Collapse
        size="small"
        items={[
          {
            key: 'inputs',
            label: `输入项 (${observation.inputs.length})`,
            children: observation.inputs.length > 0 ? <CodeBlock value={observation.inputs} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无输入项" />,
          },
          {
            key: 'buttons',
            label: `按钮/链接入口 (${observation.buttons.length})`,
            children: observation.buttons.length > 0 ? <CodeBlock value={observation.buttons} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无按钮" />,
          },
          {
            key: 'outline',
            label: '标题与链接',
            children: (
              <CodeBlock
                value={{
                  headings: observation.headings,
                  links: observation.links,
                }}
              />
            ),
          },
          {
            key: 'text',
            label: '页面文本摘录',
            children: observation.text ? <CodeBlock value={observation.text} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文本" />,
          },
        ]}
      />
    </Space>
  </Card>
);

const RecorderDebugDetailPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const sessionQuery = useQuery(
    ['recorder-debug-session', sessionId],
    () => apiClient.get<RecorderDebugSession>(`/ai/recorder-debug/${sessionId}`),
    {
      enabled: Boolean(sessionId),
      refetchInterval: 5000,
    },
  );

  const session = sessionQuery.data;

  if (sessionQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 360 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <Card>
        <Space direction="vertical" size="middle">
          <Alert
            type="error"
            message="加载 Recorder Debug 会话失败"
            description="会话不存在，或 Redis 中的调试数据已过期。"
            showIcon
          />
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/recorder')}>
            返回录制页
          </Button>
        </Space>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/recorder')}>
          返回录制页
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            void sessionQuery.refetch();
          }}
        >
          刷新
        </Button>
        {session.currentPageUrl ? (
          <Button
            type="link"
            icon={<LinkOutlined />}
            onClick={() => window.open(session.currentPageUrl, '_blank', 'noopener,noreferrer')}
          >
            打开当前页面
          </Button>
        ) : null}
      </Space>

      <Card
        title={(
          <Space wrap>
            <Title level={4} style={{ margin: 0 }}>
              Recorder Debug 详情
            </Title>
            <Tag color="processing">{backendLabelMap[session.backend] || session.backend}</Tag>
            <Tag color={session.browserInitialized ? 'success' : 'default'}>
              {session.browserInitialized ? 'Browser Ready' : 'Browser Not Ready'}
            </Tag>
          </Space>
        )}
      >
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="会话 ID">{session.sessionId}</Descriptions.Item>
          <Descriptions.Item label="运行时会话 ID">{session.runtimeSessionId}</Descriptions.Item>
          <Descriptions.Item label="当前页面 URL">{session.currentPageUrl || '-'}</Descriptions.Item>
          <Descriptions.Item label="执行命令数">{session.executedCommands.length}</Descriptions.Item>
          <Descriptions.Item label="对话轮次数">{session.history.length}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatTimestamp(session.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatTimestamp(session.updatedAt)}</Descriptions.Item>
        </Descriptions>
      </Card>

      {session.lastObservation ? (
        <ObservationSummaryCard title="最近页面观察" observation={session.lastObservation} />
      ) : null}

      <Card title="已执行命令">
        {session.executedCommands.length > 0 ? (
          <CodeBlock value={session.executedCommands} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无执行命令" />
        )}
      </Card>

      <Card title="会话历史">
        {session.history.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话历史" />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {session.history.map((turn, index) => {
              const collapseItems = [];

              if (turn.commands && turn.commands.length > 0) {
                collapseItems.push({
                  key: `commands-${index}`,
                  label: `命令 (${turn.commands.length})`,
                  children: <CodeBlock value={turn.commands} />,
                });
              }

              if (turn.execution) {
                collapseItems.push({
                  key: `execution-${index}`,
                  label: `执行结果${turn.execution.success === false ? '（失败）' : ''}`,
                  children: <CodeBlock value={turn.execution} />,
                });
              }

              if (turn.observation) {
                collapseItems.push({
                  key: `observation-${index}`,
                  label: '页面观察',
                  children: <CodeBlock value={turn.observation} />,
                });
              }

              if (turn.exportArtifacts) {
                collapseItems.push({
                  key: `export-${index}`,
                  label: '导出产物',
                  children: <CodeBlock value={turn.exportArtifacts} />,
                });
              }

              return (
                <Card
                  key={`${turn.timestamp}-${index}`}
                  size="small"
                  title={(
                    <Space wrap>
                      <Tag color={roleColorMap[turn.role] || 'default'}>{turn.role}</Tag>
                      <Text type="secondary">{formatTimestamp(turn.timestamp)}</Text>
                    </Space>
                  )}
                >
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                      {turn.content || '-'}
                    </Paragraph>
                    {collapseItems.length > 0 ? (
                      <Collapse size="small" items={collapseItems} />
                    ) : null}
                  </Space>
                </Card>
              );
            })}
          </Space>
        )}
      </Card>
    </Space>
  );
};

export default RecorderDebugDetailPage;
