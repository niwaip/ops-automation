/**
 * ChatWindow
 * 聊天窗口主体组件
 */

import React, { useEffect, useRef } from 'react';
import { Card, Spin, Select, Space, Button } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { useChatStore } from './chatStore';
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
    streamingEvents,
    selectedModel,
    availableModels,
    uploadedFiles,
    pendingParamsConfirm,
    pendingSkillName,
    setOpen,
    addMessage,
    updateLastMessage,
    setStreaming,
    appendStreamingContent,
    addStreamEvent,
    clearStreaming,
    createSession,
    setSelectedModel,
    setAvailableModels,
    setPendingParamsConfirm,
    confirmParams,
    clearUploadedFiles,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  }, [messages, streamingContent]);

  // 发送消息
  const handleSendMessage = async (content: string) => {
    if (!content.trim() && uploadedFiles.length === 0) return;

    // 添加用户消息
    const userMessage = {
      id: uuidv4(),
      sessionId: currentSession?.id || '',
      role: 'user' as const,
      content,
      timestamp: new Date(),
      metadata: {
        files: uploadedFiles.map((f) => f.fileName),
      },
    };
    addMessage(userMessage);

    // 添加占位assistant消息
    const assistantMessage = {
      id: uuidv4(),
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

    // 发送流式请求
    streamChat(
      {
        message: content,
        sessionId: currentSession?.id,
        modelId: selectedModel,
        files: uploadedFiles,
      },
      (event) => {
        addStreamEvent(event);

        // 处理不同类型事件
        if (event.type === 'result' || event.type === 'observation') {
          updateLastMessage(event.content);
        } else if (event.type === 'params_confirm') {
          // 参数确认场景
          setPendingParamsConfirm(
            event.data?.params as Record<string, unknown>,
            event.data?.skill?.skillName as string,
          );
        }
      },
      (error) => {
        updateLastMessage(`错误: ${error.message}`);
        setStreaming(false);
      },
      () => {
        setStreaming(false);
        // 更新消息为非流式状态
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.isStreaming) {
          updateLastMessage(streamingContent || '处理完成');
        }
      }
    );
  };

  // 确认参数
  const handleConfirmParams = () => {
    confirmParams();
    // 发送确认消息继续流程
    if (pendingParamsConfirm) {
      handleSendMessage('确认');
    }
  };

  // 取消参数确认
  const handleCancelConfirm = () => {
    setPendingParamsConfirm(null, null);
    handleSendMessage('取消');
  };

  return (
    <div className="chat-window-container">
      <Card
        className="chat-window"
        title={
          <Space className="chat-window-header">
            <span>AI助手</span>
            <Select
              value={selectedModel}
              onChange={setSelectedModel}
              style={{ width: 150 }}
              options={availableModels.map((m) => ({
                value: m.id,
                label: m.config?.display_name || m.name,
              }))
              }
              placeholder="选择模型"
              size="small"
            />
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
          body: { padding: 0, height: 'calc(100% - 50px)', overflow: 'hidden' },
        }}
      >
        {/* 消息列表 */}
        <div className="chat-messages">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isStreaming={msg.isStreaming && isLoading}
              streamingContent={msg.isStreaming ? streamingContent : ''}
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