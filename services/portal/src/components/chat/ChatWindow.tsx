/**
 * ChatWindow
 * 聊天窗口主体组件
 */

import React, { useEffect, useRef, useState } from 'react';
import { Spin, Button, Empty, Typography, message as antdMessage } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useChatStore } from './chatStore';
import { useAuthStore } from '../../store/authStore';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import SkillConfirm from './SkillConfirm';
import { streamChat, getAvailableModels } from './chatApi';
import { executionApi } from '../../api/execution';
import { ChatRequest, StreamEventType } from './types';
import { v4 as uuidv4 } from 'uuid';
import './ChatWindow.css';

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 本地流式内容状态，用于实时显示
  const [localStreamingContent, setLocalStreamingContent] = useState('');

  const resolveTaskStatus = (
    eventType: StreamEventType,
    status?: string,
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
    getAvailableModels().then((models) => {
      setAvailableModels(models);
      if (models.length > 0 && !selectedModel) {
        setSelectedModel(models[0].id);
      }
    });
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, localStreamingContent]);

  // 发送消息
  const handleSendMessage = async (content: string) => {
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
        errorMessage: '',
      },
    };
    addMessage(assistantMessage);

    // 只有等待补充输入的场景，才延续上一次执行单
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    const executionId = draftExecutionId
      || (
        lastAssistantMessage?.metadata?.taskStatus === 'waiting_input'
          ? lastAssistantMessage.metadata.executionId
          : undefined
      );

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

  const startAssistantStream = (assistantMessageId: string, request: ChatRequest) => {
    clearStreaming();
    clearUploadedFiles();
    setStreaming(true);
    setLocalStreamingContent('');

    let accumulatedContent = '';
    const showThinking = request.config?.thinking !== false;
    const isChatRequest = request.config?.mode === 'chat';

    const abortStreaming = streamChat(
      request,
      (event) => {
        addStreamEvent(event);

        if (event.type === StreamEventType.THOUGHT) {
          if (showThinking) {
            accumulatedContent += `【思考】${event.content}\n`;
          }
          updateMessageMetadataById(assistantMessageId, {
            mode: request.config?.mode,
            showThinking,
            taskStatus: 'running',
            executionId: event.data?.executionId as string | undefined,
            executionStatus: event.data?.status as string | undefined,
            errorMessage: '',
          });
        } else if (event.type === StreamEventType.ACTION) {
          if (showThinking) {
            accumulatedContent += `【行动】${event.content}\n`;
          }
          updateMessageMetadataById(assistantMessageId, {
            mode: request.config?.mode,
            showThinking,
            taskStatus: 'running',
            executionId: event.data?.executionId as string | undefined,
            executionStatus: event.data?.status as string | undefined,
            errorMessage: '',
          });
        } else if (event.type === StreamEventType.OBSERVATION && !Boolean(event.data?.hasBusinessResult) && !event.data?.downloadUrl) {
          if (isChatRequest) {
            accumulatedContent = event.content;
          } else if (showThinking) {
            accumulatedContent += `【观察】${event.content}\n`;
          }
          updateMessageMetadataById(assistantMessageId, {
            mode: request.config?.mode,
            showThinking,
            finalSummary: isChatRequest ? '' : accumulatedContent,
            errorMessage: '',
          });
        } else if (
          event.type === StreamEventType.RESULT ||
          event.type === StreamEventType.WAITING_INPUT ||
          event.type === StreamEventType.PENDING_APPROVAL ||
          (event.type === StreamEventType.OBSERVATION && (Boolean(event.data?.hasBusinessResult) || event.data?.downloadUrl))
        ) {
          const hasBusinessResult = Boolean(event.data?.hasBusinessResult);
          const executionStatus = event.data?.status as string | undefined;
          const missingInputs = event.data?.missingInputs as any[];
          const eventMode = (event.data?.mode as 'chat' | 'task' | undefined) || request.config?.mode;

          if (eventMode === 'chat' && event.type === StreamEventType.RESULT) {
            accumulatedContent = event.content;
            updateMessageMetadataById(assistantMessageId, {
              mode: 'chat',
              showThinking,
              taskStatus: undefined,
              executionId: undefined,
              executionStatus: undefined,
              finalResult: '',
              finalResultData: event.data,
              usage: event.data?.usage as any,
              rateLimit: event.data?.rateLimit as any,
              finalSummary: '',
              downloadUrl: undefined,
              hasBusinessResult: false,
              missingInputs: undefined,
              errorMessage: '',
            });
          } else {
            if (event.type === StreamEventType.RESULT) {
              accumulatedContent = ''; // 结果事件清空累积内容
            }

            // 提取结果数据
            const downloadUrl = event.data?.downloadUrl as string | undefined;
            updateMessageMetadataById(assistantMessageId, {
              mode: eventMode,
              showThinking,
              taskStatus: resolveTaskStatus(event.type as any, executionStatus),
              executionId: event.data?.executionId as string,
              executionStatus,
              finalResult: event.type === StreamEventType.RESULT && hasBusinessResult ? event.content : '',
              finalResultData: event.type === StreamEventType.RESULT ? (event.data?.result || event.data) : undefined,
              usage: event.data?.usage as any,
              rateLimit: event.data?.rateLimit as any,
              finalSummary: event.type === StreamEventType.WAITING_INPUT || !hasBusinessResult ? event.content : '',
              downloadUrl: downloadUrl || undefined,
              hasBusinessResult,
              missingInputs,
              errorMessage: '',
            });
          }
        } else if (event.type === 'error') {
          if (event.content) {
            accumulatedContent += isChatRequest ? event.content : `${event.content}\n`;
          }
          updateMessageMetadataById(assistantMessageId, {
            mode: request.config?.mode,
            showThinking,
            taskStatus: 'failed',
            executionId: event.data?.executionId as string | undefined,
            executionStatus: event.data?.status as string | undefined,
            finalResultData: undefined,
            usage: event.data?.usage as any,
            errorMessage: event.content,
          });
        } else if (event.type === 'params_confirm') {
          const skill = event.data?.skill as { skillName?: string } | undefined;
          setPendingParamsConfirm(
            event.data?.params as Record<string, unknown>,
            skill?.skillName || null,
          );
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

    antdMessage.success('已批准任务，正在继续执行');

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

    antdMessage.success('已驳回任务');
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
