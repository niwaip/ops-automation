import { MenuUnfoldOutlined } from '@ant-design/icons';
import { Button, Layout, Space, Tag, Tooltip } from 'antd';
import { useStore } from 'zustand';
import { preferencesStore } from '../../adapters/preferences/preferencesStore';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from './header/NotificationBell';
import { ThemeToggle } from './header/ThemeToggle';
import { LanguagePicker } from './header/LanguagePicker';
import { UserMenu } from './header/UserMenu';
import styles from './UserLayout.module.css';

const { Header } = Layout;

type Language = 'zh-CN' | 'en-US' | 'ja-JP';

interface UserHeaderProps {
  language: Language;
  /** 当前路由推导出的选中菜单 key（决定顶部 Tag 显示哪个页面名） */
  selectedMenuKey: string;
}

/**
 * Header 容器：左侧折叠按钮 + 当前页面 Tag；右侧通知/主题/语言/用户。
 */
export function UserHeader({ language, selectedMenuKey }: UserHeaderProps) {
  const { t } = useTranslation('common');
  const toggleSidebar = useStore(preferencesStore, (state) => state.toggleSidebar);
  const sidebarCollapsed = useStore(preferencesStore, (state) => state.sidebarCollapsed);

  const getHeaderTitle = (key: string) => {
    switch (key) {
      case '/dashboard': return t('menu.dashboard', '工作台');
      case '/chat': return t('menu.chat', '智能协同');
      case '/executions': return t('menu.executions', '任务中心');
      case '/published-skills': return t('menu.published_skills', '数字员工');
      case '/workspaces': return t('menu.workspaces', '资料空间');
      case '/settings': return t('menu.settings', '系统设置');
      case '/im-channels': return t('menu.im_channels', 'IM 渠道');
      case '/email-settings': return t('menu.email_settings', '邮箱连接');
      case '/notifications': return t('menu.notifications', '通知中心');
      case '/reports': return t('menu.reports', '执行报告');
      default: return t('menu.dashboard', '工作台');
    }
  };

  const currentMenuLabel = getHeaderTitle(selectedMenuKey);

  return (
    <Header className={styles['user-shell-header']}>
      <div className={styles['user-shell-header-left']}>
        {sidebarCollapsed ? (
          <Tooltip title={t('sidebar.expand', '展开侧边栏')}>
            <Button
              type="text"
              aria-label={t('sidebar.expand', '展开侧边栏')}
              icon={<MenuUnfoldOutlined />}
              onClick={toggleSidebar}
              style={{
                fontSize: 18,
                color: 'var(--text-secondary)',
                width: 40,
                height: 40,
                borderRadius: 10,
              }}
            />
          </Tooltip>
        ) : null}
        <Space size={8}>
          <Tag
            bordered={false}
            style={{
              marginInlineEnd: 0,
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--primary-color) 10%, transparent)',
              color: 'var(--primary-color)',
              fontWeight: 600,
              padding: '2px 10px',
              fontSize: 12,
            }}
          >
            {currentMenuLabel}
          </Tag>
        </Space>
      </div>
      <div className={styles['user-shell-header-right']}>
        <NotificationBell language={language} />
        <ThemeToggle />
        <LanguagePicker language={language} />
        <UserMenu language={language} />
      </div>
    </Header>
  );
}
