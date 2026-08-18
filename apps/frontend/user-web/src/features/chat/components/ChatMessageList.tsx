import { Card, Empty, List, Skeleton, Typography } from 'antd';
import type { ChatMessage } from '@ops/user-core';
import type { MutableRefObject } from 'react';
import { ChatMessageItem } from './ChatMessageItem';
import styles from '../pages/ChatPage.module.css';

interface ChatMessageListProps {
  actionLoadingByMessage: Record<string, 'approve' | 'reject' | undefined>;
  activeMessages: ChatMessage[];
  expandedThoughtMessageId: string | null;
  historyLoading: boolean;
  messagesEndRef: MutableRefObject<HTMLDivElement | null>;
  onApproveExecution: (messageId: string, executionId: string) => void;
  onRejectExecution: (messageId: string, executionId: string) => void;
  onRetry?: (message: ChatMessage) => void;
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
  onRetry,
  onToggleThought,
}: ChatMessageListProps) {
  return (
    <Card className={styles['user-chat-thread']} styles={{ body: { paddingBottom: 8 } }}>
      {historyLoading && activeMessages.length === 0 ? (
        <Skeleton active avatar paragraph={{ rows: 4 }} />
      ) : activeMessages.length === 0 ? (
        <div className={styles['user-chat-empty-state']}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className={styles['user-chat-empty-description']}>
                <div className={styles['user-chat-empty-title']}>开始一个新对话</div>
                <Typography.Text type="secondary">
                  您可以直接提问，或者选择任务模式执行操作
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
              onRetry={onRetry}
            />
          )}
        />
      )}
      <div ref={messagesEndRef} />
    </Card>
  );
}
