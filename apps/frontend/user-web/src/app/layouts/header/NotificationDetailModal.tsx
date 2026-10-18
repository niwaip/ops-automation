import React from 'react';
import { Button, Divider, Modal, Space, Tag, Typography, message as antdMessage } from 'antd';
import {
  CopyOutlined,
  DownloadOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import {
  buildNotificationContent,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
  getNotificationSeverityTagColor,
  getNotificationSeverityText,
  isExecutionStatusValue,
  type AppNotification,
} from '@ops/user-core';
import SharedMessageContentRenderer from '@chat-web/components/MessageContentRenderer';
import { copyTextToClipboard } from '../../../adapters/platform/browserClipboard';

interface NotificationDetailModalProps {
  open: boolean;
  notification: AppNotification | null;
  language?: 'zh-CN' | 'en-US' | 'ja-JP';
  zIndex?: number;
  onClose: () => void;
  onNavigate?: (actionUrl: string) => void;
}

export const NotificationDetailModal: React.FC<NotificationDetailModalProps> = ({
  open,
  notification,
  language = 'zh-CN',
  zIndex = 1500,
  onClose,
  onNavigate,
}) => {
  if (!notification) {
    return null;
  }

  const statusLabels = language === 'en-US' ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const content = buildNotificationContent(notification, language);
  const isCoordination = notification.source === 'coordination';
  const isApproval = notification.metadata?.taskType === 'approval';
  const sender = (notification.metadata?.sender as string) || notification.sourceName;
  const downloadUrl = notification.metadata?.downloadUrl as string | undefined;

  const markdownToDisplay =
    content.fullMarkdown ||
    (notification.metadata?.resultSummary as string) ||
    content.description;

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(markdownToDisplay);
      void antdMessage.success('已复制到剪贴板');
    } catch {
      void antdMessage.error('复制失败');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      zIndex={zIndex}
      width={640}
      title={
        <Space wrap size={[8, 8]} align="center" style={{ maxWidth: '90%' }}>
          <Typography.Text strong style={{ fontSize: 16 }}>
            {content.title}
          </Typography.Text>
          {isCoordination ? (
            <>
              <Tag color={isApproval ? 'orange' : 'cyan'}>
                {isApproval ? '审批承认' : '协同任务'}
              </Tag>
              {sender ? <Tag color="geekblue">@{sender}</Tag> : null}
            </>
          ) : isExecutionStatusValue(notification.status) ? (
            <Tag color={EXECUTION_STATUS_COLORS[notification.status]}>
              {statusLabels[notification.status]}
            </Tag>
          ) : (
            <Tag color={getNotificationSeverityTagColor(notification.severity)}>
              {getNotificationSeverityText(notification.severity, language)}
            </Tag>
          )}
          {notification.unread ? <Tag color="blue">未读</Tag> : null}
        </Space>
      }
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopy}>
          复制内容
        </Button>,
        downloadUrl ? (
          <Button
            key="download"
            icon={<DownloadOutlined />}
            type="default"
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            下载产物
          </Button>
        ) : null,
        onNavigate && notification.actionUrl ? (
          <Button
            key="navigate"
            type="primary"
            icon={<ExportOutlined />}
            onClick={() => {
              onClose();
              onNavigate(notification.actionUrl);
            }}
          >
            {content.actionText}
          </Button>
        ) : (
          <Button key="close" onClick={onClose}>
            关闭
          </Button>
        ),
      ]}
    >
      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          通知时间：{new Date(notification.timestamp).toLocaleString(language === 'en-US' ? 'en-US' : 'zh-CN')}
        </Typography.Text>
      </div>

      <Divider style={{ margin: '8px 0 16px' }} />

      <div
        style={{
          maxHeight: '60vh',
          overflowY: 'auto',
          paddingRight: 6,
          lineHeight: 1.7,
        }}
      >
        <SharedMessageContentRenderer
          content={markdownToDisplay}
          mode="markdown"
        />
      </div>
    </Modal>
  );
};
