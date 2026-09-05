import { DownOutlined, LogoutOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Dropdown, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from 'zustand';
import { authStore } from '../../../adapters/auth/authStore';
import styles from '../UserLayout.module.css';

type Language = 'zh-CN' | 'en-US' | 'ja-JP';
type UserRole = 'employee' | 'admin' | 'agent';

const roleLabels: Record<Language, Record<UserRole, string>> = {
  'zh-CN': { employee: '企业成员', admin: '管理员', agent: '代理账号' },
  'en-US': { employee: 'Employee', admin: 'Administrator', agent: 'Agent' },
  'ja-JP': { employee: '従業員', admin: '管理者', agent: 'エージェント' },
};

const roleColors: Record<UserRole, string> = {
  employee: 'blue',
  admin: 'gold',
  agent: 'purple',
};

interface UserMenuProps {
  language: Language;
}

/**
 * 用户头像 + 下拉菜单（用户信息卡片 + 退出登录）。
 *
 * 退出登录会清除当前 session 并返回登录页。
 */
export function UserMenu({ language }: UserMenuProps) {
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const user = useStore(authStore, (state) => state.user);

  const currentRoleLabel = user ? roleLabels[language][user.role] : null;
  const accountStatusLabel =
    language === 'en-US'
      ? user?.isActive
        ? 'Active'
        : 'Inactive'
      : language === 'ja-JP'
        ? user?.isActive
          ? '有効'
          : '無効'
        : user?.isActive
          ? '已启用'
          : '已停用';
  const userSecondaryText =
    user?.email?.trim() ||
    (currentRoleLabel
      ? language === 'en-US'
        ? `Role · ${currentRoleLabel}`
        : language === 'ja-JP'
          ? `役割・${currentRoleLabel}`
          : `角色 · ${currentRoleLabel}`
      : language === 'en-US'
        ? 'Not signed in'
        : language === 'ja-JP'
          ? '未ログイン'
          : '未登录');
  const userInitial = user?.username?.trim()?.charAt(0).toUpperCase() || 'U';
  const handleLogout = () => {
    setUserMenuOpen(false);
    authStore.getState().logout();
  };

  return (
    <Dropdown
      open={userMenuOpen}
      onOpenChange={setUserMenuOpen}
      placement="bottomRight"
      trigger={['click']}
      popupRender={() => (
        <div className={styles['user-shell-user-menu']}>
          <div className={styles['user-shell-user-menu-card']}>
            <Avatar
              size={44}
              className={styles['user-shell-user-menu-avatar']}
              icon={!user ? <UserOutlined /> : undefined}
            >
              {user ? userInitial : null}
            </Avatar>
            <div className={styles['user-shell-user-menu-body']}>
              <div className={styles['user-shell-user-menu-title']}>
                <Typography.Text strong className={styles['user-shell-user-menu-name']}>
                  {user?.username || '未登录'}
                </Typography.Text>
                {user && currentRoleLabel ? (
                  <Tag color={roleColors[user.role]} style={{ marginInlineEnd: 0 }}>
                    {currentRoleLabel}
                  </Tag>
                ) : null}
              </div>
              <Typography.Text type="secondary" className={styles['user-shell-user-menu-secondary']}>
                {userSecondaryText}
              </Typography.Text>
              {user ? (
                <Typography.Text
                  type="secondary"
                  className={`${styles['user-shell-user-menu-secondary']} ${styles['user-shell-user-menu-id']}`}
                >
                  {language === 'en-US'
                    ? `Account status · ${accountStatusLabel}`
                    : language === 'ja-JP'
                      ? `アカウント状態・${accountStatusLabel}`
                      : `账号状态 · ${accountStatusLabel}`}
                </Typography.Text>
              ) : null}
            </div>
          </div>
          <div className={styles['user-shell-user-menu-section']}>
            <button
              type="button"
              className={styles['user-shell-user-menu-action']}
              onClick={() => {
                setUserMenuOpen(false);
                navigate('/settings?tab=email');
              }}
            >
              <span className={styles['user-shell-user-menu-action-icon']}>
                <MailOutlined />
              </span>
              <span className={styles['user-shell-user-menu-action-copy']}>
                <span className={styles['user-shell-user-menu-action-title']}>个人邮箱连接</span>
                <span className={styles['user-shell-user-menu-action-description']}>
                  配置专属工作/私人邮箱与发信授权
                </span>
              </span>
            </button>
            <button
              type="button"
              className={`${styles['user-shell-user-menu-action']} ${styles.danger}`}
              onClick={handleLogout}
            >
              <span className={styles['user-shell-user-menu-action-icon']}>
                <LogoutOutlined />
              </span>
              <span className={styles['user-shell-user-menu-action-copy']}>
                <span className={styles['user-shell-user-menu-action-title']}>退出登录</span>
                <span className={styles['user-shell-user-menu-action-description']}>
                  清除当前会话并返回登录页
                </span>
              </span>
            </button>
          </div>
        </div>
      )}
    >
      <button type="button" className={styles['user-shell-user']}>
        <Avatar
          size={36}
          className={styles['user-shell-user-avatar']}
          icon={!user ? <UserOutlined /> : undefined}
        >
          {user ? userInitial : null}
        </Avatar>
        <span className={styles['user-shell-user-meta']}>
          <span className={styles['user-shell-user-name']}>{user?.username || '未登录'}</span>
          <span className={styles['user-shell-user-secondary']}>{userSecondaryText}</span>
        </span>
        <DownOutlined className={styles['user-shell-user-chevron']} />
      </button>
    </Dropdown>
  );
}
