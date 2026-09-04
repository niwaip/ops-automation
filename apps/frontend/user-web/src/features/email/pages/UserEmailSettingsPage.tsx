import {
  ApiOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LinkOutlined,
  LoadingOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WindowsOutlined,
} from '@ant-design/icons';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  userEmailApi,
  type MicrosoftDeviceCodeResponse,
  type SaveUserEmailRequest,
} from '@/api';
import { EmailInboxSyncCard } from '../components/EmailInboxSyncCard';

const { Title, Text, Paragraph } = Typography;

const EMAIL_PRESETS = [
  {
    key: 'qq',
    label: 'QQ 邮箱',
    icon: '🐧',
    imapHost: 'imap.qq.com',
    imapPort: 993,
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
    tip: '请在 QQ 邮箱「设置 -> 账户」中开启 POP3/IMAP/SMTP 服务并生成专属「授权码」。',
  },
  {
    key: '163',
    label: '163 网易邮箱',
    icon: '📮',
    imapHost: 'imap.163.com',
    imapPort: 993,
    smtpHost: 'smtp.163.com',
    smtpPort: 465,
    tip: '请在 163 邮箱「设置 -> POP3/SMTP/IMAP」中开启服务并生成客户端专用「授权密码」。',
  },
  {
    key: 'gmail',
    label: 'Gmail',
    icon: '🔴',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    tip: '请在 Google 账号「安全性 -> 两步验证」中生成「应用专用密码 (App Password)」。',
  },
  {
    key: 'custom',
    label: '企业专属邮箱',
    icon: '🏢',
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 465,
    tip: '支持阿里企业邮、腾讯企业邮、Exchange 或私有部署的 IMAP/SMTP 服务器。',
  },
];

const PROMPT_EXAMPLES = [
  {
    title: '查收最新未读邮件',
    prompt: '帮我查一下今天收到的最新未读邮件',
    desc: '自动调用 IMAP / Graph API 检索收件箱最新邮件列表并给出结构化摘要',
  },
  {
    title: '搜索指定主题或发件人',
    prompt: '搜索关于周报或报销的邮件详情',
    desc: '按发件人、主题关键词进行邮件深度检索',
  },
  {
    title: '快速起草并发送邮件',
    prompt: '给 team@example.com 发送一封邮件，通知今天下午3点系统维护',
    desc: '自动组装邮件标题与正文并通过你的专属通道安全投递',
  },
];

