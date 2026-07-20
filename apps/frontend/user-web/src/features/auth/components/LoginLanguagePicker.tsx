import { GlobalOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useStore } from 'zustand';
import { preferencesStore } from '../../../adapters/preferences/preferencesStore';

type Language = 'zh-CN' | 'en-US' | 'ja-JP';

/**
 * 登录页语言选择器（独立于主 Layout）。
 *
 * 直接读写 `preferencesStore.language`，无需 Layout 容器提供上下文。
 */
export function LoginLanguagePicker() {
  const language = useStore(preferencesStore, (state) => state.language);
  const setLanguage = useStore(preferencesStore, (state) => state.setLanguage);

  const menu: MenuProps = {
    items: [
      { key: 'zh-CN', label: '简体中文' },
      { key: 'en-US', label: 'English' },
      { key: 'ja-JP', label: '日本語' },
    ],
    onClick: ({ key }) => void setLanguage(key as Language),
    selectedKeys: [language],
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 16 }}>
      <Dropdown menu={menu} placement="bottom" trigger={['click']}>
        <Button
          type="text"
          icon={<GlobalOutlined />}
          style={{ color: 'var(--text-secondary)', borderRadius: 8, fontWeight: 500, fontSize: 13 }}
        >
          {language === 'zh-CN' ? '简体中文' : language === 'en-US' ? 'English' : '日本語'}
        </Button>
      </Dropdown>
    </div>
  );
}
