/**
 * ChatWindow
 * 聊天窗口主体组件
 */

import React, { useEffect, useRef, useState } from 'react';
import { Card, Spin, Select, Space, Button } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { useChatStore } from './chatStore';
import { useAuthStore } from '../../store/authStore';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import SkillConfirm from './SkillConfirm';
import { streamChat, getAvailableModels } from './chatApi';
import { v4 as uuidv4 } from 'uuid';
import './ChatWindow.css';

const ChatWindow: React.FC = () => {
  const {
    currentSession,
    messages,
    isLoading,
    streamingContent,
    chatMode,
    selectedModel,
    availableModels,
    uploadedFiles,
    pendingParamsConfirm,
    pendingSkillName,
    setOpen,
    addMessage,
    updateLastMessage,
    setStreaming,
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
    };
    addMessage(assistantMessage);

    clearStreaming();
    clearUploadedFiles();
    setStreaming(true);
    setLocalStreamingContent('');

    // 流式内容累积
    let accumulatedContent = '';

    // 发送流式请求（使用保存的文件副本）
    streamChat(
      {
        message: content,
        sessionId: currentSession?.id,
        userId: user?.id || undefined,  // 传递当前登录用户ID，null转为undefined
        modelId: selectedModel,
        files: filesToSend,
        config: {
          mode: chatMode, // chat模式或task模式
        },
      },
      (event) => {
        addStreamEvent(event);

        // 处理不同类型事件 - 实时更新显示
        if (event.type === 'thought') {
          accumulatedContent += `【思考】${event.content}\n`;
        } else if (event.type === 'action') {
          accumulatedContent += `【行动】${event.action || event.content}\n`;
        } else if (event.type === 'observation') {
          accumulatedContent += `【观察】${event.content}\n`;
        } else if (event.type === 'result') {
          accumulatedContent = event.content; // 最终结果替换所有内容
        } else if (event.type === 'error') {
          accumulatedContent += `❌ 错误: ${event.content}\n`;
        } else if (event.type === 'params_confirm') {
          // 参数确认场景
          setPendingParamsConfirm(
            event.data?.params as Record<string, unknown>,
            event.data?.skill?.skillName as string,
          );
        }

        // 实时更新本地状态和消息
        setLocalStreamingContent(accumulatedContent);
        updateLastMessage(accumulatedContent);
      },
      (error) => {
        const errorMsg = `错误: ${error.message}`;
        setLocalStreamingContent(errorMsg);
        updateLastMessage(errorMsg);
        setStreaming(false);
      },
      () => {
        setStreaming(false);
        // 最终更新消息
        if (accumulatedContent) {
          updateLastMessage(accumulatedContent);
        }
        setLocalStreamingContent('');
      }
    );
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
      <Card
        className="chat-window"
        title={
          <Space className="chat-window-header">
            <span style={{ fontWeight: 600 }}>AI助手</span>

            {/* 模型选择 */}
            <Select
              value={selectedModel}
              onChange={setSelectedModel}
              style={{ width: 140 }}
              options={availableModels.map((m) => ({
                value: m.id,
                label: m.config?.display_name || m.name,
              }))}
              placeholder="选择模型"
              size="small"
            />

            {/* 新对话 */}
            <Button
              type="text"
              icon={<PlusOutlined />}
              onClick={createSession}
              size="small"
              title="新对话"
            />
          </Space>
        }
        extra={
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setOpen(false)}
            size="small"
          />
        }
        styles={{
          body: { padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100% - 56px)', overflow: 'hidden' },
        }}
      >
        {/* 消息列表 */}
        <div className="chat-messages">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isStreaming={msg.isStreaming && isLoading}
              streamingContent={msg.isStreaming ? localStreamingContent : ''}
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
        />
      </Card>
    </div>
  );
};

export default ChatWindow;