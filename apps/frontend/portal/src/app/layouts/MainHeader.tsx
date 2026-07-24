import React from 'react';
import { useLocation } from 'react-router-dom';
import { Layout, Button, Space, Tag } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, ExportOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  buildNavigationMenuItems,
  getSelectedNavigationKey,
} from '@/app/navigation/menu';
import ExecutionNotificationCenter from '@/features/notifications/ExecutionNotificationCenter';
import { buildUserWebUrl } from '@/shared/config/runtime';
import { useAuthStore } from '@/shared/store/authStore';
import { usePreferencesStore } from '@/shared/store/preferencesStore';
import { ThemeToggle } from './header/ThemeToggle';
import { LanguagePicker } from './header/LanguagePicker';
import { UserMenu } from './header/UserMenu';

const { Header } = Layout;

export const MainHeader: React.FC = () => {
  const { t } = useTranslation('common');
  const location = useLocation();
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = usePreferencesStore();

  const menuItems = buildNavigationMenuItems(t, user?.role);
  const selectedKey = getSelectedNavigationKey(location.pathname);

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

  return (
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
        <ThemeToggle />
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
        <LanguagePicker />
        <UserMenu />
      </Space>
    </Header>
  );
};

export default MainHeader;
