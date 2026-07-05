import {
  ClockCircleOutlined,
  LoadingOutlined,
  MessageOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  RightOutlined,
  RobotOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Empty,
  List,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import {
  reduceChatStreamEvent,
  resolveWaitingInputDisplayLabel,
  type AIModel,
  type ChatMessage,
  type ChatProgressLog,
  type ChatRequest,
  type ChatSession,
} from '@ops/user-core';
import { apiClient, chatApi, executionApi } from '../../../api';
import { UserChatComposer } from '../components/UserChatComposer';
import { useChatStore } from '../chatStore';
import { authStore } from '../../../adapters/auth/authStore';
import { browserStreamingTransport } from '../../../adapters/streaming/browserStreamingTransport';
import SharedChatMessageActions from '@chat-web/components/ChatMessageActions';
import SharedContentPartsRenderer from '@chat-web/components/ContentPartsRenderer';
import { findDeeplinkByLabel, resolveTaskParts } from '@chat-web/lib/contentParts';
import {
  buildApprovedAssistantDraftMeta,
  buildApprovedTaskPatch,
  buildRejectedTaskPatch,
  buildResumedHumanControlTaskPatch,
} from '@chat-web/controller/taskActionController';
import {
  buildChatRequest,
  buildResumeExecutionRequest,
} from '@chat-web/controller/chatRequestController';
import { resumeHumanControlExecution } from '@chat-web/controller/humanControlController';
import SharedMessageContentRenderer from '@chat-web/components/MessageContentRenderer';
import SharedThoughtProcessPanel from '@chat-web/components/ThoughtProcessPanel';
import SharedTaskOutcomeCard from '@chat-web/components/TaskOutcomeCard';
import SharedTaskProgressCard from '@chat-web/components/TaskProgressCard';
import '../ChatMessage.css';
import './ChatPage.css';

type ChatTaskStatus = NonNullable<NonNullable<ChatMessage['metadata']>['taskStatus']>;
const buildMessageId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toChatTimestamp = (): string => new Date().toISOString();

const buildSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `chat-session-${buildMessageId()}`;
};

const resolveDefaultChatModel = (models: AIModel[]): AIModel | null => {
  if (!models.length) {
    return null;
  }

  const preferredDefault = models.find((model) => {
    const config = model.config as (AIModel['config'] & { default?: boolean }) | undefined;
    return config?.default === true;
  });

  return preferredDefault || models[0] || null;
};

const supportsNativeReasoning = (model?: AIModel | null): boolean => {
  if (!model) {
    return false;
  }

  const config = model.config;
  return (
    config?.supports_reasoning === true ||
    config?.reasoning?.supported === true ||
    (model.provider === 'minimax' && /^MiniMax-M/i.test(model.name)) ||
    /^(o1|o3|o4|qwq)/i.test(model.name) ||
    /(reasoner|reasoning|deepseek-r1)/i.test(model.name)
  );
};

const getLatestWaitingInputExecutionId = (messages: ChatMessage[]): string | undefined => {
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
    const message = assistantMessages[index];
    if (resolveMessageTaskStatus(message) !== 'waiting_input') {
      continue;
    }
    const executionId =
      message.metadata?.executionId || resolveTaskParts(message.contentParts).executionId;
    if (executionId) {
      return executionId;
    }
  }
  return undefined;
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

const isSameSession = (
  left: ChatSession | null | undefined,
  right: ChatSession | null | undefined
): boolean => {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.id === right.id &&
    left.title === right.title &&
    left.modelId === right.modelId &&
    left.status === right.status &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
};

const upsertMessage = (messages: ChatMessage[], nextMessage: ChatMessage): ChatMessage[] => {
  const hasExisting = messages.some((message) => message.id === nextMessage.id);
  if (hasExisting) {
    return messages.map((message) => (message.id === nextMessage.id ? nextMessage : message));
  }
  return [...messages, nextMessage];
};

const normalizeComparableMessageText = (value: string): string =>
  value
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const isEphemeralAssistantMessage = (message: ChatMessage): boolean => {
  if (message.role !== 'assistant') {
    return false;
  }

  const normalized = message.content.trim();
  return (
    message.isStreaming === true ||
    normalized === '正在思考...' ||
    normalized === 'Session updated' ||
    normalized.length === 0
  );
};

const areMessagesEquivalent = (localMessage: ChatMessage, remoteMessage: ChatMessage): boolean => {
  if (localMessage.role !== remoteMessage.role) {
    return false;
  }

  const localTime = new Date(localMessage.timestamp).getTime();
  const remoteTime = new Date(remoteMessage.timestamp).getTime();
  if (
    Number.isFinite(localTime) &&
    Number.isFinite(remoteTime) &&
    Math.abs(localTime - remoteTime) > 15_000
  ) {
    return false;
  }

  if (localMessage.role === 'user') {
    return (
      normalizeComparableMessageText(localMessage.content) ===
      normalizeComparableMessageText(remoteMessage.content)
    );
  }

  if (isEphemeralAssistantMessage(localMessage)) {
    return true;
  }

  const localText = normalizeComparableMessageText(localMessage.content);
  const remoteText = normalizeComparableMessageText(remoteMessage.content);
  if (!localText || !remoteText) {
    return false;
  }

  return localText === remoteText || localText.includes(remoteText) || remoteText.includes(localText);
};

