import { Card, Empty, List, Skeleton, Typography } from 'antd';
import type { ChatMessage } from '@ops/user-core';
import type { MutableRefObject } from 'react';
import { ChatMessageItem } from './ChatMessageItem';

interface ChatMessageListProps {
  actionLoadingByMessage: Record<string, 'approve' | 'reject' | undefined>;
  activeMessages: ChatMessage[];
  expandedThoughtMessageId: string | null;
  historyLoading: boolean;
  messagesEndRef: MutableRefObject<HTMLDivElement | null>;
  onApproveExecution: (messageId: string, executionId: string) => void;
  onRejectExecution: (messageId: string, executionId: string) => void;
  onToggleThought: (messageId: string) => void;
}

export function ChatMessageList({
  actionLoadingByMessage,
  activeMessages,
  expandedThoughtMessageId,
  historyLoading,
  messagesEndRef,
  onApproveExecution,
  onRejectExecution,
  onToggleThought,
}: ChatMessageListProps) {
  return (
    <Card className="user-chat-thread" styles={{ body: { paddingBottom: 8 } }}>
      {historyLoading && activeMessages.length === 0 ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : activeMessages.length === 0 ? (
        <div className="user-chat-empty-state">
          <Empty
            description={
              <div className="user-chat-empty-description">
                <div className="user-chat-empty-title">开始一个新对话</div>
                <Typography.Text type="secondary">
                  输入你的问题、任务或补充信息，AI 会在这里持续返回结果。
                </Typography.Text>
              </div>
            }
          />
        </div>
      ) : (
        <List
          dataSource={activeMessages}
          renderItem={(message) => (
            <ChatMessageItem
              message={message}
              actionLoadingByMessage={actionLoadingByMessage}
              expandedThought={expandedThoughtMessageId === message.id}
              onToggleThought={onToggleThought}
              onApproveExecution={onApproveExecution}
              onRejectExecution={onRejectExecution}
            />
          )}
        />
      )}
      <div ref={messagesEndRef} />
    </Card>
  );
}
