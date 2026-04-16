/**
 * ChatMessage
 * 单条消息渲染组件
 */

import React from 'react';
import { Avatar, Typography, Card } from 'antd';
import { UserOutlined, RobotOutlined, FileTextOutlined } from '@ant-design/icons';
import { ChatMessage } from './types';
import './ChatMessage.css';

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
}

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  isStreaming,
  streamingContent,
}) => {
  const isUser = message.role === 'user';
  const content = isStreaming && streamingContent ? streamingContent : message.content;

  // 渲染文件附件
  const renderFiles = () => {
    if (!message.metadata?.files?.length) return null;

    return (
      <div className="chat-message-files">
        {message.metadata.files.map((fileName, idx) => (
          <div key={idx} className="chat-message-file">
            <FileTextOutlined />
            <span>{fileName}</span>
          </div>
        ))}
      </div>
    );
  };

  // 渲染下载链接
  const renderDownloadLink = () => {
    if (!message.metadata?.downloadUrl) return null;

    return (
      <div className="chat-message-download">
        <a href={message.metadata.downloadUrl} target="_blank" rel="noopener noreferrer">
          点击下载文档
        </a>
      </div>
    );
  };

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <Avatar
        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
        className={`chat-message-avatar ${isUser ? 'user' : 'assistant'}`}
      />
      <Card
        className={`chat-message-content ${isUser ? 'user' : 'assistant'}`}
        bordered={false}
      >
        <Typography.Text>
          {content}
          {isStreaming && <span className="streaming-indicator">...</span>}
        </Typography.Text>
        {renderFiles()}
        {renderDownloadLink()}
        <div className="chat-message-time">
          {message.timestamp.toLocaleTimeString()}
        </div>
      </Card>
    </div>
  );
};

export default ChatMessageComponent;