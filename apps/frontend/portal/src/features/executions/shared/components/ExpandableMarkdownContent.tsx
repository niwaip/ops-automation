import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { beautifyText } from '@/features/executions/detail/detailView';

export interface ExpandableMarkdownContentProps {
  text: string;
  maxCollapsedHeight?: number;
  maxCollapsedLines?: number;
  className?: string;
  style?: React.CSSProperties;
  bordered?: boolean;
}

export const ExpandableMarkdownContent: React.FC<ExpandableMarkdownContentProps> = ({
  text,
  maxCollapsedHeight = 360,
  maxCollapsedLines = 15,
  className,
  style,
  bordered = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflow, setIsOverflow] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const normalized = useMemo(() => {
    if (!text || typeof text !== 'string') return '';
    return beautifyText(text);
  }, [text]);

  useEffect(() => {
    if (contentRef.current) {
      // 10 lines is approx 240~260px
      const lineCount = (normalized.match(/\n/g) || []).length + 1;
      const exceedsHeight = contentRef.current.scrollHeight > maxCollapsedHeight + 10;
      const exceedsLines = lineCount > maxCollapsedLines;
      setIsOverflow(exceedsHeight || exceedsLines);
    }
  }, [normalized, maxCollapsedHeight, maxCollapsedLines]);

  if (!normalized.trim()) {
    return null;
  }

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        borderRadius: 8,
        border: bordered ? '1px solid var(--border-color, #e8e8e8)' : 'none',
        ...style,
      }}
    >
      <div
        ref={contentRef}
        className="chat-message-markdown"
        style={{
          maxHeight: !isExpanded && isOverflow ? maxCollapsedHeight : 'none',
          overflow: 'hidden',
          position: 'relative',
          transition: 'max-height 0.25s ease',
          lineHeight: '1.7',
          fontSize: 13,
          color: 'var(--text-primary, #262626)',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h3 style={{ margin: '8px 0 4px', fontSize: 16, fontWeight: 600 }}>{children}</h3>
            ),
            h2: ({ children }) => (
              <h4 style={{ margin: '8px 0 4px', fontSize: 15, fontWeight: 600 }}>{children}</h4>
            ),
            h3: ({ children }) => (
              <h5 style={{ margin: '6px 0 4px', fontSize: 14, fontWeight: 600 }}>{children}</h5>
            ),
            p: ({ children }) => (
              <p style={{ margin: '4px 0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{children}</p>
            ),
            ul: ({ children }) => (
              <ul style={{ paddingLeft: 20, margin: '4px 0', lineHeight: 1.7 }}>{children}</ul>
            ),
            ol: ({ children }) => (
              <ol style={{ paddingLeft: 20, margin: '4px 0', lineHeight: 1.7 }}>{children}</ol>
            ),
            li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
            blockquote: ({ children }) => (
              <blockquote
                style={{
                  margin: '6px 0',
                  padding: '4px 12px',
                  borderLeft: '4px solid var(--primary-color, #1677ff)',
                  background: 'var(--bg-secondary, #fafafa)',
                  color: 'var(--text-secondary, #666)',
                }}
              >
                {children}
              </blockquote>
            ),
            code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
              inline ? (
                <code
                  style={{
                    padding: '2px 5px',
                    background: 'rgba(0, 0, 0, 0.06)',
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                >
                  {children}
                </code>
              ) : (
                <pre
                  style={{
                    margin: '6px 0',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.04)',
                    borderRadius: 6,
                    overflow: 'auto',
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                >
                  <code>{children}</code>
                </pre>
              ),
            table: ({ children }: { children?: React.ReactNode }) => (
              <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                <table
                  style={{
                    borderCollapse: 'collapse',
                    width: '100%',
                    border: '1px solid var(--border-color, #d9d9d9)',
                    fontSize: 12,
                  }}
                >
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th
                style={{
                  border: '1px solid var(--border-color, #d9d9d9)',
                  padding: '6px 10px',
                  background: 'var(--bg-secondary, #fafafa)',
                  fontWeight: 600,
                  textAlign: 'left',
                }}
              >
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td
                style={{
                  border: '1px solid var(--border-color, #d9d9d9)',
                  padding: '6px 10px',
                }}
              >
                {children}
              </td>
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#1677ff' }}>
                {children}
              </a>
            ),
          }}
        >
          {normalized}
        </ReactMarkdown>
      </div>

      {isOverflow && !isExpanded ? (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            background:
              'linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, var(--bg-card, #ffffff) 85%)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 2,
            pointerEvents: 'none',
          }}
        >
          <Button
            type="link"
            size="small"
            icon={<DownOutlined />}
            onClick={() => setIsExpanded(true)}
            style={{ fontWeight: 500, padding: '0 8px', pointerEvents: 'auto' }}
          >
            展开全文
          </Button>
        </div>
      ) : null}

      {isOverflow && isExpanded ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <Button
            type="link"
            size="small"
            icon={<UpOutlined />}
            onClick={() => setIsExpanded(false)}
            style={{ fontWeight: 500, padding: '0 8px' }}
          >
            收起内容
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default ExpandableMarkdownContent;
