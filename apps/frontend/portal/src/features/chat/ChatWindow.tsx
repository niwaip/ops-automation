/**
 * ChatWindow
 * 聊天窗口主体组件
 */

import React, { useEffect, useRef, useState } from 'react';
import { Spin, Button, Empty, Typography, message as antdMessage } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { reduceChatStreamEvent } from '@ops/user-core';
import { useChatStore } from './chatStore';
import { useAuthStore } from '@/shared/store/authStore';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import SkillConfirm from './SkillConfirm';
import { streamChat, getAvailableModels } from './chatApi';
import { executionApi } from '../../api/execution';
import type { ApprovalStatus, ExecutionDto, ExecutionStatus } from '../../api/execution';
import type {
  ChatMessage as ChatMessageItem,
  ChatProgressLog,
  ChatRequest,
  PromptDebugRecord,
  PromptDebugPayload,
  StreamEvent,
} from './types';
import { StreamEventType } from './types';
import {
  toExecutionNotification,
  RELEVANT_EXECUTION_STATUSES,
} from '@/shared/notifications/executionNotifications';
import { useNotificationStore } from '@/shared/store/notificationStore';
import {
  buildApprovedAssistantDraftMeta,
  buildApprovedTaskPatch,
  buildRejectedTaskPatch,
  buildResumedHumanControlTaskPatch,
  buildSubmittedInputTaskPatch,
} from '@chat-web/controller/taskActionController';
import {
  buildChatRequest,
  buildResumeExecutionRequest,
} from '@chat-web/controller/chatRequestController';
import { resumeHumanControlExecution } from '@chat-web/controller/humanControlController';
import { v4 as uuidv4 } from 'uuid';
import './ChatWindow.css';

type ChatTaskStatus = NonNullable<NonNullable<ChatMessageItem['metadata']>['taskStatus']>;
type MissingInputItem = NonNullable<
  NonNullable<ChatMessageItem['metadata']>['missingInputs']
>[number];

const EXECUTION_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'draft',
  'queued',
  'running',
  'waiting_input',
  'pending_approval',
  'human_control',
  'paused',
  'succeeded',
  'failed',
  'cancelled',
  'rolled_back',
]);

const APPROVAL_STATUSES: ReadonlySet<ApprovalStatus> = new Set([
  'pending',
  'approved',
  'rejected',
  'not_required',
]);

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asExecutionStatus = (value: unknown): ExecutionStatus | undefined =>
  typeof value === 'string' && EXECUTION_STATUSES.has(value as ExecutionStatus)
    ? (value as ExecutionStatus)
    : undefined;

const asApprovalStatus = (value: unknown): ApprovalStatus | undefined =>
  typeof value === 'string' && APPROVAL_STATUSES.has(value as ApprovalStatus)
    ? (value as ApprovalStatus)
    : undefined;

const asPromptDebugPayload = (value: unknown): PromptDebugPayload | undefined => {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return typeof record.systemPrompt === 'string' && typeof record.userPrompt === 'string'
    ? (value as PromptDebugPayload)
    : undefined;
};

const asMode = (value: unknown): 'chat' | 'task' | undefined =>
  value === 'chat' || value === 'task' ? value : undefined;

const isWaitingExecutionMessage = (message: ChatMessageItem): boolean =>
  message.role === 'assistant' &&
  (message.metadata?.taskStatus === 'waiting_input' ||
    message.metadata?.executionStatus === 'waiting_input');

const resolveContinuationTaskStatus = (
  taskStatus: ChatTaskStatus | undefined,
  executionStatus: ExecutionStatus | undefined
): ChatTaskStatus | undefined => {
  if (executionStatus === 'waiting_input') {
    return 'waiting_input';
  }
  if (executionStatus === 'pending_approval') {
    return 'pending_approval';
  }
  if (executionStatus === 'human_control') {
    return 'human_control';
  }
  if (executionStatus === 'succeeded' || executionStatus === 'failed' || executionStatus === 'cancelled') {
    return taskStatus === 'failed' ? 'failed' : 'completed';
  }
  return taskStatus;
};

const summarizeSessionTitle = (content: string): string | undefined => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, 24);
};

const asDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const ChatWindow: React.FC = () => {
  const { Text } = Typography;
  const {
    currentSession,
    messages,
    isLoading,
    chatMode,
    enableThinking,
    enableWebSearch,
    selectedModel,
    availableModels,
    uploadedFiles,
    pendingParamsConfirm,
    pendingSkillName,
    setOpen,
    addMessage,
    updateMessageById,
    updateMessageMetadataById,
    upsertPromptDebugRecord,
    setStreaming,
    setAbortStreaming,
    addStreamEvent,
    clearStreaming,
    createSession,
    updateSessionMeta,
    setSelectedModel,
    setAvailableModels,
    setPendingParamsConfirm,
    draftExecutionId,
    setDraftExecutionId,
    confirmParams,
    clearUploadedFiles,
  } = useChatStore();

  // 获取当前登录用户的ID
  const { user } = useAuthStore();
  const upsertNotification = useNotificationStore((state) => state.upsertNotification);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 本地流式内容状态，用于实时显示
  const [localStreamingContent, setLocalStreamingContent] = useState('');

  // 加载可用模型
  useEffect(() => {
    void getAvailableModels().then((models) => {
      setAvailableModels(models);
      if (!selectedModel) {
        setSelectedModel('default');
      }
    });
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, localStreamingContent]);

  // 发送消息
  const handleSendMessage = (content: string) => {
    const currentSessionId = currentSession?.id;
    // 获取当前的uploadedFiles（从store实时获取）
    const currentUploadedFiles = useChatStore.getState().uploadedFiles;
    if (!content.trim() && currentUploadedFiles.length === 0) return;

    // 保存文件副本用于发送
    const filesToSend = [...currentUploadedFiles];

    // 添加用户消息
    const userMessage = {
      id: uuidv4(),
      sessionId: currentSession?.id || '',
      role: 'user' as const,
      content,
      timestamp: new Date(),
      metadata: {
        files: filesToSend.map((f) => f.fileName),
      },
    };
    addMessage(userMessage);
    if (currentSessionId) {
      updateSessionMeta(currentSessionId, {
        title: summarizeSessionTitle(content),
        updatedAt: new Date(),
        modelId: selectedModel || undefined,
      });
    }

    // 添加占位assistant消息
    const assistantMessageId = uuidv4();
    const assistantMessage = {
      id: assistantMessageId,
      sessionId: currentSession?.id || '',
      role: 'assistant' as const,
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      metadata: {
        mode: chatMode,
        showThinking: enableThinking,
        taskStatus: undefined,
        finalResult: '',
        finalResultData: undefined,
        finalSummary: '',
        progressLogs: [],
        errorMessage: '',
        promptDebug: undefined,
      },
    };
    addMessage(assistantMessage);

    // 只有等待补充输入的场景，才延续上一次执行单
    const waitingAssistantMessage = [...messages].reverse().find(isWaitingExecutionMessage);
    const executionId = draftExecutionId || waitingAssistantMessage?.metadata?.executionId;
    if (executionId && waitingAssistantMessage?.id) {
      updateMessageMetadataById(
        waitingAssistantMessage.id,
        buildSubmittedInputTaskPatch({
          executionId,
          executionStatus: 'running',
        })
      );
    }

    startAssistantStream(
      assistantMessageId,
      buildChatRequest({
        message: content,
        sessionId: currentSession?.id,
        userId: user?.id || undefined,
        executionId,
        userRoles: user?.role ? [user.role] : undefined,
        modelId: selectedModel || undefined,
        files: filesToSend,
        mode: chatMode,
        thinking: enableThinking,
        webSearch: enableWebSearch,
      })
    );

    if (draftExecutionId) {
      setDraftExecutionId(null);
    }
  };

  const appendProgressLog = (messageId: string, progressLog: ChatProgressLog) => {
    const targetMessage = useChatStore.getState().messages.find((msg) => msg.id === messageId);
    const currentLogs = targetMessage?.metadata?.progressLogs || [];
    const lastLog = currentLogs[currentLogs.length - 1];
    if (lastLog?.stage === progressLog.stage && lastLog.text === progressLog.text) {
      return;
    }
    updateMessageMetadataById(messageId, {
      progressLogs: [...currentLogs, progressLog].slice(-12),
    });
  };

  const startAssistantStream = (assistantMessageId: string, request: ChatRequest) => {
    clearStreaming();
    clearUploadedFiles();
    setStreaming(true);
    setLocalStreamingContent('');

    let accumulatedContent = '';
    const syncPromptDebug = (
      event: StreamEvent,
      taskStatus: ChatTaskStatus | undefined,
      sourceEventType: StreamEventType
    ) => {
      const data =
        event.data && typeof event.data === 'object' && !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : {};
      const promptDebug = asPromptDebugPayload(data.promptDebug);
      if (!promptDebug) {
        return;
      }
      upsertPromptDebugRecord({
        messageId: assistantMessageId,
        sessionId: request.sessionId,
        executionId: asString(data.executionId),
        mode: asMode(data.mode) ?? request.config?.mode,
        taskStatus: taskStatus as PromptDebugRecord['taskStatus'],
        sourceEventType,
        promptDebug,
      });
    };

    const applyReducedMessagePatch = (messagePatch: Partial<ChatMessageItem>) => {
      if (typeof messagePatch.content === 'string') {
        updateMessageById(
          assistantMessageId,
          messagePatch.content,
          messagePatch.isStreaming
        );
      }

      if (messagePatch.metadata) {
        updateMessageMetadataById(assistantMessageId, {
          mode: messagePatch.metadata.mode,
          showThinking: messagePatch.metadata.showThinking,
          usage: messagePatch.metadata.usage,
          rateLimit: messagePatch.metadata.rateLimit,
          downloadUrl: messagePatch.metadata.downloadUrl,
          temporalLink: messagePatch.metadata.temporalLink,
          missingInputs: messagePatch.metadata.missingInputs as MissingInputItem[] | undefined,
          taskStatus: messagePatch.metadata.taskStatus,
          executionId: messagePatch.metadata.executionId,
          executionStatus: messagePatch.metadata.executionStatus,
          resultType: messagePatch.metadata.resultType,
          resultTitle: messagePatch.metadata.resultTitle,
          finalResult: messagePatch.metadata.finalResult,
          finalResultData: messagePatch.metadata.finalResultData,
          finalSummary: messagePatch.metadata.finalSummary,
          errorMessage: messagePatch.metadata.errorMessage,
          failureReason: messagePatch.metadata.failureReason,
          hasBusinessResult: messagePatch.metadata.hasBusinessResult,
          normalizedResult: messagePatch.metadata.normalizedResult,
        });
      }
    };

    const abortStreaming = streamChat(
      request,
      (event) => {
        addStreamEvent(event);
        const dataRecord =
          event.data && typeof event.data === 'object' && !Array.isArray(event.data)
            ? (event.data as Record<string, unknown>)
            : {};

        const reduced = reduceChatStreamEvent({
          event: event as Parameters<typeof reduceChatStreamEvent>[0]['event'],
          accumulatedContent,
          mode: request.config?.mode,
        });
        accumulatedContent = reduced.accumulatedContent;

        const executionId = asString(dataRecord.executionId);
        const executionStatus = asExecutionStatus(dataRecord.status);
        if (executionId && executionStatus && RELEVANT_EXECUTION_STATUSES.has(executionStatus)) {
          const notification = toExecutionNotification({
            id: executionId,
            skillId: asString(dataRecord.skillId) ?? '',
            status: executionStatus,
            approvalStatus: asApprovalStatus(dataRecord.approvalStatus),
            failureReason: executionStatus === 'failed' ? event.content : undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            endedAt: ['succeeded', 'failed', 'cancelled'].includes(executionStatus)
              ? new Date().toISOString()
              : undefined,
          } satisfies ExecutionDto);

          if (notification) {
            upsertNotification(notification, true);
          }
        }

        if (reduced.progressLog) {
          appendProgressLog(assistantMessageId, reduced.progressLog);
        }

        if (reduced.sessionPatch && request.sessionId) {
          updateSessionMeta(request.sessionId, {
            title: reduced.sessionPatch.title,
            updatedAt: asDate(reduced.sessionPatch.updatedAt),
            status: reduced.sessionPatch.status,
          });
        }

        if (event.type === StreamEventType.PARAMS_CONFIRM) {
          const skill = asRecord(dataRecord.skill);
          setPendingParamsConfirm(
            asRecord(dataRecord.params) ?? null,
            asString(skill?.skillName) ?? null
          );
          syncPromptDebug(event, 'running', StreamEventType.PARAMS_CONFIRM);
        } else {
          applyReducedMessagePatch(reduced.messagePatch as Partial<ChatMessageItem>);

          const nextTaskStatus = resolveContinuationTaskStatus(
            reduced.messagePatch.metadata?.taskStatus,
            executionStatus
          );
          if (nextTaskStatus === 'waiting_input' && executionId) {
            setDraftExecutionId(executionId);
          } else if (
            nextTaskStatus === 'completed' ||
            nextTaskStatus === 'failed' ||
            nextTaskStatus === 'pending_approval' ||
            nextTaskStatus === 'human_control'
          ) {
            setDraftExecutionId(null);
          }
          updateMessageMetadataById(assistantMessageId, {
            promptDebug: asPromptDebugPayload(dataRecord.promptDebug),
            executionId,
            executionStatus,
            ...(nextTaskStatus ? { taskStatus: nextTaskStatus } : {}),
          });
          syncPromptDebug(event, nextTaskStatus, event.type);
        }

        setLocalStreamingContent(accumulatedContent);
      },
      (error) => {
        const errorMsg = `错误: ${error.message}`;
        setLocalStreamingContent(errorMsg);
        updateMessageById(assistantMessageId, errorMsg, false);
        setStreaming(false);
        setAbortStreaming(null);
        setPendingParamsConfirm(null, null);
        setDraftExecutionId(null);
      },
      () => {
        setStreaming(false);
        setAbortStreaming(null);
        setPendingParamsConfirm(null, null);
        if (accumulatedContent) {
          updateMessageById(assistantMessageId, accumulatedContent, false);
        }
        setLocalStreamingContent('');
      }
    );

    setAbortStreaming(abortStreaming);
  };

  const handleApproveExecution = async (messageId: string, executionId: string) => {
    const execution = await executionApi.approve(executionId);

    updateMessageMetadataById(
      messageId,
      buildApprovedTaskPatch({
        executionId,
        executionStatus: execution.status,
      })
    );

    void antdMessage.success('已批准任务，正在继续执行');

    const assistantMessageId = uuidv4();
    addMessage({
      id: assistantMessageId,
      sessionId: currentSession?.id || '',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      metadata: buildApprovedAssistantDraftMeta({
        executionId,
        executionStatus: execution.status,
        runningSummary: '审批已通过，正在观察执行进度...',
        mode: chatMode,
      }),
    });

    startAssistantStream(
      assistantMessageId,
      buildResumeExecutionRequest({
        sessionId: currentSession?.id,
        userId: user?.id || undefined,
        executionId,
        userRoles: user?.role ? [user.role] : undefined,
        modelId: selectedModel || undefined,
        files: [],
        mode: chatMode,
        thinking: enableThinking,
        webSearch: enableWebSearch,
      })
    );
  };

  const handleRejectExecution = async (messageId: string, executionId: string) => {
    const execution = await executionApi.reject(executionId);

    updateMessageMetadataById(
      messageId,
      buildRejectedTaskPatch({
        executionId,
        executionStatus: execution.status,
      })
    );

    void antdMessage.success('已驳回任务');
  };

  const handleResumeExecution = async (messageId: string, executionId: string) => {
    const execution = await executionApi.getById(executionId);
    const resumedExecution = await resumeHumanControlExecution({
      executionId,
      execution,
      executionApi,
    });

    updateMessageMetadataById(
      messageId,
      buildResumedHumanControlTaskPatch({
        executionId,
        executionStatus: resumedExecution.status,
      })
    );

    void antdMessage.success('已同意人工处理结果，任务继续执行中');
  };

  const handleRetryMessage = (messageId: string) => {
    const targetIndex = messages.findIndex((m) => m.id === messageId);
    if (targetIndex <= 0) return;
    const previousUserMessage = [...messages.slice(0, targetIndex)]
      .reverse()
      .find((m) => m.role === 'user');
    if (previousUserMessage?.content) {
      handleSendMessage(previousUserMessage.content);
    }
  };

  // 确认参数
  const handleConfirmParams = () => {
    confirmParams();
    if (pendingParamsConfirm) {
      handleSendMessage('确认');
    }
  };

  // 取消参数确认
  const handleCancelConfirm = () => {
    setPendingParamsConfirm(null, null);
  };

  return (
    <div className="chat-window-container">
      <div className="chat-window">
        <div className="chat-window-actions">
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setOpen(false)}
            size="small"
            className="chat-window-close-btn"
          />
        </div>

        {/* 消息列表 */}
        <div className="chat-messages">
          {!isLoading && messages.length === 0 && (
            <div className="chat-empty-state">
              <Empty
                description={
                  <div className="chat-empty-description">
                    <div className="chat-empty-title">开始一个新对话</div>
                    <Text type="secondary">
                      输入你的问题、任务或上传文件，AI 会在这里返回结果。
                    </Text>
                  </div>
                }
              />
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isStreaming={msg.isStreaming && isLoading}
              streamingContent={msg.isStreaming ? localStreamingContent : ''}
              onRetry={msg.role === 'assistant' ? handleRetryMessage : undefined}
              onApproveExecution={msg.role === 'assistant' ? handleApproveExecution : undefined}
              onRejectExecution={msg.role === 'assistant' ? handleRejectExecution : undefined}
              onResumeExecution={msg.role === 'assistant' ? handleResumeExecution : undefined}
            />
          ))}
          {isLoading && messages.length === 0 && (
            <div className="chat-loading">
              <Spin tip="正在处理..." />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 参数确认面板 */}
        {pendingParamsConfirm && pendingSkillName && (
          <SkillConfirm
            skillName={pendingSkillName}
            params={pendingParamsConfirm}
            onConfirm={handleConfirmParams}
            onCancel={handleCancelConfirm}
          />
        )}

        {/* 输入框 */}
        <ChatInput
          onSend={handleSendMessage}
          disabled={isLoading || !!pendingParamsConfirm}
          uploadedFiles={uploadedFiles}
          onNewSession={createSession}
          selectedModel={selectedModel}
          availableModels={availableModels}
          onModelChange={setSelectedModel}
        />
      </div>
    </div>
  );
};

export default ChatWindow;
