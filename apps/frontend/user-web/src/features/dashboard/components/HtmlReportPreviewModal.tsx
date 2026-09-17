import { useState } from 'react';
import {
  DownloadOutlined,
  ExportOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Button, Modal, Space, Tag } from 'antd';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';

interface HtmlReportPreviewModalProps {
  open: boolean;
  fileUrl?: string;
  fileName?: string;
  title?: string;
  onClose: () => void;
}

export function HtmlReportPreviewModal({
  open,
  fileUrl,
  fileName = '合同合规审查报告.html',
  title = '合同合规审查报告预览',
  onClose,
}: HtmlReportPreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(true);
  const resolvedUrl = replaceLocalhostWithCurrentHost(fileUrl);

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 32 }}>
          <Space size={8}>
            <SafetyCertificateOutlined style={{ color: '#1677ff', fontSize: 18 }} />
            <span style={{ fontWeight: 600 }}>{title}</span>
            <Tag color="blue" bordered={false}>
              系统智能合规诊断报告 · 左右分栏底稿
            </Tag>
          </Space>
          <Space size={8}>
            <Button
              size="small"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? '窗口模式' : '全屏预览'}
            </Button>
            {resolvedUrl ? (
              <>
                <Button
                  size="small"
                  icon={<ExportOutlined />}
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  新窗口查看
                </Button>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<DownloadOutlined />}
                  href={resolvedUrl}
                  download={fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  下载文件
                </Button>
              </>
            ) : null}
          </Space>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={isFullscreen ? '100vw' : '96vw'}
      style={
        isFullscreen
          ? { top: 0, margin: 0, padding: 0, maxWidth: '100vw' }
          : { top: 16, margin: '0 auto', maxWidth: '98vw' }
      }
      styles={{
        body: {
          padding: 0,
          background: 'var(--bg-card, #1e293b)',
          borderRadius: isFullscreen ? 0 : 8,
          overflow: 'hidden',
          height: isFullscreen ? 'calc(100vh - 64px)' : '84vh',
        },
      }}
      footer={null}
      destroyOnClose
    >
      {resolvedUrl ? (
        <iframe
          src={resolvedUrl}
          title={fileName}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            background: 'var(--bg-card, #ffffff)',
          }}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      ) : (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
          暂无可预览的审查报告链接
        </div>
      )}
    </Modal>
  );
}
