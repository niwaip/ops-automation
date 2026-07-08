import {
  MenuFoldOutlined,
  MessageOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Button, Card, Empty, List, Skeleton, Space, Tag, Typography } from 'antd';
import type { ChatSession } from '@ops/user-core';

interface ChatSessionSidebarProps {
  sessions: ChatSession[];
  selectedSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onCollapse: () => void;
  onCreateSession: () => void;
  getPreview: (sessionId: string) => string;
  formatUpdatedAt: (value?: string) => string;
}

export function ChatSessionSidebar({
  sessions,
  selectedSessionId,
  isLoading,
  onSelectSession,
  onCollapse,
  onCreateSession,
  getPreview,
  formatUpdatedAt,
}: ChatSessionSidebarProps) {
  return (
    <Card className="user-chat-sidebar">
      <div className="user-chat-sidebar-header">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            会话管理
          </Typography.Title>
          <Typography.Text type="secondary">查看历史记录并切换任务上下文</Typography.Text>
        </div>
        <Space>
          <Button
            type="text"
            icon={<MenuFoldOutlined />}
            onClick={onCollapse}
            className="user-chat-sidebar-toggle"
            title="收起会话管理"
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreateSession}>
            新建会话
          </Button>
        </Space>
      </div>
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : sessions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史会话" />
      ) : (
        <List
          dataSource={sessions}
          renderItem={(session) => (
            <List.Item
              key={session.id}
              className={`user-chat-session-item ${session.id === selectedSessionId ? 'active' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="user-chat-session-main">
                <Space align="center" size={8}>
                  <MessageOutlined />
                  <Typography.Text strong>{session.title || '未命名会话'}</Typography.Text>
                </Space>
                <Typography.Paragraph type="secondary" className="user-chat-session-preview">
                  {getPreview(session.id)}
                </Typography.Paragraph>
                <Space size={8} wrap>
                  {session.modelId ? <Tag>{session.modelId}</Tag> : null}
                  <Typography.Text type="secondary">
                    {formatUpdatedAt(session.updatedAt)}
                  </Typography.Text>
                </Space>
              </div>
              <RightOutlined className="user-chat-session-arrow" />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
