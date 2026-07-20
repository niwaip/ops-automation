import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Input, Space } from 'antd';
import { useForm } from 'antd/lib/form/Form';
import { useTranslation } from 'react-i18next';
import { useLoginForm, type LoginFormValues } from '../hooks/useLoginForm';

interface PasswordLoginFormProps {
  /** SSO 流程进行中时禁用所有按钮 */
  ssoPending: boolean;
}

/**
 * 用户名密码登录表单 + "记住我"勾选 + SSO 入口按钮。
 *
 * "记住我" 仅保存用户名（不保存密码），见 `useLoginForm`。
 */
export function PasswordLoginForm({ ssoPending }: PasswordLoginFormProps) {
  const [form] = useForm<LoginFormValues>();
  const { loginMutation, handleSubmit, initiateSso } = useLoginForm({ ssoPending, form });
  const { t } = useTranslation('auth');

  return (
    <Form<LoginFormValues>
      form={form}
      layout="vertical"
      initialValues={{ username: '', password: '', remember: false }}
      onFinish={handleSubmit}
    >
      <Form.Item name="username" rules={[{ required: true, message: t('required_username', '请输入用户名') }]}>
        <Input
          prefix={<UserOutlined style={{ color: 'var(--text-light)' }} />}
          placeholder={t('placeholder_username', '请输入用户名')}
          autoComplete="username"
          style={{ borderRadius: 12, padding: '12px 16px', fontSize: 15 }}
        />
      </Form.Item>
      <Form.Item name="password" rules={[{ required: true, message: t('required_password', '请输入密码') }]}>
        <Input.Password
          prefix={<LockOutlined style={{ color: 'var(--text-light)' }} />}
          placeholder={t('placeholder_password', '请输入密码')}
          autoComplete="current-password"
          style={{ borderRadius: 12, padding: '12px 16px', fontSize: 15 }}
        />
      </Form.Item>
      <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 16 }}>
        <Checkbox style={{ color: 'var(--text-secondary)' }}>{t('remember_me', '记住我')}</Checkbox>
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
          {t('btn_login', '登录并进入用户工作台')}
        </Button>
        <Button
          block
          onClick={initiateSso}
          loading={ssoPending}
          style={{ height: 44, borderRadius: 12, fontWeight: 500 }}
        >
          {t('btn_sso', '使用 SSO 登录')}
        </Button>
      </Space>
    </Form>
  );
}
