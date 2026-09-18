import {
  DeleteOutlined,
  DownloadOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Card, Space, Tag, Upload } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import type { CoordinationAttachment } from '../../../api/workbenchCoordination';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';

interface VoucherAttachmentsCardProps {
  attachments: CoordinationAttachment[];
  fileList: UploadFile[];
  onFileListChange: (files: UploadFile[]) => void;
  disabled?: boolean;
  isActionable?: boolean;
}

export function VoucherAttachmentsCard({
  attachments = [],
  fileList = [],
  onFileListChange,
  disabled = false,
  isActionable = false,
}: VoucherAttachmentsCardProps) {
  const validOriginals = attachments.filter(
    (att) => Boolean(att && (att.url?.trim() || att.name?.trim()))
  );

  const totalCount = validOriginals.length + fileList.length;

  const renderFileIcon = (fileName?: string) => {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.pdf')) return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />;
    if (lower.match(/\.(jpg|jpeg|png|webp|gif)$/)) return <FileImageOutlined style={{ color: '#52c41a', fontSize: 16 }} />;
    return <FileTextOutlined style={{ color: '#1677ff', fontSize: 16 }} />;
  };

  return (
    <Card
      size="small"
      style={{
        borderRadius: 8,
        border: '1px solid var(--border-color, rgba(148, 163, 184, 0.18))',
        background: 'var(--bg-card, #ffffff)',
      }}
      title={
        <Space size={6} align="center">
          <PaperClipOutlined style={{ color: '#1677ff' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>业务凭证与佐证材料</span>
          <Tag color="blue" bordered={false} style={{ fontSize: 11, margin: 0 }}>
            {totalCount} 份材料
          </Tag>
        </Space>
      }
      extra={
        isActionable && !disabled ? (
          <Upload
            fileList={fileList}
            beforeUpload={(file) => {
              onFileListChange([...fileList, file]);
              return false;
            }}
            onRemove={(file) => {
              onFileListChange(fileList.filter((f) => f.uid !== file.uid));
            }}
            showUploadList={false}
          >
            <Button
              type="dashed"
              size="small"
              icon={<UploadOutlined />}
              style={{ fontSize: 12 }}
            >
              + 上传发票/凭据
            </Button>
          </Upload>
        ) : null
      }
    >
      {totalCount === 0 ? (
        <div style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
          暂无附加凭据或佐证材料
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 原有佐证材料 */}
          {validOriginals.map((att, idx) => {
            const resolvedUrl = replaceLocalhostWithCurrentHost(att.url);
            return (
              <div
                key={`voucher_orig_${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  borderRadius: 6,
                  background: 'var(--bg-secondary, rgba(148, 163, 184, 0.05))',
                  border: '1px solid var(--border-color, rgba(148, 163, 184, 0.12))',
                }}
              >
                <Space size={8} style={{ minWidth: 0, flex: 1 }}>
                  {renderFileIcon(att.name)}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={att.name}
                  >
                    {att.name || `凭证材料_${idx + 1}`}
                  </span>
                  <Tag color="default" bordered={false} style={{ fontSize: 10, margin: 0 }}>
                    历史已附凭据
                  </Tag>
                </Space>
                {resolvedUrl ? (
                  <Button
                    type="link"
                    size="small"
                    icon={<DownloadOutlined />}
                    href={resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, padding: 0 }}
                  >
                    查验下载
                  </Button>
                ) : null}
              </div>
            );
          })}

          {/* 本次新增佐证材料 */}
          {fileList.map((f) => (
            <div
              key={`new_file_${f.uid}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                borderRadius: 6,
                background: 'rgba(82, 196, 26, 0.06)',
                border: '1px solid rgba(82, 196, 26, 0.25)',
              }}
            >
              <Space size={8} style={{ minWidth: 0, flex: 1 }}>
                {renderFileIcon(f.name)}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={f.name}
                >
                  {f.name}
                </span>
                <Tag color="success" bordered={false} style={{ fontSize: 10, margin: 0 }}>
                  本次待附佐证
                </Tag>
              </Space>
              {isActionable && !disabled ? (
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => onFileListChange(fileList.filter((item) => item.uid !== f.uid))}
                  style={{ fontSize: 12, padding: 0 }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
