/**
 * ChatWindow
 * 聊天窗口主体组件
 */

import React, { useEffect, useRef, useState } from 'react';
import { Spin, Button, Empty, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useChatStore } from './chatStore';
import { useAuthStore } from '../../store/authStore';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import SkillConfirm from './SkillConfirm';
import { streamChat, getAvailableModels } from './chatApi';
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
    confirmParams,
    clearUploadedFiles,
  } = useChatStore();

  // 获取当前登录用户的ID
  const { user } = useAuthStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 本地流式内容状态，用于实时显示
  const [localStreamingContent, setLocalStreamingContent] = useState('');

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
        taskStatus: undefined,
      },
    };
    addMessage(assistantMessage);

    clearStreaming();
    clearUploadedFiles();
    setStreaming(true);
    setLocalStreamingContent('');

    // 流式内容累积
    let accumulatedContent = '';

    // 发送流式请求（使用保存的文件副本），返回中止函数
    const abortStreaming = streamChat(
      {
        message: content,
        sessionId: currentSession?.id,
        userId: user?.id || undefined,
        userRoles: user?.role ? [user.role] : undefined,
        modelId: selectedModel || undefined,
        files: filesToSend,
        config: {
          mode: chatMode,
          thinking: enableThinking,
          webSearch: enableWebSearch,
        },
      },
      (event) => {
        addStreamEvent(event);

        // 处理不同类型事件 - 实时更新显示
        if (event.type === 'thought') {
          accumulatedContent += `【思考】${event.content}\n`;
        } else if (event.type === 'action') {
          accumulatedContent += `【行动】${event.content}\n`;
        } else if (event.type === 'observation') {
          accumulatedContent += `【观察】${event.content}\n`;
        } else if (event.type === 'result' || event.type === 'waiting_input') {
          accumulatedContent = event.content; // 最终结果替换所有内容
          updateMessageMetadataById(assistantMessageId, {
            taskStatus: event.type === 'waiting_input' ? 'waiting_input' : 'completed',
          });
        } else if (event.type === 'error') {
          accumulatedContent += `❌ 错误: ${event.content}\n`;
          updateMessageMetadataById(assistantMessageId, {
            taskStatus: 'failed',
          });
        } else if (event.type === 'params_confirm') {
          const skill = event.data?.skill as { skillName?: string } | undefined;
          // 参数确认场景
          setPendingParamsConfirm(
            event.data?.params as Record<string, unknown>,
            skill?.skillName || null,
          );
        }

        // 实时更新本地状态和消息
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
        // 最终更新消息
        if (accumulatedContent) {
          updateMessageById(assistantMessageId, accumulatedContent, false);
        }
        setLocalStreamingContent('');
      }
    );

    // 存储中止函数
    setAbortStreaming(abortStreaming);
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
