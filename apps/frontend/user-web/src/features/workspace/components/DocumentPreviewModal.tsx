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
  workspaceApi,
  type FilePreviewResponse,
  type WorkspaceNode,
} from '../../../api/workspace';
import styles from './DocumentPreviewModal.module.css';

interface DocumentPreviewModalProps {
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
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return { type: 'image', ext };
  if (['csv', 'tsv'].includes(ext)) return { type: 'csv', ext };
  if (['json'].includes(ext)) return { type: 'json', ext };
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'yaml', 'yml', 'sql', 'html', 'css'].includes(ext)) {
    return { type: 'code', ext };
  }
  return { type: 'text', ext };
}

function getFileIcon(type: string) {
  if (type === 'markdown' || type === 'text') return <FileTextOutlined style={{ color: '#1677ff' }} />;
  if (type === 'pdf') return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
  if (type === 'image') return <PictureOutlined style={{ color: '#13c2c2' }} />;
  if (type === 'csv') return <FileExcelOutlined style={{ color: '#52c41a' }} />;
  return <FileOutlined style={{ color: '#8c8c8c' }} />;
}

export function DocumentPreviewModal({
  open,
  node,
  previewData,
  loading,
  onClose,
  onDownload,
}: DocumentPreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<string>('rendered');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isBlobLoading, setIsBlobLoading] = useState(false);

  const { type: fileType, ext } = useMemo(() => getFileType(node), [node]);

  // 当切换文件时重置默认视图模式
  useEffect(() => {
    if (!open) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      return;
    }
    if (fileType === 'markdown') {
      setViewMode('rendered');
    } else if (fileType === 'pdf') {
      setViewMode('native');
    } else if (fileType === 'csv') {
      setViewMode('table');
    } else {
      setViewMode('raw');
    }
  }, [open, fileType]);

  // PDF 或图片时加载原生 Blob URL
  useEffect(() => {
    if (!open || !node) return;
    if (fileType === 'pdf' || fileType === 'image') {
      let isMounted = true;
      setIsBlobLoading(true);
      workspaceApi
        .getFileBlob(node.workspaceId, node.id)
        .then((blob) => {
          if (isMounted) {
            const url = URL.createObjectURL(blob);
            setBlobUrl(url);
          }
        })
        .catch((err) => {
          console.warn('Failed to load blob for preview:', err);
        })
        .finally(() => {
          if (isMounted) setIsBlobLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [open, node, fileType]);

  // 复制当前文本
  const handleCopy = () => {
    if (previewData?.content) {
      void navigator.clipboard.writeText(previewData.content);
      void antdMessage.success('文档内容已复制到剪贴板');
    }
  };

  // CSV 简单解析
  const csvParsed = useMemo(() => {
    if (fileType !== 'csv' || !previewData?.content) return null;
    const lines = previewData.content.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return null;
    const delimiter = ext === 'tsv' ? '\t' : ',';
    const headerRow = lines[0].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 32 }}>
          <div className={styles['preview-header-meta']}>
            {getFileIcon(fileType)}
            <span style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
              {node?.name}
            </span>
            <Tag color={fileType === 'markdown' ? 'blue' : fileType === 'pdf' ? 'red' : 'cyan'}>
              {fileType === 'markdown'
                ? 'Markdown'
                : fileType === 'pdf'
                ? 'PDF 文档'
                : fileType === 'csv'
                ? 'CSV 表格'
                : fileType === 'image'
                ? '图像'
                : (ext || '文本').toUpperCase()}
            </Tag>
          </div>

          {/* 视图模式切换 */}
          <div>
            {fileType === 'markdown' && (
              <Segmented
                size="small"
                value={viewMode}
                onChange={(val) => setViewMode(val as string)}
                options={[
                  { label: '渲染视图', value: 'rendered' },
                  { label: '源码视图', value: 'raw' },
                ]}
              />
            )}
            {fileType === 'pdf' && (
              <Segmented
                size="small"
                value={viewMode}
                onChange={(val) => setViewMode(val as string)}
                options={[
                  { label: 'PDF 原生视图', value: 'native' },
                  { label: '提取文本', value: 'text' },
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {rawText ? `字数: ${rawText.length.toLocaleString()} 字符` : ''}
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
      <div className={styles['preview-container']}>
        {loading || (isBlobLoading && !rawText) ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <Spin tip="正在加载并准备文档预览..." />
          </div>
        ) : (
          <div
            className={styles['preview-body']}
            style={{
              maxHeight: isFullscreen ? '82vh' : '70vh',
              minHeight: isFullscreen ? '78vh' : '450px',
            }}
          >
            {/* 1. PDF 原生视图 */}
            {fileType === 'pdf' && viewMode === 'native' && (
              blobUrl ? (
                <iframe
                  className={styles['preview-pdf-frame']}
                  src={blobUrl}
                  title={node?.name || 'PDF Preview'}
                  style={{ height: isFullscreen ? '80vh' : '68vh' }}
                />
              ) : (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <Spin tip="正在载入原生 PDF 渲染器..." />
                </div>
              )
            )}

            {/* 2. PDF 提取纯文本视图 */}
            {fileType === 'pdf' && viewMode === 'text' && (
              <div className={styles['preview-raw']}>
                {rawText || '暂未提取到文本内容'}
              </div>
            )}

            {/* 3. Markdown 渲染视图 */}
            {fileType === 'markdown' && viewMode === 'rendered' && (
              <div className={styles['preview-markdown']}>
                {rawText ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <div style={{ overflowX: 'auto', margin: '14px 0' }}>
                          <table>{children}</table>
                        </div>
                      ),
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
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

            {/* 4. Markdown 源码视图 */}
            {fileType === 'markdown' && viewMode === 'raw' && (
              <div className={styles['preview-raw']}>
                {rawText || '暂无内容'}
              </div>
            )}

            {/* 5. 图片视图 */}
            {fileType === 'image' && (
              <div className={styles['preview-image-container']}>
                {blobUrl ? (
                  <img src={blobUrl} alt={node?.name} className={styles['preview-image']} />
                ) : (
                  <Spin />
                )}
              </div>
            )}

            {/* 6. CSV 表格视图 */}
            {fileType === 'csv' && viewMode === 'table' && csvParsed && (
              <Table
                columns={csvParsed.columns}
                dataSource={csvParsed.data}
                size="small"
                pagination={{ pageSize: 20, showSizeChanger: true }}
                scroll={{ x: 'max-content' }}
              />
            )}

            {/* 7. CSV 原始文本视图 */}
            {fileType === 'csv' && viewMode === 'raw' && (
              <div className={styles['preview-raw']}>
                {rawText || '暂无内容'}
              </div>
            )}

            {/* 8. 通用代码与纯文本 */}
            {!['markdown', 'pdf', 'image', 'csv'].includes(fileType) && (
              <div className={styles['preview-raw']}>
                {rawText || '暂无内容'}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
