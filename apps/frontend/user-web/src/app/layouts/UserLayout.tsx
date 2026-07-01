import {
  BellOutlined,
  BgColorsOutlined,
  MessageOutlined,
  DashboardOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  OrderedListOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown, Empty, Layout, Menu, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
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
import { UserChatWidget } from '@/features/chat/components/UserChatWidget';
import { authStore } from '../../adapters/auth/authStore';
import { notificationStore } from '../../adapters/notifications/notificationStore';
import { preferencesStore } from '../../adapters/preferences/preferencesStore';
import './UserLayout.css';

const { Header, Content, Sider } = Layout;
export function UserLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith('/chat');
  const user = useStore(authStore, (state) => state.user);
  const notifications = useStore(notificationStore, (state) => state.items);
  const unreadNotificationCount = useStore(
    notificationStore,
    (state) => state.items.filter((item) => item.unread).length
  );
  const markAsRead = useStore(notificationStore, (state) => state.markAsRead);
  const markAllAsRead = useStore(notificationStore, (state) => state.markAllAsRead);
  const language = useStore(preferencesStore, (state) => state.language);
  const setLanguage = useStore(preferencesStore, (state) => state.setLanguage);
  const theme = useStore(preferencesStore, (state) => state.theme);
  const toggleTheme = useStore(preferencesStore, (state) => state.toggleTheme);
  const sidebarCollapsed = useStore(preferencesStore, (state) => state.sidebarCollapsed);
  const toggleSidebar = useStore(preferencesStore, (state) => state.toggleSidebar);
  const setSidebarCollapsed = useStore(preferencesStore, (state) => state.setSidebarCollapsed);
  const selectedMenuKey = location.pathname.startsWith('/executions')
    ? '/executions'
    : location.pathname.startsWith('/published-skills')
      ? '/published-skills'
      : location.pathname.startsWith('/notifications')
        ? '/notifications'
        : location.pathname.startsWith('/chat')
          ? '/chat'
          : location.pathname.startsWith('/reports')
            ? '/reports'
            : location.pathname;
  const statusLabels =
    language === 'en-US' ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const previewNotifications = notifications
    .slice()
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 5);

  const languageMenu: MenuProps = {
    items: [
      { key: 'zh-CN', label: '简体中文' },
      { key: 'en-US', label: 'English' },
      { key: 'ja-JP', label: '日本語' },
    ],
    onClick: ({ key }) => void setLanguage(key as 'zh-CN' | 'en-US' | 'ja-JP'),
    selectedKeys: [language],
  };

  const userMenu: MenuProps = {
    items: [
      {
        key: 'chat',
        icon: <MessageOutlined />,
        label: '打开 AI 对话',
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
      },
    ],
    onClick: ({ key }) => {
      if (key === 'chat') {
        navigate('/chat');
        return;
      }
      authStore.getState().logout();
    },
  };
  const resolveActionPath = (actionUrl: string, source: string, sourceId: string): string => {
    if (source === 'execution') {
      return `/executions/${sourceId}`;
    }
    if (source === 'report') {
      return `/reports/${sourceId}`;
    }
    return actionUrl;
  };

  return (
    <Layout className="user-shell">
      <Sider
        className="user-shell-sider"
        collapsible
        collapsed={sidebarCollapsed}
        onCollapse={(collapsed) => setSidebarCollapsed(collapsed)}
        trigger={null}
      >
        <div
          className="user-shell-logo"
          style={{ padding: sidebarCollapsed ? '0 16px' : '0 24px' }}
        >
          <div className="user-shell-logo-inner" style={{ gap: sidebarCollapsed ? 0 : 12 }}>
            <div className="user-shell-logo-mark">U</div>
            {!sidebarCollapsed ? <div className="user-shell-logo-text">企业AI门户</div> : null}
          </div>
        </div>
        <Menu
          className="user-shell-menu"
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          onClick={({ key }) => navigate(key)}
          items={[
            { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
            { key: '/chat', icon: <MessageOutlined />, label: 'AI 对话' },
            { key: '/executions', icon: <OrderedListOutlined />, label: '执行列表' },
            { key: '/published-skills', icon: <ThunderboltOutlined />, label: '已发布技能' },
          ]}
        />
      </Sider>
      <Layout
        className="user-shell-main"
        style={{
          marginLeft: sidebarCollapsed ? 80 : 200,
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Header className="user-shell-header">
          <div className="user-shell-header-left">
            <Button
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSidebar}
              style={{
                fontSize: 18,
                color: 'var(--text-secondary)',
                width: 40,
                height: 40,
                borderRadius: 10,
              }}
            />
            <Space size={8}>
              <Tag color="blue" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                工作台
              </Tag>
            </Space>
          </div>
          <div className="user-shell-header-right">
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              popupRender={() => (
                <div
                  style={{
                    width: 360,
                    maxWidth: 'calc(100vw - 32px)',
                    background: 'var(--surface-primary)',
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
                            onClick={() => {
                              markAsRead(item.id);
                              navigate(
                                resolveActionPath(item.actionUrl, item.source, item.sourceId)
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
                              background: item.unread
                                ? 'rgba(59, 130, 246, 0.06)'
                                : 'var(--surface-secondary)',
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
                                style={{
                                  display: 'block',
                                  lineHeight: 1.6,
                                }}
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
              )}
            >
              <Button
                type="text"
                icon={
                  <Badge count={unreadNotificationCount} size="small" overflowCount={99}>
                    <BellOutlined />
                  </Badge>
                }
                style={{ color: 'var(--text-secondary)', borderRadius: 10, height: 36, width: 36 }}
              />
            </Dropdown>
            <Button
              type="text"
              icon={<BgColorsOutlined />}
              onClick={toggleTheme}
              style={{
                color: 'var(--text-secondary)',
                borderRadius: 10,
                height: 36,
                padding: '0 12px',
              }}
            >
              {theme === 'light' ? '深色' : '浅色'}
            </Button>
            <Dropdown menu={languageMenu} placement="bottomRight" trigger={['click']}>
              <Button
                type="text"
                icon={<GlobalOutlined />}
                style={{
                  color: 'var(--text-secondary)',
                  borderRadius: 10,
                  height: 36,
                  padding: '0 12px',
                }}
              >
                {language === 'zh-CN' ? '中文' : language === 'en-US' ? 'EN' : '日本語'}
              </Button>
            </Dropdown>
            <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
              <Space className="user-shell-user">
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #f472b6 100%)' }}
                />
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {user?.username || '未登录'}
                </span>
              </Space>
            </Dropdown>
          </div>
        </Header>
        <Content className={`user-shell-content${isChatRoute ? ' user-shell-content-chat' : ''}`}>
          <Outlet />
        </Content>
        <UserChatWidget />
      </Layout>
    </Layout>
  );
}
