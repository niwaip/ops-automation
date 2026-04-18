/**
 * ChatInput
 * 聊天输入框组件 - 包含模式切换和停止按钮
 */

import React, { useState, useRef } from 'react';
import { Input, Button, Upload, Space, Tag, Tooltip } from 'antd';
import { SendOutlined, PaperClipOutlined, MessageOutlined, RobotOutlined, StopOutlined } from '@ant-design/icons';
import { RcFile } from 'antd/es/upload';
import { UploadedFile } from './types';
import { uploadFile } from './chatApi';
import { useChatStore } from './chatStore';
import './ChatInput.css';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  uploadedFiles: UploadedFile[];
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  uploadedFiles,
}) => {
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { addUploadedFile, removeUploadedFile, chatMode, setChatMode, isLoading, abortCurrentStreaming } = useChatStore();

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
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 切换模式
  const toggleMode = () => {
    setChatMode(chatMode === 'chat' ? 'task' : 'chat');
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
              >
                {file.fileName}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      {/* 输入框 */}
      <div className="chat-input-row">
        <Input.TextArea
          ref={inputRef as any}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入消息，按 Enter 发送..."
          autoSize={{ minRows: 2, maxRows: 5 }}
          disabled={disabled || uploading}
          className="chat-input-textarea"
        />

        {/* 文件上传按钮 */}
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

        {/* 模式切换按钮 */}
        <Tooltip title={chatMode === 'chat' ? '切换到任务模式' : '切换到聊天模式'}>
          <Button
            type="text"
            icon={chatMode === 'chat' ? <MessageOutlined /> : <RobotOutlined />}
            onClick={toggleMode}
            disabled={disabled}
            className={`chat-mode-btn ${chatMode === 'task' ? 'active' : ''}`}
          />
        </Tooltip>

        {/* 发送/停止按钮 */}
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

      {/* 模式指示器 */}
      <div className="chat-mode-indicator">
        {chatMode === 'chat' ? '💬 聊天模式' : '🤖 任务模式'}
      </div>
    </div>
  );
};

export default ChatInput;