/**
 * ChatWidget
 * 悬浮聊天入口组件
 */

import React from 'react';
import { Button, Badge } from 'antd';
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
            shape="circle"
            onClick={toggleChat}
            className="chat-trigger-button"
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" />
              </svg>
            }
          />
        </Badge>
      </div>

      {/* 聊天窗口 */}
      {isOpen && <ChatWindow />}
    </>
  );
};

export default ChatWidget;
