import { GlobalOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useStore } from 'zustand';
import { preferencesStore } from '../../../adapters/preferences/preferencesStore';
import styles from '../UserLayout.module.css';

type Language = 'zh-CN' | 'en-US' | 'ja-JP';

interface LanguagePickerProps {
  language: Language;
}

/**
 * 语言选择下拉。
 *
 * 当前语言由 Layout 传入（Layout 同时用其驱动 antd locale），
 * 选中后写入 `preferencesStore.setLanguage`。
 */
export function LanguagePicker({ language }: LanguagePickerProps) {
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
    <Dropdown menu={menu} placement="bottomRight" trigger={['click']}>
      <Button
        type="text"
        icon={<GlobalOutlined />}
        className={styles['user-shell-language-btn']}
        aria-label="选择语言 / Select Language"
      >
        <span className={styles['user-shell-language-label']}>
          {language === 'zh-CN' ? '中文' : language === 'en-US' ? 'EN' : '日本語'}
        </span>
      </Button>
    </Dropdown>
  );
}
