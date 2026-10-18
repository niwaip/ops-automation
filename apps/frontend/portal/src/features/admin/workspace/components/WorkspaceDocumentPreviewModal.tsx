import {
  CopyOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import {
  Button,
  Empty,
  Modal,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  message as antdMessage,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  type FilePreviewResponse,
  type WorkspaceNode,
} from '@/api/workspace';

interface WorkspaceDocumentPreviewModalProps {
  open: boolean;
  node: WorkspaceNode | null;
  previewData: FilePreviewResponse | null;
  loading: boolean;
  onClose: () => void;
  onDownload: (node: WorkspaceNode) => void;
}

function getFileType(node: WorkspaceNode | null) {
  if (!node) return { type: 'unknown', ext: '' };
  const ext = (node.name.split('.').pop() || '').toLowerCase();
  if (['md', 'markdown'].includes(ext)) return { type: 'markdown', ext };
  if (ext === 'pdf' || node.mimeType === 'application/pdf') return { type: 'pdf', ext };
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext))
    return { type: 'image', ext };
  if (['csv', 'tsv'].includes(ext)) return { type: 'csv', ext };
  if (['json'].includes(ext)) return { type: 'json', ext };
  if (
    ['ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'yaml', 'yml', 'sql', 'html', 'css', 'go', 'java'].includes(
      ext
    )
  ) {
    return { type: 'code', ext };
  }
  return { type: 'text', ext };
}

function getFileIcon(type: string) {
  if (type === 'markdown' || type === 'text')
    return <FileTextOutlined style={{ color: '#1677ff' }} />;
  if (type === 'pdf') return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
  if (type === 'image') return <PictureOutlined style={{ color: '#13c2c2' }} />;
  if (type === 'csv') return <FileExcelOutlined style={{ color: '#52c41a' }} />;
  return <FileOutlined style={{ color: '#8c8c8c' }} />;
}

