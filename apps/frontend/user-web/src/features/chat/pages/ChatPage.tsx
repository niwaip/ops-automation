import {
  CheckOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  MessageOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  buildExecutionWaitingInputGroups,
  getExecutionWaitingInputFields,
  getExecutionWaitingInputStep,
  isBooleanInputType,
  isJsonLikeInputType,
  isNumericInputType,
  normalizeExecutionWaitingInputValues,
  StreamEventType,
  resolveWaitingInputDisplayLabel,
  type ExecutionDto,
  type AIModel,
  type ChatMessage,
  type ChatProgressLog,
  type ChatRequest,
  type ChatSession,
  type StreamEvent,
} from '@ops/user-core';
import { apiClient, chatApi, executionApi } from '../../../api';
import { UserChatComposer } from '../components/UserChatComposer';
import { authStore } from '../../../adapters/auth/authStore';
import { browserStreamingTransport } from '../../../adapters/streaming/browserStreamingTransport';
import './ChatPage.css';

const { TextArea } = Input;
type ChatTaskStatus = NonNullable<NonNullable<ChatMessage['metadata']>['taskStatus']>;
const buildMessageId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toChatTimestamp = (): string => new Date().toISOString();

const buildSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `chat-session-${buildMessageId()}`;
};

const formatRelativeTime = (value?: string): string => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const normalizeMissingInputs = (
  value: unknown
): NonNullable<NonNullable<ChatMessage['metadata']>['missingInputs']> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.reduce<NonNullable<NonNullable<ChatMessage['metadata']>['missingInputs']>>(
    (acc, item) => {
      const record = asRecord(item);
      if (!record) {
        return acc;
      }
      acc.push({
        name: asString(record.name),
        description: asString(record.description),
        missing: typeof record.missing === 'boolean' ? record.missing : undefined,
      });
      return acc;
    },
    []
  );

  return items.length > 0 ? items : undefined;
};

const normalizeUsage = (
  value: unknown
): NonNullable<NonNullable<ChatMessage['metadata']>['usage']> | undefined => {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.prompt_tokens !== 'number' ||
    typeof record.completion_tokens !== 'number' ||
    typeof record.total_tokens !== 'number'
  ) {
    return undefined;
  }

  const completionDetails = asRecord(record.completion_tokens_details);
  return {
    prompt_tokens: record.prompt_tokens,
    completion_tokens: record.completion_tokens,
    total_tokens: record.total_tokens,
    completion_tokens_details:
      completionDetails && typeof completionDetails.reasoning_tokens === 'number'
        ? { reasoning_tokens: completionDetails.reasoning_tokens }
        : undefined,
  };
};

const normalizeRateLimit = (
  value: unknown
): NonNullable<NonNullable<ChatMessage['metadata']>['rateLimit']> | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    requests_limit: typeof record.requests_limit === 'number' ? record.requests_limit : undefined,
    requests_remaining:
      typeof record.requests_remaining === 'number' ? record.requests_remaining : undefined,
    requests_reset: asString(record.requests_reset),
    tokens_limit: typeof record.tokens_limit === 'number' ? record.tokens_limit : undefined,
    tokens_remaining:
      typeof record.tokens_remaining === 'number' ? record.tokens_remaining : undefined,
    tokens_reset: asString(record.tokens_reset),
  };
};

const normalizeResultArtifacts = (
  value: unknown
): NonNullable<NonNullable<ChatMessage['metadata']>['artifacts']> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const artifacts = value.reduce<NonNullable<NonNullable<ChatMessage['metadata']>['artifacts']>>(
    (acc, item) => {
      const record = asRecord(item);
      if (!record) {
        return acc;
      }
      acc.push({
        type: asString(record.type),
        name: asString(record.name),
        label: asString(record.label),
        downloadUrl: asString(record.downloadUrl),
        url: asString(record.url),
        path: asString(record.path),
        mimeType: asString(record.mimeType),
      });
      return acc;
    },
    []
  );

  return artifacts.length > 0 ? artifacts : undefined;
};

const normalizeNormalizedResult = (
  value: unknown
): NonNullable<NonNullable<ChatMessage['metadata']>['normalizedResult']> | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    resultType: asString(record.resultType),
    title: asString(record.title),
    summary: asString(record.summary),
    body: asString(record.body),
    summaryFormat: record.summaryFormat === 'markdown' ? 'markdown' : 'plain_text',
    detailText: asString(record.detailText),
    detailFormat: record.detailFormat === 'markdown' ? 'markdown' : 'plain_text',
    structuredData: record.structuredData,
    artifacts: normalizeResultArtifacts(record.artifacts),
    downloadUrl: asString(record.downloadUrl),
    temporalLink: asString(record.temporalLink),
    hasBusinessResult: record.hasBusinessResult === true,
    envelope: asRecord(record.envelope),
    rawResult: record.rawResult,
  };
};

const summarizeSessionTitle = (message: string): string => {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '新对话';
  }
  return normalized.slice(0, 24);
};

const getSessionPreview = (messages: ChatMessage[] | undefined): string => {
  const latestMessage = messages?.[messages.length - 1];
  if (!latestMessage) {
    return '开始一个新任务或发起一次提问';
  }
  const preview =
    latestMessage.metadata?.finalSummary ||
    latestMessage.metadata?.finalResult ||
    latestMessage.content;
  return (preview || '查看历史消息').replace(/\s+/g, ' ').slice(0, 42);
};

const getSessionSortTime = (session: ChatSession): number => {
  const updatedAt = new Date(session.updatedAt).getTime();
  if (!Number.isNaN(updatedAt)) {
    return updatedAt;
  }
  return new Date(session.createdAt).getTime() || 0;
};

const upsertMessage = (messages: ChatMessage[], nextMessage: ChatMessage): ChatMessage[] => {
  const hasExisting = messages.some((message) => message.id === nextMessage.id);
  if (hasExisting) {
    return messages.map((message) => (message.id === nextMessage.id ? nextMessage : message));
  }
  return [...messages, nextMessage];
};

