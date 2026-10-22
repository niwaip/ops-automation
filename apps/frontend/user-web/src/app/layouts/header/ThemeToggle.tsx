import { BgColorsOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import { preferencesStore } from '../../../adapters/preferences/preferencesStore';
import styles from '../UserLayout.module.css';

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
      className={styles['user-shell-theme-btn']}
      aria-label={theme === 'light' ? t('theme.dark', '深色模式') : t('theme.light', '浅色模式')}
    >
      <span className={styles['user-shell-theme-label']}>
        {theme === 'light' ? t('theme.dark', '深色') : t('theme.light', '浅色')}
      </span>
    </Button>
  );
}
