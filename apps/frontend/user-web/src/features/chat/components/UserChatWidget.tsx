import { lazy, Suspense, useState } from 'react';
import { CloseOutlined, MessageOutlined } from '@ant-design/icons';
import { Badge, Button, Skeleton } from 'antd';
import './UserChatWidget.css';

const EmbeddedChatPage = lazy(() =>
  import('../pages/ChatPage').then((module) => ({ default: module.ChatPage }))
);

export function UserChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="chat-widget-trigger">
        <Badge dot={open ? false : undefined}>
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<MessageOutlined />}
            onClick={() => setOpen((current) => !current)}
            className="chat-trigger-button"
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
