import {
  CarryOutOutlined,
  DashboardOutlined,
  FolderOutlined,
  MessageOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/features/chat';
import { preferencesStore } from '../../adapters/preferences/preferencesStore';
import styles from './UserLayout.module.css';

const { Sider } = Layout;

interface UserSidebarProps {
  /** 当前选中的菜单 key（由 Layout 根据路由推导后传入） */
  selectedMenuKey: string;
}

/**
 * 侧边栏：一级导航（工作台 / 智能协同 / 任务中心 / 数字员工 / 资料空间 / 系统设置 等）。
 */
export function UserSidebar({ selectedMenuKey }: UserSidebarProps) {
  const navigate = useNavigate();
  const setChatWidgetOpen = useChatStore((state) => state.setOpen);
  const sidebarCollapsed = useStore(preferencesStore, (state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useStore(preferencesStore, (state) => state.setSidebarCollapsed);
  const { t } = useTranslation('common');

  const primaryMenuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('menu.dashboard', '工作台') },
    { key: '/chat', icon: <MessageOutlined />, label: t('menu.chat', '智能协同') },
    { key: '/executions', icon: <CarryOutOutlined />, label: t('menu.executions', '任务中心') },
    {
      key: '/published-skills',
      icon: <TeamOutlined />,
      label: t('menu.published_skills', '数字员工'),
    },
    { key: '/workspaces', icon: <FolderOutlined />, label: t('menu.workspaces', '资料空间') },
  ] satisfies Required<MenuProps>['items'];

  const bottomMenuItems = [
    { key: '/settings', icon: <SettingOutlined />, label: t('menu.settings', '系统设置') },
  ] satisfies Required<MenuProps>['items'];

  return (
    <Sider
      className={styles['user-shell-sider']}
      collapsible
      collapsed={sidebarCollapsed}
      onCollapse={(collapsed) => setSidebarCollapsed(collapsed)}
      trigger={null}
    >
      <div
        className={styles['user-shell-logo']}
        style={{ padding: sidebarCollapsed ? '0 16px' : '0 24px' }}
      >
        <div className={styles['user-shell-logo-inner']} style={{ gap: sidebarCollapsed ? 0 : 12 }}>
          <div
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
          {!sidebarCollapsed ? (
            <div
              className={styles['user-shell-logo-text']}
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              OpsPilot
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
          ) : null}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <Menu
          className={styles['user-shell-menu']}
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          onClick={({ key }) => {
            setChatWidgetOpen(false);
            navigate(key);
          }}
          items={primaryMenuItems}
        />
      </div>
      <div className={styles['user-shell-bottom-menu-wrapper']}>
        <Menu
          className={`${styles['user-shell-menu']} ${styles['user-shell-bottom-menu']}`}
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          onClick={({ key }) => {
            setChatWidgetOpen(false);
            navigate(key);
          }}
          items={bottomMenuItems}
        />
      </div>
    </Sider>
  );
}
