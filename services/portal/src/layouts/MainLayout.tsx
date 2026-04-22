import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar, Space, Tooltip } from 'antd';
import {
  DashboardOutlined,
  DesktopOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  SettingOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  GlobalOutlined,
  LogoutOutlined,
  SunOutlined,
  MoonOutlined,
  PlusCircleOutlined,
  FilePdfOutlined,
  BarChartOutlined,
  FileWordOutlined,
  ThunderboltOutlined,
  OrderedListOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { ChatWidget } from '../components/chat';

const { Header, Sider, Content } = Layout;

const MainLayout: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, language, setLanguage, sidebarCollapsed, toggleSidebar } = useAuthStore();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: t('dashboard'),
    },
    {
      key: '/sessions/new',
      icon: <PlusCircleOutlined />,
      label: t('newSession'),
    },
    {
      key: '/sessions',
      icon: <DesktopOutlined />,
      label: t('sessions'),
    },
    {
      key: '/templates',
      icon: <FileTextOutlined />,
      label: t('templates'),
    },
    {
      key: '/report-templates',
      icon: <FilePdfOutlined />,
      label: t('reportTemplates'),
    },
    {
      key: '/reports',
      icon: <BarChartOutlined />,
      label: t('reports'),
    },
    {
      key: '/carbone-templates',
      icon: <FileWordOutlined />,
      label: t('carboneTemplates'),
    },
    {
      key: '/recorder',
      icon: <VideoCameraOutlined />,
      label: t('recorder'),
    },
    ...(user?.role === 'admin'
      ? [
          {
            key: '/admin',
            icon: <SettingOutlined />,
            label: t('admin'),
            children: [
              {
                key: '/admin/users',
                icon: <UserOutlined />,
                label: t('users'),
              },
              {
                key: '/admin/models',
                icon: <SettingOutlined />,
                label: t('models'),
              },
              {
                key: '/admin/skills',
                icon: <ThunderboltOutlined />,
                label: t('skills'),
              },
              {
                key: '/admin/execution-flows',
                icon: <OrderedListOutlined />,
                label: t('executionFlows'),
              },
              {
                key: '/admin/temporal-workflows',
                icon: <ThunderboltOutlined />,
                label: 'Temporal工作流',
              },
              {
                key: '/admin/activities',
<<<<<<< HEAD
                icon: <SettingOutlined />,
=======
                icon: <ThunderboltOutlined />,
>>>>>>> 326e2d06510e0b3ff127d572df7deb4ecb7b1191
                label: 'Activity管理',
              },
            ],
          },
        ]
      : []),
  ];

  const languageMenu = (
    <Menu
      items={[
        { key: 'zh-CN', label: '简体中文' },
        { key: 'en-US', label: 'English' },
        { key: 'ja-JP', label: '日本語' },
      ]}
      onClick={({ key }) => setLanguage(key as 'zh-CN' | 'en-US' | 'ja-JP')}
      selectedKeys={[language]}
    />
  );

  const userMenu = (
    <Menu
      items={[
        {
          key: 'profile',
          icon: <UserOutlined />,
          label: t('profile'),
          onClick: () => navigate('/profile'),
        },
        {
          key: 'logout',
          icon: <LogoutOutlined />,
          label: t('logout'),
          onClick: () => {
            logout();
            navigate('/login');
          },
        },
      ]}
    />
  );

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/sessions/new') return '/sessions/new';
    if (path.startsWith('/sessions')) return '/sessions';
    if (path.startsWith('/templates')) return '/templates';
    if (path.startsWith('/report-templates')) return '/report-templates';
    if (path.startsWith('/reports')) return '/reports';
    if (path.startsWith('/carbone-templates')) return '/carbone-templates';
    if (path.startsWith('/admin/users')) return '/admin/users';
    if (path.startsWith('/admin/models')) return '/admin/models';
    if (path.startsWith('/admin/skills')) return '/admin/skills';
    if (path.startsWith('/admin/execution-flows')) return '/admin/execution-flows';
    if (path.startsWith('/admin/temporal-workflows')) return '/admin/temporal-workflows';
    if (path.startsWith('/admin/activities')) return '/admin/activities';
    return path;
  };

  const getOpenKey = () => {
    const path = location.pathname;
    if (path.startsWith('/admin')) return '/admin';
    return undefined;
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
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
          boxShadow: sidebarCollapsed ? '4px 0 24px rgba(0,0,0,0.15)' : '4px 0 24px rgba(0,0,0,0.1)',
          zIndex: 100,
        }}
      >
        {/* Logo Area */}
        <div
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
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: sidebarCollapsed ? 0 : 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700,
                color: '#fff',
                backdropFilter: 'blur(10px)',
              }}
            >
              O
            </div>
            {!sidebarCollapsed && (
              <span
                style={{
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                }}
              >
                {t('appName')}
              </span>
            )}
          </div>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          defaultOpenKeys={getOpenKey() ? [getOpenKey()!] : undefined}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{
            background: 'transparent',
            padding: '8px 0',
          }}
        />

        {/* Bottom collapse button */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Button
            type="text"
            icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggleSidebar}
            style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: 16,
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.1)',
            }}
          />
        </div>
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
            padding: '0 24px',
            background: theme === 'dark' ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
          </div>

          <Space size={12}>
            <Dropdown overlay={languageMenu} placement="bottomRight" trigger={['click']}>
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

            <Tooltip title={theme === 'dark' ? '浅色模式' : '深色模式'}>
              <Button
                type="text"
                icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                style={{
                  color: 'var(--text-secondary)',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                }}
              />
            </Tooltip>

            <Dropdown overlay={userMenu} placement="bottomRight" trigger={['click']}>
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

      {/* AI Chat Widget */}
      <ChatWidget />
    </Layout>
  );
};

export default MainLayout;