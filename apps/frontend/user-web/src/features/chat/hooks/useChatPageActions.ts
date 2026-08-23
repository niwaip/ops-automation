import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from 'react-query';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ChatMessage, ChatRequest, ChatSession, UploadedFileDescriptor } from '@ops/user-core';
import { executionApi } from '../../../api';
import {
  buildApprovedAssistantDraftMeta,
  buildApprovedTaskPatch,
  buildRejectedTaskPatch,
} from '@chat-web/controller/taskActionController';
import {
  buildChatRequest,
  buildResumeExecutionRequest,
} from '@chat-web/controller/chatRequestController';
import { upsertMessage } from '../lib/messageState';
import { summarizeSessionTitle } from '../lib/sessionView';
import { getLatestWaitingInputExecutionId } from '../lib/taskStatus';

const buildMessageId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toChatTimestamp = (): string => new Date().toISOString();

interface UseChatPageActionsOptions {
  activeMessages: ChatMessage[];
  chatMode: 'chat' | 'task';
  clearError: () => void;
  createDraftSession: (initialTitle: string, now: string) => ChatSession;
  draft: string;
  enableThinking: boolean;
  ensureSession: (now: string) => ChatSession;
  isStreaming: boolean;
  nativeReasoningEnabled: boolean;
  pendingExecutionId: string | null;
  runAssistantRequest: (
    session: ChatSession,
    request: ChatRequest,
    assistantMessageId: string
  ) => Promise<void>;
  selectedModel: string;
  selectedSession: ChatSession | null;
  setDraft: Dispatch<SetStateAction<string>>;
  setPendingExecutionId: Dispatch<SetStateAction<string | null>>;
  toast: MessageInstance;
  updateMessage: (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  updateSessionMessages: (
    sessionId: string,
    updater: (messages: ChatMessage[]) => ChatMessage[]
  ) => void;
  updateSessionMeta: (sessionId: string, patch: Partial<ChatSession>) => void;
}

export function useChatPageActions({
  activeMessages,
  chatMode,
  clearError,
  createDraftSession,
  draft,
  enableThinking,
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
}: UseChatPageActionsOptions) {
  const queryClient = useQueryClient();
  const [actionLoadingByMessage, setActionLoadingByMessage] = useState<
    Record<string, 'approve' | 'reject' | undefined>
  >({});

  const syncRelatedQueries = useCallback(async (sessionId: string) => {
    await Promise.all([
      queryClient.invalidateQueries(['user-web-chat-sessions']),
      queryClient.invalidateQueries(['user-web-chat-history', sessionId]),
      queryClient.invalidateQueries(['user-web-executions']),
      queryClient.invalidateQueries(['user-web-notifications']),
    ]);
  }, [queryClient]);

  const handleSend = useCallback((filesToSend?: UploadedFileDescriptor[]) => {
    const content = draft.trim();
    const hasFiles = (filesToSend || []).length > 0;
    if ((!content && !hasFiles) || isStreaming) {
      return;
    }

    const resolvedModelId =
      selectedModel && selectedModel !== 'default' ? selectedModel : undefined;
    const continuedExecutionId =
      pendingExecutionId || getLatestWaitingInputExecutionId(activeMessages);
    const now = toChatTimestamp();
    const session = ensureSession(now);
    const userMessage: ChatMessage = {
      id: buildMessageId(),
      sessionId: session.id,
      role: 'user',
      content,
      timestamp: now,
      metadata: {
        files: filesToSend?.map((f) => f.fileName),
      },
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
      title: summarizeSessionTitle(content || filesToSend?.[0]?.fileName || '附件消息'),
      updatedAt: now,
      modelId: resolvedModelId,
    });
    setDraft('');
    clearError();

    const request: ChatRequest = buildChatRequest({
      message: content,
      sessionId: session.id,
      executionId: continuedExecutionId || undefined,
      modelId: resolvedModelId,
      files: filesToSend,
      mode: chatMode,
      thinking: enableThinking,
      reasoning: nativeReasoningEnabled,
    });

    if (pendingExecutionId) {
      setPendingExecutionId(null);
    }

    void runAssistantRequest(session, request, assistantMessageId);
  }, [
    activeMessages,
    chatMode,
    clearError,
    draft,
    enableThinking,
    ensureSession,
    isStreaming,
    nativeReasoningEnabled,
    pendingExecutionId,
    runAssistantRequest,
    selectedModel,
    setDraft,
    setPendingExecutionId,
    updateSessionMessages,
    updateSessionMeta,
  ]);

  const handleCreateSession = useCallback(() => {
    clearError();
    createDraftSession('新对话', toChatTimestamp());
  }, [clearError, createDraftSession]);

  const handleApprove = useCallback(async (messageId: string, executionId: string) => {
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
  }, [
    enableThinking,
    runAssistantRequest,
    selectedModel,
    selectedSession,
    toast,
    updateMessage,
    updateSessionMessages,
  ]);

  const handleReject = useCallback(async (messageId: string, executionId: string) => {
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
  }, [selectedSession, syncRelatedQueries, toast, updateMessage]);

  const handleRetry = useCallback(
    (targetMessage: ChatMessage) => {
      if (isStreaming || !selectedSession) return;

      let userContent = '';
      if (targetMessage.role === 'user') {
        userContent = targetMessage.content;
      } else {
        const idx = activeMessages.findIndex((m) => m.id === targetMessage.id);
        if (idx > 0 && activeMessages[idx - 1]?.role === 'user') {
          userContent = activeMessages[idx - 1].content;
        } else {
          const lastUser = [...activeMessages].reverse().find((m) => m.role === 'user');
          if (lastUser) userContent = lastUser.content;
        }
      }

      if (!userContent.trim()) return;

      const resolvedModelId =
        selectedModel && selectedModel !== 'default' ? selectedModel : undefined;
      const now = toChatTimestamp();
      const assistantMessageId = buildMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        sessionId: selectedSession.id,
        role: 'assistant',
        content: '',
        timestamp: now,
        isStreaming: true,
        metadata: {
          mode: chatMode,
          showThinking: enableThinking,
        },
      };

      updateSessionMessages(selectedSession.id, (current) => [...current, assistantMessage]);
      clearError();

      const request: ChatRequest = buildChatRequest({
        message: userContent,
        sessionId: selectedSession.id,
        modelId: resolvedModelId,
        mode: chatMode,
        thinking: enableThinking,
        reasoning: nativeReasoningEnabled,
      });

      void runAssistantRequest(selectedSession, request, assistantMessageId);
    },
    [
      activeMessages,
      chatMode,
      clearError,
      enableThinking,
      isStreaming,
      nativeReasoningEnabled,
      runAssistantRequest,
      selectedModel,
      selectedSession,
      updateSessionMessages,
    ]
  );

  return {
    actionLoadingByMessage,
    handleApprove,
    handleCreateSession,
    handleReject,
    handleRetry,
    handleSend,
  };
}
