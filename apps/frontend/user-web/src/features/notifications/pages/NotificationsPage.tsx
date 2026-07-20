import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Empty, List, Space, Tag, Typography } from 'antd';
import { useMemo } from 'react';
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
} from '@ops/user-core';
import { useStore } from 'zustand';
import { preferencesStore } from '../../../adapters/preferences/preferencesStore';
import { useNotificationStore } from '../../../adapters/notifications/notificationStore';
import { resolveNotificationActionPath } from '@/shared/utils/notificationNavigation';

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    language === 'en-US' ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const resolveDownloadUrl = (item: (typeof items)[number]): string | undefined =>
    typeof item.metadata?.downloadUrl === 'string' && item.metadata.downloadUrl.trim()
      ? item.metadata.downloadUrl
      : undefined;
  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            通知中心
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            当前先提供页面化列表，聚合普通用户可见的执行通知，不引入管理员侧的复杂弹层和调试链路。
          </Typography.Paragraph>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void queryClient.refetchQueries(['user-web-notifications'])}
          loading={isFetching}
        >
          刷新
        </Button>
      </Space>
      {sortedItems.length === 0 && initialized && !isFetching ? (
        <Empty description="暂无通知" />
      ) : (
        <List
          loading={!initialized && isFetching}
          dataSource={sortedItems}
          renderItem={(item) => {
            const content = buildNotificationContent(item, language);
            return (
              <List.Item
                key={item.id}
                actions={[
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
                    onClick={() =>
                      navigate(
                        resolveNotificationActionPath(item.actionUrl, item.source, item.sourceId)
                      )
                    }
                  >
                    {content.actionText}
                  </Button>,
                ]}
              >
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space wrap size={8}>
                    <Typography.Text strong>{content.title}</Typography.Text>
                    {isExecutionStatusValue(item.status) ? (
                      <Tag color={EXECUTION_STATUS_COLORS[item.status]}>
                        {statusLabels[item.status]}
                      </Tag>
                    ) : null}
                    <Tag color={getNotificationSeverityTagColor(item.severity)}>
                      {getNotificationSeverityText(item.severity, language)}
                    </Tag>
                    {item.requiresAction ? <Tag color="warning">待处理</Tag> : null}
                  </Space>
                  <Typography.Text type="secondary">{content.description}</Typography.Text>
                  <Typography.Text type="secondary">
                    {new Date(item.timestamp).toLocaleString()}
                  </Typography.Text>
                </Space>
              </List.Item>
            );
          }}
        />
      )}
    </Card>
  );
}
