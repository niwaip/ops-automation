import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar, Space, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  GlobalOutlined,
  LogoutOutlined,
  BgColorsOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  buildNavigationMenuItems,
  getDefaultNavigationOpenKeys,
  getSelectedNavigationKey,
} from '@/app/navigation/menu';
import { ChatWidget } from '@/features/chat';
import ExecutionNotificationCenter from '@/features/notifications/ExecutionNotificationCenter';
import { buildUserWebUrl } from '@/shared/config/runtime';
import { useAuthStore } from '@/shared/store/authStore';
import { usePreferencesStore } from '@/shared/store/preferencesStore';

const { Header, Sider, Content } = Layout;
const MainLayout: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { language, setLanguage, theme, toggleTheme, sidebarCollapsed, toggleSidebar } =
    usePreferencesStore();
  const menuItems = buildNavigationMenuItems(t, user?.role);
  const selectedKey = getSelectedNavigationKey(location.pathname);
  const [openKeys, setOpenKeys] = useState<string[]>(getDefaultNavigationOpenKeys(location.pathname));

  let currentMenuLabel: React.ReactNode = '内部工作台';
  for (const item of menuItems || []) {
    if (!item) continue;
    if (item.key === selectedKey) {
      currentMenuLabel = (item as any).label;
      break;
    }
    if ('children' in item && item.children) {
      const child = item.children.find((c: any) => c?.key === selectedKey);
      if (child) {
        currentMenuLabel = (child as any).label;
        break;
      }
    }
  }

  useEffect(() => {
    setOpenKeys(getDefaultNavigationOpenKeys(location.pathname));
  }, [location.pathname]);

  const languageMenu: MenuProps = {
    items: [
      { key: 'zh-CN', label: '简体中文' },
      { key: 'en-US', label: 'English' },
      { key: 'ja-JP', label: '日本語' },
    ],
    onClick: ({ key }) => setLanguage(key as 'zh-CN' | 'en-US' | 'ja-JP'),
    selectedKeys: [language],
  };

  const userMenu: MenuProps = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: t('profile'),
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: t('logout'),
      },
    ],
    onClick: ({ key }) => {
      if (key === 'profile') {
        navigate('/profile');
        return;
      }
      if (key === 'logout') {
        logout();
        navigate('/login');
      }
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        className="portal-sider"
        collapsible
        collapsed={sidebarCollapsed}
        onCollapse={toggleSidebar}
        trigger={null}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          boxShadow: sidebarCollapsed
            ? '4px 0 24px rgba(0,0,0,0.15)'
            : '4px 0 24px rgba(0,0,0,0.1)',
          zIndex: 100,
        }}
      >
        {/* Logo Area */}
        <div
          className="portal-sider-logo"
          style={{
            height: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: sidebarCollapsed ? '0 16px' : '0 24px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            marginBottom: 8,
          }}
        >
          <div
            className="portal-sider-logo-inner"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: sidebarCollapsed ? 0 : 12,
            }}
          >
            <div
              className="portal-sider-logo-mark"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1 0%, #f472b6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)',
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div
                className="portal-sider-logo-text"
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: '#fff',
                  margin: 0,
                  letterSpacing: '-0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {t('appName')}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #6366f1 0%, #f472b6 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    padding: '1px 6px',
                    borderRadius: 8,
                    border: '1px solid rgba(244, 114, 182, 0.3)',
                    verticalAlign: 'middle',
                  }}
                >
                  AI
                </span>
              </div>
            )}
          </div>
        </div>

        <Menu
          className="portal-menu"
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{
            background: 'transparent',
            padding: '8px 0',
          }}
        />
      </Sider>

      <Layout
        style={{
          marginLeft: sidebarCollapsed ? 80 : 200,
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          background: 'var(--bg-primary)',
        }}
      >
        <Header
          style={{
            padding: '12px 24px',
            background: 'var(--bg-header)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            height: 'auto',
            minHeight: 64,
            lineHeight: 'normal',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--bg-secondary)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flex: '1 1 320px',
              minWidth: 0,
              flexWrap: 'wrap',
            }}
          >
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
            <Space size={8} wrap>
              <Tag color="purple" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                {currentMenuLabel}
              </Tag>
            </Space>
          </div>

          <Space size={12} wrap style={{ marginLeft: 'auto', justifyContent: 'flex-end' }}>
            <ExecutionNotificationCenter />

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
              {theme === 'light' ? t('darkTheme', { defaultValue: '深色' }) : t('lightTheme', { defaultValue: '浅色' })}
            </Button>

            <Button
              type="text"
              icon={<ExportOutlined />}
              href={buildUserWebUrl('/login')}
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--text-secondary)',
                borderRadius: 10,
                height: 36,
                padding: '0 12px',
              }}
            >
              {t('userPortal', { defaultValue: '用户入口' })}
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
                {language === 'zh-CN' ? t('zh-CN', { defaultValue: '中文' }) : language === 'en-US' ? t('en-US', { defaultValue: 'EN' }) : t('ja-JP', { defaultValue: '日本語' })}
              </Button>
            </Dropdown>

            <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
              <Space
                style={{
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 12,
                  background: 'var(--bg-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                <Avatar
                  size={32}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #f472b6 100%)',
                  }}
                >
                  {user?.username?.charAt(0).toUpperCase()}
                </Avatar>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {user?.username}
                </span>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: 24,
            padding: 0,
            minHeight: 'calc(100vh - 64px - 48px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
      <ChatWidget />
    </Layout>
  );
};

export default MainLayout;
