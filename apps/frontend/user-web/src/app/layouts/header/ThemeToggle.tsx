import { BgColorsOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useStore } from 'zustand';
import { preferencesStore } from '../../../adapters/preferences/preferencesStore';

/**
 * 主题切换按钮。
 *
 * 仅订阅 `preferencesStore.theme` 与 `toggleTheme`。
 */
export function ThemeToggle() {
  const theme = useStore(preferencesStore, (state) => state.theme);
  const toggleTheme = useStore(preferencesStore, (state) => state.toggleTheme);

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
      {theme === 'light' ? '深色' : '浅色'}
    </Button>
  );
}
