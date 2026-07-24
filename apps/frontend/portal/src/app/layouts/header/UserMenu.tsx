import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, Avatar, Space } from 'antd';
import type { MenuProps } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/shared/store/authStore';

export const UserMenu: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

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
  );
};

export default UserMenu;
