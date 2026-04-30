/**
 * ChatInput
 * 聊天输入框组件 - 包含模式切换和停止按钮
 */

import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, Upload, Space, Tag, Switch, Select } from 'antd';
import { SendOutlined, PaperClipOutlined, StopOutlined, PlusOutlined, MessageOutlined, RobotOutlined } from '@ant-design/icons';
import { RcFile } from 'antd/es/upload';
import { UploadedFile, AIModel } from './types';
import { uploadFile } from './chatApi';
import { useChatStore } from './chatStore';
import './ChatInput.css';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  uploadedFiles: UploadedFile[];
  onNewSession?: () => void;
  selectedModel: string | null;
  availableModels: AIModel[];
  onModelChange: (modelId: string) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  uploadedFiles,
  onNewSession,
  selectedModel,
  availableModels,
  onModelChange,
}) => {
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    addUploadedFile,
    removeUploadedFile,
    chatMode,
    toggleChatMode,
    isLoading,
    abortCurrentStreaming,
    enableThinking,
    enableWebSearch,
    setEnableThinking,
    setEnableWebSearch,
    draftMessage,
    setDraftMessage,
  } = useChatStore();

  useEffect(() => {
    if (!draftMessage) {
      return;
    }
    setMessage(draftMessage);
    setDraftMessage('');
    inputRef.current?.focus();
  }, [draftMessage, setDraftMessage]);

  // 发送消息
  const handleSend = () => {
    if (message.trim() || uploadedFiles.length > 0) {
      onSend(message);
      setMessage('');
    }
  };

  // 停止执行
  const handleStop = () => {
    abortCurrentStreaming();
  };

  // 处理文件上传
  const handleFileUpload = async (file: RcFile) => {
    setUploading(true);
    try {
      const uploaded = await uploadFile(file as unknown as File);
      addUploadedFile(uploaded);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
    return false; // 阻止默认上传行为
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-container">
      {/* 已上传文件显示 */}
      {uploadedFiles.length > 0 && (
        <div className="chat-uploaded-files">
          <Space>
            {uploadedFiles.map((file) => (
              <Tag
                key={file.fileId}
                closable
                onClose={() => removeUploadedFile(file.fileId)}
                icon={<PaperClipOutlined />}
                className="chat-uploaded-file-tag"
              >
                {file.fileName}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      <div className="chat-input-shell">
        <div className="chat-input-editor">
          <Input.TextArea
            ref={inputRef as any}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，按 Enter 发送..."
            autoSize={{ minRows: 4, maxRows: 8 }}
            disabled={disabled || uploading}
            className="chat-input-textarea"
          />
        </div>

        <div className="chat-input-toolbar">
          <Button
            size="small"
            type={chatMode === 'task' ? 'primary' : 'default'}
            icon={chatMode === 'task' ? <RobotOutlined /> : <MessageOutlined />}
            onClick={toggleChatMode}
            className="chat-input-mode-toggle-btn"
          >
            {chatMode === 'chat' ? '聊天' : '任务'}
          </Button>

          <div className="chat-input-controls">
            <div className="chat-control-item">
              <span className="chat-control-label">联网</span>
              <Switch
                size="small"
                checked={enableWebSearch}
                onChange={setEnableWebSearch}
                className="chat-input-dot-switch"
              />
            </div>
            <div className="chat-control-item">
              <span className="chat-control-label">思考</span>
              <Switch
                size="small"
                checked={enableThinking}
                onChange={setEnableThinking}
                className="chat-input-dot-switch"
              />
            </div>
          </div>
          {chatMode === 'task' && <Tag color="processing">ReAct</Tag>}

          <div className="chat-input-toolbar-spacer" />

          <Button
            type="default"
            icon={<PlusOutlined />}
            onClick={onNewSession}
            size="small"
            title="新对话"
            className="chat-input-new-btn"
          >
            新建
          </Button>

          <Select
            value={selectedModel || undefined}
            onChange={onModelChange}
            style={{ width: 150 }}
            options={availableModels.map((m) => ({
              value: m.id,
              label: m.config?.display_name || m.name,
            }))}
            placeholder="模型"
            size="small"
            className="chat-input-model-select"
          />

          <Upload
            beforeUpload={handleFileUpload}
            showUploadList={false}
            disabled={disabled || uploading}
          >
            <Button
              type="text"
              icon={<PaperClipOutlined />}
              loading={uploading}
              disabled={disabled}
              title="上传文件"
            />
          </Upload>

          {isLoading ? (
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={handleStop}
              title="停止执行"
            />
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={disabled || (!message.trim() && uploadedFiles.length === 0)}
            />
          )}
        </div>
      </div>

    </div>
  );
};

export default ChatInput;
