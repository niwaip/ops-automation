import { lazy, Suspense } from 'react';
import { CloseOutlined, MessageOutlined } from '@ant-design/icons';
import { Badge, Button, Skeleton } from 'antd';
import { useChatStore } from '@/features/chat';
import './UserChatWidget.css';

const EmbeddedChatPage = lazy(() =>
  import('../pages/ChatPage').then((module) => ({ default: module.ChatPage }))
);

export function UserChatWidget() {
  const open = useChatStore((state) => state.isOpen);
  const setOpen = useChatStore((state) => state.setOpen);

  return (
    <>
      <div className="chat-widget-trigger">
        <Badge dot={open ? false : undefined}>
          <Button
            shape="circle"
            onClick={() => setOpen(!open)}
            className="chat-trigger-button"
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" />
              </svg>
            }
          />
        </Badge>
      </div>
      {open ? (
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
