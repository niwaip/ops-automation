import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useQueryClient } from 'react-query';
import {
  reduceChatStreamEvent,
  type ChatMessage,
  type ChatProgressLog,
  type ChatRequest,
  type ChatSession,
} from '@ops/user-core';
import type { MessageInstance } from 'antd/es/message/interface';
import { apiClient, chatApi, executionApi } from '../../../api';
import { authStore } from '../../../adapters/auth/authStore';
import { browserStreamingTransport } from '../../../adapters/streaming/browserStreamingTransport';
import { buildPatchedMessage } from '../lib/messageState';
import { notifyTaskTerminalState } from '../lib/taskNotifications';
import { backgroundTaskManager } from '../lib/backgroundTaskManager';
import { handleWorkflowNaturalLanguage } from '../lib/workflowNaturalLanguageRouter';

const isStreamAbortError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    const msg = error.message.toLowerCase();
    if (msg.includes('aborted') || msg.includes('bodystreambuffer')) return true;
  }
  if (typeof error === 'object' && error !== null && 'name' in error && (error as any).name === 'AbortError') {
    return true;
  }
  return false;
};

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
  getCurrentSelectedSessionId?: () => string | null;
}

interface ActiveStreamRecord {
  abort: () => void;
  sessionId: string;
  assistantMessageId: string;
  executionId?: string;
  taskTitle?: string;
  isStarted: boolean;
  isUserAborted: boolean;
  isRunInBackground: boolean;
}