const mergeHistoryMessages = (
  remoteMessages: ChatMessage[],
  localMessages: ChatMessage[]
): ChatMessage[] => {
  const merged = new Map<string, ChatMessage>();

  localMessages.forEach((message) => {
    merged.set(message.id, message);
  });
  remoteMessages.forEach((message) => {
    merged.set(message.id, {
      ...(merged.get(message.id) || {}),
      ...message,
      metadata: {
        ...(merged.get(message.id)?.metadata || {}),
        ...(message.metadata || {}),
      },
    });
  });

  return [...merged.values()].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  );
};

const getMessageStatusLabel = (status?: ChatTaskStatus): string | null => {
  switch (status) {
    case 'waiting_input':
      return '待补输入';
    case 'pending_approval':
      return '待审批';
    case 'running':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return null;
  }
};

const getStatusTagColor = (status?: ChatTaskStatus): string | undefined => {
  switch (status) {
    case 'waiting_input':
    case 'pending_approval':
      return 'warning';
    case 'running':
      return 'processing';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return undefined;
  }
};

const resolveSpecialStateTitle = (message: ChatMessage): string | null => {
  switch (message.metadata?.taskStatus) {
    case 'waiting_input':
      return '等待你补充输入';
    case 'pending_approval':
      return '等待你审批';
    case 'running':
      return '任务正在执行';
    default:
      return null;
  }
};

const getEventTagColor = (eventType: StreamEvent['type']): string => {
  switch (eventType) {
    case StreamEventType.RESULT:
      return 'success';
    case StreamEventType.ERROR:
      return 'error';
    case StreamEventType.WAITING_INPUT:
    case StreamEventType.PENDING_APPROVAL:
      return 'warning';
    default:
      return 'processing';
  }
};

const toStructuredResultText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const compactText = (value: string, maxLength = 120): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
};

