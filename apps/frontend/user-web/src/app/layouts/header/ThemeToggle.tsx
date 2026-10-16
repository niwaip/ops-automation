import { BgColorsOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { preferencesStore } from '../../../adapters/preferences/preferencesStore';

/**
 * 主题切换按钮。
 *
 * 仅订阅 `preferencesStore.theme` 与 `toggleTheme`，文本支持多语言。
 */
export function ThemeToggle() {
  const theme = useStore(preferencesStore, (state) => state.theme);
  const toggleTheme = useStore(preferencesStore, (state) => state.toggleTheme);
  const { t } = useTranslation('common');

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
      {theme === 'light' ? t('theme.dark', '深色') : t('theme.light', '浅色')}
    </Button>
  );
}
