import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Dropdown, Empty, List, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useIsFetching, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
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
import { useStore } from 'zustand';
import { preferencesStore } from '../../../adapters/preferences/preferencesStore';
import { useNotificationStore } from '../../../adapters/notifications/notificationStore';
import { resolveNotificationActionPath } from '@/shared/utils/notificationNavigation';
import { reminderApi } from '@/api';
import { useTranslation } from 'react-i18next';
import { NotificationDetailModal } from '../../../app/layouts/header/NotificationDetailModal';

const EXECUTION_STATUS_LABELS_JA: Record<string, string> = {
  draft: '下書き',
  queued: '待機中',
  running: '実行中',
  waiting_input: '入力待ち',
  pending_approval: '承認待ち',
  human_control: '手動介入',
  paused: '一時停止',
  succeeded: '完了',
  failed: '失敗',
  cancelled: 'キャンセル済',
  rolled_back: 'ロールバック済',
};

export function NotificationsPage() {
  const { t } = useTranslation('notification');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  const language = useStore(preferencesStore, (state) => state.language);
  const items = useNotificationStore((state) => state.items);
  const initialized = useNotificationStore((state) => state.initialized);
  const isFetching = useIsFetching(['user-web-notifications']) > 0;

  const sortedItems = useMemo(
    () =>
      items
        .slice()
        .sort(
          (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
        ),
    [items]
  );

  const statusLabels =
    language === 'en-US'
      ? EXECUTION_STATUS_LABELS_EN
      : language === 'ja-JP'
        ? EXECUTION_STATUS_LABELS_JA
        : EXECUTION_STATUS_LABELS_ZH;
  const resolveDownloadUrl = (item: (typeof items)[number]): string | undefined =>
    typeof item.metadata?.downloadUrl === 'string' && item.metadata.downloadUrl.trim()
      ? item.metadata.downloadUrl
      : undefined;
  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t('page_title', '通知中心')}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {t('page_subtitle', '聚合普通用户可见的执行通知与提醒')}
          </Typography.Paragraph>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void queryClient.refetchQueries(['user-web-notifications'])}
          loading={isFetching}
        >
          {t('refresh', '刷新')}
        </Button>
      </Space>
      {sortedItems.length === 0 && initialized && !isFetching ? (
        <Empty description="暂无通知" />
      ) : (
        <List
          loading={!initialized && isFetching}
          dataSource={sortedItems}
          renderItem={(item) => {
            const isCoordination = item.source === 'coordination';
            const isApproval = item.metadata?.taskType === 'approval';
            const sender = (item.metadata?.sender as string) || item.sourceName;
            const content = buildNotificationContent(item, language);
            const refresh = () => void queryClient.invalidateQueries(['user-web-notifications']);

            return (
              <List.Item
                key={item.id}
                actions={[
                  ...(item.source === 'reminder' ? [
                    <Button key="read" type="link" disabled={!item.unread}
                      onClick={() => void reminderApi.markRead(item.sourceId).then(refresh)}>标为已读</Button>,
                    <Dropdown key="snooze" menu={{ items: [
                      { key: '10', label: '10 分钟后' },
                      { key: '60', label: '1 小时后' },
                      { key: '1440', label: '明天此时' },
                    ], onClick: ({ key }) => void reminderApi.snooze(item.sourceId, Number(key) as 10 | 60 | 1440).then(refresh) }}>
                      <Button type="link">稍后提醒</Button>
                    </Dropdown>,
                  ] : []),
                  ...(content.fullMarkdown ? [
                    <Button
                      key="quick-view"
                      type="link"
                      icon={<EyeOutlined />}
                      onClick={() => setSelectedNotification(item)}
                    >
                      快速查看
                    </Button>,
                  ] : []),
                  ...(resolveDownloadUrl(item)
                    ? [
                        <Button
                          key="download"
                          type="link"
                          href={resolveDownloadUrl(item)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          下载结果
                        </Button>,
                      ]
                    : []),
                  <Button
                    key="open"
                    type="link"
                    onClick={() => {
                      if (item.source === 'reminder') {
                        void reminderApi.markRead(item.sourceId).then(refresh);
                      }
                      navigate(
                        resolveNotificationActionPath(item.actionUrl, item.source, item.sourceId)
                      );
                    }}
                  >
                    {content.actionText}
                  </Button>,
                ]}
              >
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space wrap size={8}>
                    <Typography.Text strong>{content.title}</Typography.Text>
                    {isCoordination ? (
                      <>
                        <Tag color={isApproval ? 'orange' : 'cyan'}>
                          {isApproval ? '审批承认' : '协同任务'}
                        </Tag>
                        {sender ? <Tag color="geekblue">@{sender}</Tag> : null}
                      </>
                    ) : isExecutionStatusValue(item.status) ? (
                      <Tag color={EXECUTION_STATUS_COLORS[item.status]}>
                        {statusLabels[item.status]}
                      </Tag>
                    ) : (
                      <Tag color={getNotificationSeverityTagColor(item.severity)}>
                        {getNotificationSeverityText(item.severity, language)}
                      </Tag>
                    )}
                    {item.unread ? <Tag color="blue">未读</Tag> : null}
                    {item.requiresAction && !isCoordination ? <Tag color="warning">待处理</Tag> : null}
                  </Space>
                  <Typography.Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2, tooltip: false }}
                    style={{ margin: 0, wordBreak: 'break-word', lineHeight: 1.6 }}
                  >
                    {content.description}
                  </Typography.Paragraph>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(item.timestamp).toLocaleString()}
                  </Typography.Text>
                </Space>
              </List.Item>
            );
          }}
        />
      )}

      {/* 完整 Markdown 详情弹窗 */}
      <NotificationDetailModal
        open={Boolean(selectedNotification)}
        notification={selectedNotification}
        language={language}
        onClose={() => setSelectedNotification(null)}
        onNavigate={(actionUrl) => {
          navigate(actionUrl);
        }}
      />
    </Card>
  );
}
