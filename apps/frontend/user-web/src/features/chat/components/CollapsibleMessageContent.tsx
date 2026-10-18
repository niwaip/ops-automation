import React, { useState, useRef, useEffect } from 'react';
import { Button } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import styles from './CollapsibleMessageContent.module.css';

export interface CollapsibleMessageContentProps {
  children: React.ReactNode;
  isStreaming?: boolean;
  role?: string;
  maxCollapsedHeight?: number;
  contentLength?: number;
}

export const CollapsibleMessageContent: React.FC<CollapsibleMessageContentProps> = ({
  children,
  isStreaming = false,
  role = 'assistant',
  maxCollapsedHeight = 290,
  contentLength,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Only collapse assistant responses
  const canCollapse = role === 'assistant';

  useEffect(() => {
    if (!canCollapse) return;

    const checkOverflow = () => {
      if (!contentRef.current) return;
      const scrollHeight = contentRef.current.scrollHeight;
      // Allow a buffer over maxCollapsedHeight before showing collapse button
      const overflowing = scrollHeight > maxCollapsedHeight + 24;
      setIsOverflowing(overflowing);
    };

    checkOverflow();

    if (typeof ResizeObserver !== 'undefined' && contentRef.current) {
      const ro = new ResizeObserver(() => {
        checkOverflow();
      });
      ro.observe(contentRef.current);
      return () => ro.disconnect();
    }
  }, [children, canCollapse, maxCollapsedHeight]);

  const shouldCollapse = canCollapse && isOverflowing && !isExpanded && !isStreaming;

  return (
    <div className={styles.collapsibleWrapper}>
      <div
        ref={contentRef}
        className={`${styles.contentContainer} ${shouldCollapse ? styles.collapsed : ''}`}
        style={shouldCollapse ? { maxHeight: `${maxCollapsedHeight}px` } : undefined}
      >
        {children}
      </div>

      {canCollapse && isOverflowing && !isStreaming && (
        <div className={styles.expandActionWrapper}>
          <Button
            type="link"
            size="small"
            className={styles.toggleBtn}
            onClick={() => setIsExpanded((prev) => !prev)}
            icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
          >
            {isExpanded
              ? '收起全文'
              : contentLength && contentLength > 500
              ? `展开全文 (共 ${contentLength} 字)`
              : '展开全文'}
          </Button>
        </div>
      )}
    </div>
  );
};
