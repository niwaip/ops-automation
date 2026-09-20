import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeTabSeparatedTable } from '../lib/tableNormalizer';
import { HtmlPreviewBlock } from './HtmlPreviewBlock';

interface MessageContentRendererProps {
  content: string;
  mode: 'plain' | 'markdown';
  isStreaming?: boolean;
}

const safeUrlTransform = (url?: string): string => {
  if (!url) return '';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed, 'http://dummy.local');
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return trimmed;
    }
  } catch {}
  return '';
};

const appendAuthToken = (url: string): string => {
  if (typeof window === 'undefined' || !url.includes('/api/ai/chat/workspace-files/')) return url;
  if (url.includes('token=')) return url;
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  } catch {
    return url;
  }
};

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
        urlTransform={safeUrlTransform}
        components={{
          code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
            const match = /language-(\w+)/.exec(className || '');
            const codeText = String(children || '');
            if (
              match &&
              match[1] === 'html' &&
              (codeText.includes('<!DOCTYPE html') ||
                codeText.includes('<html') ||
                codeText.includes('class="slide') ||
                codeText.includes('presentation') ||
                codeText.includes('guizang') ||
                codeText.includes('diff-ins') ||
                codeText.includes('diff-del'))
            ) {
              return (
                <HtmlPreviewBlock
                  code={codeText.trim()}
                  className={className}
                  isStreaming={isStreaming}
                />
              );
            }

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
          img: ({ src, alt, ...props }: React.ComponentPropsWithoutRef<'img'>) => {
            let finalSrc = src || '';
            if (finalSrc.startsWith('/workspace/') || finalSrc.startsWith('workspace/')) {
              const fileName = finalSrc.split('/').pop();
              if (fileName) {
                finalSrc = `/api/ai/chat/workspace-files/me/${encodeURIComponent(fileName)}`;
              }
            }
            finalSrc = appendAuthToken(finalSrc);

            return (
              <span style={{ display: 'block', margin: '12px 0', maxWidth: '100%' }}>
                <img
                  src={finalSrc}
                  alt={alt || 'AI 生成图片'}
                  loading="lazy"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '520px',
                    objectFit: 'contain',
                    borderRadius: '12px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                    display: 'block',
                    cursor: 'zoom-in',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    background: 'var(--bg-card, #ffffff)',
                  }}
                  onClick={() => {
                    if (finalSrc && typeof window !== 'undefined') {
                      if (finalSrc.startsWith('data:image/')) {
                        const w = window.open('');
                        if (w) {
                          w.document.write(
                            `<!DOCTYPE html><html><head><title>${alt || '图片查看器'}</title><style>body{margin:0;background:#0f172a;display:flex;justify-content:center;align-items:center;min-height:100vh;}</style></head><body><img src="${finalSrc}" style="max-width:96vw;max-height:96vh;object-fit:contain;box-shadow:0 8px 32px rgba(0,0,0,0.6);border-radius:8px;" /></body></html>`
                          );
                          w.document.close();
                        }
                      } else {
                        window.open(finalSrc, '_blank');
                      }
                    }
                  }}
                  {...props}
                />
                {alt && alt !== 'AI 生成图片' && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: 'var(--text-secondary, #64748b)',
                      marginTop: '6px',
                      fontStyle: 'italic',
                    }}
                  >
                    📷 {alt}
                  </span>
                )}
              </span>
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
            let finalHref = href || '';
            if (finalHref.startsWith('/workspace/') || finalHref.startsWith('workspace/')) {
              const fileName = finalHref.split('/').pop();
              if (fileName) {
                finalHref = `/api/ai/chat/workspace-files/me/${encodeURIComponent(fileName)}`;
              }
            }
            finalHref = appendAuthToken(finalHref);
            const isDownloadLink = finalHref.includes('/api/ai/chat/workspace-files/');
            return (
              <a
                href={finalHref}
                target="_blank"
                rel="noopener noreferrer"
                download={isDownloadLink ? true : undefined}
                style={{
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                  wordWrap: 'break-word',
                  color: 'var(--primary-color, #1677ff)',
                  fontWeight: isDownloadLink ? 600 : undefined,
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
      {isStreaming ? <span className="streaming-indicator" aria-label="generating" /> : null}
    </div>
  );
};

export default MessageContentRenderer;
