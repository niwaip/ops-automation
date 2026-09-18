/**
 * ChatWidget
 * 悬浮聊天入口组件
 */

import React, { useEffect, useRef } from 'react';
import { Button, Badge } from 'antd';
import { useChatStore } from './chatStore';
import ChatWindow from './ChatWindow';
import './ChatWidget.css';

const ChatWidget: React.FC = () => {
  const { isOpen, toggleChat, setOpen, messages } = useChatStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  // 未读消息数（assistant消息）
  const unreadCount = messages.filter((m) => m.role === 'assistant' && !m.isStreaming).length;

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // 1. 点击发生在悬浮聊天窗内部 -> 不收起
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }

      // 2. 点击发生在右下角悬浮切换按钮本身 -> 由按钮自身 onClick 切换
      if (triggerRef.current && triggerRef.current.contains(target)) {
        return;
      }

      // 3. 点击发生在挂载于 document.body 的全局浮层/弹窗（如下拉选项、提示框、模态弹窗等） -> 不收起
      if (
        target.closest('.ant-select-dropdown') ||
        target.closest('.ant-dropdown') ||
        target.closest('.ant-popover') ||
        target.closest('.ant-tooltip') ||
        target.closest('.ant-modal-root') ||
        target.closest('.ant-modal-mask') ||
        target.closest('.ant-modal-wrap') ||
        target.closest('.ant-message') ||
        target.closest('.ant-notification') ||
        target.closest('.ant-picker-dropdown') ||
        target.closest('[data-floating-ui-portal]')
      ) {
        return;
      }

      // 4. 用户点击了悬浮窗外部的页面其他区域 -> 自动收起聊天框
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (
          document.querySelector('.ant-modal-wrap:not([style*="display: none"])') ||
          document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        ) {
          return;
        }
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setOpen]);

  return (
    <>
      {/* 悬浮按钮 */}
      <div ref={triggerRef} className="chat-widget-trigger">
        <Badge count={unreadCount} offset={[-5, 5]}>
          <Button
            shape="circle"
            onClick={toggleChat}
            className="chat-trigger-button"
            aria-label="打开悬浮对话框"
            title="打开悬浮对话框"
            data-testid="floating-chat-trigger"
            data-ai-action="open-floating-chat"
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <title>悬浮对话框</title>
                <path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" />
              </svg>
            }
          />
        </Badge>
      </div>

      {/* 聊天窗口 */}
      {isOpen && (
        <div ref={containerRef}>
          <ChatWindow />
        </div>
      )}
    </>
  );
};

export default ChatWidget;
