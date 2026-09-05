import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeTabSeparatedTable } from '../lib/tableNormalizer';

interface MessageContentRendererProps {
  content: string;
  mode: 'plain' | 'markdown';
  isStreaming?: boolean;
}

const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({
  content,
  mode,
  isStreaming = false,
}) => {
  if (!content) {
    return null;
  }

  if (mode === 'plain') {
    return <div className="chat-message-plain">{content}</div>;
  }

  return (
    <div className="chat-message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
            const match = /language-(\w+)/.exec(className || '');
            return match ? (
              <pre className={`code-block language-${match[1]}`}>
                <code {...props}>{children}</code>
              </pre>
            ) : (
              <code className="inline-code" {...props}>
                {children}
              </code>
            );
          },
          a: ({ href, children, onClick, ...props }: React.ComponentPropsWithoutRef<'a'>) => {
            const isWorkspaceLink = Boolean(href?.includes('/workspaces') && href?.includes('fileId='));
            if (isWorkspaceLink) {
              return (
                <span
                  role="button"
                  tabIndex={0}
                  style={{
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                    wordWrap: 'break-word',
                    color: 'var(--primary-color, #1677ff)',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const fileIdMatch = href?.match(/[?&]fileId=([^&]+)/);
                    const wsMatch = href?.match(/[?&]workspaceId=([^&]+)/);
                    const fileId = fileIdMatch ? decodeURIComponent(fileIdMatch[1]) : '';
                    const workspaceId = wsMatch ? decodeURIComponent(wsMatch[1]) : undefined;
                    if (fileId && typeof window !== 'undefined') {
                      window.dispatchEvent(
                        new CustomEvent('open-workspace-preview', {
                          detail: {
                            fileId,
                            workspaceId,
                            fileName: typeof children === 'string' ? children : undefined,
                          },
                        })
                      );
                    }
                  }}
                >
                  {children}
                </span>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  wordWrap: 'break-word',
                }}
                onClick={onClick}
                {...props}
              >
                {children}
              </a>
            );
          },
          table: ({ children }: { children?: React.ReactNode }) => (
            <div className="markdown-table-wrapper">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {normalizeTabSeparatedTable(content)}
      </ReactMarkdown>
      {isStreaming ? <span className="streaming-indicator">...</span> : null}
    </div>
  );
};

export default MessageContentRenderer;
