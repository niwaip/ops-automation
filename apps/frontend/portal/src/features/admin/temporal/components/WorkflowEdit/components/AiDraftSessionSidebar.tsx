import React from 'react';
import { Button, List, Popconfirm, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, RobotOutlined } from '@ant-design/icons';
import type { AiWorkflowDraftSessionListItem } from '@/api/temporal';

const { Text } = Typography;

export interface AiDraftSessionSidebarProps {
  sessions: AiWorkflowDraftSessionListItem[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  loading: boolean;
}

export const AiDraftSessionSidebar: React.FC<AiDraftSessionSidebarProps> = ({
  sessions,
  activeSessionId,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  loading,
}) => {
  return (
    <div
      style={{
        width: 260,
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
      }}
    >
      <div style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}>
        <Button
          type="primary"
          block
          icon={<PlusOutlined />}
          onClick={onNewSession}
        >
          新建工作流草稿会话
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        <List
          size="small"
          loading={loading}
          dataSource={sessions}
          renderItem={(item) => {
            const isActive = item.sessionId === activeSessionId;
            return (
              <List.Item
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  marginBottom: 4,
                  cursor: 'pointer',
                  background: isActive ? 'var(--bg-card)' : 'transparent',
                  border: isActive ? '1px solid var(--primary-color)' : '1px solid transparent',
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                }}
                onClick={() => onSelectSession(item.sessionId)}
                actions={[
                  <Popconfirm
                    key="del"
                    title="确定删除此草稿会话？"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      onDeleteSession(item.sessionId);
                    }}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<RobotOutlined style={{ color: isActive ? 'var(--primary-color)' : 'var(--text-light)', fontSize: 16 }} />}
                  title={
                    <Text strong={isActive} ellipsis style={{ fontSize: 13, display: 'block' }}>
                      {item.currentDraftName || item.title || `会话 ${item.sessionId.slice(0, 8)}`}
                    </Text>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '最近'}
                    </Text>
                  }
                />
              </List.Item>
            );
          }}
        />
      </div>
    </div>
  );
};
