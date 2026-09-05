import { MessageOutlined, MailOutlined, SettingOutlined } from '@ant-design/icons';
import { Space, Tabs, Typography } from 'antd';
import { Suspense, lazy, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const ImChannelsPage = lazy(() => import('../../im-channels/pages/ImChannelsPage'));
const UserEmailSettingsPage = lazy(() => import('../../email/pages/UserEmailSettingsPage'));

const { Title, Text } = Typography;

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeKey = rawTab === 'email' ? 'email' : 'im';

  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key });
  };

  const tabItems = useMemo(
    () => [
      {
        key: 'im',
        label: (
          <Space>
            <MessageOutlined />
            <span>IM 消息渠道</span>
          </Space>
        ),
        children: (
          <Suspense fallback={<div style={{ minHeight: 300, display: 'grid', placeItems: 'center' }}>加载中...</div>}>
            <ImChannelsPage />
          </Suspense>
        ),
      },
      {
        key: 'email',
        label: (
          <Space>
            <MailOutlined />
            <span>个人邮箱连接</span>
          </Space>
        ),
        children: (
          <Suspense fallback={<div style={{ minHeight: 300, display: 'grid', placeItems: 'center' }}>加载中...</div>}>
            <UserEmailSettingsPage />
          </Suspense>
        ),
      },
    ],
    []
  );

  return (
    <div style={{ width: '100%', maxWidth: 1120, margin: '0 auto', padding: '24px 20px 48px' }}>
      {/* 统一页头 */}
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <SettingOutlined style={{ color: 'var(--primary-color, #6366f1)' }} />
          系统设置与连接
        </Title>
        <Text type="secondary" style={{ fontSize: 14, marginTop: 4, display: 'block' }}>
          集中管理您的消息通信通道、外部应用集成与邮箱服务连接。
        </Text>
      </div>

      {/* 选项卡 */}
      <Tabs
        activeKey={activeKey}
        onChange={handleTabChange}
        items={tabItems}
        size="large"
        type="card"
        style={{ marginTop: 8 }}
      />
    </div>
  );
}

export default SettingsPage;