export function WorkspaceDocumentPreviewModal({
  open,
  node,
  previewData,
  loading,
  onClose,
  onDownload,
}: WorkspaceDocumentPreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<string>('rendered');

  const { type: fileType, ext } = useMemo(() => getFileType(node), [node]);

  useEffect(() => {
    if (!open) return;
    if (fileType === 'markdown') {
      setViewMode('rendered');
    } else if (fileType === 'csv') {
      setViewMode('table');
    } else {
      setViewMode('raw');
    }
  }, [open, fileType]);

  const handleCopy = () => {
    if (previewData?.content) {
      void navigator.clipboard.writeText(previewData.content);
      antdMessage.success('文档内容已复制到剪贴板');
    }
  };

  const csvParsed = useMemo(() => {
    if (fileType !== 'csv' || !previewData?.content) return null;
    const lines = previewData.content.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return null;
    const delimiter = ext === 'tsv' ? '\t' : ',';
    const headerRow = lines[0]
      .split(delimiter)
      .map((c) => c.trim().replace(/^["']|["']$/g, ''));
    const columns = headerRow.map((col, idx) => ({
      title: col || `列 ${idx + 1}`,
      dataIndex: `col_${idx}`,
      key: `col_${idx}`,
    }));
    const data = lines.slice(1).map((line, rIdx) => {
      const cells = line.split(delimiter);
      const rowObj: Record<string, string> = { key: String(rIdx) };
      headerRow.forEach((_, cIdx) => {
        rowObj[`col_${cIdx}`] = (cells[cIdx] || '').trim().replace(/^["']|["']$/g, '');
      });
      return rowObj;
    });
    return { columns, data };
  }, [fileType, ext, previewData]);

  const rawText = previewData?.content || '';

  return (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {getFileIcon(fileType)}
            <span
              style={{
                maxWidth: 420,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
            >
              {node?.name}
            </span>
            <Tag color={fileType === 'markdown' ? 'blue' : fileType === 'pdf' ? 'red' : 'cyan'}>
              {fileType === 'markdown'
                ? 'Markdown'
                : fileType === 'pdf'
                ? 'PDF 文档'
                : fileType === 'csv'
                ? 'CSV 表格'
                : (ext || '文本').toUpperCase()}
            </Tag>
          </div>

          <div>
            {fileType === 'markdown' && (
              <Segmented
                size="small"
                value={viewMode}
                onChange={(val) => setViewMode(val as string)}
                options={[
                  { label: '渲染视图', value: 'rendered' },
                  { label: '纯文本源码', value: 'raw' },
                ]}
              />
            )}
            {fileType === 'csv' && (
              <Segmented
                size="small"
                value={viewMode}
                onChange={(val) => setViewMode(val as string)}
                options={[
                  { label: '表格视图', value: 'table' },
                  { label: '原始文本', value: 'raw' },
                ]}
              />
            )}
          </div>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={isFullscreen ? '96vw' : 920}
      style={isFullscreen ? { top: '2vh' } : { top: 36 }}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>
            {rawText
              ? `共 ${rawText.length.toLocaleString()} 字符 · ${
                  rawText.split('\n').length
                } 行`
              : ''}
          </div>
          <Space>
            <Tooltip title={isFullscreen ? '退出全屏' : '全屏预览'}>
              <Button
                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={() => setIsFullscreen((prev) => !prev)}
              />
            </Tooltip>
            {rawText && (
              <Button icon={<CopyOutlined />} onClick={handleCopy}>
                复制文本
              </Button>
            )}
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => {
                if (node) onDownload(node);
              }}
            >
              下载原文件
            </Button>
          </Space>
        </div>
      }
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <Spin tip="正在提取并渲染文档文本内容..." />
          </div>
        ) : (
          <div
            style={{
              maxHeight: isFullscreen ? '82vh' : '65vh',
              minHeight: isFullscreen ? '78vh' : '420px',
              overflowY: 'auto',
              padding: 16,
              background: 'var(--bg-card, #1e293b)',
              color: 'var(--text-primary, #f8fafc)',
              borderRadius: 6,
              border: '1px solid var(--border-color, #334155)',
            }}
          >
            {/* Markdown 渲染视图 */}
            {fileType === 'markdown' && viewMode === 'rendered' && (
              <div
                style={{
                  lineHeight: 1.7,
                  fontSize: 14,
                  wordBreak: 'break-word',
                  color: 'var(--text-primary, #f8fafc)',
                }}
              >
                {rawText ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={(url) => {
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
                        // Preview cleanup is best-effort.
                      }
                      return '';
                    }}
                    components={{
                      h1: ({ ...props }) => (
                        <h1
                          style={{
                            color: 'var(--text-primary, #f8fafc)',
                            borderBottom: '1px solid var(--border-color, #334155)',
                            paddingBottom: '0.3em',
                            marginTop: '1.2em',
                            marginBottom: '0.6em',
                            fontSize: '1.6em',
                          }}
                          {...props}
                        />
                      ),
                      h2: ({ ...props }) => (
                        <h2
                          style={{
                            color: 'var(--text-primary, #f8fafc)',
                            borderBottom: '1px solid var(--border-color, #334155)',
                            paddingBottom: '0.25em',
                            marginTop: '1.1em',
                            marginBottom: '0.5em',
                            fontSize: '1.35em',
                          }}
                          {...props}
                        />
                      ),
                      h3: ({ ...props }) => (
                        <h3
                          style={{
                            color: 'var(--text-primary, #f8fafc)',
                            marginTop: '1em',
                            marginBottom: '0.4em',
                            fontSize: '1.15em',
                          }}
                          {...props}
                        />
                      ),
                      h4: ({ ...props }) => (
                        <h4
                          style={{
                            color: 'var(--text-primary, #f8fafc)',
                            marginTop: '0.8em',
                            marginBottom: '0.3em',
                          }}
                          {...props}
                        />
                      ),
                      p: ({ ...props }) => (
                        <p
                          style={{
                            color: 'var(--text-primary, #f8fafc)',
                            marginBottom: '0.8em',
                            lineHeight: 1.75,
                          }}
                          {...props}
                        />
                      ),
                      ul: ({ ...props }) => (
                        <ul
                          style={{
                            color: 'var(--text-primary, #f8fafc)',
                            paddingLeft: '1.5em',
                            marginBottom: '0.8em',
                          }}
                          {...props}
                        />
                      ),
                      ol: ({ ...props }) => (
                        <ol
                          style={{
                            color: 'var(--text-primary, #f8fafc)',
                            paddingLeft: '1.5em',
                            marginBottom: '0.8em',
                          }}
                          {...props}
                        />
                      ),
                      li: ({ ...props }) => (
                        <li style={{ marginBottom: '0.3em', color: 'var(--text-primary, #f8fafc)' }} {...props} />
                      ),
                      blockquote: ({ ...props }) => (
                        <blockquote
                          style={{
                            margin: '0.8em 0',
                            padding: '0.6em 1em',
                            borderLeft: '4px solid #6366f1',
                            background: 'var(--bg-subtle, #141f32)',
                            color: 'var(--text-secondary, #cbd5e1)',
                            borderRadius: '0 4px 4px 0',
                          }}
                          {...props}
                        />
                      ),
                      code: ({ inline, children, ...props }: any) => {
                        if (inline) {
                          return (
                            <code
                              style={{
                                background: 'var(--bg-subtle, #243244)',
                                color: '#a5b4fc',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.9em',
                                fontFamily: 'SFMono-Regular, Consolas, Menlo, monospace',
                              }}
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        }
                        return (
                          <pre
                            style={{
                              background: 'var(--bg-subtle, #0f172a)',
                              color: 'var(--text-primary, #f8fafc)',
                              padding: 12,
                              borderRadius: 6,
                              overflowX: 'auto',
                              fontSize: '0.88em',
                              border: '1px solid var(--border-color, #334155)',
                              margin: '0.8em 0',
                            }}
                          >
                            <code {...props}>{children}</code>
                          </pre>
                        );
                      },
                      table: ({ ...props }) => (
                        <div style={{ overflowX: 'auto', margin: '1em 0' }}>
                          <table
                            style={{
                              borderCollapse: 'collapse',
                              width: '100%',
                              border: '1px solid var(--border-color, #334155)',
                            }}
                            {...props}
                          />
                        </div>
                      ),
                      th: ({ ...props }) => (
                        <th
                          style={{
                            border: '1px solid var(--border-color, #334155)',
                            padding: '8px 12px',
                            background: 'var(--bg-subtle, #243244)',
                            color: 'var(--text-primary, #f8fafc)',
                            fontWeight: 600,
                          }}
                          {...props}
                        />
                      ),
                      td: ({ ...props }) => (
                        <td
                          style={{
                            border: '1px solid var(--border-color, #334155)',
                            padding: '8px 12px',
                            color: 'var(--text-primary, #f8fafc)',
                          }}
                          {...props}
                        />
                      ),
                      hr: ({ ...props }) => (
                        <hr
                          style={{
                            border: 'none',
                            borderTop: '1px solid var(--border-color, #334155)',
                            margin: '1.2em 0',
                          }}
                          {...props}
                        />
                      ),
                      a: ({ href, children, ...props }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#818cf8', textDecoration: 'underline' }}
                          {...props}
                        >
                          {children}
                        </a>
                      ),
                      img: ({ src, alt, ...props }) => (
                        <span style={{ display: 'block', margin: '16px 0', textAlign: 'center' }}>
                          <img
                            src={src}
                            alt={alt || '文档图片'}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '520px',
                              objectFit: 'contain',
                              borderRadius: '8px',
                              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                              border: '1px solid var(--border-color, #334155)',
                              cursor: 'zoom-in',
                            }}
                            onClick={() => {
                              if (src) window.open(src, '_blank');
                            }}
                            {...props}
                          />
                          {alt && (
                            <span
                              style={{
                                display: 'block',
                                fontSize: '12px',
                                color: 'var(--text-secondary, #94a3b8)',
                                marginTop: '6px',
                              }}
                            >
                              📷 {alt}
                            </span>
                          )}
                        </span>
                      ),
                    }}
                  >
                    {rawText}
                  </ReactMarkdown>
                ) : (
                  <Empty description="暂无内容" />
                )}
              </div>
            )}

            {/* CSV 表格视图 */}
            {fileType === 'csv' && viewMode === 'table' && csvParsed && (
              <Table
                columns={csvParsed.columns}
                dataSource={csvParsed.data}
                size="small"
                pagination={{ pageSize: 20, showSizeChanger: true }}
                scroll={{ x: 'max-content' }}
              />
            )}

            {/* 纯文本/代码视图 */}
            {(viewMode === 'raw' || (fileType !== 'markdown' && fileType !== 'csv')) && (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'SFMono-Regular, Consolas, Menlo, monospace',
                  fontSize: 13,
                  lineHeight: 1.65,
                  padding: 14,
                  borderRadius: 6,
                  background: 'var(--bg-subtle, #0f172a)',
                  color: 'var(--text-primary, #f8fafc)',
                  border: '1px solid var(--border-color, #334155)',
                }}
              >
                {rawText || '（暂无提取到文本内容或文件为空）'}
              </pre>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
