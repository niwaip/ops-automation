import { useState, useEffect } from 'react';
import {
  DownloadOutlined,
  ExportOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Button, Modal, Space, Tag } from 'antd';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';

export interface ReviewDraftPayload {
  executionId?: string;
  artifactId?: string;
  ruleSetId?: string;
  ruleSetVersion?: string;
  summaryText: string;
  stagedComments: any[];
  findingStates: Record<string, any>;
  approvalOpinions?: any[];
  sourceDocumentVersion?: string;
  action?: 'finish' | 'stage';
  stats?: {
    totalFindings: number;
    viewedCount: number;
    stagedCommentsCount: number;
    totalCommentsCount: number;
  };
}

export interface ContractReviewResultPayload {
  type?: 'CONTRACT_REVIEW_RESULT';
  action: 'finish' | 'stage';
  summaryText: string;
  stats?: {
    totalFindings: number;
    viewedCount: number;
    stagedCommentsCount: number;
    totalCommentsCount: number;
  };
  stagedComments?: any[];
  findingStates?: Record<string, any>;
  approvalOpinions?: any[];
  reviewDraft?: ReviewDraftPayload;
}

interface HtmlReportPreviewModalProps {
  open: boolean;
  fileUrl?: string;
  fileName?: string;
  title?: string;
  onClose: () => void;
  onReviewResult?: (result: ContractReviewResultPayload) => void;
}

export function HtmlReportPreviewModal({
  open,
  fileUrl,
  fileName = '合同合规审查报告.html',
  title = '合同合规审查报告预览',
  onClose,
  onReviewResult,
}: HtmlReportPreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(true);
  const resolvedUrl = replaceLocalhostWithCurrentHost(fileUrl);

  useEffect(() => {
    if (!open) return;

    let lastHandledTime = 0;
    let lastHandledDigest = '';

    const dispatchReviewResult = (payload: any) => {
      if (!payload || !onReviewResult) return;
      const now = Date.now();
      const digest = `${payload.action || ''}_${payload.summaryText || ''}_${payload.reviewDraft?.summaryText || ''}`;
      if (now - lastHandledTime < 1200 && digest === lastHandledDigest) {
        return;
      }
      lastHandledTime = now;
      lastHandledDigest = digest;
      onReviewResult(payload);
    };

    const handleMessage = (event: MessageEvent) => {
      // 安全校验：允许同源或者与报告资源 URL 同源的消息
      let fileOrigin = '';
      try {
        if (resolvedUrl) {
          fileOrigin = new URL(resolvedUrl, window.location.origin).origin;
        }
      } catch {
        // 忽略非有效 URL 的解析错误
      }

      if (event.origin !== window.location.origin && (!fileOrigin || event.origin !== fileOrigin)) {
        return;
      }

      if (event.data?.type === 'CONTRACT_REVIEW_RESULT') {
        dispatchReviewResult(event.data);
        if (event.data?.action === 'finish') {
          onClose();
        }
      } else if (event.data?.type === 'CONTRACT_REVIEW_CLOSE') {
        onClose();
      }
    };

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('CONTRACT_REVIEW_CHANNEL');
        bc.onmessage = (event) => {
          if (event.data?.type === 'CONTRACT_REVIEW_RESULT') {
            dispatchReviewResult(event.data);
            onClose();
          }
        };
      }
    } catch {
      // 忽略部分受限环境下 BroadcastChannel 实例创建异常
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'CONTRACT_REVIEW_LAST_RESULT' && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue);
          dispatchReviewResult(payload);
          onClose();
        } catch {
          // 忽略非 JSON 结构存储事件
        }
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
    };
  }, [open, onReviewResult, onClose]);

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