const sanitizeDisplayUrl = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  return value.replace(/`/g, '').trim();
};

const buildTaskProgressLog = (
  event: StreamEvent,
  data: Record<string, unknown> | undefined,
  normalizedResult:
    | NonNullable<NonNullable<ChatMessage['metadata']>['normalizedResult']>
    | undefined
): ChatProgressLog | undefined => {
  if (event.type === StreamEventType.THOUGHT) {
    const text = compactText(event.content.replace(/[🚀📥]/g, '').trim(), 100);
    return text ? { stage: 'thought', text } : undefined;
  }

  if (event.type === StreamEventType.ACTION) {
    const text = compactText(event.content, 100);
    return text ? { stage: 'action', text } : undefined;
  }

  if (event.type !== StreamEventType.OBSERVATION) {
    return undefined;
  }

  const result = asRecord(data?.result);
  const command = asString(result?.command);
  const pageTitle = asString(result?.pageTitle);
  const pageUrl = sanitizeDisplayUrl(asString(result?.pageUrl));
  const resultData = asRecord(result?.data);
  const duration = typeof resultData?.duration === 'number' ? resultData.duration : undefined;
  const summary =
    normalizedResult?.summary || normalizedResult?.detailText || normalizedResult?.body;

  const parts = ['步骤执行成功'];
  if (command) {
    parts.push(`命令：${command}`);
  }
  if (pageTitle) {
    parts.push(`页面：${pageTitle}`);
  } else if (pageUrl) {
    parts.push(`页面：${pageUrl}`);
  }
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    parts.push(`耗时 ${duration} ms`);
  }
  if (summary) {
    const compactSummary = compactText(summary, 80);
    if (compactSummary && compactSummary !== '步骤执行成功') {
      parts.push(compactSummary);
    }
  }

  return {
    stage: 'observation',
    text: compactText(parts.join('，'), 160),
  };
};

const parseMessageContent = (content: string): { thoughts: string[]; answer: string } => {
  const thoughts: string[] = [];
  let answer = content;

  const thoughtRegex = /【思考】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const actionRegex = /【行动】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const observationRegex = /【观察】([^\n]*(?:\n(?!【)[^\n]*)*)/g;

  let match: RegExpExecArray | null;
  while ((match = thoughtRegex.exec(content)) !== null) {
    if (match[1]?.trim()) {
      thoughts.push(`思考: ${match[1].trim()}`);
    }
  }
  while ((match = actionRegex.exec(content)) !== null) {
    if (match[1]?.trim()) {
      thoughts.push(`行动: ${match[1].trim()}`);
    }
  }

  answer = content.replace(thoughtRegex, '').replace(actionRegex, '').trim();

  if (!answer) {
    const observations = [...content.matchAll(observationRegex)]
      .map((item) => item[1]?.trim())
      .filter((item): item is string => Boolean(item));
    answer = observations.join('\n\n');
  }

  return { thoughts, answer };
};

function renderInlineRequiredInputField(name: string, type: string, description?: string) {
  if (isNumericInputType(type)) {
    return <InputNumber style={{ width: '100%' }} placeholder={`请输入 ${description || name}`} />;
  }
  if (isBooleanInputType(type)) {
    return <Switch />;
  }
  if (isJsonLikeInputType(type)) {
    return <TextArea rows={3} placeholder="请输入 JSON 字符串" />;
  }
  return <Input placeholder={description || `请输入 ${name}`} />;
}

interface WaitingInputInlineFormProps {
  executionId: string;
  sessionId?: string;
  onSubmitted: (execution: ExecutionDto) => void;
}

interface ChatPageProps {
  embedded?: boolean;
}

function WaitingInputInlineForm(props: WaitingInputInlineFormProps) {
  const { executionId, sessionId, onSubmitted } = props;
  const queryClient = useQueryClient();
  const { message: toast } = App.useApp();
  const [form] = Form.useForm<{ input: Record<string, unknown> }>();

  const executionQuery = useQuery(
    ['chat-inline-execution', executionId],
    () => executionApi.getById(executionId),
    { enabled: Boolean(executionId) }
  );
  const stepsQuery = useQuery(
    ['chat-inline-execution-steps', executionId],
    () => executionApi.getSteps(executionId),
    { enabled: Boolean(executionId) }
  );

  const requiredInputs = useMemo(
    () =>
      executionQuery.data && stepsQuery.data
        ? getExecutionWaitingInputFields(executionQuery.data, stepsQuery.data)
        : [],
    [executionQuery.data, stepsQuery.data]
  );
  const waitingInputStep = useMemo(
    () =>
      executionQuery.data && stepsQuery.data
        ? getExecutionWaitingInputStep(executionQuery.data, stepsQuery.data)
        : undefined,
    [executionQuery.data, stepsQuery.data]
  );
  const waitingInputGroups = useMemo(
    () =>
      executionQuery.data && stepsQuery.data
        ? buildExecutionWaitingInputGroups(executionQuery.data, stepsQuery.data)
        : [],
    [executionQuery.data, stepsQuery.data]
  );

  useEffect(() => {
    if (requiredInputs.length === 0) {
      return;
    }
    form.setFieldsValue({
      input: Object.fromEntries(
        requiredInputs.map((field) => [
          field.name,
          field.value ?? (isBooleanInputType(field.type) ? false : undefined),
        ])
      ),
    });
  }, [form, requiredInputs]);

  const submitInputMutation = useMutation(
    async (values: Record<string, unknown>) => {
      if (!waitingInputStep) {
        throw new Error('当前没有可提交的待补输入步骤');
      }
      return executionApi.submitInput(executionId, {
        stepId: waitingInputStep.id,
        input: normalizeExecutionWaitingInputValues(values, requiredInputs),
      });
    },
    {
      onSuccess: async (execution) => {
        void toast.success('输入已提交，执行继续处理中');
        await Promise.all([
          queryClient.invalidateQueries(['chat-inline-execution', executionId]),
          queryClient.invalidateQueries(['chat-inline-execution-steps', executionId]),
          queryClient.invalidateQueries(['user-web-chat-sessions']),
          queryClient.invalidateQueries(['user-web-chat-history', sessionId]),
          queryClient.invalidateQueries(['user-web-executions']),
          queryClient.invalidateQueries(['user-web-notifications']),
        ]);
        onSubmitted(execution);
      },
      onError: (submitError) => {
        void toast.error(submitError instanceof Error ? submitError.message : '提交输入失败');
      },
    }
  );

  if (executionQuery.isLoading || stepsQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 4 }} />;
  }

  if (!executionQuery.data || requiredInputs.length === 0) {
    return null;
  }

  const groups =
    waitingInputGroups.length > 0
      ? waitingInputGroups
      : [{ label: '待补字段', items: requiredInputs }];

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={(values) => {
        submitInputMutation.mutate(values.input || {});
      }}
    >
      <div className="user-chat-inline-form">
        {groups.map((group) => (
          <div key={group.label} className="user-chat-inline-group">
            <Typography.Text strong>{group.label}</Typography.Text>
            {group.items.map((field) => (
              <Form.Item
                key={field.name}
                label={resolveWaitingInputDisplayLabel(field)}
                name={['input', field.name]}
                valuePropName={isBooleanInputType(field.type) ? 'checked' : 'value'}
                extra={field.description || field.type}
                rules={[
                  { required: true, message: `请填写 ${resolveWaitingInputDisplayLabel(field)}` },
                ]}
              >
                {renderInlineRequiredInputField(field.name, field.type, field.description)}
              </Form.Item>
            ))}
          </div>
        ))}
        <Space>
          <Button
            onClick={() => {
              form.resetFields();
            }}
          >
            重置
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitInputMutation.isLoading}
            disabled={!waitingInputStep}
          >
            提交并继续
          </Button>
        </Space>
      </div>
    </Form>
  );
}

export function ChatPage({ embedded = false }: ChatPageProps) {
  const { message: toast } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('default');
  const [chatMode, setChatMode] = useState<'chat' | 'task'>('chat');
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isSessionListCollapsed, setIsSessionListCollapsed] = useState(embedded);
  const [draftSessions, setDraftSessions] = useState<ChatSession[]>([]);
  const [sessionOverrides, setSessionOverrides] = useState<Record<string, Partial<ChatSession>>>(
    {}
  );
  const [sessionMessages, setSessionMessages] = useState<Record<string, ChatMessage[]>>({});
  const [actionLoadingByMessage, setActionLoadingByMessage] = useState<
    Record<string, 'approve' | 'reject' | undefined>
  >({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeMessages = selectedSessionId ? sessionMessages[selectedSessionId] || [] : [];
  const selectedSessionNeedsRefresh = useMemo(
    () =>
      activeMessages.some(
        (message) =>
          message.role === 'assistant' &&
          (message.isStreaming ||
            message.metadata?.taskStatus === 'running' ||
            message.metadata?.taskStatus === 'waiting_input' ||
            message.metadata?.taskStatus === 'pending_approval')
      ),
    [activeMessages]
  );

  const modelsQuery = useQuery(['user-web-chat-models'], () => chatApi.getAvailableModels());
  const sessionsQuery = useQuery(['user-web-chat-sessions'], () => chatApi.listSessions(), {
    refetchInterval: selectedSessionNeedsRefresh ? 5000 : false,
    refetchOnWindowFocus: false,
  });

  const remoteSessions = sessionsQuery.data || [];
  const remoteSessionIds = useMemo(
    () => new Set(remoteSessions.map((session) => session.id)),
    [remoteSessions]
  );

  const selectedSessionHistoryQuery = useQuery(
    ['user-web-chat-history', selectedSessionId],
    () => chatApi.getChatHistory(selectedSessionId!),
    {
      enabled: Boolean(selectedSessionId && remoteSessionIds.has(selectedSessionId)),
      refetchOnWindowFocus: false,
      refetchInterval: selectedSessionNeedsRefresh && !isStreaming ? 4000 : false,
    }
  );

  const sessions = useMemo(() => {
    const merged = new Map<string, ChatSession>();
    [...draftSessions, ...remoteSessions].forEach((session) => {
      merged.set(session.id, {
        ...session,
        ...(sessionOverrides[session.id] || {}),
      });
    });
    return [...merged.values()].sort(
      (left, right) => getSessionSortTime(right) - getSessionSortTime(left)
    );
  }, [draftSessions, remoteSessions, sessionOverrides]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [selectedSessionId, sessions]
  );

  useEffect(() => {
    const models = modelsQuery.data || [];
    setSelectedModel((current) => current || models[0]?.id || 'default');
  }, [modelsQuery.data]);

  useEffect(() => {
    if (embedded) {
      setIsSessionListCollapsed(true);
    }
  }, [embedded]);

  useEffect(() => {
    if (!selectedSessionId && sessions[0]?.id) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    if (!remoteSessions.length) {
      return;
    }
    setDraftSessions((current) => current.filter((session) => !remoteSessionIds.has(session.id)));
  }, [remoteSessionIds, remoteSessions.length]);

  useEffect(() => {
    if (!selectedSessionId || !selectedSessionHistoryQuery.data || isStreaming) {
      return;
    }

    const history = selectedSessionHistoryQuery.data;
    setSessionMessages((current) => {
      const existing = current[selectedSessionId] || [];
      if (history.length === 0 && existing.length > 0) {
        return current;
      }
      return {
        ...current,
        [selectedSessionId]: mergeHistoryMessages(history, existing),
      };
    });
  }, [isStreaming, selectedSessionHistoryQuery.data, selectedSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages, isStreaming]);

  const placeholder = useMemo(
    () =>
      chatMode === 'task' ? '例如：帮我总结这个执行的结果，并给出下一步建议' : '输入你想咨询的问题',
    [chatMode]
  );

  const updateSessionMessages = (
    sessionId: string,
    updater: (messages: ChatMessage[]) => ChatMessage[]
  ) => {
    setSessionMessages((current) => ({
      ...current,
      [sessionId]: updater(current[sessionId] || []),
    }));
  };

  const updateMessage = (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => {
    updateSessionMessages(sessionId, (messages) =>
      messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              ...patch,
              metadata: patch.metadata
                ? { ...(message.metadata || {}), ...patch.metadata }
                : message.metadata,
            }
          : message
      )
    );
  };

  const appendProgressLog = (
    sessionId: string,
    messageId: string,
    progressLog: ChatProgressLog
  ) => {
    updateSessionMessages(sessionId, (messages) =>
      messages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        const currentLogs = message.metadata?.progressLogs || [];
        const lastLog = currentLogs[currentLogs.length - 1];
        if (lastLog?.stage === progressLog.stage && lastLog.text === progressLog.text) {
          return message;
        }
        return {
          ...message,
          metadata: {
            ...(message.metadata || {}),
            progressLogs: [...currentLogs, progressLog].slice(-12),
          },
        };
      })
    );
  };

  const updateSessionMeta = (sessionId: string, patch: Partial<ChatSession>) => {
    setDraftSessions((current) =>
      current.map((session) => (session.id === sessionId ? { ...session, ...patch } : session))
    );
    setSessionOverrides((current) => ({
      ...current,
      [sessionId]: {
        ...(current[sessionId] || {}),
        ...patch,
      },
    }));
  };

  const createDraftSession = (initialTitle = '新对话'): ChatSession => {
    const now = toChatTimestamp();
    const nextSession: ChatSession = {
      id: buildSessionId(),
      title: initialTitle,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      modelId: selectedModel,
    };
    setDraftSessions((current) => [nextSession, ...current]);
    setSelectedSessionId(nextSession.id);
    setSessionMessages((current) => ({
      ...current,
      [nextSession.id]: current[nextSession.id] || [],
    }));
    return nextSession;
  };

  const ensureSession = (): ChatSession => {
    if (selectedSession) {
      return selectedSession;
    }
    return createDraftSession();
  };

  const getAccessToken = async (): Promise<string | null | undefined> =>
    (await apiClient.ensureFreshAccessToken()) || authStore.getState().accessToken;

  const syncRelatedQueries = async (sessionId: string) => {
    await Promise.all([
      queryClient.invalidateQueries(['user-web-chat-sessions']),
      queryClient.invalidateQueries(['user-web-chat-history', sessionId]),
      queryClient.invalidateQueries(['user-web-executions']),
      queryClient.invalidateQueries(['user-web-notifications']),
    ]);
  };

  const startAssistantStream = async (
    sessionId: string,
    assistantMessageId: string,
    request: ChatRequest
  ) => {
    const token = await getAccessToken();
    let accumulatedContent = '';

    await chatApi.stream(browserStreamingTransport, token, request, (event) => {
      const data = asRecord(event.data);
      const normalizedResult = normalizeNormalizedResult(data?.normalizedResult);
      const progressLog =
        request.config?.mode === 'task'
          ? buildTaskProgressLog(event, data, normalizedResult)
          : undefined;
      const taskStatus = (() => {
        switch (event.type) {
          case StreamEventType.WAITING_INPUT:
            return 'waiting_input' as const;
          case StreamEventType.PENDING_APPROVAL:
            return 'pending_approval' as const;
          case StreamEventType.ERROR:
            return 'failed' as const;
          case StreamEventType.RESULT:
            return request.config?.mode === 'task' ? ('completed' as const) : undefined;
          default:
            return request.config?.mode === 'task' ? ('running' as const) : undefined;
        }
      })();

      if (
        event.type === StreamEventType.THOUGHT ||
        event.type === StreamEventType.ACTION ||
        event.type === StreamEventType.OBSERVATION
      ) {
        if (request.config?.mode !== 'task') {
          const prefix =
            event.type === StreamEventType.THOUGHT
              ? '【思考】'
              : event.type === StreamEventType.ACTION
                ? '【行动】'
                : '【观察】';
          accumulatedContent = `${accumulatedContent}${accumulatedContent ? '\n' : ''}${prefix}${event.content}`;
        }
      } else if (event.type === StreamEventType.RESULT && request.config?.mode === 'chat') {
        accumulatedContent = event.content;
      } else if (event.type === StreamEventType.ERROR) {
        accumulatedContent = accumulatedContent || event.content;
      }

      if (progressLog) {
        appendProgressLog(sessionId, assistantMessageId, progressLog);
      }

      setLastEvent(event);
      updateMessage(sessionId, assistantMessageId, {
        content: accumulatedContent,
        isStreaming:
          event.type !== StreamEventType.RESULT &&
          event.type !== StreamEventType.ERROR &&
          event.type !== StreamEventType.WAITING_INPUT &&
          event.type !== StreamEventType.PENDING_APPROVAL,
        metadata: {
          mode: request.config?.mode,
          showThinking: request.config?.thinking,
          taskStatus,
          executionId: asString(data?.executionId),
          executionStatus: asString(data?.status),
          resultType: asString(data?.resultType) || normalizedResult?.resultType,
          resultTitle: asString(data?.resultTitle) || normalizedResult?.title,
          usage: normalizeUsage(data?.usage),
          rateLimit: normalizeRateLimit(data?.rateLimit),
          finalSummary:
            event.type === StreamEventType.WAITING_INPUT ||
            event.type === StreamEventType.PENDING_APPROVAL ||
            event.type === StreamEventType.RESULT
              ? asString(data?.resultSummary) ||
                normalizedResult?.detailText ||
                normalizedResult?.summary ||
                normalizedResult?.body ||
                event.content
              : undefined,
          finalResult:
            event.type === StreamEventType.RESULT && request.config?.mode === 'task'
              ? normalizedResult?.detailText ||
                normalizedResult?.body ||
                normalizedResult?.summary ||
                event.content
              : undefined,
          finalResultData:
            event.type === StreamEventType.RESULT
              ? (normalizedResult?.structuredData ?? data?.result ?? data)
              : undefined,
          errorMessage: event.type === StreamEventType.ERROR ? event.content : undefined,
          failureReason:
            event.type === StreamEventType.ERROR
              ? asString(data?.failureReason) || event.content
              : undefined,
          missingInputs: normalizeMissingInputs(data?.missingInputs),
          hasBusinessResult:
            normalizedResult?.hasBusinessResult === true || data?.hasBusinessResult === true,
          downloadUrl: asString(data?.downloadUrl) || normalizedResult?.downloadUrl,
          temporalLink: asString(data?.temporalLink) || normalizedResult?.temporalLink,
          artifacts: normalizeResultArtifacts(data?.artifacts) || normalizedResult?.artifacts,
          normalizedResult,
        },
      });
    });
  };

  const runAssistantRequest = async (
    session: ChatSession,
    request: ChatRequest,
    assistantMessageId: string
  ) => {
    try {
      await startAssistantStream(session.id, assistantMessageId, request);
      updateMessage(session.id, assistantMessageId, { isStreaming: false });
      await syncRelatedQueries(session.id);
    } catch (streamError) {
      const nextError = streamError instanceof Error ? streamError.message : '聊天请求失败';
      setError(nextError);
      updateMessage(session.id, assistantMessageId, {
        content: nextError,
        isStreaming: false,
        metadata: {
          mode: request.config?.mode,
          taskStatus: 'failed',
          errorMessage: nextError,
        },
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSend = () => {
    const content = draft.trim();
    if (!content || isStreaming) {
      return;
    }

    const resolvedModelId =
      selectedModel && selectedModel !== 'default' ? selectedModel : undefined;

    const session = ensureSession();
    const now = toChatTimestamp();
    const userMessage: ChatMessage = {
      id: buildMessageId(),
      sessionId: session.id,
      role: 'user',
      content,
      timestamp: now,
    };
    const assistantMessageId = buildMessageId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      sessionId: session.id,
      role: 'assistant',
      content: '',
      timestamp: now,
      isStreaming: true,
      metadata: {
        mode: chatMode,
        showThinking: chatMode === 'task',
      },
    };

    updateSessionMessages(session.id, (current) => [...current, userMessage, assistantMessage]);
    updateSessionMeta(session.id, {
      title: summarizeSessionTitle(content),
      updatedAt: now,
      modelId: resolvedModelId,
    });
    setDraft('');
    setError(null);
    setLastEvent(null);
    setIsStreaming(true);

    const request: ChatRequest = {
      message: content,
      sessionId: session.id,
      modelId: resolvedModelId,
      config: {
        mode: chatMode,
        thinking: chatMode === 'task',
      },
    };

    void runAssistantRequest(session, request, assistantMessageId);
  };

  const handleCreateSession = () => {
    setError(null);
    setLastEvent(null);
    createDraftSession();
  };

  const handleApprove = async (messageId: string, executionId: string) => {
    if (!selectedSession) {
      return;
    }
    setActionLoadingByMessage((current) => ({ ...current, [messageId]: 'approve' }));
    try {
      const execution = await executionApi.approve(executionId);
      updateMessage(selectedSession.id, messageId, {
        metadata: {
          taskStatus: 'running',
          executionId,
          executionStatus: execution.status,
          finalSummary: '审批已通过，任务继续执行中。',
        },
      });
      void toast.success('已批准任务，继续观察执行结果');

      const assistantMessageId = buildMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        sessionId: selectedSession.id,
        role: 'assistant',
        content: '',
        timestamp: toChatTimestamp(),
        isStreaming: true,
        metadata: {
          mode: 'task',
          taskStatus: 'running',
          executionId,
          executionStatus: execution.status,
          finalSummary: '已批准，正在继续执行...',
        },
      };
      updateSessionMessages(selectedSession.id, (messages) =>
        upsertMessage(messages, assistantMessage)
      );
      setIsStreaming(true);
      void runAssistantRequest(
        selectedSession,
        {
          message: '继续执行',
          sessionId: selectedSession.id,
          executionId,
          modelId: selectedModel && selectedModel !== 'default' ? selectedModel : undefined,
          config: {
            mode: 'task',
            thinking: true,
          },
        },
        assistantMessageId
      );
    } catch (approveError) {
      void toast.error(approveError instanceof Error ? approveError.message : '批准执行失败');
    } finally {
      setActionLoadingByMessage((current) => ({ ...current, [messageId]: undefined }));
    }
  };

  const handleReject = async (messageId: string, executionId: string) => {
    if (!selectedSession) {
      return;
    }
    setActionLoadingByMessage((current) => ({ ...current, [messageId]: 'reject' }));
    try {
      const execution = await executionApi.reject(executionId);
      updateMessage(selectedSession.id, messageId, {
        metadata: {
          taskStatus: 'failed',
          executionId,
          executionStatus: execution.status,
          errorMessage: '审批已驳回，任务不会继续执行。',
        },
      });
      await syncRelatedQueries(selectedSession.id);
      void toast.success('已驳回任务');
    } catch (rejectError) {
      void toast.error(rejectError instanceof Error ? rejectError.message : '驳回执行失败');
    } finally {
      setActionLoadingByMessage((current) => ({ ...current, [messageId]: undefined }));
    }
  };

  const renderStateCard = (message: ChatMessage) => {
    const title = resolveSpecialStateTitle(message);
    if (!title || message.role !== 'assistant') {
      return null;
    }

    const status = message.metadata?.taskStatus;
    const executionId = message.metadata?.executionId;
    const missingInputs = message.metadata?.missingInputs || [];
    const canReview = Boolean(executionId);

    return (
      <div className={`user-chat-state-card status-${status || 'default'}`}>
        <Space align="start" size={12}>
          {status === 'waiting_input' || status === 'pending_approval' ? (
            <ClockCircleOutlined className="user-chat-state-icon" />
          ) : status === 'failed' ? (
            <WarningOutlined className="user-chat-state-icon" />
          ) : status === 'completed' ? (
            <CheckOutlined className="user-chat-state-icon" />
          ) : (
            <ReloadOutlined className="user-chat-state-icon" />
          )}
          <div className="user-chat-state-main">
            <Typography.Text strong>{title}</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {message.metadata?.errorMessage ||
                message.metadata?.finalSummary ||
                message.metadata?.finalResult ||
                '该任务有新的状态变化。'}
            </Typography.Paragraph>
            {status === 'waiting_input' && missingInputs.length > 0 ? (
              <div className="user-chat-missing-inputs">
                {missingInputs.map((item, index) => (
                  <Tag key={`${item.name || 'missing'}-${index}`}>
                    {resolveWaitingInputDisplayLabel({
                      name: item.name || item.description || `field-${index + 1}`,
                      description: item.description,
                    })}
                  </Tag>
                ))}
              </div>
            ) : null}
            {status === 'waiting_input' && executionId ? (
              <WaitingInputInlineForm
                executionId={executionId}
                sessionId={selectedSession?.id}
                onSubmitted={(execution) => {
                  if (!selectedSession?.id) {
                    return;
                  }
                  updateMessage(selectedSession.id, message.id, {
                    metadata: {
                      taskStatus: 'running',
                      executionId: execution.id,
                      executionStatus: execution.status,
                      finalSummary: '输入已提交，任务继续执行中。',
                      missingInputs: undefined,
                    },
                  });
                }}
              />
            ) : null}
            <Space wrap>
              {status === 'pending_approval' && executionId ? (
                <>
                  <Button
                    type="primary"
                    size="small"
                    loading={actionLoadingByMessage[message.id] === 'approve'}
                    onClick={() => {
                      void handleApprove(message.id, executionId);
                    }}
                  >
                    批准继续
                  </Button>
                  <Button
                    danger
                    size="small"
                    loading={actionLoadingByMessage[message.id] === 'reject'}
                    onClick={() => {
                      void handleReject(message.id, executionId);
                    }}
                  >
                    驳回
                  </Button>
                </>
              ) : null}
              {canReview ? (
                <Button size="small" onClick={() => navigate(`/executions/${executionId}`)}>
                  去执行详情
                </Button>
              ) : null}
            </Space>
          </div>
        </Space>
      </div>
    );
  };

  const renderOutcomeCard = (message: ChatMessage) => {
    if (message.role !== 'assistant') {
      return null;
    }

    const status = message.metadata?.taskStatus;
    const finalResult = message.metadata?.finalResult?.trim();
    const finalSummary = message.metadata?.finalSummary?.trim();
    const errorMessage = message.metadata?.errorMessage?.trim();
    const failureReason = message.metadata?.failureReason?.trim();
    const executionId = message.metadata?.executionId;
    const resultTitle = message.metadata?.resultTitle?.trim();
    const artifacts =
      message.metadata?.artifacts || message.metadata?.normalizedResult?.artifacts || [];
    const structuredResult = toStructuredResultText(
      message.metadata?.normalizedResult?.structuredData ?? message.metadata?.finalResultData
    );
    const hasOutcome = Boolean(
      status === 'completed' ||
      status === 'failed' ||
      finalResult ||
      resultTitle ||
      (finalSummary &&
        status !== 'running' &&
        status !== 'waiting_input' &&
        status !== 'pending_approval') ||
      failureReason ||
      errorMessage ||
      message.metadata?.downloadUrl ||
      message.metadata?.temporalLink ||
      artifacts.length > 0
    );

    if (!hasOutcome) {
      return null;
    }

    const outcomeTone = status === 'failed' || errorMessage ? 'error' : 'success';
    const title =
      status === 'failed' || errorMessage
        ? '任务结果异常'
        : message.metadata?.hasBusinessResult
          ? '任务结果'
          : '任务完成';

    return (
      <div className={`user-chat-outcome-card ${outcomeTone}`}>
        <div className="user-chat-outcome-header">
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{title}</Typography.Text>
            {resultTitle ? <Typography.Text type="secondary">{resultTitle}</Typography.Text> : null}
          </Space>
          <Space size={8} wrap>
            {status ? (
              <Tag color={getStatusTagColor(status)}>{getMessageStatusLabel(status)}</Tag>
            ) : null}
            {executionId ? <Tag>{executionId}</Tag> : null}
          </Space>
        </div>
        {finalSummary ? (
          <Typography.Paragraph className="user-chat-outcome-summary">
            {finalSummary}
          </Typography.Paragraph>
        ) : null}
        {finalResult ? <pre className="user-chat-outcome-pre">{finalResult}</pre> : null}
        {failureReason && failureReason !== finalSummary && failureReason !== finalResult ? (
          <pre className="user-chat-outcome-pre error">{failureReason}</pre>
        ) : null}
        {errorMessage &&
        errorMessage !== failureReason &&
        errorMessage !== finalSummary &&
        errorMessage !== finalResult ? (
          <pre className="user-chat-outcome-pre error">{errorMessage}</pre>
        ) : null}
        {message.metadata?.downloadUrl || message.metadata?.temporalLink || executionId ? (
          <Space wrap className="user-chat-outcome-actions">
            {message.metadata?.downloadUrl ? (
              <Button
                size="small"
                type="primary"
                ghost
                href={message.metadata.downloadUrl}
                target="_blank"
              >
                下载结果
              </Button>
            ) : null}
            {message.metadata?.temporalLink ? (
              <Button size="small" href={message.metadata.temporalLink} target="_blank">
                查看运行详情
              </Button>
            ) : null}
            {executionId ? (
              <Button size="small" onClick={() => navigate(`/executions/${executionId}`)}>
                去执行详情
              </Button>
            ) : null}
          </Space>
        ) : null}
        {artifacts.length > 0 ? (
          <Space wrap className="user-chat-outcome-actions">
            {artifacts.map((artifact, index) => {
              const href = artifact.downloadUrl || artifact.url;
              if (!href) {
                return null;
              }
              return (
                <Button key={`${href}-${index}`} size="small" href={href} target="_blank">
                  {artifact.label || artifact.name || `查看产物 ${index + 1}`}
                </Button>
              );
            })}
          </Space>
        ) : null}
        {structuredResult &&
        structuredResult !== finalResult &&
        structuredResult !== errorMessage ? (
          <details className="user-chat-outcome-details">
            <summary>查看结构化结果</summary>
            <pre className="user-chat-outcome-pre">{structuredResult}</pre>
          </details>
        ) : null}
      </div>
    );
  };

  const renderProgressCard = (message: ChatMessage) => {
    const progressLogs = message.metadata?.progressLogs || [];
    if (
      message.role !== 'assistant' ||
      message.metadata?.mode !== 'task' ||
      progressLogs.length === 0
    ) {
      return null;
    }

    const stageLabelMap: Record<ChatProgressLog['stage'], string> = {
      thought: '思考',
      action: '行动',
      observation: '观察',
    };

    const stageColorMap: Record<ChatProgressLog['stage'], string> = {
      thought: 'processing',
      action: 'blue',
      observation: 'green',
    };

    return (
      <div className="user-chat-progress-card">
        <div className="user-chat-progress-header">
          <Typography.Text strong>执行过程</Typography.Text>
          <Tag>{progressLogs.length} 条</Tag>
        </div>
        <div className="user-chat-progress-list">
          {progressLogs.map((item, index) => (
            <div key={`${message.id}-progress-${index}`} className="user-chat-progress-item">
              <Tag color={stageColorMap[item.stage]}>{stageLabelMap[item.stage]}</Tag>
              <Typography.Text>{item.text}</Typography.Text>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMessage = (message: ChatMessage) => {
    const statusLabel = getMessageStatusLabel(message.metadata?.taskStatus);
    const statusColor = getStatusTagColor(message.metadata?.taskStatus);
    const showStateCard = Boolean(resolveSpecialStateTitle(message));
    const outcomeCard = renderOutcomeCard(message);
    const progressCard = renderProgressCard(message);
    const parsedContent = parseMessageContent(message.content);
    const plainContent = (
      message.role === 'assistant' ? parsedContent.answer : message.content
    ).trim();
    const thoughtLogs = message.role === 'assistant' ? parsedContent.thoughts : [];
    const hasProgressLogs = Boolean(message.metadata?.progressLogs?.length);
    const showThoughtLogs = Boolean(
      message.role === 'assistant' &&
      message.metadata?.mode === 'task' &&
      message.metadata?.showThinking !== false &&
      thoughtLogs.length > 0
    );
    const shouldShowMessageContent = Boolean(
      plainContent &&
      plainContent !== message.metadata?.finalResult?.trim() &&
      plainContent !== message.metadata?.errorMessage?.trim() &&
      !(message.metadata?.mode === 'task' && hasProgressLogs)
    );
    const usage = message.metadata?.usage;
    const rateLimit = message.metadata?.rateLimit;
    const showMessageActions = message.role === 'assistant';

    const handleCopyMessage = async () => {
      const copyTarget = [
        message.metadata?.finalSummary,
        message.metadata?.finalResult,
        plainContent,
        message.metadata?.failureReason,
        message.metadata?.errorMessage,
      ].find((item) => typeof item === 'string' && item.trim());
      if (!copyTarget) {
        return;
      }
      try {
        await navigator.clipboard.writeText(copyTarget);
        void toast.success('消息已复制');
      } catch {
        void toast.error('复制失败');
      }
    };

    return (
      <List.Item key={message.id} className={`user-chat-message-row role-${message.role}`}>
        <div className={`user-chat-message-bubble role-${message.role}`}>
          <Space className="user-chat-message-meta" size={8} wrap>
            <Tag color={message.role === 'user' ? 'blue' : 'green'}>
              {message.role === 'user' ? '你' : 'AI'}
            </Tag>
            <Typography.Text type="secondary">
              {new Date(message.timestamp).toLocaleString()}
            </Typography.Text>
            {message.isStreaming ? <Tag color="processing">生成中</Tag> : null}
            {statusLabel && statusColor ? <Tag color={statusColor}>{statusLabel}</Tag> : null}
          </Space>
          {showStateCard ? renderStateCard(message) : null}
          {outcomeCard}
          {progressCard}
          {showThoughtLogs ? (
            <details className="user-chat-thoughts">
              <summary>查看思考过程（{thoughtLogs.length} 条）</summary>
              <div className="user-chat-thoughts-list">
                {thoughtLogs.map((item, index) => (
                  <div key={`${message.id}-thought-${index}`} className="user-chat-thought-item">
                    {item}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {shouldShowMessageContent ? (
            <Typography.Paragraph className="user-chat-message-content">
              {plainContent}
            </Typography.Paragraph>
          ) : null}
          {showMessageActions ? (
            <div className="user-chat-message-actions">
              <Space size={12} wrap>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void handleCopyMessage();
                  }}
                >
                  复制
                </Button>
                {usage ? (
                  <Typography.Text type="secondary" className="user-chat-usage-text">
                    Tokens: {usage.total_tokens} / 输入 {usage.prompt_tokens} / 输出{' '}
                    {usage.completion_tokens}
                    {usage.completion_tokens_details?.reasoning_tokens
                      ? ` / 推理 ${usage.completion_tokens_details.reasoning_tokens}`
                      : ''}
                  </Typography.Text>
                ) : null}
                {rateLimit?.requests_remaining !== undefined ? (
                  <Typography.Text type="secondary" className="user-chat-usage-text">
                    请求剩余: {rateLimit.requests_remaining}
                  </Typography.Text>
                ) : null}
                {rateLimit?.tokens_remaining !== undefined ? (
                  <Typography.Text type="secondary" className="user-chat-usage-text">
                    Token 剩余: {rateLimit.tokens_remaining}
                  </Typography.Text>
                ) : null}
              </Space>
            </div>
          ) : null}
        </div>
      </List.Item>
    );
  };

  return (
    <div
      className={`user-chat-page${embedded ? ' embedded' : ''}${isSessionListCollapsed ? ' sidebar-collapsed' : ''}`}
    >
      {!isSessionListCollapsed ? (
        <Card className="user-chat-sidebar">
          <div className="user-chat-sidebar-header">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                会话列表
              </Typography.Title>
              <Typography.Text type="secondary">查看历史记录并切换任务上下文</Typography.Text>
            </div>
            <Space>
              <Button
                type="text"
                icon={<MenuFoldOutlined />}
                onClick={() => setIsSessionListCollapsed(true)}
                className="user-chat-sidebar-toggle"
                title="折叠会话列表"
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateSession}>
                新建会话
              </Button>
            </Space>
          </div>
          {sessionsQuery.isLoading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : sessions.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史会话" />
          ) : (
            <List
              dataSource={sessions}
              renderItem={(session) => (
                <List.Item
                  key={session.id}
                  className={`user-chat-session-item ${session.id === selectedSessionId ? 'active' : ''}`}
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <div className="user-chat-session-main">
                    <Space align="center" size={8}>
                      <MessageOutlined />
                      <Typography.Text strong>{session.title || '未命名会话'}</Typography.Text>
                    </Space>
                    <Typography.Paragraph type="secondary" className="user-chat-session-preview">
                      {getSessionPreview(sessionMessages[session.id])}
                    </Typography.Paragraph>
                    <Space size={8} wrap>
                      {session.modelId ? <Tag>{session.modelId}</Tag> : null}
                      <Typography.Text type="secondary">
                        {formatRelativeTime(session.updatedAt)}
                      </Typography.Text>
                    </Space>
                  </div>
                  <RightOutlined className="user-chat-session-arrow" />
                </List.Item>
              )}
            />
          )}
        </Card>
      ) : null}

      <div className="user-chat-main">
        <Card className={`user-chat-status-panel${embedded ? ' embedded' : ''}`}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div className="user-chat-status-heading">
              <Space align="start" size={12}>
                <Button
                  type="text"
                  icon={isSessionListCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setIsSessionListCollapsed((current) => !current)}
                  className="user-chat-sidebar-toggle"
                  title={isSessionListCollapsed ? '展开会话列表' : '折叠会话列表'}
                />
                <div>
                  <Typography.Title level={embedded ? 4 : 3} style={{ margin: 0 }}>
                    AI 对话
                  </Typography.Title>
                  <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                    {embedded
                      ? '复用悬浮窗布局壳，消息与任务逻辑保持 user-web 实现。'
                      : '网页对话页已对齐悬浮对话框视觉，并支持语音输入与会话折叠。'}
                  </Typography.Paragraph>
                </div>
              </Space>
              {selectedSession ? (
                <Tag className="user-chat-current-session-tag">
                  {selectedSession.title || '新对话'}
                </Tag>
              ) : null}
            </div>
            {lastEvent ? (
              <Tag color={getEventTagColor(lastEvent.type)}>最近事件: {lastEvent.type}</Tag>
            ) : null}
            {modelsQuery.error ? (
              <Alert
                type="error"
                showIcon
                message={
                  modelsQuery.error instanceof Error
                    ? modelsQuery.error.message
                    : '模型列表加载失败'
                }
              />
            ) : null}
            {sessionsQuery.error ? (
              <Alert
                type="error"
                showIcon
                message={
                  sessionsQuery.error instanceof Error
                    ? sessionsQuery.error.message
                    : '会话列表加载失败'
                }
              />
            ) : null}
            {selectedSessionHistoryQuery.error ? (
              <Alert
                type="warning"
                showIcon
                message={
                  selectedSessionHistoryQuery.error instanceof Error
                    ? selectedSessionHistoryQuery.error.message
                    : '历史消息加载失败'
                }
              />
            ) : null}
            {error ? <Alert type="error" showIcon message={error} /> : null}
          </Space>
        </Card>

        <Card className="user-chat-thread" styles={{ body: { paddingBottom: 8 } }}>
          {selectedSessionHistoryQuery.isLoading && activeMessages.length === 0 ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : activeMessages.length === 0 ? (
            <Empty description="还没有对话，发送第一条消息开始体验" />
          ) : (
            <List dataSource={activeMessages} renderItem={(message) => renderMessage(message)} />
          )}
          <div ref={messagesEndRef} />
        </Card>

        <UserChatComposer
          draft={draft}
          onDraftChange={setDraft}
          onSend={handleSend}
          onNewSession={handleCreateSession}
          chatMode={chatMode}
          onChatModeChange={setChatMode}
          selectedModel={selectedModel}
          availableModels={(modelsQuery.data || []) as AIModel[]}
          onModelChange={setSelectedModel}
          isStreaming={isStreaming}
          modelsLoading={modelsQuery.isLoading}
          disabled={false}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
