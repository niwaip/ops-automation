import { BellOutlined } from '@ant-design/icons';
import { Badge, Button, Dropdown } from 'antd';
import { useStore } from 'zustand';
import { notificationStore } from '../../../adapters/notifications/notificationStore';
import { NotificationPreviewPanel } from './NotificationPreviewPanel';

type Language = 'zh-CN' | 'en-US' | 'ja-JP';

interface NotificationBellProps {
  language: Language;
}

/**
 * 通知铃铛 + 下拉预览面板。
 *
 * 未读数来自 `notificationStore`；预览面板内容抽到 `NotificationPreviewPanel`。
 */
export function NotificationBell({ language }: NotificationBellProps) {
  const unreadNotificationCount = useStore(
    notificationStore,
    (state) => state.items.filter((item) => item.unread).length
  );

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      popupRender={() => <NotificationPreviewPanel language={language} />}
    >
      <Button
        type="text"
        className="user-shell-header-icon-button user-shell-notification-button"
        icon={
          <Badge count={unreadNotificationCount} size="small" overflowCount={99}>
            <BellOutlined />
          </Badge>
        }
        style={{ color: 'var(--text-secondary)', borderRadius: 10, height: 36, width: 36 }}
      />
    </Dropdown>
  );
}
