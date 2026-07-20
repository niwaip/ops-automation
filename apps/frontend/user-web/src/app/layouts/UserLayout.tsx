import { Layout } from 'antd';
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useStore } from 'zustand';
import { UserChatWidget } from '@/features/chat/components/UserChatWidget';
import { useChatStore } from '@/features/chat';
import { preferencesStore } from '../../adapters/preferences/preferencesStore';
import { UserSidebar } from './UserSidebar';
import { UserHeader } from './UserHeader';
import './UserLayout.css';

const { Content } = Layout;

/**
 * 用户主框架：Sider + Header + Content + (非 chat 路由时的悬浮 ChatWidget)。
 *
 * 各关注点已下沉至 `UserSidebar` / `UserHeader` 及 `header/*` 子组件，
 * 此文件仅负责骨架组装与 chat 路由下关闭 chat widget 的副作用。
 */
export function UserLayout() {
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith('/chat');
  const setChatWidgetOpen = useChatStore((state) => state.setOpen);
  const sidebarCollapsed = useStore(preferencesStore, (state) => state.sidebarCollapsed);
  const language = useStore(preferencesStore, (state) => state.language);

  useEffect(() => {
    if (isChatRoute) {
      setChatWidgetOpen(false);
    }
  }, [isChatRoute, setChatWidgetOpen]);

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

  return (
    <Layout className="user-shell">
      <UserSidebar selectedMenuKey={selectedMenuKey} />
      <Layout
        className="user-shell-main"
        style={{
          marginLeft: sidebarCollapsed ? 80 : 200,
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <UserHeader language={language} selectedMenuKey={selectedMenuKey} />
        <Content className={`user-shell-content${isChatRoute ? ' user-shell-content-chat' : ''}`}>
          <Outlet />
        </Content>
        {isChatRoute ? null : <UserChatWidget />}
      </Layout>
    </Layout>
  );
}
