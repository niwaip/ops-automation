import React from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePreferencesStore } from '@/shared/store/preferencesStore';

export const LanguagePicker: React.FC = () => {
  const { t } = useTranslation('common');
  const { language, setLanguage } = usePreferencesStore();

  const languageMenu: MenuProps = {
    items: [
      { key: 'zh-CN', label: '简体中文' },
      { key: 'en-US', label: 'English' },
      { key: 'ja-JP', label: '日本語' },
    ],
    onClick: ({ key }) => setLanguage(key as 'zh-CN' | 'en-US' | 'ja-JP'),
    selectedKeys: [language],
  };

  return (
    <Dropdown menu={languageMenu} placement="bottomRight" trigger={['click']}>
      <Button
        type="text"
        icon={<GlobalOutlined />}
        style={{
          color: 'var(--text-secondary)',
          borderRadius: 10,
          height: 36,
          padding: '0 12px',
        }}
      >
        {language === 'zh-CN'
          ? t('zh-CN', { defaultValue: '中文' })
          : language === 'en-US'
          ? t('en-US', { defaultValue: 'EN' })
          : t('ja-JP', { defaultValue: '日本語' })}
      </Button>
    </Dropdown>
  );
};

export default LanguagePicker;
