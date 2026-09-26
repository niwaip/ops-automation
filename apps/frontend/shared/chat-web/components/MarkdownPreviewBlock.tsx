import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Tooltip, Space, Modal, message as antMessage } from 'antd';
import {
  FileMarkdownOutlined,
  FullscreenOutlined,
  CopyOutlined,
  CheckOutlined,
  DownloadOutlined,
  ExportOutlined,
  EyeOutlined,
  UpOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeTabSeparatedTable } from '../lib/tableNormalizer';
import { unwrapOuterMarkdownFence } from './MessageContentRenderer';

export interface MarkdownPreviewBlockProps {
  content?: string;
  srcUrl?: string;
  fileName?: string;
  sizeBytes?: number | string;
  defaultExpanded?: boolean;
  isStreaming?: boolean;
}

const normalizeArtifactUrl = (url?: string): string => {
  if (!url) return '';
  const target = url.trim();
  if (typeof window !== 'undefined') {
    if (/^(?:https?:\/\/[^/]+)?(?:\/api)?\/renders\/(.*)$/i.test(target)) {
      const rest = target.replace(/^(?:https?:\/\/[^/]+)?(?:\/api)?\/renders\//i, '');
      return `/api/renders/${rest}`;
    }
    if (/^(?:https?:\/\/[^/]+)?(?:\/api)?\/studio\/(.*)$/i.test(target)) {
      const rest = target.replace(/^(?:https?:\/\/[^/]+)?(?:\/api)?\/studio\//i, '');
      return `/studio/${rest}`;
    }
  }
  return target;
};

export const MarkdownPreviewBlock: React.FC<MarkdownPreviewBlockProps> = React.memo(
  function MarkdownPreviewBlock({
    content,
    srcUrl,
    fileName,
    sizeBytes,
    defaultExpanded = true,
    isStreaming = false,
  }) {
    const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);
    const [fetchedText, setFetchedText] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const normalizedSrcUrl = useMemo(() => normalizeArtifactUrl(srcUrl), [srcUrl]);

    useEffect(() => {
      if (!content && normalizedSrcUrl && !fetchedText && !isLoading) {
        setIsLoading(true);
        setFetchError(null);
        fetch(normalizedSrcUrl)
          .then((res) => {
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            return res.text();
          })
          .then((text) => {
            setFetchedText(text);
          })
          .catch((err) => {
            console.error('Failed to fetch markdown artifact text:', err);
            setFetchError((err as Error).message || '网络请求失败');
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }, [content, normalizedSrcUrl, fetchedText, isLoading]);

    const effectiveMarkdown = useMemo(() => {
      const raw = content || fetchedText || '';
      return unwrapOuterMarkdownFence(raw);
    }, [content, fetchedText]);

    const displayFileName = useMemo(() => {
      if (fileName && fileName.trim()) {
        return fileName.trim();
      }
      if (srcUrl) {
        const match = srcUrl.match(/\/([^/?#]+\.md)(?:[?#]|$)/i);
        if (match && match[1]) {
          return match[1];
        }
      }
      return 'document.md';
    }, [fileName, srcUrl]);

    const approxSize = useMemo(() => {
      if (sizeBytes !== undefined) {
        const num = Number(sizeBytes);
        if (!isNaN(num)) {
          return `${(num / 1024).toFixed(1)} KB`;
        }
        return String(sizeBytes);
      }
      if (effectiveMarkdown) {
        return `${(new Blob([effectiveMarkdown]).size / 1024).toFixed(1)} KB`;
      }
      return 'MD';
    }, [sizeBytes, effectiveMarkdown]);

    const effectiveExpanded = !isStreaming && isExpanded;

    const handleCopy = useCallback(async () => {
      if (!effectiveMarkdown) return;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(effectiveMarkdown);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = effectiveMarkdown;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        setCopied(true);
        void antMessage.success('已复制 Markdown 正文');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        void antMessage.error('复制失败');
      }
    }, [effectiveMarkdown]);

    const handleDownload = useCallback(() => {
      try {
        if (normalizedSrcUrl) {
          const a = document.createElement('a');
          a.href = normalizedSrcUrl;
          a.download = displayFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        }
        const blob = new Blob([effectiveMarkdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = displayFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
        }, 60000);
      } catch (err) {
        console.error('Failed to download markdown file:', err);
      }
    }, [normalizedSrcUrl, effectiveMarkdown, displayFileName]);

    const handleOpenNewWindow = useCallback(() => {
      if (normalizedSrcUrl) {
        window.open(normalizedSrcUrl, '_blank');
        return;
      }
      const newWin = window.open('', '_blank');
      if (newWin) {
        newWin.document.open();
        newWin.document.write(
          `<!DOCTYPE html><html><head><title>${displayFileName}</title><meta charset="utf-8"/><style>body{margin:28px auto;max-width:800px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.7;white-space:pre-wrap;color:#1e293b;}</style></head><body>${effectiveMarkdown.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</body></html>`
        );
        newWin.document.close();
      }
    }, [normalizedSrcUrl, displayFileName, effectiveMarkdown]);

    const renderMarkdownContent = (maxHeightStyle?: string) => {
      if (isLoading) {
        return (
          <div style={{ padding: '24px', textAlign: 'center', color: '#1677ff', fontSize: 13 }}>
            <LoadingOutlined spin style={{ marginRight: 8 }} />
            正在读取 Markdown 正文内容...
          </div>
        );
      }

      if (fetchError && !effectiveMarkdown) {
        return (
          <div style={{ padding: '16px 20px', color: '#dc2626', fontSize: 12 }}>
            ⚠️ 读取正文失败：{fetchError}
            {normalizedSrcUrl && (
              <Button
                size="small"
                type="link"
                href={normalizedSrcUrl}
                target="_blank"
                style={{ padding: '0 4px', height: 'auto', fontSize: 12 }}
              >
                直接在新窗口查看文件
              </Button>
            )}
          </div>
        );
      }

      return (
        <div
          style={{
            padding: '16px 20px',
            maxHeight: maxHeightStyle || '520px',
            overflowY: 'auto',
            fontSize: '13.5px',
            lineHeight: 1.7,
            color: 'inherit',
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }: { children?: React.ReactNode }) => (
                <div style={{ overflowX: 'auto', margin: '12px 0' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</table>
                </div>
              ),
              pre: ({ children, className: preClassName, ...props }: React.ComponentPropsWithoutRef<'pre'>) => {
                const childElement = React.isValidElement(children) ? children : null;
                const childProps = childElement
                  ? (childElement.props as { className?: string; children?: React.ReactNode })
                  : null;
                const codeClassName = childProps?.className || '';
                const mergedClass = ['code-block', preClassName, codeClassName].filter(Boolean).join(' ');
                return (
                  <pre
                    className={mergedClass}
                    style={{
                      margin: '10px 0',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.05)',
                      overflowX: 'auto',
                      fontSize: '12.5px',
                    }}
                    {...props}
                  >
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
                  <code
                    className={className || 'inline-code'}
                    style={{
                      padding: '2px 5px',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {normalizeTabSeparatedTable(effectiveMarkdown)}
          </ReactMarkdown>
        </div>
      );
    };

    return (
      <div
        style={{
          margin: '12px 0',
          borderRadius: '10px',
          border: '1px solid rgba(140, 140, 140, 0.25)',
          background: 'rgba(255, 255, 255, 0.03)',
          overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
        }}
      >
        {/* Header bar / Standard Artifact Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '9px 12px',
            background: 'rgba(0, 0, 0, 0.03)',
            borderBottom: effectiveExpanded ? '1px solid rgba(140, 140, 140, 0.15)' : 'none',
            flexWrap: 'wrap',
            gap: '8px',
            cursor: isStreaming ? 'default' : 'pointer',
          }}
          onClick={() => {
            if (!isStreaming) {
              setIsExpanded(!isExpanded);
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isStreaming ? (
              <LoadingOutlined spin style={{ color: '#1677ff', fontSize: '15px' }} />
            ) : (
              <FileMarkdownOutlined style={{ color: '#1677ff', fontSize: '16px' }} />
            )}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                <span>📝 {displayFileName}</span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: isStreaming ? 'rgba(22, 119, 255, 0.08)' : 'rgba(22, 119, 255, 0.1)',
                    color: '#1677ff',
                    fontWeight: 500,
                  }}
                >
                  .md
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(0, 0, 0, 0.04)',
                    color: '#64748b',
                  }}
                >
                  {approxSize}
                </span>
              </div>
              {!effectiveExpanded && (
                <div
                  style={{
                    fontSize: '11px',
                    color: isStreaming ? '#1677ff' : '#64748b',
                    marginTop: '2px',
                  }}
                >
                  {isStreaming
                    ? '⚡ Markdown 文件生成中...'
                    : '💡 Markdown 文档已就绪（支持在线富文本阅读、全屏预览与正文一键复制）'}
                </div>
              )}
            </div>
          </div>

          {isStreaming ? (
            <Space size="small" onClick={(e) => e.stopPropagation()}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#1677ff',
                  background: 'rgba(22, 119, 255, 0.08)',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontWeight: 500,
                }}
              >
                <LoadingOutlined spin /> 生成中...
              </span>
            </Space>
          ) : (
            <Space size="small" onClick={(e) => e.stopPropagation()}>
              <Button
                size="small"
                type={effectiveExpanded ? 'default' : 'primary'}
                icon={effectiveExpanded ? <UpOutlined /> : <EyeOutlined />}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {effectiveExpanded ? '收起预览' : '展开在线预览'}
              </Button>

              <Tooltip title="复制 Markdown 正文内容到剪贴板">
                <Button
                  size="small"
                  icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
                  onClick={handleCopy}
                >
                  {copied ? '已复制' : '复制正文'}
                </Button>
              </Tooltip>

              <Tooltip title="在当前页面全屏阅读预览">
                <Button size="small" icon={<FullscreenOutlined />} onClick={() => setIsFullscreen(true)}>
                  全屏
                </Button>
              </Tooltip>

              {normalizedSrcUrl ? (
                <Tooltip title="在新标签页独立打开文件">
                  <Button size="small" icon={<ExportOutlined />} onClick={handleOpenNewWindow}>
                    新窗口
                  </Button>
                </Tooltip>
              ) : null}

              <Tooltip title="下载 Markdown (.md) 文件至本地">
                <Button size="small" type="primary" ghost icon={<DownloadOutlined />} onClick={handleDownload}>
                  下载
                </Button>
              </Tooltip>
            </Space>
          )}
        </div>

        {/* Body content */}
        {effectiveExpanded && renderMarkdownContent()}

        {/* Fullscreen Reading Modal */}
        <Modal
          open={isFullscreen}
          onCancel={() => setIsFullscreen(false)}
          footer={null}
          width="92vw"
          style={{ top: '3vh', paddingBottom: 0 }}
          styles={{
            body: { padding: '20px 32px', height: '86vh', overflowY: 'auto' },
          }}
          destroyOnClose
          title={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingRight: '24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileMarkdownOutlined style={{ color: '#1677ff' }} />
                <span>{displayFileName} - 全屏阅读</span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(22, 119, 255, 0.1)',
                    color: '#1677ff',
                  }}
                >
                  {approxSize}
                </span>
              </div>
              <Space size="small">
                <Button
                  size="small"
                  icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
                  onClick={handleCopy}
                >
                  {copied ? '已复制' : '复制正文'}
                </Button>
                {normalizedSrcUrl ? (
                  <Button size="small" icon={<ExportOutlined />} onClick={handleOpenNewWindow}>
                    新标签页打开
                  </Button>
                ) : null}
                <Button size="small" type="primary" ghost icon={<DownloadOutlined />} onClick={handleDownload}>
                  下载 Markdown
                </Button>
              </Space>
            </div>
          }
        >
          {renderMarkdownContent('100%')}
        </Modal>
      </div>
    );
  }
);

export default MarkdownPreviewBlock;