const mergeHistoryMessages = (
  remoteMessages: ChatMessage[],
  localMessages: ChatMessage[]
): ChatMessage[] => {
  const merged = new Map<string, ChatMessage>();
  const matchedLocalIds = new Set<string>();

  localMessages.forEach((message) => {
    merged.set(message.id, message);
  });
  remoteMessages.forEach((message) => {
    const exactMatch = merged.get(message.id);
    if (exactMatch) {
      merged.set(message.id, {
        ...exactMatch,
        ...message,
        isStreaming: false,
        metadata: {
          ...(exactMatch.metadata || {}),
          ...(message.metadata || {}),
        },
      });
      matchedLocalIds.add(message.id);
      return;
    }

    const localMatch = localMessages.find(
      (localMessage) =>
        !matchedLocalIds.has(localMessage.id) && areMessagesEquivalent(localMessage, message)
    );

    if (!localMatch) {
      merged.set(message.id, {
        ...(merged.get(message.id) || {}),
        ...message,
        isStreaming: false,
        metadata: {
          ...(merged.get(message.id)?.metadata || {}),
          ...(message.metadata || {}),
        },
      });
      return;
    }

    matchedLocalIds.add(localMatch.id);
    const current = merged.get(localMatch.id) || localMatch;
    const preserveLocalContent =
      localMatch.role === 'assistant' &&
      !isEphemeralAssistantMessage(localMatch) &&
      normalizeComparableMessageText(current.content).includes(
        normalizeComparableMessageText(message.content)
      );

    merged.set(localMatch.id, {
      ...current,
      ...message,
      id: localMatch.id,
      content: preserveLocalContent ? current.content : message.content,
      isStreaming: false,
      metadata: {
        ...(current.metadata || {}),
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
    case 'human_control':
      return '人工处理';
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
    case 'human_control':
      return 'gold';
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

const normalizeTaskStatus = (value?: string): ChatTaskStatus | undefined => {
  switch (value) {
    case 'waiting_input':
    case 'pending_approval':
    case 'human_control':
    case 'running':
    case 'completed':
    case 'failed':
      return value;
    default:
      return undefined;
  }
};

const hasTerminalTaskOutcome = (message: ChatMessage): boolean => {
  if (message.role !== 'assistant' || message.metadata?.mode !== 'task' || message.isStreaming) {
    return false;
  }

  const normalizedResult = message.metadata?.normalizedResult;
  return Boolean(
    message.metadata?.finalResult?.trim() ||
      message.metadata?.errorMessage?.trim() ||
      message.metadata?.failureReason?.trim() ||
      message.metadata?.hasBusinessResult ||
      normalizedResult?.structuredData ||
      normalizedResult?.summary?.trim() ||
      normalizedResult?.detailText?.trim() ||
      message.metadata?.finalResultData ||
      /任务完成/.test(message.content)
  );
};

const resolveMessageTaskStatus = (message: ChatMessage): ChatTaskStatus | undefined => {
  const metadataStatus = message.metadata?.taskStatus;
  const partsStatus = normalizeTaskStatus(resolveTaskParts(message.contentParts).taskStatus);
  const terminalStatus = [metadataStatus, partsStatus].find(
    (status): status is ChatTaskStatus => Boolean(status && status !== 'running')
  );

  if (terminalStatus) {
    return terminalStatus;
  }

  if (hasTerminalTaskOutcome(message)) {
    return 'completed';
  }

  return metadataStatus || partsStatus;
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

const formatMessageTimestamp = (timestamp: string): string =>
  new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const parseMessageContent = (content: string): { thoughts: string[]; answer: string } => {
  const thoughts: string[] = [];
  let answer = content;
  const thinkTagRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;

  // Legacy fallback for older assistant text payloads. This duplicate parser
  // can be removed after all backends emit dedicated thought/action/
  // observation events and user-web fully switches to those fields.
  const thoughtRegex = /【思考】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const actionRegex = /【行动】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const observationRegex = /【观察】([^\n]*(?:\n(?!【)[^\n]*)*)/g;

  let match: RegExpExecArray | null;
  while ((match = thinkTagRegex.exec(content)) !== null) {
    if (match[1]?.trim()) {
      thoughts.push(match[1].trim());
    }
  }
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

  answer = content
    .replace(thinkTagRegex, '')
    .replace(/<\/?think>/gi, '')
    .replace(thoughtRegex, '')
    .replace(actionRegex, '')
    .trim();

  if (!answer) {
    const observations = [...content.matchAll(observationRegex)]
      .map((item) => item[1]?.trim())
      .filter((item): item is string => Boolean(item));
    answer = observations.join('\n\n');
  }

  return { thoughts, answer };
};

const summarizeThoughts = (thoughts: string[]): string | undefined => {
  const lastMeaningfulThought = [...thoughts]
    .reverse()
    .map((item) => item.trim())
    .find(Boolean);

  if (!lastMeaningfulThought) {
    return undefined;
  }

  const normalized = lastMeaningfulThought.replace(/^(思考|行动)\s*:\s*/u, '').trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length > 140 ? `${normalized.slice(0, 140).trim()}...` : normalized;
};

const dedupeThoughtTexts = (thoughts: string[]): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  thoughts.forEach((item) => {
    const normalized = item.trim();
    if (!normalized) {
      return;
    }
    const key = normalizeComparableMessageText(normalized);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(normalized);
  });

  return deduped;
};

const terminalTaskStatuses = new Set<NonNullable<NonNullable<ChatMessage['metadata']>['taskStatus']>>([
  'completed',
  'waiting_input',
  'pending_approval',
  'human_control',
  'failed',
]);

interface ChatPageProps {
  embedded?: boolean;
}

export function ChatPage({ embedded = false }: ChatPageProps) {
  const { message: toast } = App.useApp();
  const queryClient = useQueryClient();
  const currentSession = useChatStore((state) => state.currentSession);
  const prefetchedDraftMessage = useChatStore((state) => state.draftMessage);
  const prefetchedChatMode = useChatStore((state) => state.chatMode);
  const prefetchedDraftExecutionId = useChatStore((state) => state.draftExecutionId);
  const clearDraftContext = useChatStore((state) => state.clearDraftContext);
  const setCurrentSession = useChatStore((state) => state.setCurrentSession);
  const [draft, setDraft] = useState('');
  const [pendingExecutionId, setPendingExecutionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('default');
  const [chatMode, setChatMode] = useState<'chat' | 'task'>('chat');
  const [enableThinking, setEnableThinking] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortStreaming, setAbortStreaming] = useState<(() => void) | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    () => currentSession?.id ?? null
  );
  const [isSessionListCollapsed, setIsSessionListCollapsed] = useState(true);
  const [draftSessions, setDraftSessions] = useState<ChatSession[]>([]);
  const [sessionOverrides, setSessionOverrides] = useState<Record<string, Partial<ChatSession>>>(
    {}
  );
  const [sessionMessages, setSessionMessages] = useState<Record<string, ChatMessage[]>>({});
  const [actionLoadingByMessage, setActionLoadingByMessage] = useState<
    Record<string, 'approve' | 'reject' | 'resume' | undefined>
  >({});
  const [expandedThoughtMessageId, setExpandedThoughtMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeMessages = selectedSessionId ? sessionMessages[selectedSessionId] || [] : [];
  const showSessionSidebar = !embedded && !isSessionListCollapsed;
  const selectedSessionNeedsRefresh = useMemo(
    () =>
      activeMessages.some(
        (message) =>
          message.role === 'assistant' &&
          (message.isStreaming ||
            resolveMessageTaskStatus(message) === 'running' ||
            resolveMessageTaskStatus(message) === 'waiting_input' ||
            resolveMessageTaskStatus(message) === 'pending_approval')
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
  const availableModels = useMemo(() => ((modelsQuery.data || []) as AIModel[]) || [], [modelsQuery.data]);
  const selectedModelInfo = useMemo(() => {
    if (selectedModel && selectedModel !== 'default') {
      return availableModels.find((model) => model.id === selectedModel) || null;
    }

    return resolveDefaultChatModel(availableModels);
  }, [availableModels, selectedModel]);
  const nativeReasoningSupported = useMemo(
    () => supportsNativeReasoning(selectedModelInfo),
    [selectedModelInfo]
  );
  const thinkingToggleLabel = useMemo(() => {
    if (chatMode === 'chat' && nativeReasoningSupported) {
      return '推理';
    }
    return '思考';
  }, [chatMode, nativeReasoningSupported]);
  const thinkingToggleHint = useMemo(() => {
    if (chatMode === 'chat' && nativeReasoningSupported) {
      return '当前模型支持原生推理';
    }
    if (chatMode === 'chat') {
      return '当前模型不支持原生推理，将使用思考增强';
    }
    return '任务模式下展示思考过程与中间状态';
  }, [chatMode, nativeReasoningSupported]);
  const nativeReasoningEnabled = chatMode === 'chat' && nativeReasoningSupported && enableThinking;

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
    if (!currentSession) {
      return;
    }

    setDraftSessions((existing) => {
      const hasCurrentSession = existing.some((session) => session.id === currentSession.id);
      if (hasCurrentSession) {
        let changed = false;
        const next = existing.map((session) => {
          if (session.id !== currentSession.id) {
            return session;
          }
          if (isSameSession(session, currentSession)) {
            return session;
          }
          changed = true;
          return { ...session, ...currentSession };
        });
        return changed ? next : existing;
      }
      return [currentSession, ...existing];
    });
    setSelectedSessionId((existing) =>
      existing === currentSession.id ? existing : currentSession.id
    );
    setSessionMessages((existing) =>
      existing[currentSession.id]
        ? existing
        : {
            ...existing,
            [currentSession.id]: [],
          }
    );
  }, [currentSession]);

  useEffect(() => {
    if (!prefetchedDraftMessage) {
      return;
    }
    setDraft(prefetchedDraftMessage);
    setChatMode(prefetchedChatMode);
    setPendingExecutionId(prefetchedDraftExecutionId);
    clearDraftContext();
  }, [
    clearDraftContext,
    prefetchedChatMode,
    prefetchedDraftExecutionId,
    prefetchedDraftMessage,
  ]);

  useEffect(() => {
    if (selectedSessionId || currentSession || !sessions[0]?.id) {
      return;
    }
    setSelectedSessionId(sessions[0].id);
  }, [currentSession, selectedSessionId, sessions]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }
    if (isSameSession(currentSession, selectedSession)) {
      return;
    }
    setCurrentSession(selectedSession);
  }, [currentSession, selectedSession, setCurrentSession]);

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
    () => {
      const waitingExecutionId = getLatestWaitingInputExecutionId(activeMessages);
      if (waitingExecutionId || pendingExecutionId) {
        return '请直接在聊天框补充所需信息，Enter 发送后会继续当前任务';
      }
      return chatMode === 'task'
        ? '例如：帮我总结这个执行的结果，并给出下一步建议'
        : '输入你想咨询的问题';
    },
    [activeMessages, chatMode, pendingExecutionId]
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
              metadata: (() => {
                if (!patch.metadata) {
                  return message.metadata;
                }

                const nextMetadata = { ...(message.metadata || {}), ...patch.metadata };
                const nextTaskStatus = nextMetadata.taskStatus;
                if (!nextTaskStatus || !terminalTaskStatuses.has(nextTaskStatus)) {
                  return nextMetadata;
                }

                const progressThoughtLogs = (message.metadata?.progressLogs || [])
                  .filter((log) => log.stage === 'thought')
                  .map((log) => log.text.trim())
                  .filter(Boolean);
                const persistedThoughtLogs = message.metadata?.thoughtLogsSnapshot || [];
                const mergedThoughtLogs = dedupeThoughtTexts([
                  ...persistedThoughtLogs,
                  ...progressThoughtLogs,
                ]);

                if (mergedThoughtLogs.length === 0) {
                  return nextMetadata;
                }

                return {
                  ...nextMetadata,
                  thoughtLogsSnapshot: mergedThoughtLogs,
                };
              })(),
            }
          : message
      )
    );
  };

  const snapshotMessageThoughts = (sessionId: string, messageId: string) => {
    setSessionMessages((current) => {
      const currentMessages = current[sessionId] || [];
      const nextMessages = currentMessages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const parsedThoughtLogs =
          message.role === 'assistant' ? parseMessageContent(message.content).thoughts : [];
        const progressThoughtLogs = (message.metadata?.progressLogs || [])
          .filter((log) => log.stage === 'thought')
          .map((log) => log.text.trim())
          .filter(Boolean);
        const persistedThoughtLogs = message.metadata?.thoughtLogsSnapshot || [];
        const mergedThoughtLogs = dedupeThoughtTexts([
          ...persistedThoughtLogs,
          ...progressThoughtLogs,
          ...parsedThoughtLogs,
        ]);

        if (mergedThoughtLogs.length === 0) {
          return message;
        }

        return {
          ...message,
          metadata: {
            ...(message.metadata || {}),
            thoughtLogsSnapshot: mergedThoughtLogs,
          },
        };
      });

      return {
        ...current,
        [sessionId]: nextMessages,
      };
    });
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
    setCurrentSession(nextSession);
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
    const streamHandle = chatApi.stream(browserStreamingTransport, token, request, (event) => {
      const reduced = reduceChatStreamEvent({
        event,
        accumulatedContent,
        mode: request.config?.mode,
      });
      accumulatedContent = reduced.accumulatedContent;

      if (reduced.progressLog) {
        appendProgressLog(sessionId, assistantMessageId, reduced.progressLog);
      }
      if (reduced.sessionPatch) {
        updateSessionMeta(sessionId, reduced.sessionPatch);
      }
      if (Object.keys(reduced.messagePatch).length > 0) {
        updateMessage(sessionId, assistantMessageId, reduced.messagePatch);
      }
    });
    setAbortStreaming(() => streamHandle.abort);
    await streamHandle.promise;
  };

  const runAssistantRequest = async (
    session: ChatSession,
    request: ChatRequest,
    assistantMessageId: string
  ) => {
    try {
      await startAssistantStream(session.id, assistantMessageId, request);
      snapshotMessageThoughts(session.id, assistantMessageId);
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
      setAbortStreaming(null);
    }
  };

  const handleStopStreaming = () => {
    abortStreaming?.();
    setAbortStreaming(null);
    setIsStreaming(false);
  };

  const handleSend = () => {
    const content = draft.trim();
    if (!content || isStreaming) {
      return;
    }

    const resolvedModelId =
      selectedModel && selectedModel !== 'default' ? selectedModel : undefined;
    const continuedExecutionId =
      pendingExecutionId || getLatestWaitingInputExecutionId(activeMessages);

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
        showThinking: enableThinking,
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
    setIsStreaming(true);

    const request: ChatRequest = buildChatRequest({
      message: content,
      sessionId: session.id,
      executionId: continuedExecutionId || undefined,
      modelId: resolvedModelId,
      mode: chatMode,
      thinking: enableThinking,
      reasoning: nativeReasoningEnabled,
    });

    if (pendingExecutionId) {
      setPendingExecutionId(null);
    }

    void runAssistantRequest(session, request, assistantMessageId);
  };

  const handleCreateSession = () => {
    setError(null);
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
        metadata: buildApprovedTaskPatch({
          executionId,
          executionStatus: execution.status,
        }),
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
        metadata: buildApprovedAssistantDraftMeta({
          executionId,
          executionStatus: execution.status,
        }),
      };
      updateSessionMessages(selectedSession.id, (messages) =>
        upsertMessage(messages, assistantMessage)
      );
      setIsStreaming(true);
      void runAssistantRequest(
        selectedSession,
        buildResumeExecutionRequest({
          sessionId: selectedSession.id,
          executionId,
          modelId: selectedModel && selectedModel !== 'default' ? selectedModel : undefined,
          mode: 'task',
          thinking: enableThinking,
          reasoning: false,
        }),
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
        metadata: buildRejectedTaskPatch({
          executionId,
          executionStatus: execution.status,
        }),
      });
      await syncRelatedQueries(selectedSession.id);
      void toast.success('已驳回任务');
    } catch (rejectError) {
      void toast.error(rejectError instanceof Error ? rejectError.message : '驳回执行失败');
    } finally {
      setActionLoadingByMessage((current) => ({ ...current, [messageId]: undefined }));
    }
  };

  const handleResumeHumanControl = async (messageId: string, executionId: string) => {
    if (!selectedSession) {
      return;
    }
    setActionLoadingByMessage((current) => ({ ...current, [messageId]: 'resume' }));
    try {
      const execution = await executionApi.getById(executionId);
      const resumedExecution = await resumeHumanControlExecution({
        executionId,
        execution,
        executionApi,
      });
      updateMessage(selectedSession.id, messageId, {
        metadata: buildResumedHumanControlTaskPatch({
          executionId,
          executionStatus: resumedExecution.status,
        }),
      });
      await syncRelatedQueries(selectedSession.id);
      void toast.success('已同意人工处理结果，任务继续执行中');
    } catch (resumeError) {
      void toast.error(
        resumeError instanceof Error ? resumeError.message : '继续执行失败'
      );
    } finally {
      setActionLoadingByMessage((current) => ({ ...current, [messageId]: undefined }));
    }
  };

  const renderTaskCard = (message: ChatMessage) => {
    if (message.role !== 'assistant' || message.metadata?.mode !== 'task') {
      return null;
    }

    const taskParts = resolveTaskParts(message.contentParts);
    const status = resolveMessageTaskStatus(message);
    const executionId = message.metadata?.executionId || taskParts.executionId;
    const finalResult = message.metadata?.finalResult?.trim();
    const finalSummary = message.metadata?.finalSummary?.trim();
    const errorMessage = message.metadata?.errorMessage?.trim();
    const failureReason = message.metadata?.failureReason?.trim();
    const resultTitle = message.metadata?.resultTitle?.trim();
    const normalizedSummary = message.metadata?.normalizedResult?.summary?.trim();
    const normalizedDetail = message.metadata?.normalizedResult?.detailText?.trim();
    const structuredResult = toStructuredResultText(
      message.metadata?.normalizedResult?.structuredData ??
        message.metadata?.finalResultData ??
        taskParts.structuredResultData
    );
    const partDownloadUrl =
      findDeeplinkByLabel(taskParts.deeplinks, /下载|download/i) || taskParts.deeplinks[0]?.url;
    const partDetailUrl = findDeeplinkByLabel(taskParts.deeplinks, /详情|detail|执行/i);
    const primaryStructuredResult =
      status === 'completed' && structuredResult && structuredResult !== errorMessage
        ? structuredResult
        : null;
    const displayFinalResult =
      status === 'completed'
        ? finalResult ||
          finalSummary ||
          normalizedSummary ||
          primaryStructuredResult ||
          normalizedDetail ||
          undefined
        : undefined;
    const supplementalResult =
      displayFinalResult && finalResult && finalResult !== displayFinalResult
        ? finalResult
        : displayFinalResult && normalizedDetail && normalizedDetail !== displayFinalResult
          ? normalizedDetail
          : null;
    const missingInputs = (message.metadata?.missingInputs || []) as {
      name?: string;
      description?: string;
      group_label?: string;
      display_name?: string;
      missing?: boolean;
    }[];
    const waitingInputItems = missingInputs.map((item, index) => ({
      key: `${item.name || 'missing'}-${index}`,
      label: resolveWaitingInputDisplayLabel({
        name: item.name || item.description || `field-${index + 1}`,
        description: item.description,
        group_label: item.group_label,
        display_name: item.display_name,
      }),
    }));
    const waitingInputGroupMap = missingInputs.reduce<Map<string, typeof waitingInputItems>>(
      (groups, item, index) => {
        const label = item.group_label?.trim() || '待补字段';
        const groupItems = groups.get(label) || [];
        groupItems.push({
          key: `${label}-${item.name || 'missing'}-${index}`,
          label: resolveWaitingInputDisplayLabel({
            name: item.name || item.description || `field-${index + 1}`,
            description: item.description,
            group_label: item.group_label,
            display_name: item.display_name,
          }),
        });
        groups.set(label, groupItems);
        return groups;
      },
      new Map()
    );
    const waitingInputGroups = [...waitingInputGroupMap.entries()].map(([label, items]) => ({
      label,
      items,
    }));
    const artifacts =
      message.metadata?.artifacts || message.metadata?.normalizedResult?.artifacts || [];
    const hasTaskCard = Boolean(
      status ||
        displayFinalResult ||
        finalSummary ||
        normalizedSummary ||
        errorMessage ||
        failureReason ||
        resultTitle ||
        executionId ||
        message.metadata?.downloadUrl ||
        partDownloadUrl ||
        message.metadata?.temporalLink ||
        partDetailUrl ||
        primaryStructuredResult ||
        artifacts.length > 0 ||
        waitingInputItems.length > 0
    );

    if (!hasTaskCard) {
      return null;
    }

    return (
      <>
        <SharedTaskOutcomeCard
          executionStatus={getMessageStatusLabel(status) || null}
          executionId={executionId}
          downloadUrl={message.metadata?.downloadUrl || partDownloadUrl}
          temporalLink={message.metadata?.temporalLink || partDetailUrl}
          executionDetailLink={executionId ? `/executions/${executionId}` : undefined}
          browserExecutionMode={false}
          shouldShowTakeoverCard={status === 'human_control'}
          shouldShowErrorCard={status === 'failed'}
          errorMessage={errorMessage}
          failureReason={failureReason}
          finalResult={displayFinalResult}
          hasBusinessResult={message.metadata?.hasBusinessResult}
          shouldShowStructuredResult={Boolean(
            structuredResult &&
              displayFinalResult &&
              structuredResult !== displayFinalResult &&
              structuredResult !== errorMessage
          )}
          structuredResultText={structuredResult}
          waitingInputSummary={
            status === 'waiting_input'
              ? finalSummary || '还需要你补充以下信息，请直接在下方聊天框回复，任务会继续执行。'
              : undefined
          }
          isWaitingInput={status === 'waiting_input'}
          isPendingApproval={status === 'pending_approval'}
          showRunningState={status === 'running'}
          summaryToDisplay={finalSummary || normalizedSummary || resultTitle || undefined}
          waitingInputGroups={waitingInputGroups}
          waitingInputItems={waitingInputItems}
          approvalAction={(() => {
            const action = actionLoadingByMessage[message.id];
            return action === 'approve' || action === 'reject' ? action : null;
          })()}
          takeoverAction={actionLoadingByMessage[message.id] === 'resume' ? 'resume' : null}
          onApproveExecution={() => {
            if (executionId) {
              void handleApprove(message.id, executionId);
            }
          }}
          onRejectExecution={() => {
            if (executionId) {
              void handleReject(message.id, executionId);
            }
          }}
          onResumeExecution={() => {
            if (executionId) {
              void handleResumeHumanControl(message.id, executionId);
            }
          }}
        />
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
        {supplementalResult ? (
          <details className="user-chat-outcome-details">
            <summary>查看补充说明</summary>
            <pre className="user-chat-outcome-pre">{supplementalResult}</pre>
          </details>
        ) : null}
      </>
    );
  };

  const renderProgressCard = (message: ChatMessage) => {
    const progressLogs = message.metadata?.progressLogs || [];
    const status = resolveMessageTaskStatus(message);
    const taskParts = resolveTaskParts(message.contentParts);
    const finalResult = message.metadata?.finalResult?.trim();
    const finalSummary = message.metadata?.finalSummary?.trim();
    const errorMessage = message.metadata?.errorMessage?.trim();
    const failureReason = message.metadata?.failureReason?.trim();
    const normalizedSummary = message.metadata?.normalizedResult?.summary?.trim();
    const structuredResult = toStructuredResultText(
      message.metadata?.normalizedResult?.structuredData ??
        message.metadata?.finalResultData ??
        taskParts.structuredResultData
    );
    if (
      message.role !== 'assistant' ||
      message.metadata?.mode !== 'task' ||
      progressLogs.length === 0 ||
      status !== 'running' ||
      Boolean(
        finalResult ||
          finalSummary ||
          normalizedSummary ||
          errorMessage ||
          failureReason ||
          structuredResult
      )
    ) {
      return null;
    }

    const currentProgress = progressLogs[progressLogs.length - 1];

    if (!currentProgress) {
      return null;
    }

    return (
      <SharedTaskProgressCard currentProgressLog={currentProgress} isRunning />
    );
  };

  const renderMessage = (message: ChatMessage) => {
    const resolvedTaskStatus = resolveMessageTaskStatus(message);
    const statusLabel = getMessageStatusLabel(resolvedTaskStatus);
    const statusColor = getStatusTagColor(resolvedTaskStatus);
    const taskCard = renderTaskCard(message);
    const progressCard = renderProgressCard(message);
    const parsedContent = parseMessageContent(message.content);
    const plainContent = (
      message.role === 'assistant' ? parsedContent.answer : message.content
    ).trim();
    const hasRenderableContentParts = Boolean(
      message.contentParts?.some((part) =>
        ['text', 'markdown', 'structured_result', 'deeplink', 'file_ref'].includes(part.type)
      )
    );
    const taskSummaryCandidates = [
      message.metadata?.finalSummary?.trim(),
      message.metadata?.normalizedResult?.summary?.trim(),
      message.metadata?.resultTitle?.trim(),
      message.metadata?.finalResult?.trim(),
      message.metadata?.errorMessage?.trim(),
    ].filter((item): item is string => Boolean(item));
    const contentThoughtLogs = message.role === 'assistant' ? parsedContent.thoughts : [];
    const persistedThoughtLogs = message.metadata?.thoughtLogsSnapshot || [];
    const progressThoughtLogs = (message.metadata?.progressLogs || [])
      .filter((log) => log.stage === 'thought')
      .map((log) => log.text.trim())
      .filter(Boolean);
    const thoughtLogs = dedupeThoughtTexts([
      ...persistedThoughtLogs,
      ...progressThoughtLogs,
      ...contentThoughtLogs,
    ]);
    const hasProgressLogs = Boolean(message.metadata?.progressLogs?.length);
    const showThoughtLogs = Boolean(
      message.role === 'assistant' &&
      message.metadata?.showThinking !== false &&
      thoughtLogs.length > 0
    );
    const isThoughtExpanded = expandedThoughtMessageId === message.id;
    const thoughtSummary = summarizeThoughts(thoughtLogs);
    const shouldPinCollapsedThoughts =
      showThoughtLogs && !message.isStreaming && !isThoughtExpanded && Boolean(taskCard);
    const shouldPinFinishedTaskThoughts =
      showThoughtLogs &&
      !message.isStreaming &&
      Boolean(taskCard) &&
      message.metadata?.mode === 'task';
    const thoughtPanel = showThoughtLogs ? (
      <SharedThoughtProcessPanel
        thoughts={thoughtLogs}
        expanded={isThoughtExpanded}
        collapsedSummary={thoughtSummary}
        preserveSummaryWhenCollapsed={!message.isStreaming}
        onToggle={() =>
          setExpandedThoughtMessageId((current) => (current === message.id ? null : message.id))
        }
      />
    ) : null;
    const hasDuplicatedTaskSummary = Boolean(
      message.metadata?.mode === 'task' &&
      taskCard &&
      plainContent &&
      taskSummaryCandidates.some(
        (item) =>
          normalizeComparableMessageText(plainContent) === normalizeComparableMessageText(item)
      )
    );
    const shouldShowMessageContent = Boolean(
      (hasRenderableContentParts ||
        (plainContent &&
          !hasDuplicatedTaskSummary &&
          plainContent !== message.metadata?.finalResult?.trim() &&
          plainContent !== message.metadata?.errorMessage?.trim())) &&
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
        <div className={`user-chat-message-stack role-${message.role}`}>
          <div className={`user-chat-message-bubble role-${message.role}`}>
            {shouldPinCollapsedThoughts || shouldPinFinishedTaskThoughts ? thoughtPanel : null}
            {taskCard}
            {progressCard}
            {!(shouldPinCollapsedThoughts || shouldPinFinishedTaskThoughts) ? thoughtPanel : null}
            {shouldShowMessageContent ? (
              <div className="user-chat-message-content">
                {hasRenderableContentParts ? (
                  <SharedContentPartsRenderer
                    parts={message.contentParts}
                    isStreaming={Boolean(message.isStreaming)}
                    renderStructuredResult={message.metadata?.mode !== 'task'}
                    renderDeeplink={message.metadata?.mode !== 'task'}
                  />
                ) : (
                  <SharedMessageContentRenderer
                    content={plainContent}
                    mode={message.role === 'assistant' ? 'markdown' : 'plain'}
                    isStreaming={Boolean(message.isStreaming)}
                  />
                )}
              </div>
            ) : null}
          </div>
          <div className={`user-chat-message-footer role-${message.role}`}>
            <div className={`user-chat-message-meta role-${message.role}`}>
              <span className="user-chat-message-meta-item user-chat-message-meta-identity">
                <Avatar
                  icon={message.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  className={`user-chat-message-avatar inline ${message.role}`}
                />
                <span className="user-chat-message-meta-time">
                  <ClockCircleOutlined />
                  <span>{formatMessageTimestamp(message.timestamp)}</span>
                </span>
              </span>
              {message.isStreaming ? (
                <span className="user-chat-message-meta-item user-chat-message-meta-status status-processing">
                  <LoadingOutlined spin />
                  <span>生成中</span>
                </span>
              ) : null}
              {statusLabel && statusColor ? (
                <span className={`user-chat-message-meta-item user-chat-message-meta-status status-${statusColor}`}>
                  <span className="user-chat-message-status-dot" />
                  <span>{statusLabel}</span>
                </span>
              ) : null}
            </div>
            {showMessageActions ? (
              <div className="user-chat-message-actions">
                <SharedChatMessageActions
                  usage={usage}
                  onCopy={() => {
                    void handleCopyMessage();
                  }}
                  extraContent={
                    <>
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
                    </>
                  }
                />
              </div>
            ) : null}
          </div>
        </div>
      </List.Item>
    );
  };

  const showEmbeddedAlertPanel = Boolean(
    embedded &&
      (modelsQuery.error ||
        sessionsQuery.error ||
        selectedSessionHistoryQuery.error ||
        error)
  );

  return (
    <div className={`user-chat-page${embedded ? ' embedded' : ''}`}>
      {!embedded && isSessionListCollapsed ? (
        <div className="user-chat-sidebar-rail">
          <Button
            type="text"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setIsSessionListCollapsed(false)}
            className="user-chat-sidebar-toggle"
            title="展开会话管理"
          />
          <Button
            type="primary"
            shape="circle"
            icon={<PlusOutlined />}
            onClick={handleCreateSession}
            title="新建会话"
          />
        </div>
      ) : null}

      {showSessionSidebar ? (
        <Card className="user-chat-sidebar">
          <div className="user-chat-sidebar-header">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                会话管理
              </Typography.Title>
              <Typography.Text type="secondary">查看历史记录并切换任务上下文</Typography.Text>
            </div>
            <Space>
              <Button
                type="text"
                icon={<MenuFoldOutlined />}
                onClick={() => setIsSessionListCollapsed(true)}
                className="user-chat-sidebar-toggle"
                title="收起会话管理"
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
        {showEmbeddedAlertPanel ? (
          <Card className={`user-chat-status-panel${embedded ? ' embedded' : ''}`}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
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
        ) : (
          <div className="user-chat-alert-stack">
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
          </div>
        )}

        <div className={`user-chat-window-shell${embedded ? ' embedded' : ''}`}>
          <Card className="user-chat-thread" styles={{ body: { paddingBottom: 8 } }}>
            {selectedSessionHistoryQuery.isLoading && activeMessages.length === 0 ? (
              <Skeleton active paragraph={{ rows: 8 }} />
            ) : activeMessages.length === 0 ? (
              <div className="user-chat-empty-state">
                <Empty
                  description={
                    <div className="user-chat-empty-description">
                      <div className="user-chat-empty-title">开始一个新对话</div>
                      <Typography.Text type="secondary">
                        输入你的问题、任务或补充信息，AI 会在这里持续返回结果。
                      </Typography.Text>
                    </div>
                  }
                />
              </div>
            ) : (
              <List dataSource={activeMessages} renderItem={(message) => renderMessage(message)} />
            )}
            <div ref={messagesEndRef} />
          </Card>

          <UserChatComposer
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSend}
            onStop={handleStopStreaming}
            onNewSession={handleCreateSession}
            chatMode={chatMode}
            onChatModeChange={setChatMode}
            enableThinking={enableThinking}
            onEnableThinkingChange={setEnableThinking}
            thinkingLabel={thinkingToggleLabel}
            thinkingHint={thinkingToggleHint}
            nativeReasoningSupported={nativeReasoningSupported}
            selectedModel={selectedModel}
            availableModels={availableModels}
            onModelChange={setSelectedModel}
            isStreaming={isStreaming}
            modelsLoading={modelsQuery.isLoading}
            disabled={false}
            placeholder={placeholder}
          />
        </div>
      </div>

    </div>
  );
}
