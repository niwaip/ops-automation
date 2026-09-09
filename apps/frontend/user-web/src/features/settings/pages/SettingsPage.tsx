import { MessageOutlined, MailOutlined, SettingOutlined, KeyOutlined } from '@ant-design/icons';
import { Alert, Button, Space, Tabs, Typography } from 'antd';
import { Component, Suspense, lazy, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

const ImChannelsPage = lazy(() => import('../../im-channels/pages/ImChannelsPage'));
const UserEmailSettingsPage = lazy(() => import('../../email/pages/UserEmailSettingsPage'));
const UserCredentialVaultPanel = lazy(() => import('../components/UserCredentialVaultPanel'));

const { Title, Text } = Typography;

interface TabErrorBoundaryProps {
  children: ReactNode;
}
interface TabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  constructor(props: TabErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Settings tab error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          type="error"
          showIcon
          message="面板加载异常"
          description={
            <div style={{ marginTop: 8 }}>
              <div style={{ marginBottom: 12 }}>{this.state.error?.message || '组件渲染失败'}</div>
              <Button size="small" onClick={() => this.setState({ hasError: false, error: null })}>
                重试加载
              </Button>
            </div>
          }
          style={{ margin: '24px 0', borderRadius: 8 }}
        />
      );
    }
    return this.props.children;
  }
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeKey = rawTab === 'credentials' ? 'credentials' : rawTab === 'email' ? 'email' : 'im';

  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key });
  };

  const tabItems = useMemo(
    () => [
      {
        key: 'credentials',
        label: (
          <Space>
            <KeyOutlined />
            <span>凭证与密钥中心</span>
          </Space>
        ),
        children: (
          <TabErrorBoundary>
            <Suspense fallback={<div style={{ minHeight: 300, display: 'grid', placeItems: 'center' }}>加载中...</div>}>
              <UserCredentialVaultPanel />
            </Suspense>
          </TabErrorBoundary>
        ),
      },
      {
        key: 'im',
        label: (
          <Space>
            <MessageOutlined />
            <span>IM 消息渠道</span>
          </Space>
        ),
        children: (
          <TabErrorBoundary>
            <Suspense fallback={<div style={{ minHeight: 300, display: 'grid', placeItems: 'center' }}>加载中...</div>}>
              <ImChannelsPage />
            </Suspense>
          </TabErrorBoundary>
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
          <TabErrorBoundary>
            <Suspense fallback={<div style={{ minHeight: 300, display: 'grid', placeItems: 'center' }}>加载中...</div>}>
              <UserEmailSettingsPage />
            </Suspense>
          </TabErrorBoundary>
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
