import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, message, Dropdown, Checkbox } from 'antd';
import type { MenuProps } from 'antd';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/shared/store/authStore';
import { usePreferencesStore } from '@/shared/store/preferencesStore';

const REMEMBERED_CREDENTIALS_KEY = 'remembered_credentials';

interface LoginFormValues {
  username: string;
  password: string;
  remember?: boolean;
}

interface SavedCredentials {
  username: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const { t } = useTranslation(['auth', 'common']);
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { language, setLanguage, theme } = usePreferencesStore();
  const [form] = Form.useForm();
  const isDarkTheme = theme === 'dark';

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBERED_CREDENTIALS_KEY);
      if (saved) {
        const credentials: SavedCredentials = JSON.parse(saved);
        form.setFieldsValue({
          username: credentials.username,
          password: credentials.password,
          remember: true,
        });
      }
    } catch {
      // Ignore parsing errors
    }
  }, [form]);

  const loginMutation = useMutation(authApi.login, {
    onSuccess: (data) => {
      login(data.accessToken, data.refreshToken, data.user);
      message.success(t('auth:loginSuccess'));
      navigate('/executions');
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : t('auth:loginFailed');
      message.error(errorMessage);
    },
  });

  const handleSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(
      {
        username: values.username,
        password: values.password,
      },
      {
        onSuccess: () => {
          if (values.remember) {
            localStorage.setItem(
              REMEMBERED_CREDENTIALS_KEY,
              JSON.stringify({
                username: values.username,
                password: values.password,
              })
            );
          } else {
            localStorage.removeItem(REMEMBERED_CREDENTIALS_KEY);
          }
        },
      }
    );
  };

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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDarkTheme
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
          background: isDarkTheme ? 'rgba(15, 23, 42, 0.84)' : 'rgba(255, 255, 255, 0.95)',
          borderRadius: 24,
          boxShadow: isDarkTheme
            ? '0 25px 60px -18px rgba(2, 6, 23, 0.7), 0 0 0 1px rgba(148, 163, 184, 0.14)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          zIndex: 1,
          border: isDarkTheme ? '1px solid rgba(148, 163, 184, 0.14)' : 'none',
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
            O
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
            {t('common:appName')}
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
          {t('loginTitle')}
        </p>

        <Form form={form} onFinish={handleSubmit} layout="vertical" size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('usernamePlaceholder') }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: 'var(--text-light)' }} />}
              placeholder={t('usernamePlaceholder')}
              style={{
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 15,
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('passwordPlaceholder') }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: 'var(--text-light)' }} />}
              placeholder={t('passwordPlaceholder')}
              style={{
                borderRadius: 12,
                padding: '12px 16px',
                fontSize: 15,
              }}
            />
          </Form.Item>

          <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 16 }}>
            <Checkbox style={{ color: 'var(--text-secondary)' }}>{t('rememberMe')}</Checkbox>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loginMutation.isLoading}
              block
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
              {t('login')}
            </Button>
          </Form.Item>
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
              style={{
                color: 'var(--text-secondary)',
                borderRadius: 8,
                fontWeight: 500,
              }}
            >
              {language === 'zh-CN' ? '简体中文' : language === 'en-US' ? 'English' : '日本語'}
            </Button>
          </Dropdown>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
