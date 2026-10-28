import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [hasOpenDetails, setHasOpenDetails] = useState(false);

  // Only collapse assistant responses
  const canCollapse = role === 'assistant';

  const checkState = useCallback(() => {
    if (!contentRef.current) return;
    const openDetails = contentRef.current.querySelector('details[open]');
    const hasOpen = Boolean(openDetails);
    setHasOpenDetails(hasOpen);

    const scrollHeight = contentRef.current.scrollHeight;
    // Allow a buffer over maxCollapsedHeight before showing collapse button
    const overflowing = scrollHeight > maxCollapsedHeight + 24;
    setIsOverflowing(overflowing);
  }, [maxCollapsedHeight]);

  useEffect(() => {
    if (!canCollapse) return;

    checkState();

    const container = contentRef.current;
    if (!container) return;

    // Listen to native toggle event on <details> with capture: true (toggle event does not bubble in HTML5)
    const onToggle = () => {
      checkState();
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'SUMMARY' ||
          target.closest('summary') ||
          target.tagName === 'DETAILS' ||
          target.closest('details'))
      ) {
        // Wait a microtask / tick for native DOM 'open' attribute toggle
        setTimeout(checkState, 20);
      }
    };

    container.addEventListener('toggle', onToggle, true);
    container.addEventListener('click', onClick, true);

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        checkState();
      });
      ro.observe(container);
    }

    return () => {
      container.removeEventListener('toggle', onToggle, true);
      container.removeEventListener('click', onClick, true);
      if (ro) ro.disconnect();
    };
  }, [children, canCollapse, checkState]);

  // When details is open (e.g. user clicked "查看来源与核算明细"), fully expand and never collapse or show "展开全文"
  const shouldCollapse = canCollapse && isOverflowing && !isExpanded && !isStreaming && !hasOpenDetails;

  return (
    <div className={styles.collapsibleWrapper}>
      <div
        ref={contentRef}
        className={`${styles.contentContainer} ${shouldCollapse ? styles.collapsed : ''}`}
        style={shouldCollapse ? { maxHeight: `${maxCollapsedHeight}px` } : undefined}
      >
        {children}
      </div>

      {canCollapse && isOverflowing && !isStreaming && !hasOpenDetails && (
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
