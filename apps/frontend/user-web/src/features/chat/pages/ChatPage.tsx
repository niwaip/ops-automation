import {
  DeleteOutlined,
  DesktopOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'react-query';
import {
  type AIModel,
  type UploadedFileDescriptor,
} from '@ops/user-core';
import { chatApi } from '../../../api';
import { ChatMessageList } from '../components/ChatMessageList';
import { ChatSessionSidebar } from '../components/ChatSessionSidebar';
import { ChatStatusAlerts } from '../components/ChatStatusAlerts';
import { UserChatComposer } from '../components/UserChatComposer';
import { useChatPageActions } from '../hooks/useChatPageActions';
import { useChatSessions } from '../hooks/useChatSessions';
import { useChatStreaming } from '../hooks/useChatStreaming';
import { useChatStore } from '../chatStore';
import { supportsNativeReasoning } from '@/shared/lib/aiModelReasoning';
import {
  CHAT_SESSION_POLL_INTERVAL,
  CHAT_SESSION_STREAMING_POLL_INTERVAL,
} from '@/shared/config/pollingConfig';
import {
  formatRelativeTime,
  getSessionPreview,
  resolveSessionChannel,
} from '../lib/sessionView';
import {
  getLatestWaitingInputExecutionId,
  resolveMessageTaskStatus,
} from '../lib/taskStatus';
import '../ChatMessage.css';
import styles from './ChatPage.module.css';

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


interface ChatPageProps {
  embedded?: boolean;
}

export function ChatPage({ embedded = false }: ChatPageProps) {
  const { message: toast } = App.useApp();
  const currentSession = useChatStore((state) => state.currentSession);
  const prefetchedDraftMessage = useChatStore((state) => state.draftMessage);
  const prefetchedChatMode = useChatStore((state) => state.chatMode);
  const prefetchedDraftExecutionId = useChatStore((state) => state.draftExecutionId);
  const clearDraftContext = useChatStore((state) => state.clearDraftContext);
  const setCurrentSession = useChatStore((state) => state.setCurrentSession);
  const [draft, setDraft] = useState('');
  const [sentHistory, setSentHistory] = useState<string[]>([]);
  const [pendingExecutionId, setPendingExecutionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('default');
  const [chatMode, setChatMode] = useState<'chat' | 'task'>('task');
  const [enableThinking, setEnableThinking] = useState(true);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [expandedThoughtMessageId, setExpandedThoughtMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const notifiedTaskStateKeysRef = useRef<Set<string>>(new Set());

  const modelsQuery = useQuery(['user-web-chat-models'], () => chatApi.getAvailableModels());
  const sessionsQuery = useQuery(['user-web-chat-sessions'], () => chatApi.listSessions(), {
    refetchOnWindowFocus: false,
  });
  const refetchSessions = sessionsQuery.refetch;

  const remoteSessions = sessionsQuery.data || [];
  const remoteSessionIds = useMemo(
    () => new Set(remoteSessions.map((session) => session.id)),
    [remoteSessions]
  );
  const {
    activeMessages,
    appendProgressLog,
    createDraftSession,
    deleteSession,
    ensureSession,
    isSessionListCollapsed,
    mergeSessionHistory,
    selectedSession,
    selectedSessionId,
    sessionMessages,
    sessionMessagesRef,
    sessions,
    showSessionSidebar,
    snapshotMessageThoughts,
    updateMessage,
    updateSessionMessages,
    updateSessionMeta,
    setIsSessionListCollapsed,
    setSelectedSessionId,
  } = useChatSessions({
    currentSession,
    embedded,
    remoteSessions,
    selectedModel,
    setCurrentSession,
  });
  const {
    clearError,
    error,
    handleStopStreaming,
    isStreaming,
    runAssistantRequest,
  } = useChatStreaming({
    toast,
    notifiedTaskStateKeysRef,
    sessionMessagesRef,
    appendProgressLog,
    snapshotMessageThoughts,
    updateMessage,
    updateSessionMeta,
  });
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

  useEffect(() => {
    if (!selectedSessionNeedsRefresh) {
      return;
    }
    const timer = window.setInterval(() => {
      void refetchSessions({ cancelRefetch: false });
    }, CHAT_SESSION_POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [refetchSessions, selectedSessionNeedsRefresh]);

  const selectedSessionHistoryQuery = useQuery(
    ['user-web-chat-history', selectedSessionId],
    () => chatApi.getChatHistory(selectedSessionId!),
    {
      enabled: Boolean(selectedSessionId && remoteSessionIds.has(selectedSessionId)),
      refetchOnWindowFocus: false,
      refetchInterval: selectedSessionNeedsRefresh && !isStreaming ? CHAT_SESSION_STREAMING_POLL_INTERVAL : false,
    }
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
  const {
    actionLoadingByMessage,
    handleApprove,
    handleCreateSession,
    handleReject,
    handleRetry,
    handleSend,
  } = useChatPageActions({
    activeMessages,
    chatMode,
    clearError,
    createDraftSession,
    draft,
    enableThinking,
    enableWebSearch,
    ensureSession,
    isStreaming,
    nativeReasoningEnabled,
    pendingExecutionId,
    runAssistantRequest,
    selectedModel,
    selectedSession,
    setDraft,
    setPendingExecutionId,
    toast,
    updateMessage,
    updateSessionMessages,
    updateSessionMeta,
  });

  // Wrap handleSend to push draft into sent history before clearing it
  const handleSendWithHistory = useCallback((files?: UploadedFileDescriptor[], contentOverride?: string) => {
    const textToSave = contentOverride !== undefined ? contentOverride : draft;
    if (textToSave.trim()) {
      setSentHistory((prev) => {
        const next = [...prev, textToSave.trim()];
        return next.length > 50 ? next.slice(next.length - 50) : next;
      });
    }
    handleSend(files, contentOverride);
  }, [draft, handleSend]);

  useEffect(() => {
    const models = modelsQuery.data || [];
    setSelectedModel((current) => current || models[0]?.id || 'default');
  }, [modelsQuery.data]);

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
    if (!selectedSessionId || !selectedSessionHistoryQuery.data || isStreaming) {
      return;
    }

    mergeSessionHistory(selectedSessionId, selectedSessionHistoryQuery.data, isStreaming);
  }, [isStreaming, mergeSessionHistory, selectedSessionHistoryQuery.data, selectedSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages, isStreaming]);

  useEffect(() => {
    if (!activeMessages || activeMessages.length === 0) return;
    const historyUserContents = activeMessages
      .filter((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim())
      .map((m) => m.content.trim());
    if (historyUserContents.length > 0) {
      setSentHistory((prev) => {
        const combined = [...historyUserContents, ...prev];
        const result: string[] = [];
        for (const item of combined) {
          if (item && result[result.length - 1] !== item) {
            result.push(item);
          }
        }
        return result.length > 50 ? result.slice(result.length - 50) : result;
      });
    }
  }, [activeMessages]);

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

  return (
    <div className={`${styles['user-chat-page']}${embedded ? ` ${styles.embedded}` : ''}`}>
      {!embedded && isSessionListCollapsed ? (
        <div className={styles['user-chat-sidebar-rail']}>
          <Button
            type="text"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setIsSessionListCollapsed(false)}
            className={styles['user-chat-sidebar-toggle']}
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
        <ChatSessionSidebar
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          isLoading={sessionsQuery.isLoading}
          onSelectSession={setSelectedSessionId}
          onDeleteSession={async (sessionId) => {
            deleteSession(sessionId);
            try {
              await chatApi.deleteSession(sessionId);
              refetchSessions();
            } catch {
              // ignore
            }
          }}
          onRefresh={() => {
            void refetchSessions();
          }}
          onCollapse={() => setIsSessionListCollapsed(true)}
          onCreateSession={handleCreateSession}
          getPreview={(sessionId) => getSessionPreview(sessionMessages[sessionId])}
          formatUpdatedAt={formatRelativeTime}
        />
      ) : null}

      <div className={styles['user-chat-main']}>
        <ChatStatusAlerts
          embedded={embedded}
          modelsError={modelsQuery.error}
          sessionsError={sessionsQuery.error}
          historyError={selectedSessionHistoryQuery.error}
          pageError={error}
        />

        <div className={`${styles['user-chat-window-shell']}${embedded ? ` ${styles.embedded}` : ''}`}>
          {selectedSession ? (
            <div className={styles['user-chat-header-bar']}>
              <div className={styles['user-chat-header-info']}>
                {(() => {
                  const channelMeta = resolveSessionChannel(selectedSession);
                  return (
                    <span
                      className={`${styles['session-channel-tag']} ${
                        styles[`channel-${channelMeta.key}`] || ''
                      }`}
                    >
                      {channelMeta.key === 'wechat' ? (
                        <WechatOutlined style={{ marginRight: 4 }} />
                      ) : (
                        <DesktopOutlined style={{ marginRight: 4 }} />
                      )}
                      {channelMeta.badgeText}
                    </span>
                  );
                })()}
                <Typography.Text
                  strong
                  className={styles['user-chat-header-title']}
                  ellipsis={{ tooltip: selectedSession.title || '新对话' }}
                >
                  {selectedSession.title || '新对话'}
                </Typography.Text>
                {selectedSession.modelId && selectedSession.modelId !== 'default' ? (
                  <Tag className={styles['session-model-tag']}>{selectedSession.modelId}</Tag>
                ) : null}
              </div>
              <Space size={4} className={styles['user-chat-header-actions']}>
                <Tooltip title="新建会话">
                  <Button
                    type="text"
                    shape="circle"
                    icon={<PlusOutlined />}
                    onClick={handleCreateSession}
                    className={styles['user-chat-header-btn']}
                  />
                </Tooltip>
                <Tooltip title="刷新会话">
                  <Button
                    type="text"
                    shape="circle"
                    icon={<ReloadOutlined spin={selectedSessionHistoryQuery.isFetching} />}
                    onClick={() => {
                      void selectedSessionHistoryQuery.refetch();
                      void refetchSessions();
                    }}
                    className={styles['user-chat-header-btn']}
                  />
                </Tooltip>
                <Popconfirm
                  title="删除当前会话"
                  description="确定要删除当前会话及其所有历史记录吗？"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true, size: 'small' }}
                  cancelButtonProps={{ size: 'small' }}
                  onConfirm={async () => {
                    const sid = selectedSession.id;
                    deleteSession(sid);
                    try {
                      await chatApi.deleteSession(sid);
                      void refetchSessions();
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <Tooltip title="删除会话">
                    <Button
                      type="text"
                      danger
                      shape="circle"
                      icon={<DeleteOutlined />}
                      className={styles['user-chat-header-btn']}
                    />
                  </Tooltip>
                </Popconfirm>
              </Space>
            </div>
          ) : null}

          <ChatMessageList
            actionLoadingByMessage={actionLoadingByMessage}
            activeMessages={activeMessages}
            expandedThoughtMessageId={expandedThoughtMessageId}
            historyLoading={selectedSessionHistoryQuery.isLoading}
            messagesEndRef={messagesEndRef}
            onToggleThought={(messageId) =>
              setExpandedThoughtMessageId((current) => (current === messageId ? null : messageId))
            }
            onApproveExecution={(messageId, executionId) => {
              void handleApprove(messageId, executionId);
            }}
            onRejectExecution={(messageId, executionId) => {
              void handleReject(messageId, executionId);
            }}
            onRetry={handleRetry}
          />

          <UserChatComposer
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSendWithHistory}
            onStop={handleStopStreaming}
            onNewSession={handleCreateSession}
            chatMode={chatMode}
            onChatModeChange={setChatMode}
            enableThinking={enableThinking}
            onEnableThinkingChange={setEnableThinking}
            enableWebSearch={enableWebSearch}
            onEnableWebSearchChange={setEnableWebSearch}
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
            sentHistory={sentHistory}
          />
        </div>
      </div>

    </div>
  );
}
