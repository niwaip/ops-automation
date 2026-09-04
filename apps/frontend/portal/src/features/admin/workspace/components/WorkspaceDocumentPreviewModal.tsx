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
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
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
              background: '#ffffff',
              borderRadius: 6,
              border: '1px solid #f0f0f0',
            }}
          >
            {/* Markdown 渲染视图 */}
            {fileType === 'markdown' && viewMode === 'rendered' && (
              <div style={{ lineHeight: 1.7, fontSize: 14, wordBreak: 'break-word' }}>
                {rawText ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{rawText}</ReactMarkdown>
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
                  background: '#1a1a1a',
                  color: '#e0e0e0',
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
