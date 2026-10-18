import { useState } from 'react';
import { Button, Empty, Space, Tag, Typography } from 'antd';
import { EyeOutlined, DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { reminderApi } from '@/api';
import { useStore } from 'zustand';
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
import { resolveNotificationActionPath } from '@/shared/utils/notificationNavigation';
import { notificationStore } from '../../../adapters/notifications/notificationStore';
import { NotificationDetailModal } from './NotificationDetailModal';
import styles from '../UserLayout.module.css';

type Language = 'zh-CN' | 'en-US' | 'ja-JP';

interface NotificationPreviewPanelProps {
  language: Language;
}

function formatFriendlyTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return timestamp;
  }
}

/**
 * 通知铃铛下拉内的预览面板（含头部操作条 + 最新 5 条列表 + 详情快速弹窗）。
 */
export function NotificationPreviewPanel({ language }: NotificationPreviewPanelProps) {
  const { t } = useTranslation('notification');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

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

  const handleNavigate = (item: AppNotification) => {
    markAsRead(item.id);
    if (item.source === 'reminder') {
      void reminderApi.markRead(item.sourceId).then(() => queryClient.invalidateQueries(['user-web-notifications']));
    }
    navigate(
      resolveNotificationActionPath(item.actionUrl, item.source, item.sourceId)
    );
  };

  return (
    <>
      <div
        className={styles['user-shell-notification-panel']}
        style={{
          width: 380,
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
            <Typography.Text strong style={{ fontSize: 15 }}>{t('preview_title', '通知预览')}</Typography.Text>
            <div style={{ marginTop: 2 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {unreadNotificationCount > 0
                  ? t('unread_count', { count: unreadNotificationCount, defaultValue: `未读 ${unreadNotificationCount} 条` })
                  : t('no_unread', '当前没有未读通知')}
              </Typography.Text>
            </div>
          </div>
          <Space size={4}>
            <Button
              type="link"
              size="small"
              disabled={unreadNotificationCount === 0}
              onClick={() => {
                markAllAsRead();
                void reminderApi.markAllRead().then(() => queryClient.invalidateQueries(['user-web-notifications']));
              }}
            >
              {t('mark_all_read', '全部已读')}
            </Button>
            <Button type="link" size="small" onClick={() => navigate('/notifications')}>
              {t('view_all', '查看全部')}
            </Button>
          </Space>
        </Space>
        {previewNotifications.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('no_unread', '暂无通知')}
            style={{ margin: '20px 0 8px' }}
          />
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {previewNotifications.map((item) => {
              const isCoordination = item.source === 'coordination';
              const isApproval = item.metadata?.taskType === 'approval';
              const sender = (item.metadata?.sender as string) || item.sourceName;
              const content = buildNotificationContent(item, language);
              const downloadUrl = item.metadata?.downloadUrl as string | undefined;

              return (
                <div
                  key={item.id}
                  className={`${styles['user-shell-notification-item']}${item.unread ? ` ${styles['is-unread']}` : ''}`}
                  onClick={() => handleNavigate(item)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: item.unread
                      ? '1px solid rgba(59, 130, 246, 0.32)'
                      : '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    {/* 头部标题与单一状态标签 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <Typography.Text
                          strong
                          ellipsis={{ tooltip: content.title }}
                          style={{ fontSize: 13, color: 'var(--text-primary)' }}
                        >
                          {content.title}
                        </Typography.Text>
                        {isCoordination ? (
                          <>
                            <Tag color={isApproval ? 'orange' : 'cyan'} style={{ margin: 0, fontSize: 11, padding: '0 4px' }}>
                              {isApproval ? '审批承认' : '协同任务'}
                            </Tag>
                            {sender ? <Tag color="geekblue" style={{ margin: 0, fontSize: 11, padding: '0 4px' }}>@{sender}</Tag> : null}
                          </>
                        ) : isExecutionStatusValue(item.status) ? (
                          <Tag color={EXECUTION_STATUS_COLORS[item.status]} style={{ margin: 0, fontSize: 11, padding: '0 4px' }}>
                            {statusLabels[item.status]}
                          </Tag>
                        ) : (
                          <Tag color={getNotificationSeverityTagColor(item.severity)} style={{ margin: 0, fontSize: 11, padding: '0 4px' }}>
                            {getNotificationSeverityText(item.severity, language)}
                          </Tag>
                        )}
                        {item.unread ? <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>未读</Tag> : null}
                      </div>
                    </div>

                    {/* 精炼摘要（严格限制 2 行截断，杜绝大段刷屏） */}
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2, tooltip: false }}
                      style={{
                        margin: '2px 0 4px',
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: 'var(--text-secondary)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {content.description}
                    </Typography.Paragraph>

                    {/* 底部多维操作与展现条 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 2,
                        paddingTop: 4,
                        borderTop: '1px dashed color-mix(in srgb, var(--border-color) 70%, transparent 30%)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {formatFriendlyTime(item.timestamp)}
                      </span>
                      <Space size={2}>
                        {content.fullMarkdown ? (
                          <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            style={{ fontSize: 11, padding: '0 6px', height: 22, color: 'var(--primary-color)' }}
                            onClick={() => setSelectedNotification(item)}
                          >
                            快速查看
                          </Button>
                        ) : null}
                        {downloadUrl ? (
                          <Button
                            type="text"
                            size="small"
                            icon={<DownloadOutlined />}
                            style={{ fontSize: 11, padding: '0 6px', height: 22 }}
                            href={downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            产物
                          </Button>
                        ) : null}
                        <Button
                          type="link"
                          size="small"
                          icon={<ExportOutlined />}
                          style={{ fontSize: 11, padding: '0 4px', height: 22 }}
                          onClick={() => handleNavigate(item)}
                        >
                          {content.actionText}
                        </Button>
                      </Space>
                    </div>
                  </Space>
                </div>
              );
            })}
          </Space>
        )}
      </div>

      {/* 完整 Markdown 详情弹窗（支持直接查看、复制、下载，无需跳页） */}
      <NotificationDetailModal
        open={Boolean(selectedNotification)}
        notification={selectedNotification}
        language={language}
        zIndex={1500}
        onClose={() => setSelectedNotification(null)}
        onNavigate={(actionUrl) => {
          if (selectedNotification) {
            handleNavigate(selectedNotification);
          } else {
            navigate(actionUrl);
          }
        }}
      />
    </>
  );
}
