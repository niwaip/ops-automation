import React from 'react';
import { Card, List, Button, Typography, Popconfirm } from 'antd';
import { DeleteOutlined, RobotOutlined } from '@ant-design/icons';
import type { AiWorkflowDraftSessionListItem } from '@/api/temporal';

const { Text } = Typography;

export interface AiDraftSessionListProps {
  sessions: AiWorkflowDraftSessionListItem[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  loading: boolean;
}

export const AiDraftSessionList: React.FC<AiDraftSessionListProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  loading,
}) => {
  return (
    <Card size="small" title="历史草稿会话" style={{ marginBottom: 16 }}>
      <List
        size="small"
        loading={loading}
        dataSource={sessions}
        renderItem={(item) => (
          <List.Item
            style={{
              cursor: 'pointer',
              background: item.sessionId === activeSessionId ? 'var(--bg-secondary)' : 'transparent',
              borderRadius: 6,
              padding: '6px 12px',
            }}
            onClick={() => onSelectSession(item.sessionId)}
            actions={[
              <Popconfirm
                key="del"
                title="删除会话？"
                onConfirm={(e) => {
                  e?.stopPropagation();
                  onDeleteSession(item.sessionId);
                }}
              >
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              avatar={<RobotOutlined style={{ fontSize: 16, color: 'var(--primary-color)' }} />}
              title={<Text style={{ fontSize: 13 }}>{item.currentDraftName || item.title || `会话 ${item.sessionId.slice(0, 8)}`}</Text>}
              description={<Text type="secondary" style={{ fontSize: 11 }}>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '最近'}</Text>}
            />
          </List.Item>
        )}
      />
    </Card>
  );
};
