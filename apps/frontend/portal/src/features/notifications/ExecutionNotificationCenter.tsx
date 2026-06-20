import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Empty, List, Popover, Segmented, Space, Tag, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { notificationApi } from '@/api/notification';
import { useNotificationStore } from '@/shared/store/notificationStore';
import { usePreferencesStore } from '@/shared/store/preferencesStore';
import type { AppNotification } from '@/shared/notifications/types';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
  EXECUTION_STATUS_VALUES,
} from '@/shared/lib/executionStatusMeta';

const { Text } = Typography;
type NotificationViewMode = 'action_required' | 'all';
const ACTIVE_POLLING_INTERVAL_MS = 10000;
const IDLE_POLLING_INTERVAL_MS = 60000;

const buildNotificationContent = (item: AppNotification, language: 'zh-CN' | 'en-US' | 'ja-JP') => {
  const isEnglish = language === 'en-US';
  const statusLabels = isEnglish ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const executionId = String(item.metadata?.executionId || item.sourceId);
  const failureReason =
    typeof item.metadata?.failureReason === 'string' ? item.metadata.failureReason : undefined;
  const takeoverReason =
    typeof item.metadata?.takeoverReason === 'string' ? item.metadata.takeoverReason : undefined;
  const approvalStatus =
    typeof item.metadata?.approvalStatus === 'string' ? item.metadata.approvalStatus : undefined;
  const skillId =
    typeof item.metadata?.skillId === 'string' ? item.metadata.skillId : item.sourceName;

  switch (item.category) {
    case 'completed':
      return {
        title: isEnglish ? 'Task Completed' : '任务已完成',
        description: isEnglish
          ? `Execution ${executionId} completed successfully.`
          : `执行单 ${executionId} 已成功完成。`,
        actionText: isEnglish ? 'View Details' : '查看详情',
      };
    case 'failed':
      return {
        title: isEnglish ? 'Task Failed' : '任务执行失败',
        description: failureReason
          ? isEnglish
            ? failureReason
            : `失败原因：${failureReason}`
          : isEnglish
            ? `Execution ${executionId} failed and needs attention.`
            : `执行单 ${executionId} 执行失败，请尽快处理。`,
        actionText: isEnglish ? 'View Details' : '查看详情',
      };
    case 'cancelled':
      return {
        title: isEnglish ? 'Task Interrupted' : '任务已中断',
        description: isEnglish
          ? `Execution ${executionId} was cancelled.`
          : `执行单 ${executionId} 已被中断或取消。`,
        actionText: isEnglish ? 'View Details' : '查看详情',
      };
    case 'human_control':
      return {
        title: isEnglish ? 'Manual Intervention Required' : '需要人工介入',
        description: takeoverReason
          ? isEnglish
            ? takeoverReason
            : `介入原因：${takeoverReason}`
          : isEnglish
            ? `Execution ${executionId} is waiting for manual takeover.`
            : `执行单 ${executionId} 正在等待人工接管。`,
        actionText: isEnglish ? 'Open Execution' : '查看详情',
      };
    case 'waiting_input':
      return {
        title: isEnglish ? 'Input Required' : '需要补充输入',
        description: isEnglish
          ? `Execution ${executionId} is waiting for additional input.`
          : `执行单 ${executionId} 正在等待补充输入。`,
        actionText: isEnglish ? 'Open Execution' : '查看详情',
      };
    case 'pending_approval':
      return {
        title: isEnglish ? 'Approval Required' : '需要审批处理',
        description: approvalStatus
          ? isEnglish
            ? `Current approval status: ${approvalStatus}.`
            : `当前审批状态：${approvalStatus}`
          : isEnglish
            ? `Execution ${executionId} is waiting for approval.`
            : `执行单 ${executionId} 正在等待审批。`,
        actionText: isEnglish ? 'Open Execution' : '查看详情',
      };
    default:
      return {
        title: isExecutionStatusValue(item.status)
          ? statusLabels[item.status]
          : isEnglish
            ? 'Status Updated'
            : '状态已更新',
        description: isEnglish
          ? `Execution ${executionId} has a status update.${skillId ? ` Skill: ${skillId}.` : ''}`
          : `执行单 ${executionId} 有新的状态变更。${skillId ? ` 技能：${skillId}。` : ''}`,
        actionText: isEnglish ? 'View Details' : '查看详情',
      };
  }
};

const getSeverityTagColor = (notification: AppNotification) => {
  switch (notification.severity) {
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'processing';
  }
};

const getSeverityText = (notification: AppNotification, language: 'zh-CN' | 'en-US' | 'ja-JP') => {
  const isEnglish = language === 'en-US';
  switch (notification.severity) {
    case 'success':
      return isEnglish ? 'Completed' : '已完成';
    case 'error':
      return isEnglish ? 'Attention' : '需处理';
    case 'warning':
      return isEnglish ? 'Pending' : '待处理';
    default:
      return isEnglish ? 'Info' : '通知';
  }
};

const getSourceText = (notification: AppNotification, language: 'zh-CN' | 'en-US' | 'ja-JP') => {
  if (notification.source === 'execution') {
    return language === 'en-US' ? 'Execution' : '执行管理';
  }
  return notification.source;
};

const isExecutionStatusValue = (
  value?: string
): value is (typeof EXECUTION_STATUS_VALUES)[number] =>
  typeof value === 'string' &&
  EXECUTION_STATUS_VALUES.includes(value as (typeof EXECUTION_STATUS_VALUES)[number]);

