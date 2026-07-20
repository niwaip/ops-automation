import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Button, Layout, Space, Tag } from 'antd';
import { useStore } from 'zustand';
import { preferencesStore } from '../../adapters/preferences/preferencesStore';
import { userMenuItems } from './UserSidebar';
import { NotificationBell } from './header/NotificationBell';
import { ThemeToggle } from './header/ThemeToggle';
import { LanguagePicker } from './header/LanguagePicker';
import { UserMenu } from './header/UserMenu';

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
  const toggleSidebar = useStore(preferencesStore, (state) => state.toggleSidebar);
  const sidebarCollapsed = useStore(preferencesStore, (state) => state.sidebarCollapsed);
  const currentMenuLabel =
    userMenuItems.find((item) => item?.key === selectedMenuKey)?.label ?? '工作台';

  return (
    <Header className="user-shell-header">
      <div className="user-shell-header-left">
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
          }}
        />
        <Space size={8}>
          <Tag color="blue" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
            {currentMenuLabel}
          </Tag>
        </Space>
      </div>
      <div className="user-shell-header-right">
        <NotificationBell language={language} />
        <ThemeToggle />
        <LanguagePicker language={language} />
        <UserMenu language={language} />
      </div>
    </Header>
  );
}
