/**
 * ChatWindow
 * 聊天窗口主体组件
 */

import React, { useEffect, useRef, useState } from 'react';
import { Spin, Button, Empty, Typography, message as antdMessage } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
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
  LLMRateLimit,
  LLMUsage,
  PromptDebugPayload,
  StreamEvent,
} from './types';
import { StreamEventType } from './types';
import {
  toExecutionNotification,
  RELEVANT_EXECUTION_STATUSES,
} from '@/shared/notifications/executionNotifications';
import { useNotificationStore } from '@/shared/store/notificationStore';
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

const asUsage = (value: unknown): LLMUsage | undefined => {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.prompt_tokens !== 'number' ||
    typeof record.completion_tokens !== 'number' ||
    typeof record.total_tokens !== 'number'
  ) {
    return undefined;
  }

  return value as LLMUsage;
};

const asRateLimit = (value: unknown): LLMRateLimit | undefined => {
  const record = asRecord(value);
  return record ? (value as LLMRateLimit) : undefined;
};

const asMode = (value: unknown): 'chat' | 'task' | undefined =>
  value === 'chat' || value === 'task' ? value : undefined;

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

const asMissingInputs = (value: unknown): MissingInputItem[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.reduce<MissingInputItem[]>((acc, item) => {
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
  }, []);

  return items.length > 0 ? items : undefined;
};