const hasPendingExecutionNotifications = (notifications: AppNotification[]) =>
  notifications.some((item) => item.source === 'execution' && item.requiresAction);

const ExecutionNotificationCenter: React.FC = () => {
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const { language } = usePreferencesStore();
  const items = useNotificationStore((state) => state.items);
  const syncNotifications = useNotificationStore((state) => state.syncNotifications);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const shownToastKeysRef = useRef<Set<string>>(new Set());
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [viewMode, setViewMode] = useState<NotificationViewMode>('all');

  const { data, isFetching } = useQuery(
    ['header-notifications'],
    () => notificationApi.list({ limit: 100 }),
    {
      refetchInterval: (latestData) =>
        hasPendingExecutionNotifications(latestData?.items ?? items)
          ? ACTIVE_POLLING_INTERVAL_MS
          : IDLE_POLLING_INTERVAL_MS,
      keepPreviousData: true,
    }
  );

  useEffect(() => {
    if (data?.items) {
      syncNotifications(data.items);
    }
  }, [data?.items, syncNotifications]);

  useEffect(() => {
    items
      .filter((item) => item.unread)
      .forEach((item) => {
        const toastKey = `${item.id}:${item.stateKey}`;
        if (shownToastKeysRef.current.has(toastKey)) {
          return;
        }

        shownToastKeysRef.current.add(toastKey);
        const contentMeta = buildNotificationContent(item, language);
        const openToast = notification[item.severity] || notification.open;

        openToast({
          key: toastKey,
          message: contentMeta.title,
          description: contentMeta.description,
          placement: 'topRight',
          duration: item.category === 'waiting_input' ? 5 : item.requiresAction ? 0 : 6,
          onClick: () => handleOpenNotification(item),
        });
      });
  }, [items, language, notification]);

  const unreadCount = useMemo(() => items.filter((item) => item.unread).length, [items]);

  const visibleItems = useMemo(
    () => (viewMode === 'action_required' ? items.filter((item) => item.requiresAction) : items),
    [items, viewMode]
  );

  const handleOpenNotification = (notificationItem: AppNotification) => {
    markAsRead(notificationItem.id);
    setPopoverOpen(false);
    navigate(notificationItem.actionUrl);
  };

  const statusLabels =
    language === 'en-US' ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const emptyText =
    language === 'en-US'
      ? viewMode === 'action_required'
        ? 'No pending actions'
        : 'No new notifications'
      : viewMode === 'action_required'
        ? '暂无待处理消息'
        : '暂无新消息';
  const titleText = language === 'en-US' ? 'Notifications' : '消息中心';
  const markAllText = language === 'en-US' ? 'Mark All Read' : '全部已读';
  const refreshingText = language === 'en-US' ? 'Refreshing...' : '刷新中...';
  const sourceLabelText = language === 'en-US' ? 'Source' : '来源';
  const filterOptions = [
    { label: language === 'en-US' ? 'All' : '全部', value: 'all' },
    { label: language === 'en-US' ? 'Action Required' : '待处理', value: 'action_required' },
  ];

  const content = (
    <div style={{ width: 380 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text strong>{titleText}</Text>
          <Space size={8}>
            {isFetching ? <Text type="secondary">{refreshingText}</Text> : null}
            <Button
              type="link"
              size="small"
              style={{ paddingInline: 0 }}
              onClick={() => markAllAsRead()}
            >
              {markAllText}
            </Button>
          </Space>
        </Space>

        <Segmented
          block
          options={filterOptions}
          value={viewMode}
          onChange={(value) => setViewMode(value as NotificationViewMode)}
        />

        {visibleItems.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
        ) : (
          <List
            dataSource={visibleItems}
            split
            renderItem={(item) => {
              const contentMeta = buildNotificationContent(item, language);

              return (
                <List.Item
                  key={item.id}
                  style={{
                    paddingInline: 0,
                    paddingBlock: 12,
                    alignItems: 'flex-start',
                  }}
                  actions={[
                    <Button
                      key="detail"
                      type="link"
                      size="small"
                      style={{ paddingInline: 0 }}
                      onClick={() => handleOpenNotification(item)}
                    >
                      {contentMeta.actionText}
                    </Button>,
                  ]}
                >
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Space wrap size={8}>
                      <Text strong>{contentMeta.title}</Text>
                      {isExecutionStatusValue(item.status) ? (
                        <Tag
                          color={EXECUTION_STATUS_COLORS[item.status]}
                          style={{ marginInlineEnd: 0, borderRadius: 999 }}
                        >
                          {statusLabels[item.status]}
                        </Tag>
                      ) : null}
                      <Tag
                        color={getSeverityTagColor(item)}
                        style={{ marginInlineEnd: 0, borderRadius: 999 }}
                      >
                        {getSeverityText(item, language)}
                      </Tag>
                      <Tag style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                        {`${sourceLabelText}: ${getSourceText(item, language)}`}
                      </Tag>
                      {item.unread ? (
                        <Tag color="blue" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                          {language === 'en-US' ? 'Unread' : '未读'}
                        </Tag>
                      ) : null}
                    </Space>
                    <Text type="secondary" style={{ lineHeight: 1.6 }}>
                      {contentMeta.description}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </Text>
                  </Space>
                </List.Item>
              );
            }}
          />
        )}
      </Space>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <Button
          type="text"
          icon={<BellOutlined />}
          style={{
            color: 'var(--text-secondary)',
            borderRadius: 10,
            height: 36,
            width: 36,
          }}
          aria-label={titleText}
        />
      </Badge>
    </Popover>
  );
};

export default ExecutionNotificationCenter;
