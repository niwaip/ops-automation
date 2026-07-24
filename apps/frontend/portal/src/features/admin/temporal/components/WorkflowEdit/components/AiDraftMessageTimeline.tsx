import React from 'react';
import { Typography } from 'antd';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import type { AiWorkflowDraftSessionMessage } from '@/api/temporal';

const { Text } = Typography;

export interface AiDraftMessageTimelineProps {
  messages: AiWorkflowDraftSessionMessage[];
}

export const AiDraftMessageTimeline: React.FC<AiDraftMessageTimelineProps> = ({ messages }) => {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div style={{ margin: '16px 0' }}>
      {messages.map((msg, idx) => {
        const isUser = msg.role === 'user';
        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              flexDirection: isUser ? 'row-reverse' : 'row',
              marginBottom: 12,
              gap: 8,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isUser ? 'var(--primary-color)' : 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isUser ? '#fff' : 'var(--text-primary)',
              }}
            >
              {isUser ? <UserOutlined /> : <RobotOutlined />}
            </div>
            <div
              style={{
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: 8,
                background: isUser ? 'var(--primary-color)' : 'var(--bg-secondary)',
                color: isUser ? '#fff' : 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <Text style={{ color: isUser ? '#fff' : 'var(--text-primary)' }}>{msg.content}</Text>
            </div>
          </div>
        );
      })}
    </div>
  );
};
