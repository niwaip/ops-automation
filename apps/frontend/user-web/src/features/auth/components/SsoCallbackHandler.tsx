import { Spin } from 'antd';

/**
 * SSO 回调/发起等待态的全屏占位。
 *
 * 实际副作用在 `useSsoFlow` 中执行；此组件仅负责 ssoPending 时显示 loading，
 * 避免用户在等待跳转/回调过程中误操作密码表单。
 */
export function SsoCallbackHandler({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        background: 'rgba(15, 23, 42, 0.48)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Spin size="large" tip="SSO 登录中…" />
    </div>
  );
}
