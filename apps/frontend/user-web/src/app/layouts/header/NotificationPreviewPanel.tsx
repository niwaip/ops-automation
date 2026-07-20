import { Button, Empty, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useStore } from 'zustand';
import {
  buildNotificationContent,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
  getNotificationSeverityTagColor,
  getNotificationSeverityText,
  isExecutionStatusValue,
} from '@ops/user-core';
import { resolveNotificationActionPath } from '@/shared/utils/notificationNavigation';
import { notificationStore } from '../../../adapters/notifications/notificationStore';

type Language = 'zh-CN' | 'en-US' | 'ja-JP';

interface NotificationPreviewPanelProps {
  language: Language;
}

/**
 * 通知铃铛下拉内的预览面板（含头部操作条 + 最新 5 条列表）。
 *
 * 单独成文件以便 `NotificationBell` 主体保持在阈值行数内。
 */
export function NotificationPreviewPanel({ language }: NotificationPreviewPanelProps) {
  const navigate = useNavigate();
  const notifications = useStore(notificationStore, (state) => state.items);
  const unreadNotificationCount = useStore(
    notificationStore,
    (state) => state.items.filter((item) => item.unread).length
  );
  const markAsRead = useStore(notificationStore, (state) => state.markAsRead);
  const markAllAsRead = useStore(notificationStore, (state) => state.markAllAsRead);
  const statusLabels = language === 'en-US' ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const previewNotifications = notifications
    .slice()
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 5);

  return (
    <div
      className="user-shell-notification-panel"
      style={{
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        border: '1px solid var(--border-color)',
        borderRadius: 16,
        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.16)',
        padding: 12,
      }}
    >
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}
        align="start"
      >
        <div>
          <Typography.Text strong>通知预览</Typography.Text>
          <div style={{ marginTop: 4 }}>
            <Typography.Text type="secondary">
              {unreadNotificationCount > 0
                ? `未读 ${unreadNotificationCount} 条`
                : '当前没有未读通知'}
            </Typography.Text>
          </div>
        </div>
        <Space size={4}>
          <Button
            type="link"
            size="small"
            disabled={unreadNotificationCount === 0}
            onClick={() => markAllAsRead()}
          >
            全部已读
          </Button>
          <Button type="link" size="small" onClick={() => navigate('/notifications')}>
            查看全部
          </Button>
        </Space>
      </Space>
      {previewNotifications.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无通知"
          style={{ margin: '20px 0 8px' }}
        />
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {previewNotifications.map((item) => {
            const content = buildNotificationContent(item, language);
            return (
              <button
                key={item.id}
                type="button"
                className={`user-shell-notification-item${item.unread ? ' is-unread' : ''}`}
                onClick={() => {
                  markAsRead(item.id);
                  navigate(
                    resolveNotificationActionPath(item.actionUrl, item.source, item.sourceId)
                  );
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: item.unread
                    ? '1px solid rgba(59, 130, 246, 0.24)'
                    : '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: 12,
                  cursor: 'pointer',
                }}
              >
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space wrap size={[6, 6]}>
                    <Typography.Text strong>{content.title}</Typography.Text>
                    {isExecutionStatusValue(item.status) ? (
                      <Tag color={EXECUTION_STATUS_COLORS[item.status]}>
                        {statusLabels[item.status]}
                      </Tag>
                    ) : null}
                    <Tag color={getNotificationSeverityTagColor(item.severity)}>
                      {getNotificationSeverityText(item.severity, language)}
                    </Tag>
                    {item.unread ? <Tag color="blue">未读</Tag> : null}
                  </Space>
                  <Typography.Text
                    type="secondary"
                    style={{ display: 'block', lineHeight: 1.6 }}
                  >
                    {content.description}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {new Date(item.timestamp).toLocaleString()}
                  </Typography.Text>
                </Space>
              </button>
            );
          })}
        </Space>
      )}
    </div>
  );
}
