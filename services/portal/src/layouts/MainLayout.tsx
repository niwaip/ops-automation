import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar, Space, Switch } from 'antd';
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
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';

const { Header, Sider, Content } = Layout;

const MainLayout: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, language, setLanguage, sidebarCollapsed, toggleSidebar } = useAuthStore();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: t('dashboard'),
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
            ],
          },
        ]
      : []),
  ];

  const languageMenu = (
    <Menu
      items={[
        { key: 'zh-CN', label: t('zh-CN') },
        { key: 'en-US', label: t('en-US') },
        { key: 'ja-JP', label: t('ja-JP') },
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
    if (path.startsWith('/sessions')) return '/sessions';
    if (path.startsWith('/templates')) return '/templates';
    if (path.startsWith('/admin/users')) return '/admin/users';
    if (path.startsWith('/admin/models')) return '/admin/models';
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
        theme={theme}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme === 'dark' ? '#fff' : '#1890ff',
            fontSize: sidebarCollapsed ? 16 : 18,
            fontWeight: 'bold',
            padding: sidebarCollapsed ? 0 : 16,
          }}
        >
          {sidebarCollapsed ? 'OPS' : t('appName')}
        </div>
        <Menu
          theme={theme}
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          defaultOpenKeys={getOpenKey() ? [getOpenKey()!] : undefined}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout style={{ marginLeft: sidebarCollapsed ? 80 : 200, transition: 'margin-left 0.2s' }}>
        <Header
          style={{
            padding: '0 16px',
            background: theme === 'dark' ? '#001529' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <Button
            type="text"
            icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggleSidebar}
            style={{ fontSize: 16 }}
          />
          <Space>
            <Dropdown overlay={languageMenu} placement="bottomRight">
              <Button type="text" icon={<GlobalOutlined />}>
                {language}
              </Button>
            </Dropdown>
            <Switch
              checkedChildren="Dark"
              unCheckedChildren="Light"
              checked={theme === 'dark'}
              onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
            <Dropdown overlay={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} />
                <span>{user?.username}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{
            margin: 16,
            padding: 24,
            background: theme === 'dark' ? '#141414' : '#fff',
            borderRadius: 8,
            minHeight: 'calc(100vh - 64px - 32px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;