import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  Space,
  Avatar,
  Typography,
  Alert,
  message,
  Tooltip,
} from 'antd';
import {
  KeyOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  CopyOutlined,
  ReloadOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import type { UserDto } from '@/api/auth';

const { Text } = Typography;

interface UserResetPasswordModalProps {
  open: boolean;
  user: UserDto | null;
  loading: boolean;
  onCancel: () => void;
  onReset: (userId: string, newPassword: string) => Promise<unknown> | unknown;
}

const getAvatarColor = (name: string) => {
  const colors = ['#1890ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

/**
 * 生成包含大小写字母与数字的高强度随机密码
 */
const generateRandomPassword = (length = 10): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const specials = '!@#$%^&*';
  let pwd = '';
  // 保证至少一个特殊字符与数字
  pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  pwd += specials.charAt(Math.floor(Math.random() * specials.length));
  for (let i = 2; i < length; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd
    .split('')
    .sort(() => 0.5 - Math.random())
    .join('');
};

export const UserResetPasswordModal: React.FC<UserResetPasswordModalProps> = ({
  open,
  user,
  loading,
  onCancel,
  onReset,
}) => {
  const [form] = Form.useForm();
  const [generatedPassword, setGeneratedPassword] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const handleGenerate = () => {
    const pwd = generateRandomPassword(10);
    setGeneratedPassword(pwd);
    form.setFieldsValue({
      password: pwd,
      confirmPassword: pwd,
    });
    setCopied(false);
  };

  const handleCopy = async () => {
    const pwd = form.getFieldValue('password') || generatedPassword;
    if (!pwd) {
      message.warning('当前无密码可复制');
      return;
    }
    try {
      await navigator.clipboard.writeText(pwd);
      setCopied(true);
      message.success('新密码已复制到剪贴板');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      message.info(`密码：${pwd}`);
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (!user) return;
      await onReset(user.id, values.password);
    } catch {
      // Form validation failed
    }
  };

  const handleClose = () => {
    form.resetFields();
    setGeneratedPassword('');
    setCopied(false);
    onCancel();
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #fa8c16 0%, #ffc069 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
              boxShadow: '0 4px 10px rgba(250, 140, 22, 0.25)',
            }}
          >
            <KeyOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #1f2937)' }}>
              重置用户密码
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', fontWeight: 400 }}>
              为用户分配新的登录密码，重置后旧密码将即刻作废
            </div>
          </div>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText="确认重置密码"
      cancelText="取消"
      okButtonProps={{ danger: true }}
      destroyOnClose
      width={500}
      styles={{
        content: {
          borderRadius: 16,
          overflow: 'hidden',
          padding: '24px 28px',
        },
      }}
    >
      {user && (
        <div
          style={{
            margin: '16px 0 20px',
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(250, 140, 22, 0.06) 0%, rgba(24, 144, 255, 0.04) 100%)',
            borderRadius: 12,
            border: '1px solid rgba(250, 140, 22, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Space size={12}>
            <Avatar
              style={{
                backgroundColor: getAvatarColor(user.username),
                fontWeight: 600,
                fontSize: 16,
              }}
              size={42}
            >
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{user.username}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {user.email || '未绑定邮箱'} · {user.role === 'admin' ? '系统管理员' : user.role === 'agent' ? 'Agent' : '普通员工'}
              </Text>
            </div>
          </Space>
        </div>
      )}

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button
          type="dashed"
          size="small"
          icon={<ReloadOutlined />}
          onClick={handleGenerate}
          style={{ borderRadius: 6 }}
        >
          随机生成强密码
        </Button>
        <Tooltip title="复制当前填写的密码">
          <Button
            type="text"
            size="small"
            icon={copied ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <CopyOutlined />}
            onClick={handleCopy}
            style={{ borderRadius: 6 }}
          >
            {copied ? '已复制' : '复制密码'}
          </Button>
        </Tooltip>
      </div>

      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="password"
          label={
            <span style={{ fontWeight: 500, fontSize: 13 }}>
              新密码 <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
          }
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '密码长度至少需 6 个字符' },
          ]}
          hasFeedback
        >
          <Input.Password
            placeholder="请输入新密码（至少 6 位）"
            prefix={<LockOutlined style={{ color: 'var(--text-tertiary, #bfbfbf)' }} />}
            style={{ borderRadius: 8, height: 38 }}
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label={
            <span style={{ fontWeight: 500, fontSize: 13 }}>
              确认新密码 <span style={{ color: '#ff4d4f' }}>*</span>
            </span>
          }
          dependencies={['password']}
          hasFeedback
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password
            placeholder="请再次确认新密码"
            prefix={<SafetyCertificateOutlined style={{ color: 'var(--text-tertiary, #bfbfbf)' }} />}
            style={{ borderRadius: 8, height: 38 }}
          />
        </Form.Item>
      </Form>

      <Alert
        type="warning"
        showIcon
        style={{ borderRadius: 8, fontSize: 12, marginTop: 8 }}
        message="安全须知"
        description="重置成功后，该用户需要使用新密码登录系统。请将新密码安全告知该用户，并建议其登录后妥善保管。"
      />
    </Modal>
  );
};
