import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import { ChatWidget } from '@/features/chat';
import { usePreferencesStore } from '@/shared/store/preferencesStore';
import { MainSidebar } from './MainSidebar';
import { MainHeader } from './MainHeader';

const { Content } = Layout;

export const MainLayout: React.FC = () => {
  const { sidebarCollapsed } = usePreferencesStore();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <MainSidebar />
      <Layout
        style={{
          marginLeft: sidebarCollapsed ? 80 : 200,
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          background: 'var(--bg-primary)',
        }}
      >
        <MainHeader />
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
