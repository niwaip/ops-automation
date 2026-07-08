import { useCallback, useState, type MutableRefObject } from 'react';
import { useQueryClient } from 'react-query';
import {
  reduceChatStreamEvent,
  type ChatMessage,
  type ChatProgressLog,
  type ChatRequest,
  type ChatSession,
} from '@ops/user-core';
import type { MessageInstance } from 'antd/es/message/interface';
import { apiClient, chatApi } from '../../../api';
import { authStore } from '../../../adapters/auth/authStore';
import { browserStreamingTransport } from '../../../adapters/streaming/browserStreamingTransport';
import { buildPatchedMessage } from '../lib/messageState';
import { notifyTaskTerminalState } from '../lib/taskNotifications';

interface UseChatStreamingOptions {
  toast: MessageInstance;
  notifiedTaskStateKeysRef: MutableRefObject<Set<string>>;
  sessionMessagesRef: MutableRefObject<Record<string, ChatMessage[]>>;
  appendProgressLog: (
    sessionId: string,
    messageId: string,
    progressLog: ChatProgressLog
  ) => void;
  snapshotMessageThoughts: (sessionId: string, messageId: string) => void;
  updateMessage: (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  updateSessionMeta: (sessionId: string, patch: Partial<ChatSession>) => void;
}

export function useChatStreaming({
  toast,
  notifiedTaskStateKeysRef,
  sessionMessagesRef,
  appendProgressLog,
  snapshotMessageThoughts,
  updateMessage,
  updateSessionMeta,
}: UseChatStreamingOptions) {
  const queryClient = useQueryClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortStreaming, setAbortStreaming] = useState<(() => void) | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null | undefined> => {
    return (await apiClient.ensureFreshAccessToken()) || authStore.getState().accessToken;
  }, []);

  const syncRelatedQueries = useCallback(async (sessionId: string) => {
    await Promise.all([
      queryClient.invalidateQueries(['user-web-chat-sessions']),
      queryClient.invalidateQueries(['user-web-chat-history', sessionId]),
      queryClient.invalidateQueries(['user-web-executions']),
      queryClient.invalidateQueries(['user-web-notifications']),
    ]);
  }, [queryClient]);

  const startAssistantStream = useCallback(async (
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
        const currentMessage = (sessionMessagesRef.current[sessionId] || []).find(
          (message) => message.id === assistantMessageId
        );
        if (currentMessage) {
          notifyTaskTerminalState({
            message: buildPatchedMessage(currentMessage, reduced.messagePatch),
            notifiedTaskStateKeys: notifiedTaskStateKeysRef.current,
            toast,
          });
        }
        updateMessage(sessionId, assistantMessageId, reduced.messagePatch);
      }
    });
    setAbortStreaming(() => streamHandle.abort);
    await streamHandle.promise;
  }, [
    appendProgressLog,
    getAccessToken,
    notifiedTaskStateKeysRef,
    sessionMessagesRef,
    toast,
    updateMessage,
    updateSessionMeta,
  ]);

  const runAssistantRequest = useCallback(async (
    session: ChatSession,
    request: ChatRequest,
    assistantMessageId: string
  ) => {
    setError(null);
    setIsStreaming(true);

    try {
      await startAssistantStream(session.id, assistantMessageId, request);
      snapshotMessageThoughts(session.id, assistantMessageId);
      updateMessage(session.id, assistantMessageId, { isStreaming: false });
      await syncRelatedQueries(session.id);
    } catch (streamError) {
      const nextError = streamError instanceof Error ? streamError.message : '聊天请求失败';
      setError(nextError);
      const errorPatch = {
        content: nextError,
        isStreaming: false,
        metadata: {
          mode: request.config?.mode,
          taskStatus: 'failed',
          errorMessage: nextError,
        },
      } satisfies Partial<ChatMessage>;
      const currentMessage = (sessionMessagesRef.current[session.id] || []).find(
        (message) => message.id === assistantMessageId
      );
      if (currentMessage) {
        notifyTaskTerminalState({
          message: buildPatchedMessage(currentMessage, errorPatch),
          notifiedTaskStateKeys: notifiedTaskStateKeysRef.current,
          toast,
        });
      }
      updateMessage(session.id, assistantMessageId, errorPatch);
    } finally {
      setIsStreaming(false);
      setAbortStreaming(null);
    }
  }, [
    notifiedTaskStateKeysRef,
    sessionMessagesRef,
    snapshotMessageThoughts,
    startAssistantStream,
    syncRelatedQueries,
    toast,
    updateMessage,
  ]);

  const handleStopStreaming = useCallback(() => {
    abortStreaming?.();
    setAbortStreaming(null);
    setIsStreaming(false);
  }, [abortStreaming]);

  return {
    clearError,
    error,
    handleStopStreaming,
    isStreaming,
    runAssistantRequest,
  };
}
