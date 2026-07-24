import React from 'react';
import { Button } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePreferencesStore } from '@/shared/store/preferencesStore';

export const ThemeToggle: React.FC = () => {
  const { t } = useTranslation('common');
  const { theme, toggleTheme } = usePreferencesStore();

  return (
    <Button
      type="text"
      icon={<BgColorsOutlined />}
      onClick={toggleTheme}
      style={{
        color: 'var(--text-secondary)',
        borderRadius: 10,
        height: 36,
        padding: '0 12px',
      }}
    >
      {theme === 'light' ? t('darkTheme', { defaultValue: '深色' }) : t('lightTheme', { defaultValue: '浅色' })}
    </Button>
  );
};

export default ThemeToggle;
