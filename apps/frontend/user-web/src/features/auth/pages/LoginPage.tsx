import { useEffect, useRef, useState } from 'react';
import { GlobalOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, Dropdown, Form, Input, Space } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from 'react-query';
import { useStore } from 'zustand';
import { browserStorage } from '../../../adapters/storage/browserStorage';
import { authSessionPort, authStore } from '../../../adapters/auth/authStore';
import { preferencesStore } from '../../../adapters/preferences/preferencesStore';
import { authApi } from '../../../api';

const REMEMBERED_CREDENTIALS_KEY = 'user-web-remembered-credentials';

interface LoginFormValues {
  username: string;
  password: string;
  remember?: boolean;
}

interface SavedCredentials {
  username: string;
  password: string;
}

export function LoginPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const theme = useStore(preferencesStore, (state) => state.theme);
  const language = useStore(preferencesStore, (state) => state.language);
  const setLanguage = useStore(preferencesStore, (state) => state.setLanguage);
  const isDark = theme === 'dark';
  const [form] = Form.useForm<LoginFormValues>();
  const [ssoPending, setSsoPending] = useState(false);
  const handledSsoActionRef = useRef<string | null>(null);
  const loginMutation = useMutation(authApi.login, {
    onSuccess: (response) => {
      authStore.getState().login(response.accessToken, response.refreshToken, response.user);
      void message.success('登录成功');
      navigate('/dashboard');
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : '登录失败');
    },
  });

  const ssoRequested = searchParams.get('sso') === '1';
  const ssoCode = searchParams.get('code');

  useEffect(() => {
    try {
      const saved = browserStorage.getItem(REMEMBERED_CREDENTIALS_KEY);
      if (!saved) {
        return;
      }
      const parsed = JSON.parse(saved) as SavedCredentials;
      form.setFieldsValue({
        username: parsed.username,
        password: parsed.password,
        remember: true,
      });
    } catch {
      // Ignore invalid cached credentials.
    }
  }, [form]);

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

  const languageMenu: MenuProps = {
    items: [
      { key: 'zh-CN', label: '简体中文' },
      { key: 'en-US', label: 'English' },
      { key: 'ja-JP', label: '日本語' },
    ],
    onClick: ({ key }) => void setLanguage(key as 'zh-CN' | 'en-US' | 'ja-JP'),
    selectedKeys: [language],
  };

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
      <div
        style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '60%',
          height: '60%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(244, 114, 182, 0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-30%',
          left: '-20%',
          width: '70%',
          height: '70%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          width: 420,
          padding: 48,
          background: isDark ? 'rgba(15, 23, 42, 0.84)' : 'rgba(255, 255, 255, 0.95)',
          borderRadius: 24,
          boxShadow: isDark
            ? '0 25px 60px -18px rgba(2, 6, 23, 0.7), 0 0 0 1px rgba(148, 163, 184, 0.14)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          zIndex: 1,
          border: isDark ? '1px solid rgba(148, 163, 184, 0.14)' : 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #6366f1 0%, #f472b6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
              color: '#fff',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
            }}
          >
            U
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.5px',
            }}
          >
            企业AI门户
          </h1>
        </div>
        <p
          style={{
            textAlign: 'center',
            color: 'var(--text-secondary)',
            marginBottom: 32,
            fontSize: 15,
          }}
        >
          统一沿用 portal 的登录视觉，继续使用 user-core 的认证与执行能力。
        </p>
        <Form<LoginFormValues>
          form={form}
          layout="vertical"
          initialValues={{ username: '', password: '', remember: false }}
          onFinish={(values) => {
            loginMutation.mutate(
              { username: values.username, password: values.password },
              {
                onSuccess: () => {
                  if (values.remember) {
                    browserStorage.setItem(
                      REMEMBERED_CREDENTIALS_KEY,
                      JSON.stringify({
                        username: values.username,
                        password: values.password,
                      })
                    );
                  } else {
                    browserStorage.removeItem(REMEMBERED_CREDENTIALS_KEY);
                  }
                },
              }
            );
          }}
        >
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input
              prefix={<UserOutlined style={{ color: 'var(--text-light)' }} />}
              placeholder="请输入用户名"
              autoComplete="username"
              style={{ borderRadius: 12, padding: '12px 16px', fontSize: 15 }}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: 'var(--text-light)' }} />}
              placeholder="请输入密码"
              autoComplete="current-password"
              style={{ borderRadius: 12, padding: '12px 16px', fontSize: 15 }}
            />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 16 }}>
            <Checkbox style={{ color: 'var(--text-secondary)' }}>记住我</Checkbox>
          </Form.Item>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loginMutation.isLoading}
              disabled={ssoPending}
              style={{
                height: 48,
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                border: 'none',
              }}
            >
              登录并进入用户工作台
            </Button>
            <Button
              block
              onClick={() => authSessionPort.initiateLogin?.()}
              loading={ssoPending}
              style={{ height: 44, borderRadius: 12, fontWeight: 500 }}
            >
              使用 SSO 登录
            </Button>
          </Space>
          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              borderRadius: 12,
              background: isDark ? 'rgba(30, 41, 59, 0.72)' : 'rgba(99, 102, 241, 0.06)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            当前保留本地登录；后端提供统一 SSO 端点后，可通过 `?sso=1` 或按钮切换认证入口。
          </div>
        </Form>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: 24,
            paddingTop: 24,
            borderTop: '1px solid var(--bg-secondary)',
          }}
        >
          <Dropdown menu={languageMenu} placement="bottomLeft" trigger={['click']}>
            <Button
              type="text"
              icon={<GlobalOutlined />}
              style={{ color: 'var(--text-secondary)', borderRadius: 8, fontWeight: 500 }}
            >
              {language === 'zh-CN' ? '简体中文' : language === 'en-US' ? 'English' : '日本語'}
            </Button>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}