export function useChatStreaming({
  toast,
  notifiedTaskStateKeysRef,
  sessionMessagesRef,
  appendProgressLog,
  snapshotMessageThoughts,
  updateMessage,
  updateSessionMeta,
  getCurrentSelectedSessionId,
}: UseChatStreamingOptions) {
  const queryClient = useQueryClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortStreaming, setAbortStreaming] = useState<(() => void) | null>(null);
  const [streamingSessionIds, setStreamingSessionIds] = useState<string[]>([]);

  // 多流并发计数器：每个 runAssistantRequest 启动 +1，结束 -1，归零才关闭 isStreaming
  const streamingCountRef = useRef(0);
  // 多流并发句柄表：messageId -> streamRecord
  const activeStreamsMapRef = useRef<Map<string, ActiveStreamRecord>>(new Map());

  const activeExecutionIdRef = useRef<string | null>(null);
  const activeTaskTitleRef = useRef<string>('');
  const activeSessionIdRef = useRef<string | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const isUserAbortedRef = useRef(false);
  const isRunInBackgroundRef = useRef(false);

  useEffect(() => {
    backgroundTaskManager.setQueryInvalidator(() => {
      void queryClient.invalidateQueries(['workbench-inbox']);
      void queryClient.invalidateQueries(['workbench-inbox-summary']);
      void queryClient.invalidateQueries(['user-web-executions']);
    });
  }, [queryClient]);

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
      queryClient.invalidateQueries(['workbench-inbox']),
      queryClient.invalidateQueries(['workbench-inbox-summary']),
      queryClient.invalidateQueries(['coordinationTasks']),
    ]);
  }, [queryClient]);

  const startAssistantStream = useCallback(async (
    sessionId: string,
    assistantMessageId: string,
    request: ChatRequest,
    streamRecord?: ActiveStreamRecord
  ) => {
    // 仅更新"最新流"的追踪 refs（用于兼容单流场景）
    activeExecutionIdRef.current = null;
    activeTaskTitleRef.current = request.message || 'AI 任务执行';
    activeSessionIdRef.current = sessionId;
    activeAssistantMessageIdRef.current = assistantMessageId;
    isUserAbortedRef.current = false;
    isRunInBackgroundRef.current = false;

    const token = await getAccessToken();
    if (
      streamRecord?.isUserAborted ||
      activeStreamsMapRef.current.get(assistantMessageId)?.isUserAborted
    ) {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }
    if (
      streamRecord?.isRunInBackground ||
      activeStreamsMapRef.current.get(assistantMessageId)?.isRunInBackground
    ) {
      return;
    }
    let accumulatedContent = '';
    const streamHandle = chatApi.stream(browserStreamingTransport, token, request, (event) => {
      const reduced = reduceChatStreamEvent({
        event,
        accumulatedContent,
        mode: request.config?.mode,
      });
      accumulatedContent = reduced.accumulatedContent;

      const executionId = reduced.messagePatch.metadata?.executionId;
      if (executionId) {
        activeExecutionIdRef.current = executionId;
        if (streamRecord) {
          streamRecord.executionId = executionId;
        }
        const record = activeStreamsMapRef.current.get(assistantMessageId);
        if (record) {
          record.executionId = executionId;
        }
      }

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

    if (streamRecord) {
      streamRecord.isStarted = true;
      streamRecord.abort = streamHandle.abort;
    } else {
      activeStreamsMapRef.current.set(assistantMessageId, {
        abort: streamHandle.abort,
        sessionId,
        assistantMessageId,
        taskTitle: request.message || 'AI 任务执行',
        isStarted: true,
        isUserAborted: false,
        isRunInBackground: false,
      });
    }
    setAbortStreaming(() => streamHandle.abort);

    try {
      await streamHandle.promise;
    } finally {
      if (!streamRecord) {
        activeStreamsMapRef.current.delete(assistantMessageId);
      }
    }
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
    assistantMessageId: string,
    options?: {
      workflowCommandContent?: string;
    }
  ) => {
    setError(null);
    // 多流并发：计数 +1，保持 isStreaming = true
    streamingCountRef.current += 1;
    setIsStreaming(true);
    setStreamingSessionIds((prev) => (prev.includes(session.id) ? prev : [...prev, session.id]));

    const streamRecord: ActiveStreamRecord = {
      abort: () => {
        streamRecord.isUserAborted = true;
      },
      sessionId: session.id,
      assistantMessageId,
      taskTitle: request.message || 'AI 任务执行',
      isStarted: false,
      isUserAborted: false,
      isRunInBackground: false,
    };
    activeStreamsMapRef.current.set(assistantMessageId, streamRecord);

    try {
      await startAssistantStream(session.id, assistantMessageId, request, streamRecord);
      snapshotMessageThoughts(session.id, assistantMessageId);
      updateMessage(session.id, assistantMessageId, { isStreaming: false });
      await syncRelatedQueries(session.id);

      // 工作流自然语言连接器：当底层执行单完成初稿产物生成后，将真实的 executionId 与 artifacts 交付给协同阶段
      if (options?.workflowCommandContent) {
        const currentMessage = (sessionMessagesRef.current[session.id] || []).find(
          (message) => message.id === assistantMessageId
        );
        const metadata = currentMessage?.metadata;
        const executionId = metadata?.executionId || streamRecord.executionId || undefined;
        const artifacts = (metadata?.artifacts || metadata?.normalizedResult?.artifacts || []) as any;
        const downloadUrl = metadata?.downloadUrl || metadata?.normalizedResult?.downloadUrl || metadata?.fileUrl;
        const fileName = artifacts?.[0]?.name || (metadata?.files?.[0] as any)?.fileName;

        try {
          const result = await handleWorkflowNaturalLanguage(options.workflowCommandContent, {
            executionId,
            artifacts,
            downloadUrl,
            fileName,
          });
          if (result?.coordinationTask) {
            void queryClient.invalidateQueries(['user-web-notifications']);
            void queryClient.invalidateQueries(['workbench-inbox-items']);
            void queryClient.invalidateQueries(['coordinationTasks']);
          }
        } catch (err: any) {
          console.warn('[WorkflowRouter] Post-stream coordination registration error:', err);
        }
      }

      // 旧会话流完成提示：若用户当前浏览的不是该 session.id，弹出轻量 toast 提示
      const currentSelectedId = getCurrentSelectedSessionId?.();
      if (currentSelectedId && currentSelectedId !== session.id) {
        const title = session.title || '前一个会话';
        toast.info(`会话「${title}」已回复完成`, 4);
      }
    } catch (streamError) {
      const runInBg = streamRecord.isRunInBackground;
      const userAborted = streamRecord.isUserAborted || isStreamAbortError(streamError);

      if (runInBg) {
        return;
      }

      if (userAborted) {
        const currentMessage = (sessionMessagesRef.current[session.id] || []).find(
          (message) => message.id === assistantMessageId
        );
        const existingContent = currentMessage?.content?.trim();
        const stoppedContent = existingContent
          ? `${existingContent}\n\n*(任务已由用户手动停止)*`
          : '任务已由用户手动停止。';

        snapshotMessageThoughts(session.id, assistantMessageId);

        const stopPatch = {
          content: stoppedContent,
          isStreaming: false,
          metadata: {
            mode: request.config?.mode,
            executionId: streamRecord.executionId || undefined,
            executionStatus: 'cancelled',
          },
        } satisfies Partial<ChatMessage>;

        updateMessage(session.id, assistantMessageId, stopPatch);
        await syncRelatedQueries(session.id);
        return;
      }

      const rawErrorMsg = streamError instanceof Error ? streamError.message : '聊天请求失败';
      const isTimeout =
        rawErrorMsg.toLowerCase().includes('timeout') ||
        rawErrorMsg.toLowerCase().includes('aborted') ||
        rawErrorMsg.includes('超时');
      const friendlyErrorMsg = isTimeout
        ? '⏱️ 模型响应超时或网络连接中断。您可以直接点击下方「重新尝试」继续执行。'
        : (rawErrorMsg || '聊天请求失败');
      setError(friendlyErrorMsg);

      const currentMessage = (sessionMessagesRef.current[session.id] || []).find(
        (message) => message.id === assistantMessageId
      );
      const existingContent = currentMessage?.content?.trim();
      const finalContent =
        existingContent && !existingContent.includes('⏱️') && !existingContent.includes('⚠️')
          ? `${existingContent}\n\n⚠️ **执行中断**：${friendlyErrorMsg}`
          : friendlyErrorMsg;

      const errorPatch = {
        content: finalContent,
        isStreaming: false,
        metadata: {
          mode: request.config?.mode,
          taskStatus: 'failed',
          errorMessage: friendlyErrorMsg,
        },
      } satisfies Partial<ChatMessage>;
      if (currentMessage) {
        notifyTaskTerminalState({
          message: buildPatchedMessage(currentMessage, errorPatch),
          notifiedTaskStateKeys: notifiedTaskStateKeysRef.current,
          toast,
        });
      }
      updateMessage(session.id, assistantMessageId, errorPatch);
    } finally {
      activeStreamsMapRef.current.delete(assistantMessageId);
      setStreamingSessionIds((prev) =>
        prev.filter(
          (id) =>
            id !== session.id ||
            Array.from(activeStreamsMapRef.current.values()).some((r) => r.sessionId === id)
        )
      );
      // 多流并发：计数 -1，归零才关闭 isStreaming
      streamingCountRef.current = Math.max(0, streamingCountRef.current - 1);
      if (streamingCountRef.current === 0) {
        setIsStreaming(false);
        setAbortStreaming(null);
        isUserAbortedRef.current = false;
        isRunInBackgroundRef.current = false;
        activeExecutionIdRef.current = null;
      }
    }
  }, [
    getCurrentSelectedSessionId,
    notifiedTaskStateKeysRef,
    sessionMessagesRef,
    snapshotMessageThoughts,
    startAssistantStream,
    syncRelatedQueries,
    toast,
    updateMessage,
    queryClient,
  ]);

  const handleStopStreaming = useCallback((targetSessionId?: string) => {
    const currentSessionId = targetSessionId || activeSessionIdRef.current;

    const streamsToStop: ActiveStreamRecord[] = [];
    activeStreamsMapRef.current.forEach((record) => {
      if (!currentSessionId || record.sessionId === currentSessionId) {
        streamsToStop.push(record);
      }
    });

    if (streamsToStop.length === 0) {
      if (currentSessionId) {
        // 显式指定了目标会话但该会话无活跃流：严禁向通用停止接口盲发请求（避免误杀其他会话的沙箱进程）
        toast.info('未发现进行中的输出任务');
      } else {
        const executionId = activeExecutionIdRef.current;
        if (executionId) {
          void executionApi.cancel(executionId).catch(() => {});
        }
        abortStreaming?.();
        setAbortStreaming(null);
        setIsStreaming(false);
        toast.info('任务已终止');
      }
      return;
    }

    streamsToStop.forEach((rec) => {
      rec.isUserAborted = true;
      if (rec.executionId) {
        void executionApi.cancel(rec.executionId).catch(() => {});
      }
      void apiClient.post('/ai/chat/stop', { sessionId: rec.sessionId }).catch(() => {});
      try {
        rec.abort();
      } catch (_err) {
        // Stream may have already completed or aborted; safe to ignore
      }
    });

    toast.info('对话输出已终止');
  }, [abortStreaming, toast]);

  const handleRunInBackground = useCallback((targetSessionId?: string) => {
    const currentSessionId = targetSessionId || activeSessionIdRef.current;
    let targetRecord: ActiveStreamRecord | undefined;
    if (currentSessionId) {
      activeStreamsMapRef.current.forEach((rec) => {
        if (rec.sessionId === currentSessionId) {
          targetRecord = rec;
        }
      });
      if (!targetRecord) {
        toast.warning('当前会话暂无进行中的任务可转入后台');
        return;
      }
    } else if (activeStreamsMapRef.current.size === 1) {
      targetRecord = Array.from(activeStreamsMapRef.current.values())[0];
    } else if (activeStreamsMapRef.current.size === 0) {
      toast.warning('当前暂无进行中的任务可转入后台');
      return;
    }

    if (targetRecord && !targetRecord.isStarted) {
      toast.warning('当前任务尚未启动，请稍等执行启动后再转入后台');
      return;
    }

    const executionId = targetRecord?.executionId || null;
    const sessionId = targetRecord?.sessionId || currentSessionId;
    const assistantMessageId = targetRecord?.assistantMessageId || null;
    const title = targetRecord?.taskTitle || 'AI 任务执行';

    if (!executionId && !sessionId) {
      toast.warning('当前任务尚未启动，请稍等执行启动后再转入后台');
      return;
    }

    if (targetRecord) {
      targetRecord.isRunInBackground = true;
      try {
        targetRecord.abort();
      } catch (_err) {
        // Safe to ignore
      }
    } else {
      isRunInBackgroundRef.current = true;
      abortStreaming?.();
    }
    setAbortStreaming(null);

    // 2. 注册至后台任务管理器进行轮询、完成通知和自动存入 GTD 收集箱
    const bgKey = executionId || `chat-${sessionId}-${Date.now()}`;
    backgroundTaskManager.registerTask({
      executionId: bgKey,
      isChatSession: !executionId,
      title,
      sessionId: sessionId || undefined,
      messageId: assistantMessageId || undefined,
      startedAt: Date.now(),
      toast,
      onCompleted: (execution) => {
        if (sessionId && assistantMessageId) {
          updateMessage(sessionId, assistantMessageId, {
            metadata: {
              executionStatus: execution.status,
              finalSummary:
                execution.status === 'succeeded'
                  ? '任务已在后台执行完成'
                  : `任务在后台执行结束 (${execution.status})`,
            },
          });
        }
      },
    });

    // 3. 更新当前助手消息展示
    if (sessionId && assistantMessageId) {
      const currentMessage = (sessionMessagesRef.current[sessionId] || []).find(
        (m) => m.id === assistantMessageId
      );
      const existingContent = currentMessage?.content?.trim();
      const refText = executionId ? `执行单 ID: \`${executionId}\`` : `会话 ID: \`${sessionId}\``;
      const bgNotice = `> ⚡ **任务已转入后台运行**\n> ${refText}\n> 执行完成后将自动通过通知提醒，并将结果自动同步保存至 **GTD 收集箱**。`;
      const newContent = existingContent ? `${existingContent}\n\n${bgNotice}` : bgNotice;

      updateMessage(sessionId, assistantMessageId, {
        content: newContent,
        isStreaming: false,
        metadata: {
          taskStatus: 'running',
          executionId: executionId || undefined,
        },
      });
    }

    toast.success('已转入后台运行！任务完成后将通知并自动同步至 GTD 收集箱');
  }, [abortStreaming, sessionMessagesRef, toast, updateMessage]);

  const isSessionStreaming = useCallback(
    (sessionId?: string | null): boolean => {
      if (!sessionId) return false;
      return (
        streamingSessionIds.includes(sessionId) ||
        Array.from(activeStreamsMapRef.current.values()).some((r) => r.sessionId === sessionId)
      );
    },
    [streamingSessionIds]
  );

  return {
    clearError,
    error,
    handleStopStreaming,
    handleRunInBackground,
    isSessionStreaming,
    isStreaming,
    runAssistantRequest,
  };
}
