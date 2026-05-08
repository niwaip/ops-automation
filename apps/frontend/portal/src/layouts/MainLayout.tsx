import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar, Space } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  SettingOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  GlobalOutlined,
  LogoutOutlined,
  FileWordOutlined,
  ThunderboltOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
  BgColorsOutlined,
  ToolOutlined,
  BugOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { ChatWidget } from '../components/chat';

const { Header, Sider, Content } = Layout;

const MainLayout: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, language, setLanguage, theme, toggleTheme, sidebarCollapsed, toggleSidebar } = useAuthStore();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: t('dashboard'),
    },
    {
      key: '/executions',
      icon: <PlayCircleOutlined />,
      label: t('executions'),
    },
    ...(user?.role === 'admin'
      ? [
          {
            key: '/admin/activities',
            icon: <ThunderboltOutlined />,
            label: '工作单元',
          },
          {
            key: '/admin/temporal',
            icon: <ThunderboltOutlined />,
            label: '工作流',
          },
          {
            key: '/admin/capabilities',
            icon: <ThunderboltOutlined />,
            label: '流程发布',
          },
          {
            key: '/published-skills',
            icon: <ThunderboltOutlined />,
            label: '可用技能',
          },
        ]
      : []),
    {
      key: '/carbone-templates',
      icon: <FileWordOutlined />,
      label: t('carboneTemplates'),
    },
    {
      key: '/templates',
      icon: <FileTextOutlined />,
      label: '浏览器模版',
    },
    ...(user?.role === 'admin'
      ? [
          {
            key: '/admin/flows',
            icon: <OrderedListOutlined />,
            label: t('executionFlows'),
          },
        ]
      : []),
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
                key: '/admin/tools',
                icon: <ToolOutlined />,
                label: '系统工具',
              },
              {
                key: '/admin/prompt-debug',
                icon: <BugOutlined />,
                label: 'Prompt 调试',
              },
            ],
          },
        ]
      : []),
  ];

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

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/executions')) return '/executions';
    if (path === '/sessions/new') return '/sessions/new';
    if (path.startsWith('/sessions')) return '/sessions';
    if (path.startsWith('/templates')) return '/templates';
    if (path.startsWith('/reports')) return '/reports';
    if (path.startsWith('/published-skills')) return '/published-skills';
    if (path.startsWith('/carbone-templates')) return '/carbone-templates';
    if (path.startsWith('/admin/users')) return '/admin/users';
    if (path.startsWith('/admin/models')) return '/admin/models';
    if (path.startsWith('/admin/capabilities')) return '/admin/capabilities';
    if (path.startsWith('/admin/capability-studio')) return '/admin/capabilities';
    if (path.startsWith('/admin/capability-builds')) return '/admin/capabilities';
    if (path.startsWith('/admin/skills')) return '/admin/skills';
    if (path.startsWith('/admin/tools')) return '/admin/tools';
    if (path.startsWith('/admin/prompt-debug')) return '/admin/prompt-debug';
    if (path.startsWith('/admin/flows')) return '/admin/flows';
    if (path.startsWith('/admin/temporal')) return '/admin/temporal';
    if (path.startsWith('/admin/activities')) return '/admin/activities';
    return path;
  };

  const getOpenKey = () => {
    const path = location.pathname;
    if (path.startsWith('/admin/activities')) return undefined;
    if (path.startsWith('/admin/temporal')) return undefined;
    if (path.startsWith('/admin/capabilities')) return undefined;
    if (path.startsWith('/admin')) return '/admin';
    return undefined;
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
          boxShadow: sidebarCollapsed ? '4px 0 24px rgba(0,0,0,0.15)' : '4px 0 24px rgba(0,0,0,0.1)',
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
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.12) 100%)',
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
              <div
                className="portal-sider-logo-text"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    color: '#fff',
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    lineHeight: 1.2,
                  }}
                >
                  {t('appName')}
                </span>
              </div>
            )}
          </div>
        </div>

        <Menu
          className="portal-menu"
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
            background: 'var(--bg-header)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--bg-secondary)',
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
