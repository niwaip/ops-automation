import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  buildNavigationMenuItems,
  getDefaultNavigationOpenKeys,
  getSelectedNavigationKey,
} from '@/app/navigation/menu';
import { useAuthStore } from '@/shared/store/authStore';
import { usePreferencesStore } from '@/shared/store/preferencesStore';

const { Sider } = Layout;

export const MainSidebar: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = usePreferencesStore();
  const menuItems = buildNavigationMenuItems(t, user?.role);
  const selectedKey = getSelectedNavigationKey(location.pathname);
  const [openKeys, setOpenKeys] = useState<string[]>(
    getDefaultNavigationOpenKeys(location.pathname)
  );

  useEffect(() => {
    setOpenKeys(getDefaultNavigationOpenKeys(location.pathname));
  }, [location.pathname]);

  return (
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
  );
};

export default MainSidebar;
