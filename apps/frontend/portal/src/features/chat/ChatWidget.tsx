/**
 * ChatWidget
 * 悬浮聊天入口组件
 */

import React from 'react';
import { Button, Badge } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { useChatStore } from './chatStore';
import ChatWindow from './ChatWindow';
import './ChatWidget.css';

const ChatWidget: React.FC = () => {
  const { isOpen, toggleChat, messages } = useChatStore();

  // 未读消息数（assistant消息）
  const unreadCount = messages.filter((m) => m.role === 'assistant' && !m.isStreaming).length;

  return (
    <>
      {/* 悬浮按钮 */}
      <div className="chat-widget-trigger">
        <Badge count={unreadCount} offset={[-5, 5]}>
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<MessageOutlined />}
            onClick={toggleChat}
            className="chat-trigger-button"
          />
        </Badge>
      </div>

      {/* 聊天窗口 */}
      {isOpen && <ChatWindow />}
    </>
  );
};

export default ChatWidget;
