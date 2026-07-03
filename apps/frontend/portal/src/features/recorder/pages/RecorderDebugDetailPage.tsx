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
import { ArrowLeftOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import { apiClient } from '@/shared/api/http/client';
import RecorderOutcomeDetailCard from '../components/RecorderOutcomeDetailCard';

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
  rows?: Array<Record<string, unknown>>;
  regions?: Array<Record<string, unknown>>;
  headings: string[];
  links: string[];
  suggestedParameters: Array<{
    name: string;
    label: string;
    required: boolean;
    reason: string;
  }>;
  snapshotPath?: string;
  snapshotId?: string;
  snapshotVersion?: number;
  snapshotContentHash?: string;
  observationFingerprint?: string;
  reuseEligibility?: 'fresh' | 'stale' | 'reobserve-required';
  staleReason?: string;
  capturedAt?: string;
  page?: Record<string, unknown>;
  textState?: Record<string, unknown>;
  interactiveState?: Record<string, unknown>;
  facts?: Array<Record<string, unknown>>;
}

interface BrowserExecuteResponse {
  success?: boolean;
  message?: string;
  results?: Array<Record<string, unknown>>;
  steps?: Array<Record<string, unknown>>;
  executedCommands?: MCPCommand[];
}

interface RecorderLoopDraft {
  mode: 'repeat_until';
  target: {
    scope: 'current_list' | 'current_table' | 'current_cards';
    regionId?: string;
    currentPageUrl?: string;
    match?: {
      field?: string;
      operator?: 'equals' | 'contains' | 'lt' | 'gt';
      value?: string | number | boolean;
    };
  };
  sampleRow?: {
    rowKey?: string;
    entityType?: string;
    entityId?: string;
    semanticPath?: string[];
  };
  eachIteration?: {
    capturedFromIndex?: number;
    capturedToIndex?: number;
    stepIds: string[];
    stepCount: number;
  };
  stopWhen?: {
    read:
      | { type: 'count' | 'text'; locator: { type: string; value: string } }
      | { type: 'page_signal'; key: string };
    conditionFn: string;
    description: string;
  };
  onNoProgress?: 'takeover' | 'stop';
  maxIterations?: number;
  updatedAt?: string;
}

interface RecorderLoopState {
  rawTokens: string[];
  loopTargetScope?: 'current_list' | 'current_table' | 'current_cards';
  hasLoopStart: boolean;
  hasLoopEnd: boolean;
  hasConditionalBranch: boolean;
  manualInterventionLabels: string[];
  pendingLoopCaptureStartCommandIndex?: number;
  isLoopCaptureActive: boolean;
}

interface RecorderDebugExportArtifacts {
  script?: string;
  guidance?: string;
  templateSteps?: Array<{
    step_id: string;
    action: string;
    locator?: { type: string; value: string; fallback?: { type: string; value: string } };
    params?: Record<string, string | number>;
    output_var?: string;
    branch?: Record<string, unknown>;
    description?: string;
  }>;
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
  outcomeVersion?: 'v1';
  outcome?: RecorderOutcome;
  exportArtifacts?: RecorderDebugExportArtifacts;
  loopDraft?: RecorderLoopDraft;
  loopState?: RecorderLoopState;
}

type RecorderOutcomeKind = 'action' | 'answer' | 'question';
type RecorderOutcomeStatus = 'succeeded' | 'partial' | 'blocked' | 'failed' | 'unknown';

interface RecorderVerificationCheck {
  code: string;
  passed: boolean | 'partial' | 'unknown';
  message: string;
  required?: boolean;
  weight?: number;
  evidencePath?: string;
}

interface RecorderVerification {
  verifier: string;
  routeReason: 'actionType' | 'goal-pattern' | 'command-family' | 'fallback';
  level: 'tool' | 'page' | 'goal';
  success: boolean | 'partial' | 'unknown';
  confidence: number;
  checks: RecorderVerificationCheck[];
  failureReason?: string;
}

interface RecorderOutcome {
  kind: RecorderOutcomeKind;
  status: RecorderOutcomeStatus;
  intent?: Record<string, unknown>;
  evidence?: {
    before?: RecorderDebugObservation;
    after?: RecorderDebugObservation;
    diff?: Record<string, unknown>;
    toolExecution?: Record<string, unknown>;
  };
  grounding?: Record<string, unknown>;
  verification: RecorderVerification;
  summary: {
    userVisible: string;
    compact: string;
    nextHint?: string;
  };
  artifacts?: {
    snapshotIdBefore?: string;
    snapshotIdAfter?: string;
    snapshotPathBefore?: string;
    snapshotPathAfter?: string;
    screenshotBefore?: string;
    screenshotAfter?: string;
  };
}

