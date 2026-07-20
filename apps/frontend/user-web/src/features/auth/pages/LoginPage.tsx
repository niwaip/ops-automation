import { useStore } from 'zustand';
import { preferencesStore } from '../../../adapters/preferences/preferencesStore';
import { PasswordLoginForm } from '../components/PasswordLoginForm';
import { SsoCallbackHandler } from '../components/SsoCallbackHandler';
import { LoginLanguagePicker } from '../components/LoginLanguagePicker';
import { LoginCardShell } from '../components/LoginCardShell';
import { BrandHeader } from '../components/BrandHeader';
import { useSsoFlow } from '../hooks/useSsoFlow';

/**
 * 登录页入口：渲染品牌卡片骨架，分发密码表单 / SSO 回调 / 语言选择。
 * 各关注点已下沉至 `components/*` 与 `hooks/*`，此文件仅负责组装。
 */
export function LoginPage() {
  const theme = useStore(preferencesStore, (state) => state.theme);
  const isDark = theme === 'dark';
  const { ssoPending } = useSsoFlow();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark
          ? 'linear-gradient(135deg, #020617 0%, #0f172a 30%, #1e1b4b 65%, #312e81 100%)'
          : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 25%, #4338ca 50%, #6366f1 75%, #818cf8 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <SsoCallbackHandler visible={ssoPending} />
      <LoginCardShell isDark={isDark}>
        <BrandHeader isDark={isDark} />
        <div style={{ padding: '24px 32px 32px' }}>
          <PasswordLoginForm ssoPending={ssoPending} />
          <LoginLanguagePicker />
        </div>
      </LoginCardShell>
    </div>
  );
}
