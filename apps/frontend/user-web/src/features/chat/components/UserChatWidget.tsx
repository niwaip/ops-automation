import { lazy, Suspense, useEffect, useRef } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { Badge, Button, Skeleton } from 'antd';
import { useChatStore } from '@/features/chat';
import styles from './UserChatWidget.module.css';

const EmbeddedChatPage = lazy(() =>
  import('../pages/ChatPage').then((module) => ({ default: module.ChatPage }))
);

export function UserChatWidget() {
  const open = useChatStore((state) => state.isOpen);
  const setOpen = useChatStore((state) => state.setOpen);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // 1. 点击发生在悬浮聊天窗内部 -> 不收起
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }

      // 2. 点击发生在右下角悬浮触发按钮本身 -> 由按钮自身的 onClick 切换状态
      if (triggerRef.current && triggerRef.current.contains(target)) {
        return;
      }

      // 3. 点击发生在挂载于 document.body 的全局浮层/弹窗（如模型下拉选择器、提示气泡、模态弹窗、Toast 等） -> 不收起
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

      // 4. 用户点击了悬浮窗外部的页面其他区域 -> 自动收起聊天框，让用户无缝返回页面继续操作
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 如果页面上有活动的 AntD 模态弹窗或下拉选项，优先让弹窗自身响应 ESC，不收起底层聊天窗
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
  }, [open, setOpen]);

  return (
    <>
      <div ref={triggerRef} className={styles['chat-widget-trigger']}>
        <Badge dot={open ? false : undefined}>
          <Button
            onClick={() => setOpen(!open)}
            className={styles['chat-trigger-button']}
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
      {open ? (
        <div ref={containerRef} className={styles['chat-window-container']}>
          <div className={styles['chat-window']}>
            <div className={styles['chat-window-actions']}>
              <Button
                type="text"
                icon={<CloseOutlined />}
                onClick={() => setOpen(false)}
                size="small"
                className={styles['chat-window-close-btn']}
              />
            </div>
            <Suspense
              fallback={<Skeleton active paragraph={{ rows: 8 }} style={{ padding: 24 }} />}
            >
              <EmbeddedChatPage embedded />
            </Suspense>
          </div>
        </div>
      ) : null}
    </>
  );
}
