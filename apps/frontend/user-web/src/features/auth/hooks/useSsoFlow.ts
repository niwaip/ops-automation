import { useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authSessionPort } from '../../../adapters/auth/authStore';

const REMEMBERED_USERNAME_KEY = 'user-web-remembered-username';

interface UseSsoFlowResult {
  /** 是否处于 SSO 等待态（发起中或回调处理中） */
  ssoPending: boolean;
}

/**
 * SSO 流程编排：处理 `?sso=1` 发起跳转与 `?code=xxx` 回调登录。
 *
 * 用 `useRef` 记录已处理过的 action key，避免 React 严格模式下重复触发回调。
 */
export function useSsoFlow(): UseSsoFlowResult {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ssoPending, setSsoPending] = useState(false);
  const handledSsoActionRef = useRef<string | null>(null);

  const ssoRequested = searchParams.get('sso') === '1';
  const ssoCode = searchParams.get('code');

  useEffect(() => {
    if (ssoCode && authSessionPort.handleCallback) {
      const actionKey = `callback:${ssoCode}`;
      if (handledSsoActionRef.current === actionKey) {
        return;
      }

      handledSsoActionRef.current = actionKey;
      setSsoPending(true);

      void authSessionPort
        .handleCallback(ssoCode)
        .then(() => {
          try {
            localStorage.removeItem(REMEMBERED_USERNAME_KEY);
          } catch {
            // Ignore cleanup errors.
          }
          void message.success('SSO 登录成功');
          navigate('/executions', { replace: true });
        })
        .catch((error) => {
          const nextMessage = error instanceof Error ? error.message : 'SSO 回调失败';
          void message.error(nextMessage);
        })
        .finally(() => {
          setSsoPending(false);
        });

      return;
    }

    if (ssoRequested && authSessionPort.initiateLogin) {
      const actionKey = 'redirect:sso';
      if (handledSsoActionRef.current === actionKey) {
        return;
      }

      handledSsoActionRef.current = actionKey;
      setSsoPending(true);

      try {
        authSessionPort.initiateLogin();
      } catch (error) {
        const nextMessage = error instanceof Error ? error.message : '无法发起 SSO 登录';
        void message.error(nextMessage);
        setSsoPending(false);
      }
    }
  }, [message, navigate, ssoCode, ssoRequested]);

  return { ssoPending };
}
