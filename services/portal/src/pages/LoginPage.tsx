import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, message, Dropdown, Menu } from 'antd';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'react-query';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';

interface LoginFormValues {
  username: string;
  password: string;
  remember?: boolean;
}

const LoginPage: React.FC = () => {
  const { t } = useTranslation(['auth', 'common']);
  const navigate = useNavigate();
  const { login, language, setLanguage } = useAuthStore();
  const [form] = Form.useForm();

  const loginMutation = useMutation(authApi.login, {
    onSuccess: (data) => {
      login(data.accessToken, data.refreshToken, data.user);
      message.success(t('auth:loginSuccess'));
      navigate('/dashboard');
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : t('auth:loginFailed');
      message.error(errorMessage);
    },
  });

  const handleSubmit = (values: LoginFormValues) => {
    loginMutation.mutate({
      username: values.username,
      password: values.password,
    });
  };

  const languageMenu = (
    <Menu
      items={[
        { key: 'zh-CN', label: t('common:zh-CN') },
        { key: 'en-US', label: t('common:en-US') },
        { key: 'ja-JP', label: t('common:ja-JP') },
      ]}
      onClick={({ key }: { key: string }) => setLanguage(key as 'zh-CN' | 'en-US' | 'ja-JP')}
      selectedKeys={[language]}
    />
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        style={{
          width: 400,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            marginBottom: 24,
          }}
        >
          <h1
            style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: '#1890ff',
              marginBottom: 8,
            }}
          >
            {t('common:appName')}
          </h1>
          <p style={{ color: '#666' }}>{t('loginTitle')}</p>
        </div>

        <Form form={form} onFinish={handleSubmit} layout="vertical" size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('usernamePlaceholder') }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder={t('usernamePlaceholder')}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('passwordPlaceholder') }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t('passwordPlaceholder')}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loginMutation.isLoading}
              block
            >
              {t('login')}
            </Button>
          </Form.Item>
        </Form>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Dropdown overlay={languageMenu} placement="bottomLeft">
            <Button type="text" icon={<GlobalOutlined />}>
              {language}
            </Button>
          </Dropdown>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;