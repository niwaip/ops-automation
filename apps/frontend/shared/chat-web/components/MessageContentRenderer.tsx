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
  } catch {
    // Fall back to plain content when parsing fails.
  }
  return '';
};

const extractLocalAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    // 1. Direct keys
    const directToken = localStorage.getItem('token') || localStorage.getItem('access_token');
    if (directToken) return directToken;

    // 2. user-web (packages/user-core): 'ops-user-auth' -> { accessToken: "..." }
    const opsUserAuth = localStorage.getItem('ops-user-auth');
    if (opsUserAuth) {
      const parsed = JSON.parse(opsUserAuth);
      if (parsed?.accessToken) return parsed.accessToken;
      if (parsed?.token) return parsed.token;
    }

    // 3. portal: 'auth-storage' -> { state: { token: "..." } }
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      if (parsed?.state?.token) return parsed.state.token;
      if (parsed?.state?.accessToken) return parsed.state.accessToken;
      if (parsed?.accessToken) return parsed.accessToken;
    }

    // 4. Fallback: check document.cookie for token=
    if (typeof document !== 'undefined' && document.cookie) {
      const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
      if (m && m[1]) return decodeURIComponent(m[1]).trim();
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
};

const appendAuthToken = (url: string): string => {
  if (typeof window === 'undefined' || !url.includes('/api/ai/chat/workspace-files/')) return url;
  if (url.includes('token=') || url.includes('access_token=')) return url;
  try {
    const token = extractLocalAuthToken();
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  } catch {
    return url;
  }
};


const isHtmlPreviewBlock = (className?: string, codeText?: string) => {
  const match = /language-(\w+)/.exec(className || '');
  if (!match || match[1] !== 'html' || !codeText) return false;
  return (
    codeText.includes('<!DOCTYPE html') ||
    codeText.includes('<html') ||
    codeText.includes('class="slide') ||
    codeText.includes('presentation') ||
    codeText.includes('guizang') ||
    codeText.includes('diff-ins') ||
    codeText.includes('diff-del')
  );
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
          pre: ({ children, className: preClassName, ...props }: React.ComponentPropsWithoutRef<'pre'>) => {
            const childElement = React.isValidElement(children) ? children : null;
            const childProps = childElement ? (childElement.props as { className?: string; children?: React.ReactNode }) : null;
            const codeClassName = childProps?.className || '';
            const codeText = Array.isArray(childProps?.children)
              ? childProps.children.join('')
              : String(childProps?.children || '');

            if (isHtmlPreviewBlock(codeClassName, codeText)) {
              return <>{children}</>;
            }

            const mergedClass = ['code-block', preClassName, codeClassName].filter(Boolean).join(' ');
            return (
              <pre className={mergedClass} {...props}>
                {children}
              </pre>
            );
          },
          code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
            const codeText = Array.isArray(children) ? children.join('') : String(children || '');
            if (isHtmlPreviewBlock(className, codeText)) {
              return (
                <HtmlPreviewBlock
                  code={codeText.trim()}
                  className={className}
                  isStreaming={isStreaming}
                />
              );
            }

            return (
              <code className={className || 'inline-code'} {...props}>
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
