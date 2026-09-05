import { Card, Empty, Skeleton, Typography } from 'antd';
import type { ChatMessage } from '@ops/user-core';
import { type MutableRefObject, useEffect, useRef } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
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
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);

  useEffect(() => {
    if (messagesEndRef) {
      messagesEndRef.current = {
        scrollIntoView: (options?: ScrollIntoViewOptions) => {
          virtuosoRef.current?.scrollToIndex({
            index: Math.max(0, activeMessages.length - 1),
            align: 'end',
            behavior: options?.behavior === 'smooth' ? 'smooth' : 'auto',
          });
        },
      } as unknown as HTMLDivElement;
    }
  }, [activeMessages.length, messagesEndRef]);

  return (
    <Card
      className={`${styles['user-chat-thread']} ${styles['virtualized-thread']}`}
      styles={{ body: { padding: 0, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' } }}
    >
      {historyLoading && activeMessages.length === 0 ? (
        <div style={{ padding: '30px 24px' }}>
          <Skeleton active avatar paragraph={{ rows: 4 }} />
        </div>
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
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%', width: '100%' }}
          data={activeMessages}
          followOutput="auto"
          initialTopMostItemIndex={Math.max(0, activeMessages.length - 1)}
          overscan={500}
          itemContent={(index, message) => {
            let userQuery: string | undefined;
            if (message.role === 'assistant') {
              for (let i = index - 1; i >= 0; i--) {
                if (activeMessages[i]?.role === 'user') {
                  userQuery = activeMessages[i]?.content;
                  break;
                }
              }
            }
            return (
              <div style={{ padding: '8px 24px' }}>
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  userQuery={userQuery}
                  actionLoading={actionLoadingByMessage[message.id]}
                  expandedThought={expandedThoughtMessageId === message.id}
                  onToggleThought={onToggleThought}
                  onApproveExecution={onApproveExecution}
                  onRejectExecution={onRejectExecution}
                  onRetry={onRetry}
                />
              </div>
            );
          }}
          components={{
            Header: () => <div style={{ height: 16 }} />,
            Footer: () => (
              <div style={{ height: 16 }}>
                <div ref={messagesEndRef} />
              </div>
            ),
          }}
        />
      )}
    </Card>
  );
}