const buildTaskProgressLog = (
  event: StreamEvent,
  data: Record<string, unknown>
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

  const result = asRecord(data.result);
  const command = asString(result?.command);
  const pageTitle = asString(result?.pageTitle);
  const pageUrl = sanitizeDisplayUrl(asString(result?.pageUrl));
  const resultData = asRecord(result?.data);
  const duration = typeof resultData?.duration === 'number' ? resultData.duration : undefined;
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

  return {
    stage: 'observation',
    text: compactText(parts.join('，'), 160),
  };
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

  const resolveTaskStatus = (
    eventType: StreamEventType,
    status?: string
  ): 'waiting_input' | 'pending_approval' | 'running' | 'completed' | 'failed' => {
    if (eventType === StreamEventType.ERROR) {
      return 'failed';
    }

    if (eventType === StreamEventType.WAITING_INPUT || status === 'waiting_input') {
      return 'waiting_input';
    }

    if (eventType === StreamEventType.PENDING_APPROVAL || status === 'pending_approval') {
      return 'pending_approval';
    }

    if (status && ['queued', 'running'].includes(status)) {
      return 'running';
    }

    if (eventType === StreamEventType.RESULT) {
      return 'completed';
    }

    if (status && ['succeeded', 'failed', 'cancelled'].includes(status)) {
      return status === 'failed' ? 'failed' : 'completed';
    }

    return 'running';
  };

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
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
    const executionId =
      draftExecutionId ||
      (lastAssistantMessage?.metadata?.taskStatus === 'waiting_input'
        ? lastAssistantMessage.metadata.executionId
        : undefined);

    startAssistantStream(assistantMessageId, {
      message: content,
      sessionId: currentSession?.id,
      userId: user?.id || undefined,
      executionId,
      userRoles: user?.role ? [user.role] : undefined,
      modelId: selectedModel || undefined,
      files: filesToSend,
      config: {
        mode: chatMode,
        thinking: enableThinking,
        webSearch: enableWebSearch,
      },
    });

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
    const showThinking = request.config?.thinking !== false;
    const isChatRequest = request.config?.mode === 'chat';
    const syncPromptDebug = (
      event: StreamEvent,
      taskStatus: ChatTaskStatus | undefined,
      sourceEventType: StreamEventType
    ) => {
      const data = event.data ?? {};
      const promptDebug = asPromptDebugPayload(data.promptDebug);
      if (!promptDebug) {
        return;
      }
      upsertPromptDebugRecord({
        messageId: assistantMessageId,
        sessionId: request.sessionId,
        executionId: asString(data.executionId),
        mode: asMode(data.mode) ?? request.config?.mode,
        taskStatus,
        sourceEventType,
        promptDebug,
      });
    };

    const abortStreaming = streamChat(
      request,
      (event) => {
        addStreamEvent(event);
        const data = event.data ?? {};
        const progressLog =
          request.config?.mode === 'task' ? buildTaskProgressLog(event, data) : undefined;

        const executionId = asString(data.executionId);
        const executionStatus = asExecutionStatus(data.status);
        if (executionId && executionStatus && RELEVANT_EXECUTION_STATUSES.has(executionStatus)) {
          const notification = toExecutionNotification({
            id: executionId,
            skillId: asString(data.skillId) ?? '',
            status: executionStatus,
            approvalStatus: asApprovalStatus(data.approvalStatus),
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

        if (event.type === StreamEventType.THOUGHT) {
          if (showThinking && !progressLog) {
            accumulatedContent += `【思考】${event.content}\n`;
          }
          if (progressLog) {
            appendProgressLog(assistantMessageId, progressLog);
          }
          updateMessageMetadataById(assistantMessageId, {
            mode: request.config?.mode,
            showThinking,
            taskStatus: 'running',
            executionId,
            executionStatus,
            errorMessage: '',
            promptDebug: asPromptDebugPayload(data.promptDebug),
          });
          syncPromptDebug(event, 'running', StreamEventType.THOUGHT);
        } else if (event.type === StreamEventType.ACTION) {
          if (showThinking && !progressLog) {
            accumulatedContent += `【行动】${event.content}\n`;
          }
          if (progressLog) {
            appendProgressLog(assistantMessageId, progressLog);
          }
          updateMessageMetadataById(assistantMessageId, {
            mode: request.config?.mode,
            showThinking,
            taskStatus: 'running',
            executionId,
            executionStatus,
            errorMessage: '',
            promptDebug: asPromptDebugPayload(data.promptDebug),
          });
          syncPromptDebug(event, 'running', StreamEventType.ACTION);
        } else if (
          event.type === StreamEventType.OBSERVATION &&
          data.hasBusinessResult !== true &&
          !asString(data.downloadUrl)
        ) {
          if (isChatRequest) {
            accumulatedContent = event.content;
          } else if (showThinking && !progressLog) {
            accumulatedContent += `【观察】${event.content}\n`;
          }
          if (progressLog) {
            appendProgressLog(assistantMessageId, progressLog);
          }
          updateMessageMetadataById(assistantMessageId, {
            mode: request.config?.mode,
            showThinking,
            finalSummary: isChatRequest || progressLog ? '' : accumulatedContent,
            errorMessage: '',
            promptDebug: asPromptDebugPayload(data.promptDebug),
          });
          syncPromptDebug(event, undefined, StreamEventType.OBSERVATION);
        } else if (
          event.type === StreamEventType.RESULT ||
          event.type === StreamEventType.WAITING_INPUT ||
          event.type === StreamEventType.PENDING_APPROVAL ||
          (event.type === StreamEventType.OBSERVATION &&
            (data.hasBusinessResult === true || Boolean(asString(data.downloadUrl))))
        ) {
          const hasBusinessResult = data.hasBusinessResult === true;
          const missingInputs = asMissingInputs(data.missingInputs);
          const eventMode = asMode(data.mode) ?? request.config?.mode;

          if (eventMode === 'chat' && event.type === StreamEventType.RESULT) {
            accumulatedContent = event.content;
            updateMessageMetadataById(assistantMessageId, {
              mode: 'chat',
              showThinking,
              taskStatus: undefined,
              executionId: undefined,
              executionStatus: undefined,
              finalResult: '',
              finalResultData: data,
              usage: asUsage(data.usage),
              rateLimit: asRateLimit(data.rateLimit),
              finalSummary: '',
              downloadUrl: undefined,
              hasBusinessResult: false,
              missingInputs: undefined,
              errorMessage: '',
              promptDebug: asPromptDebugPayload(data.promptDebug),
            });
            syncPromptDebug(event, undefined, StreamEventType.RESULT);
          } else {
            const nextTaskStatus = resolveTaskStatus(event.type, executionStatus);
            if (event.type === StreamEventType.RESULT) {
              accumulatedContent = ''; // 结果事件清空累积内容
            }

            // 提取结果数据
            const downloadUrl = asString(data.downloadUrl);
            updateMessageMetadataById(assistantMessageId, {
              mode: eventMode,
              showThinking,
              taskStatus: nextTaskStatus,
              executionId,
              executionStatus,
              finalResult:
                event.type === StreamEventType.RESULT && hasBusinessResult ? event.content : '',
              finalResultData:
                event.type === StreamEventType.RESULT ? (data.result ?? data) : undefined,
              usage: asUsage(data.usage),
              rateLimit: asRateLimit(data.rateLimit),
              finalSummary:
                event.type === StreamEventType.WAITING_INPUT || !hasBusinessResult
                  ? event.content
                  : '',
              downloadUrl: downloadUrl || undefined,
              hasBusinessResult,
              missingInputs,
              errorMessage: '',
              promptDebug: asPromptDebugPayload(data.promptDebug),
            });
            syncPromptDebug(event, nextTaskStatus, event.type);
          }
        } else if (event.type === StreamEventType.ERROR) {
          if (event.content) {
            accumulatedContent += isChatRequest ? event.content : `${event.content}\n`;
          }
          updateMessageMetadataById(assistantMessageId, {
            mode: request.config?.mode,
            showThinking,
            taskStatus: 'failed',
            executionId,
            executionStatus,
            finalResultData: undefined,
            usage: asUsage(data.usage),
            errorMessage: event.content,
            promptDebug: asPromptDebugPayload(data.promptDebug),
          });
          syncPromptDebug(event, 'failed', StreamEventType.ERROR);
        } else if (event.type === StreamEventType.PARAMS_CONFIRM) {
          const skill = asRecord(data.skill);
          setPendingParamsConfirm(
            asRecord(data.params) ?? null,
            asString(skill?.skillName) ?? null
          );
          syncPromptDebug(event, 'running', StreamEventType.PARAMS_CONFIRM);
        }

        setLocalStreamingContent(accumulatedContent);
        updateMessageById(assistantMessageId, accumulatedContent, true);
      },
      (error) => {
        const errorMsg = `错误: ${error.message}`;
        setLocalStreamingContent(errorMsg);
        updateMessageById(assistantMessageId, errorMsg, false);
        setStreaming(false);
        setAbortStreaming(null);
        setPendingParamsConfirm(null, null);
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

    updateMessageMetadataById(messageId, {
      taskStatus: 'running',
      executionId,
      executionStatus: execution.status,
      finalSummary: '审批已通过，任务继续执行中。',
      errorMessage: '',
    });

    void antdMessage.success('已批准任务，正在继续执行');

    const assistantMessageId = uuidv4();
    addMessage({
      id: assistantMessageId,
      sessionId: currentSession?.id || '',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      metadata: {
        taskStatus: 'running',
        executionId,
        executionStatus: execution.status,
        finalResult: '',
        finalResultData: undefined,
        finalSummary: '审批已通过，正在观察执行进度...',
        errorMessage: '',
      },
    });

    startAssistantStream(assistantMessageId, {
      message: '继续执行',
      sessionId: currentSession?.id,
      userId: user?.id || undefined,
      executionId,
      userRoles: user?.role ? [user.role] : undefined,
      modelId: selectedModel || undefined,
      files: [],
      config: {
        mode: chatMode,
        thinking: enableThinking,
        webSearch: enableWebSearch,
      },
    });
  };

  const handleRejectExecution = async (messageId: string, executionId: string) => {
    const execution = await executionApi.reject(executionId);

    updateMessageMetadataById(messageId, {
      taskStatus: 'failed',
      executionId,
      executionStatus: execution.status,
      finalSummary: '',
      errorMessage: '审批已驳回，任务已取消。',
    });

    void antdMessage.success('已驳回任务');
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