export default function UserEmailSettingsPage() {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<SaveUserEmailRequest>();
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  // Microsoft OAuth State
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [customClientId, setCustomClientId] = useState<string>('');
  const [deviceAuthInfo, setDeviceAuthInfo] = useState<MicrosoftDeviceCodeResponse | null>(null);
  const [isPollingOAuth, setIsPollingOAuth] = useState(false);
  const pollTimerRef = useRef<any>(null);

  const query = useQuery('user-email-connection', userEmailApi.getConnection, {
    onSuccess: (data) => {
      if (data.configured) {
        form.setFieldsValue({
          emailAddress: data.emailAddress,
          senderName: data.senderName,
          imapHost: data.imapHost,
          imapPort: data.imapPort,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
        });
      }
    },
  });

  const saveMutation = useMutation(userEmailApi.saveConnection, {
    onSuccess: () => {
      message.success('个人邮箱配置已保存并安全加密存储');
      queryClient.invalidateQueries('user-email-connection');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || '保存邮箱配置失败');
    },
  });

  const testMutation = useMutation(userEmailApi.testConnection, {
    onSuccess: (res) => {
      if (res.success) {
        message.success(res.message);
      } else {
        message.error(res.message);
      }
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || '邮箱连通性测试失败');
    },
  });

  const deleteMutation = useMutation(userEmailApi.deleteConnection, {
    onSuccess: () => {
      message.success('已解除绑定并清除个人邮箱凭据');
      form.resetFields();
      queryClient.invalidateQueries('user-email-connection');
    },
    onError: () => {
      message.error('解除绑定失败');
    },
  });

  const handleStartMicrosoftOAuth = async (overrideClientId?: string) => {
    try {
      const clientIdToUse = overrideClientId !== undefined ? overrideClientId : customClientId;
      message.loading({ content: '正在向微软官方请求授权码...', key: 'oauth_init' });
      const res = await userEmailApi.beginMicrosoftOAuth(clientIdToUse?.trim() || undefined);
      message.destroy('oauth_init');
      setDeviceAuthInfo(res);
      setOauthModalOpen(true);
      setIsPollingOAuth(true);
    } catch (err: any) {
      message.destroy('oauth_init');
      message.error(err?.response?.data?.message || '发起微软授权失败');
    }
  };

  useEffect(() => {
    if (!isPollingOAuth || !deviceAuthInfo || !oauthModalOpen) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await userEmailApi.pollMicrosoftOAuth(
          deviceAuthInfo.deviceCode,
          customClientId?.trim() || undefined
        );
        if (res.status === 'completed' && res.connection) {
          clearInterval(pollTimerRef.current);
          setIsPollingOAuth(false);
          setOauthModalOpen(false);
          message.success(`🎉 微软账号授权成功！已绑定 ${res.connection.emailAddress}`);
          queryClient.invalidateQueries('user-email-connection');
        }
      } catch (err: any) {
        clearInterval(pollTimerRef.current);
        setIsPollingOAuth(false);
        message.error(err?.response?.data?.message || '授权验证失败');
      }
    }, (deviceAuthInfo.interval || 5) * 1000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isPollingOAuth, deviceAuthInfo, oauthModalOpen, customClientId, queryClient, message]);

  const status = query.data;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(text);
    message.success(`已复制: ${text}`);
    setTimeout(() => setCopiedPrompt(null), 2000);
  };

  const handleApplyPreset = (preset: (typeof EMAIL_PRESETS)[0]) => {
    form.setFieldsValue({
      imapHost: preset.imapHost,
      imapPort: preset.imapPort,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
    });
    message.info(`已载入「${preset.label}」服务器地址与端口预设`);
  };

  if (query.isLoading) {
    return (
      <div style={{ minHeight: 400, display: 'grid', placeItems: 'center' }}>
        <Space direction="vertical" align="center">
          <Spin size="large" />
          <Text type="secondary">正在加载个人邮箱连接信息...</Text>
        </Space>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto', paddingBottom: 40 }}>
      {/* 顶部 Hero Banner */}
      <div
        style={{
          background: token.colorFillAlter,
          borderRadius: token.borderRadiusLG,
          padding: '24px 28px',
          marginBottom: 20,
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <Space align="center" size={12} style={{ marginBottom: 6 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: token.borderRadius,
                  background: 'linear-gradient(135deg, #1677ff 0%, #722ed1 100%)',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 4px 12px rgba(22, 119, 255, 0.3)',
                }}
              >
                <MailOutlined style={{ color: '#fff', fontSize: 22 }} />
              </div>
              <div>
                <Title level={4} style={{ margin: 0, fontWeight: 600, color: token.colorText }}>
                  个人邮箱连接与集成 (User Email Connection)
                </Title>
              </div>
            </Space>
            <Paragraph
              type="secondary"
              style={{ margin: 0, fontSize: 13, color: token.colorTextSecondary, maxWidth: 660 }}
            >
              绑定你的专属个人或企业邮箱。支持 <strong>Hotmail / Outlook 微软官方 OAuth 2.0 一键授权</strong>，
              以及 QQ、163、企业私有等所有标准 IMAP/SMTP 邮箱。配置后，AI 助手在对话中即可为您查收与代理发送邮件。
            </Paragraph>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Space direction="vertical" align="end" size={4}>
              <Badge
                status={status?.configured ? 'success' : 'default'}
                text={
                  <Text strong style={{ fontSize: 14, color: token.colorText }}>
                    {status?.configured ? '已连接个人邮箱' : '未连接邮箱'}
                  </Text>
                }
              />
              <Space size={6}>
                {status?.providerType === 'microsoft_oauth' ? (
                  <Tag color="geekblue" icon={<WindowsOutlined />}>
                    微软 OAuth 2.0
                  </Tag>
                ) : null}
                <Text type="secondary" style={{ fontSize: 12, color: token.colorTextTertiary }}>
                  {status?.emailAddress || '支持任意邮箱或微软 OAuth 2.0'}
                </Text>
              </Space>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 🌟 微软官方 OAuth 2.0 快捷授权卡片 */}
      <Card
        style={{
          marginBottom: 20,
          borderRadius: token.borderRadiusLG,
          background: 'linear-gradient(135deg, rgba(0, 120, 212, 0.06) 0%, rgba(22, 119, 255, 0.02) 100%)',
          borderColor: 'rgba(0, 120, 212, 0.25)',
          boxShadow: token.boxShadowTertiary,
        }}
        styles={{ body: { padding: '18px 22px' } }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={17}>
            <Space align="start" size={14}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: '#0078D4',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  fontSize: 20,
                }}
              >
                <WindowsOutlined />
              </div>
              <div>
                <Text strong style={{ fontSize: 15, color: token.colorText }}>
                  Hotmail / Outlook / Office 365 微软官方一键授权
                </Text>
                <Paragraph style={{ margin: '4px 0 0 0', fontSize: 12, color: token.colorTextSecondary }}>
                  微软个人邮箱已停用传统密码连接。点击右侧按钮，即可通过微软官方安全登录页面一键完成现代身份验证（OAuth 2.0 & Microsoft Graph），无需获取客户端授权密码！
                </Paragraph>
              </div>
            </Space>
          </Col>
          <Col xs={24} md={7} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              icon={<WindowsOutlined />}
              onClick={() => handleStartMicrosoftOAuth()}
              style={{
                background: '#0078D4',
                borderColor: '#0078D4',
                height: 38,
                fontWeight: 500,
                borderRadius: 6,
              }}
            >
              一键登录微软官方绑定
            </Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={[20, 20]}>
        {/* 左侧：表单配置区 */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space size={8}>
                <KeyOutlined style={{ color: token.colorPrimary }} />
                <span style={{ fontWeight: 600, fontSize: 15 }}>传统 IMAP / SMTP 账号配置</span>
                {status?.configured ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>
                    已绑定
                  </Tag>
                ) : (
                  <Tag color="default">待配置</Tag>
                )}
              </Space>
            }
            bordered
            style={{
              borderRadius: token.borderRadiusLG,
              background: token.colorBgContainer,
              borderColor: token.colorBorderSecondary,
              boxShadow: token.boxShadowTertiary,
            }}
          >
            {/* 1. 快捷服务商预设 */}
            <div style={{ marginBottom: 18 }}>
              <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                常用邮箱服务商（点击一键自动填入服务器与端口）：
              </Text>
              <Space wrap size={[8, 8]}>
                {EMAIL_PRESETS.map((p) => (
                  <Button
                    key={p.key}
                    size="small"
                    onClick={() => handleApplyPreset(p)}
                    style={{ borderRadius: 6 }}
                  >
                    <span>{p.icon}</span> {p.label}
                  </Button>
                ))}
              </Space>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={(values) => saveMutation.mutate(values)}
            >
              <Form.Item
                name="emailAddress"
                label="邮箱账号"
                required
                rules={[{ required: true, message: '请输入邮箱地址' }]}
              >
                <Input
                  prefix={<MailOutlined style={{ color: token.colorTextTertiary }} />}
                  placeholder="例如: your_name@qq.com / user@163.com"
                />
              </Form.Item>

              <Form.Item
                name="authPassword"
                label="密码 / 客户端专属授权码"
                extra="国内主流邮箱（如 QQ、163）请填入在邮箱后台生成的 16 位客户端「授权码」，切勿填入网页登录密码。"
                rules={[{ required: !status?.configured && status?.providerType !== 'microsoft_oauth', message: '请输入邮箱密码或授权码' }]}
              >
                <Input.Password
                  prefix={<KeyOutlined style={{ color: token.colorTextTertiary }} />}
                  autoComplete="new-password"
                  placeholder={
                    status?.configured
                      ? '已保存密码。留空保持不变，或输入新授权码替换'
                      : '请输入 16 位授权码或应用密码'
                  }
                />
              </Form.Item>

              <Form.Item name="senderName" label="发件人外显名称 (可选)">
                <Input
                  prefix={<UserOutlined style={{ color: token.colorTextTertiary }} />}
                  placeholder="例如: 张三 / 运维助理 (Agent 发送邮件时的署名)"
                />
              </Form.Item>

              <Divider style={{ margin: '16px 0 12px 0' }} />

              <Title level={5} style={{ fontSize: 13, color: token.colorTextSecondary, marginBottom: 12 }}>
                <GlobalOutlined style={{ marginRight: 6 }} />
                服务器参数设置 (IMAP / SMTP)
              </Title>

              <Row gutter={12}>
                <Col span={16}>
                  <Form.Item name="imapHost" label="IMAP 收信主机" style={{ marginBottom: 12 }}>
                    <Input placeholder="如 imap.qq.com" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="imapPort" label="IMAP 端口" style={{ marginBottom: 12 }}>
                    <Input placeholder="993" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={16}>
                  <Form.Item name="smtpHost" label="SMTP 发信主机" style={{ marginBottom: 16 }}>
                    <Input placeholder="如 smtp.qq.com" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="smtpPort" label="SMTP 端口" style={{ marginBottom: 16 }}>
                    <Input placeholder="465" />
                  </Form.Item>
                </Col>
              </Row>

              {/* 安全提示 */}
              <div
                style={{
                  background: token.colorSuccessBg,
                  border: `1px solid ${token.colorSuccessBorder}`,
                  borderRadius: token.borderRadius,
                  padding: '10px 14px',
                  marginBottom: 20,
                }}
              >
                <Space align="start" size={8}>
                  <SafetyCertificateOutlined
                    style={{ color: token.colorSuccess, fontSize: 16, marginTop: 2 }}
                  />
                  <div>
                    <Text strong style={{ color: token.colorSuccessText, fontSize: 13 }}>
                      端到端加密与安全防护
                    </Text>
                    <Paragraph
                      style={{ color: token.colorSuccessText, fontSize: 12, margin: 0, opacity: 0.9 }}
                    >
                      你的邮箱凭据与 OAuth 令牌在数据库中均采用 AES-256-GCM 强加密保存，仅在你本人发起会话或任务时动态解密调用。
                    </Paragraph>
                  </div>
                </Space>
              </div>

              {/* 按钮操作 */}
              <Space size={12} wrap>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={saveMutation.isLoading}
                  style={{ minWidth: 100 }}
                >
                  保存配置
                </Button>
                <Button
                  icon={<ApiOutlined />}
                  loading={testMutation.isLoading}
                  onClick={() => {
                    const values = form.getFieldsValue();
                    testMutation.mutate(values);
                  }}
                >
                  测试连通性
                </Button>
                {status?.configured ? (
                  <Popconfirm
                    title="确定要解除绑定并清除个人邮箱凭据吗？"
                    onConfirm={() => deleteMutation.mutate()}
                    okText="确定解除"
                    cancelText="取消"
                  >
                    <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isLoading}>
                      解除绑定
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            </Form>
          </Card>
        </Col>

        {/* 右侧：状态概览与智能指引 */}
        <Col xs={24} lg={10}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 当前连接概览 */}
            <Card
              title={
                <Space size={8}>
                  <Badge status={status?.configured ? 'success' : 'default'} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>连接状态与诊断</span>
                </Space>
              }
              bordered
              style={{
                borderRadius: token.borderRadiusLG,
                background: token.colorBgContainer,
                borderColor: token.colorBorderSecondary,
                boxShadow: token.boxShadowTertiary,
              }}
              styles={{ body: { padding: '14px 16px' } }}
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>绑定账号：</Text>
                  <Space size={6}>
                    <Text strong style={{ fontSize: 13, fontFamily: 'monospace' }}>
                      {status?.emailAddress || '未绑定'}
                    </Text>
                    {status?.providerType === 'microsoft_oauth' ? (
                      <Tag color="geekblue">OAuth 2.0</Tag>
                    ) : null}
                  </Space>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>连接方式：</Text>
                  <Text style={{ fontSize: 13 }}>
                    {status?.providerType === 'microsoft_oauth'
                      ? '微软官方 Graph API (现代认证)'
                      : status?.imapHost
                      ? `${status.imapHost}:${status.imapPort || 993}`
                      : '未配置'}
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>最后更新：</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {status?.updatedAt
                      ? new Date(status.updatedAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '无记录'}
                  </Text>
                </div>
              </Space>
            </Card>

            {/* GTD 收件箱自动同步卡片 */}
            <EmailInboxSyncCard isConfigured={Boolean(status?.configured)} />

            {/* AI 对话指令指引 */}
            <Card
              title={
                <Space size={8}>
                  <ThunderboltOutlined style={{ color: '#fa8c16' }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>在 AI 对话中直接使用</span>
                </Space>
              }
              bordered
              style={{
                borderRadius: token.borderRadiusLG,
                background: token.colorBgContainer,
                borderColor: token.colorBorderSecondary,
                boxShadow: token.boxShadowTertiary,
              }}
              styles={{ body: { padding: '12px 14px' } }}
            >
              <Paragraph style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 10 }}>
                配置完成后，前往 <strong>AI 对话 (Chat)</strong> 输入自然语言即可秒级调用：
              </Paragraph>

              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {PROMPT_EXAMPLES.map((item) => (
                  <div
                    key={item.title}
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '8px 10px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 3,
                      }}
                    >
                      <Text strong style={{ fontSize: 12, color: token.colorText }}>
                        {item.title}
                      </Text>
                      <Tooltip title="复制指令">
                        <Button
                          type="text"
                          size="small"
                          icon={
                            copiedPrompt === item.prompt ? (
                              <CheckOutlined style={{ color: token.colorSuccess }} />
                            ) : (
                              <CopyOutlined />
                            )
                          }
                          onClick={() => copyToClipboard(item.prompt)}
                        />
                      </Tooltip>
                    </div>
                    <Text
                      type="secondary"
                      style={{ fontSize: 11, display: 'block', marginBottom: 4 }}
                    >
                      {item.desc}
                    </Text>
                    <div
                      style={{
                        background: token.colorFillSecondary,
                        padding: '2px 6px',
                        borderRadius: 4,
                        display: 'inline-block',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>
                        👉 {item.prompt}
                      </Text>
                    </div>
                  </div>
                ))}
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      {/* 微软官方 Device Code 授权弹窗 */}
      <Modal
        title={
          <Space>
            <WindowsOutlined style={{ color: '#0078D4', fontSize: 20 }} />
            <span>微软官方账号授权 (Microsoft Account Login)</span>
          </Space>
        }
        open={oauthModalOpen}
        onCancel={() => {
          setOauthModalOpen(false);
          setIsPollingOAuth(false);
        }}
        footer={null}
        width={580}
        destroyOnClose
      >
        <div style={{ padding: '8px 0', textAlign: 'center' }}>
          <Paragraph style={{ fontSize: 14, color: token.colorTextSecondary }}>
            请复制下方 <strong>8 位授权码</strong>，并点击按钮前往微软官方页面完成授权：
          </Paragraph>

          <div
            style={{
              background: token.colorFillAlter,
              borderRadius: token.borderRadiusLG,
              padding: '16px 20px',
              margin: '12px 0 16px 0',
              border: `2px dashed ${token.colorPrimary}`,
              display: 'inline-block',
            }}
          >
            <Text
              strong
              style={{
                fontSize: 28,
                letterSpacing: 4,
                fontFamily: 'monospace',
                color: token.colorPrimary,
              }}
            >
              {deviceAuthInfo?.userCode || '----'}
            </Text>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              size="large"
              icon={<LinkOutlined />}
              href={deviceAuthInfo?.verificationUri || 'https://login.microsoft.com/device'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (deviceAuthInfo?.userCode) {
                  navigator.clipboard.writeText(deviceAuthInfo.userCode);
                  message.success(`已复制授权码「${deviceAuthInfo.userCode}」`);
                }
              }}
              style={{
                background: '#0078D4',
                borderColor: '#0078D4',
                minWidth: 280,
                height: 44,
                fontWeight: 500,
                borderRadius: 8,
              }}
            >
              复制授权码并前往微软登录页
            </Button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              若页面未自动跳转，请手动访问{' '}
              <a
                href={deviceAuthInfo?.verificationUri || 'https://login.microsoft.com/device'}
                target="_blank"
                rel="noopener noreferrer"
              >
                {deviceAuthInfo?.verificationUri || 'https://login.microsoft.com/device'}
              </a>
            </Text>
          </div>

          <div
            style={{
              background: token.colorFillSecondary,
              borderRadius: token.borderRadius,
              padding: '10px 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <LoadingOutlined style={{ color: token.colorPrimary }} />
            <Text type="secondary" style={{ fontSize: 13 }}>
              正在等待你在微软官网确认授权（授权完成后将自动绑定）...
            </Text>
          </div>

          <Collapse
            ghost
            items={[
              {
                key: 'azure_guide',
                label: (
                  <Space size={6}>
                    <InfoCircleOutlined style={{ color: token.colorPrimary }} />
                    <Text style={{ fontSize: 12 }}>若遇到微软「第一方应用不可同意」提示？点击查看 1 分钟解决指引</Text>
                  </Space>
                ),
                children: (
                  <div style={{ textAlign: 'left', fontSize: 12, background: token.colorFillAlter, padding: 12, borderRadius: 6 }}>
                    <Paragraph style={{ fontSize: 12, margin: 0, color: token.colorTextSecondary }}>
                      微软安全策略要求个人账号（Hotmail）授权给已注册的 Azure 应用程序。只需免费注册一次：
                    </Paragraph>
                    <ol style={{ paddingLeft: 18, margin: '6px 0 10px 0', color: token.colorTextSecondary }}>
                      <li>访问 <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer">Azure 应用注册 (免费)</a>；</li>
                      <li>点击「新注册」，支持的账户类型选择<strong>「任何组织目录中的账户和个人 Microsoft 账户」</strong>；</li>
                      <li>重定向 URI 选择「公共客户端/移动和桌面」填入 <code>https://login.microsoftonline.com/common/oauth2/nativeclient</code> 并注册；</li>
                      <li>复制页面上的<strong>「应用程序(客户端) ID」</strong>，填入下方输入框后点击「重新生成」。</li>
                    </ol>
                    <Space.Compact style={{ width: '100%' }}>
                      <Input
                        placeholder="粘贴 Azure 应用程序(客户端) ID"
                        value={customClientId}
                        onChange={(e) => setCustomClientId(e.target.value)}
                        size="small"
                      />
                      <Button
                        type="primary"
                        size="small"
                        onClick={() => handleStartMicrosoftOAuth(customClientId)}
                      >
                        使用此 ID 授权
                      </Button>
                    </Space.Compact>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
