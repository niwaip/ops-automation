import React, { useState, useMemo, useCallback } from 'react';
import { Button, Space, Modal, message as antMessage } from 'antd';
import {
  DownOutlined,
  UpOutlined,
  CopyOutlined,
  CheckOutlined,
  FullscreenOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeTabSeparatedTable } from '../lib/tableNormalizer';

export interface TaskResultReaderBlockProps {
  content: string;
  defaultExpanded?: boolean;
  thresholdChars?: number;
  title?: string;
  isStreaming?: boolean;
}

const formatWordCount = (chars: number): string => {
  if (chars >= 10000) {
    return `${(chars / 10000).toFixed(1)} 万`;
  }
  if (chars >= 1000) {
    return `${(chars / 1000).toFixed(1)}k`;
  }
  return String(chars);
};

export const TaskResultReaderBlock: React.FC<TaskResultReaderBlockProps> = React.memo(
  function TaskResultReaderBlock({
    content,
    defaultExpanded = false,
    thresholdChars = 450,
    title,
    isStreaming = false,
  }) {
    const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);

    const charCount = content ? content.length : 0;
    const isLongContent = !isStreaming && charCount > thresholdChars;

    const handleCopy = useCallback(
      async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!content) return;
        try {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          void antMessage.success('已复制完整内容到剪贴板');
          setTimeout(() => setCopied(false), 2000);
        } catch {
          void antMessage.error('复制失败，请手动选择复制');
        }
      },
      [content]
    );

    const renderMarkdownComponents = useMemo(() => {
      return {
        table: ({ children }: { children?: React.ReactNode }) => (
          <div className="markdown-table-wrapper" style={{ overflowX: 'auto', margin: '10px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</table>
          </div>
        ),
        a: ({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="chat-markdown-link"
            {...props}
          >
            {children}
          </a>
        ),
        pre: ({ children, className: preClassName, ...props }: React.ComponentPropsWithoutRef<'pre'>) => {
          const childElement = React.isValidElement(children) ? children : null;
          const childProps = childElement
            ? (childElement.props as { className?: string; children?: React.ReactNode })
            : null;
          const codeClassName = childProps?.className || '';
          const mergedClass = ['code-block', preClassName, codeClassName].filter(Boolean).join(' ');
          return (
            <pre className={mergedClass} {...props}>
              {children}
            </pre>
          );
        },
        code: ({
          className,
          children,
          ...props
        }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
          return (
            <code className={className || 'inline-code'} {...props}>
              {children}
            </code>
          );
        },
        img: ({ src, alt }: { src?: string; alt?: string }) => (
          <img
            src={src}
            alt={alt || ''}
            className="chat-outcome-inline-img"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ),
      };
    }, []);

    const effectiveText = useMemo(() => normalizeTabSeparatedTable(content || ''), [content]);

    if (!content) {
      return null;
    }

    return (
      <div className="chat-outcome-reader-root" style={{ width: '100%', margin: '4px 0' }}>
        {/* Content Box */}
        <div
          className={`chat-outcome-body ${isLongContent && !isExpanded ? 'is-folded' : ''}`}
          style={{
            position: 'relative',
            maxHeight: isLongContent && !isExpanded ? '260px' : 'none',
            overflow: isLongContent && !isExpanded ? 'hidden' : 'visible',
            transition: 'max-height 0.3s ease',
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={renderMarkdownComponents}
          >
            {effectiveText}
          </ReactMarkdown>

          {/* Fade mask when folded */}
          {isLongContent && !isExpanded ? (
            <div
              className="chat-outcome-fade-mask"
              onClick={() => setIsExpanded(true)}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '80px',
                cursor: 'pointer',
              }}
              title="点击展开完整内容"
            />
          ) : null}
        </div>

        {/* Action Controls for Long Content */}
        {isLongContent ? (
          <div
            className="chat-outcome-reader-actions"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
              paddingTop: 6,
              borderTop: '1px solid rgba(148, 163, 184, 0.15)',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <Button
              size="small"
              type="link"
              icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setIsExpanded(!isExpanded)}
              style={{
                padding: '0 4px',
                fontSize: 12.5,
                fontWeight: 600,
                height: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {isExpanded
                ? '收起报告'
                : `展开阅读完整报告（约 ${formatWordCount(charCount)} 字）`}
            </Button>

            <Space size={6}>
              <Button
                size="small"
                icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                onClick={handleCopy}
                style={{ fontSize: 12, borderRadius: 6 }}
              >
                {copied ? '已复制' : '复制全文'}
              </Button>
              <Button
                size="small"
                icon={<FullscreenOutlined />}
                onClick={() => setIsModalOpen(true)}
                style={{ fontSize: 12, borderRadius: 6 }}
              >
                全屏沉浸阅读
              </Button>
            </Space>
          </div>
        ) : null}

        {/* Fullscreen Reading Modal */}
        <Modal
          title={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingRight: 32,
              }}
            >
              <Space align="center" size={8}>
                <ReadOutlined style={{ color: '#10b981', fontSize: 16 }} />
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  {title || '报告全文阅读'}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary, #64748b)',
                    fontWeight: 400,
                  }}
                >
                  ({formatWordCount(charCount)} 字)
                </span>
              </Space>
              <Button
                size="small"
                icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                onClick={handleCopy}
              >
                {copied ? '已复制' : '复制全文'}
              </Button>
            </div>
          }
          open={isModalOpen}
          onCancel={() => setIsModalOpen(false)}
          footer={null}
          width={860}
          destroyOnHidden
        >
          <div
            className="chat-outcome-body"
            style={{
              maxHeight: '74vh',
              overflowY: 'auto',
              padding: '20px 24px',
              fontSize: 14.5,
              lineHeight: 1.85,
              background: 'var(--bg-card, rgba(0, 0, 0, 0.02))',
              border: '1px solid var(--border-color, rgba(148, 163, 184, 0.15))',
              borderRadius: 8,
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={renderMarkdownComponents}
            >
              {effectiveText}
            </ReactMarkdown>
          </div>
        </Modal>
      </div>
    );
  }
);
