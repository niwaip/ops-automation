import {
  ApiOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  KeyOutlined,
  MailOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Collapse,
  Form,
  Input,
  Popconfirm,
  Row,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useEffect, useState } from 'react';
import type { FormInstance } from 'antd';
import type { SaveUserEmailRequest, UserEmailConnectionStatus } from '@/api';

const { Text } = Typography;

const EMAIL_PRESETS = [
  {
    key: 'qq',
    label: 'QQ 邮箱',
    icon: '🐧',
    imapHost: 'imap.qq.com',
    imapPort: 993,
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
    tip: 'QQ 邮箱请使用专属 16 位「授权码」，在 QQ 邮箱设置 -> 账户中开启 POP3/IMAP 获取。',
  },
  {
    key: '163',
    label: '163 网易邮箱',
    icon: '📮',
    imapHost: 'imap.163.com',
    imapPort: 993,
    smtpHost: 'smtp.163.com',
    smtpPort: 465,
    tip: '163 邮箱请在「设置 -> POP3/SMTP/IMAP」中开启服务并生成「授权密码」。',
  },
  {
    key: 'gmail',
    label: 'Gmail',
    icon: '🔴',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    tip: 'Gmail 需开启两步验证并生成「应用专用密码 (App Password)」。',
  },
  {
    key: 'custom',
    label: '企业专属邮箱',
    icon: '🏢',
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 465,
    tip: '支持阿里企业邮、腾讯企业邮、Exchange 或私有部署 IMAP/SMTP。请展开下方高级设置填写服务器。',
  },
];

interface ImapSmtpConfigCardProps {
  connection: UserEmailConnectionStatus | undefined;
  form: FormInstance<SaveUserEmailRequest>;
  onSave: (values: SaveUserEmailRequest) => void;
  onTest: (values: SaveUserEmailRequest) => void;
  onDelete: () => void;
  isSaving: boolean;
  isTesting: boolean;
  isDeleting: boolean;
}

