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
          width: '100%',
          maxWidth: 440,
          margin: '0 16px',
          background: isDarkTheme ? 'rgba(15, 23, 42, 0.84)' : 'rgba(255, 255, 255, 0.95)',
          borderRadius: 24,
          boxShadow: isDarkTheme
            ? '0 25px 60px -18px rgba(2, 6, 23, 0.7), 0 0 0 1px rgba(148, 163, 184, 0.14)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          zIndex: 1,
          border: isDarkTheme ? '1px solid rgba(148, 163, 184, 0.14)' : 'none',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '40px 32px 24px',
            background: isDarkTheme
              ? 'linear-gradient(to bottom, rgba(30, 41, 59, 0.5), transparent)'
              : 'linear-gradient(to bottom, rgba(243, 244, 246, 0.6), transparent)',
            borderBottom: isDarkTheme ? '1px solid rgba(148, 163, 184, 0.05)' : '1px solid rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #6366f1 0%, #f472b6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 8px 20px -4px rgba(99, 102, 241, 0.5)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" />
              </svg>
            </div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {t('common:appName')}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #6366f1 0%, #f472b6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  padding: '2px 8px',
                  borderRadius: 12,
                  border: '1px solid rgba(244, 114, 182, 0.3)',
                  verticalAlign: 'middle',
                }}
              >
                AI
              </span>
            </h1>
          </div>
          <div
            style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 600 }}>
              {t('loginTitle')}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              智能编排 · 高效执行 · 安全认证
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 32px 32px' }}>

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
              marginTop: 16,
            }}
          >
            <Dropdown menu={languageMenu} placement="bottom" trigger={['click']}>
              <Button
                type="text"
                icon={<GlobalOutlined />}
                style={{
                  color: 'var(--text-secondary)',
                  borderRadius: 8,
                  fontWeight: 500,
                  fontSize: 13,
                }}
              >
                {language === 'zh-CN' ? '简体中文' : language === 'en-US' ? 'English' : '日本語'}
              </Button>
            </Dropdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