interface RecorderDebugSession {
  sessionId: string;
  runtimeSessionId: string;
  backend: RecorderDebugBackend;
  browserInitialized: boolean;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
  loopDraft?: RecorderLoopDraft;
  pendingLoopCaptureStartCommandIndex?: number;
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

const loopScopeLabelMap: Record<'current_list' | 'current_table' | 'current_cards', string> = {
  current_list: '当前列表',
  current_table: '当前表格',
  current_cards: '当前卡片区',
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
        <Descriptions.Item label="Snapshot ID">{observation.snapshotId || '-'}</Descriptions.Item>
        <Descriptions.Item label="Snapshot Version">
          {observation.snapshotVersion ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="Snapshot Hash">
          {observation.snapshotContentHash || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="可复用状态">
          {observation.reuseEligibility || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="失效原因">{observation.staleReason || '-'}</Descriptions.Item>
        <Descriptions.Item label="采样时间">
          {formatTimestamp(observation.capturedAt)}
        </Descriptions.Item>
        <Descriptions.Item label="快照路径">{observation.snapshotPath || '-'}</Descriptions.Item>
      </Descriptions>
      {observation.suggestedParameters.length > 0 ? (
        <div>
          <Text strong>建议参数</Text>
          <div style={{ marginTop: 8 }}>
            <Space wrap>
              {observation.suggestedParameters.map((parameter) => (
                <Tag
                  key={`${parameter.name}-${parameter.label}`}
                  color={parameter.required ? 'processing' : 'default'}
                >
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
            children:
              observation.inputs.length > 0 ? (
                <CodeBlock value={observation.inputs} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无输入项" />
              ),
          },
          {
            key: 'buttons',
            label: `按钮/链接入口 (${observation.buttons.length})`,
            children:
              observation.buttons.length > 0 ? (
                <CodeBlock value={observation.buttons} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无按钮" />
              ),
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
            children: observation.text ? (
              <CodeBlock value={observation.text} />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文本" />
            ),
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
    }
  );

  const session = sessionQuery.data;
  const latestAssistantOutcomeTurn = [...(session?.history || [])]
    .reverse()
    .find((turn) => turn.role === 'assistant' && turn.outcome);

  if (sessionQuery.isLoading) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 360 }}
      >
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
        title={
          <Space wrap>
            <Title level={4} style={{ margin: 0 }}>
              Recorder Debug 详情
            </Title>
            <Tag color="processing">{backendLabelMap[session.backend] || session.backend}</Tag>
            <Tag color={session.browserInitialized ? 'success' : 'default'}>
              {session.browserInitialized ? 'Browser Ready' : 'Browser Not Ready'}
            </Tag>
          </Space>
        }
      >
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="会话 ID">{session.sessionId}</Descriptions.Item>
          <Descriptions.Item label="运行时会话 ID">{session.runtimeSessionId}</Descriptions.Item>
          <Descriptions.Item label="当前页面 URL">
            {session.currentPageUrl || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="执行命令数">
            {session.executedCommands.length}
          </Descriptions.Item>
          <Descriptions.Item label="循环录制状态">
            {typeof session.pendingLoopCaptureStartCommandIndex === 'number'
              ? `录制中（起始命令索引 ${session.pendingLoopCaptureStartCommandIndex}）`
              : '未录制中'}
          </Descriptions.Item>
          <Descriptions.Item label="对话轮次数">{session.history.length}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {formatTimestamp(session.createdAt)}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {formatTimestamp(session.updatedAt)}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {session.lastObservation ? (
        <ObservationSummaryCard title="最近页面观察" observation={session.lastObservation} />
      ) : null}

      {latestAssistantOutcomeTurn?.outcome ? (
        <RecorderOutcomeDetailCard
          title="最近 Outcome"
          outcome={latestAssistantOutcomeTurn.outcome}
          raw={{
            reply: latestAssistantOutcomeTurn.content,
            observation: latestAssistantOutcomeTurn.observation,
            execution: latestAssistantOutcomeTurn.execution,
            commands: latestAssistantOutcomeTurn.commands,
          }}
        />
      ) : null}

      <Card title="循环录制草稿">
        {session.loopDraft ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="循环对象">
                {loopScopeLabelMap[session.loopDraft.target.scope] || session.loopDraft.target.scope}
              </Descriptions.Item>
              <Descriptions.Item label="循环页面">
                {session.loopDraft.target.currentPageUrl || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="单轮步骤数">
                {session.loopDraft.eachIteration?.stepCount ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="停止条件">
                {session.loopDraft.stopWhen?.description || '-'}
              </Descriptions.Item>
            </Descriptions>
            <CodeBlock value={session.loopDraft} />
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前会话暂无循环草稿" />
        )}
      </Card>

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

              if (turn.outcome) {
                collapseItems.push({
                  key: `outcome-${index}`,
                  label: 'Outcome / Verification',
                  children: (
                    <RecorderOutcomeDetailCard
                      title="Turn Outcome"
                      outcome={turn.outcome}
                      raw={{
                        reply: turn.content,
                        observation: turn.observation,
                        execution: turn.execution,
                        commands: turn.commands,
                      }}
                    />
                  ),
                });
              }

              if (turn.exportArtifacts) {
                collapseItems.push({
                  key: `export-${index}`,
                  label: '导出产物',
                  children: <CodeBlock value={turn.exportArtifacts} />,
                });
              }

              if (turn.loopState) {
                collapseItems.push({
                  key: `loop-state-${index}`,
                  label: '循环状态',
                  children: <CodeBlock value={turn.loopState} />,
                });
              }

              if (turn.loopDraft) {
                collapseItems.push({
                  key: `loop-draft-${index}`,
                  label: '循环草稿快照',
                  children: <CodeBlock value={turn.loopDraft} />,
                });
              }

              return (
                <Card
                  key={`${turn.timestamp}-${index}`}
                  size="small"
                  title={
                    <Space wrap>
                      <Tag color={roleColorMap[turn.role] || 'default'}>{turn.role}</Tag>
                      <Text type="secondary">{formatTimestamp(turn.timestamp)}</Text>
                    </Space>
                  }
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