export function ImapSmtpConfigCard({
  connection,
  form,
  onSave,
  onTest,
  onDelete,
  isSaving,
  isTesting,
  isDeleting,
}: ImapSmtpConfigCardProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [activeCollapseKeys, setActiveCollapseKeys] = useState<string[]>([]);
  const [selectedPresetKey, setSelectedPresetKey] = useState<string | null>(null);

  const isConfigured = Boolean(connection?.configured);
  const isImapActive = isConfigured && connection?.providerType !== 'microsoft_oauth';

  // 初始加载时若有已填写的自定义主机，展开高级设置以便查看
  useEffect(() => {
    if (connection?.imapHost) {
      const matchPreset = EMAIL_PRESETS.find(
        (p) => p.imapHost && p.imapHost.toLowerCase() === connection.imapHost?.toLowerCase()
      );
      if (matchPreset) {
        setSelectedPresetKey(matchPreset.key);
      } else {
        setSelectedPresetKey('custom');
      }
    }
  }, [connection]);

  const handleApplyPreset = (preset: (typeof EMAIL_PRESETS)[0]) => {
    setSelectedPresetKey(preset.key);
    form.setFieldsValue({
      imapHost: preset.imapHost,
      imapPort: preset.imapPort,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
    });

    if (preset.key === 'custom') {
      // 企业邮箱自动展开高级设置
      if (!activeCollapseKeys.includes('server_settings')) {
        setActiveCollapseKeys((prev) => [...prev, 'server_settings']);
      }
      message.info('已切换为企业专属邮箱，请展开下方高级服务器参数输入主机地址');
    } else {
      message.success(`已一键填充「${preset.label}」服务器参数与端口`);
    }
  };

  return (
    <Card
      title={
        <Space size={8}>
          <KeyOutlined style={{ color: token.colorPrimary }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>传统 IMAP / SMTP 账号配置</span>
          {isImapActive ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              IMAP 连接已激活
            </Tag>
          ) : isConfigured ? (
            <Tag color="default">当前使用微软官方授权</Tag>
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
      styles={{ body: { padding: '20px 22px' } }}
    >
      {/* 快捷服务商预设胶囊 */}
      <div style={{ marginBottom: 20 }}>
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
          选择常用邮箱服务商（点击一键自动填入服务器与端口）：
        </Text>
        <Space wrap size={[8, 8]}>
          {EMAIL_PRESETS.map((p) => {
            const isSelected = selectedPresetKey === p.key;
            return (
              <Button
                key={p.key}
                type={isSelected ? 'primary' : 'default'}
                ghost={isSelected}
                size="middle"
                onClick={() => handleApplyPreset(p)}
                style={{ borderRadius: 6, fontWeight: isSelected ? 600 : 400 }}
              >
                <span>{p.icon}</span> {p.label}
              </Button>
            );
          })}
        </Space>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={onSave}
        requiredMark="optional"
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="emailAddress"
              label={<span style={{ fontWeight: 500 }}>邮箱账号</span>}
              rules={[{ required: true, message: '请输入完整的邮箱地址' }]}
            >
              <Input
                prefix={<MailOutlined style={{ color: token.colorTextTertiary }} />}
                placeholder="例如: your_name@qq.com / staff@company.com"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="senderName"
              label={<span style={{ fontWeight: 500 }}>发件人外显姓名 (可选)</span>}
            >
              <Input
                prefix={<UserOutlined style={{ color: token.colorTextTertiary }} />}
                placeholder="例如: 张三 / 运维助理 (发信署名)"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="authPassword"
          label={<span style={{ fontWeight: 500 }}>授权码 / 专用密码</span>}
          rules={[
            {
              required: !isConfigured && connection?.providerType !== 'microsoft_oauth',
              message: '请输入邮箱专属授权码或密码',
            },
          ]}
        >
          <Input.Password
            prefix={<KeyOutlined style={{ color: token.colorTextTertiary }} />}
            autoComplete="new-password"
            placeholder={
              isConfigured
                ? '已保存密码。留空保持不变，或输入新授权码替换'
                : '国内邮箱（QQ/163）请填入 16 位客户端授权码，非登录密码'
            }
          />
        </Form.Item>

        {/* 可折叠收起区域：高级服务器参数与帮助指南 */}
        <div style={{ marginTop: 8, marginBottom: 18 }}>
          <Collapse
            activeKey={activeCollapseKeys}
            onChange={(keys) => setActiveCollapseKeys(typeof keys === 'string' ? [keys] : keys)}
            bordered={false}
            style={{ background: 'transparent' }}
            items={[
              {
                key: 'server_settings',
                label: (
                  <Space size={6}>
                    <SettingOutlined style={{ color: token.colorPrimary }} />
                    <Text strong style={{ fontSize: 13, color: token.colorPrimary }}>
                      高级服务器参数 (IMAP / SMTP 协议主机与端口)
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      （常用服务商已自动填充，点击可展开自定义）
                    </Text>
                  </Space>
                ),
                children: (
                  <div
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '16px 16px 4px 16px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Row gutter={12}>
                      <Col xs={24} sm={16}>
                        <Form.Item name="imapHost" label="IMAP 收信主机" style={{ marginBottom: 12 }}>
                          <Input placeholder="如 imap.qq.com / imap.exmail.qq.com" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="imapPort" label="IMAP 端口" style={{ marginBottom: 12 }}>
                          <Input placeholder="993" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col xs={24} sm={16}>
                        <Form.Item name="smtpHost" label="SMTP 发信主机" style={{ marginBottom: 12 }}>
                          <Input placeholder="如 smtp.qq.com / smtp.exmail.qq.com" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="smtpPort" label="SMTP 端口" style={{ marginBottom: 12 }}>
                          <Input placeholder="465" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                ),
              },
              {
                key: 'auth_code_guide',
                label: (
                  <Space size={6}>
                    <QuestionCircleOutlined style={{ color: token.colorInfo }} />
                    <Text style={{ fontSize: 12 }}>各邮箱服务商「授权码」获取指引 (点击查看)</Text>
                  </Space>
                ),
                children: (
                  <div
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '12px 14px',
                      fontSize: 12,
                      color: token.colorTextSecondary,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: '20px' }}>
                      <li>
                        <strong>QQ 邮箱</strong>：登录网页版 ➔ 设置 ➔ 账户 ➔ 找到「POP3/IMAP/SMTP 服务」点击开启 ➔ 发送短信生成 16 位字母授权码。
                      </li>
                      <li>
                        <strong>163 网易邮箱</strong>：登录网页版 ➔ 设置 ➔ POP3/SMTP/IMAP ➔ 开启服务 ➔ 新增「客户端授权密码」。
                      </li>
                      <li>
                        <strong>企业专属邮箱</strong>：通常使用公司分配的专用密码或专用邮箱别名，服务器主机请咨询企业 IT 或查看企业邮后台。
                      </li>
                    </ul>
                  </div>
                ),
              },
              {
                key: 'security_note',
                label: (
                  <Space size={6}>
                    <SafetyCertificateOutlined style={{ color: token.colorSuccess }} />
                    <Text style={{ fontSize: 12 }}>端到端加密与安全防护说明</Text>
                  </Space>
                ),
                children: (
                  <div
                    style={{
                      background: token.colorSuccessBg,
                      border: `1px solid ${token.colorSuccessBorder}`,
                      borderRadius: token.borderRadius,
                      padding: '10px 14px',
                      fontSize: 12,
                      color: token.colorSuccessText,
                    }}
                  >
                    你的邮箱密码/授权码在存入数据库前通过 AES-256-GCM 强算法加密，密文隔离存储。系统仅在你本人授权发起查发信时在受限沙箱中解密使用，平台运维人员无法查看明文。
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* 底部操作按钮 */}
        <Space size={12} wrap>
          <Button
            type="primary"
            htmlType="submit"
            loading={isSaving}
            style={{ minWidth: 100, height: 38, borderRadius: 6 }}
          >
            保存并连接
          </Button>
          <Button
            icon={<ApiOutlined />}
            loading={isTesting}
            onClick={() => {
              const values = form.getFieldsValue();
              onTest(values);
            }}
            style={{ height: 38, borderRadius: 6 }}
          >
            测试连通性
          </Button>
          {isImapActive && (
            <Popconfirm
              title="确定要解除绑定并清除个人邮箱凭据吗？"
              onConfirm={onDelete}
              okText="确定解除"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />} loading={isDeleting} style={{ height: 38, borderRadius: 6 }}>
                解除绑定
              </Button>
            </Popconfirm>
          )}
        </Space>
      </Form>
    </Card>
  );
}
