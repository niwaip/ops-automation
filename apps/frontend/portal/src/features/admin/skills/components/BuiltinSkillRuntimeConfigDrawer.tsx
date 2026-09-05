import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  GlobalOutlined,
  KeyOutlined,
  MailOutlined,
  NodeIndexOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { builtinSkillApi, BuiltinSkillInventoryDTO } from '@/api/skill';

const { Text, Title, Paragraph } = Typography;

const DEFAULT_PROVIDER_ORDER = ['tavily', 'firecrawl', 'exa', 'duckduckgo'];

const PROVIDER_INFO: Record<
  string,
  { label: string; desc: string; icon: string; keylessDesc?: string }
> = {
  tavily: {
    label: 'Tavily Search',
    desc: '高精度 AI 联网搜索与实时新闻检索，支持多 Key 轮换与 401/429/432 自动故障转移。',
    icon: '🔍',
  },
  firecrawl: {
    label: 'Firecrawl',
    desc: '支持 JavaScript 网页深度渲染与提取，支持多 Key 轮换。',
    keylessDesc: '默认启用免 Key 公开通道（每月 1,000 次免费额度）。',
    icon: '🔥',
  },
  exa: {
    label: 'Exa AI',
    desc: '基于语义嵌入的高质量 AI 互联网知识检索，支持多 Key 轮换。',
    icon: '⚡',
  },
  duckduckgo: {
    label: 'DuckDuckGo',
    desc: '免凭据零配置公开搜索引擎，在所有商用 API 配额耗尽时作为强力兜底。',
    keylessDesc: '开箱即用，无需配置任何 API Key。',
    icon: '🦆',
  },
};

const EMAIL_PRESETS = [
  {
    key: 'qq',
    label: 'QQ 邮箱',
    icon: '🐧',
    imapHost: 'imap.qq.com',
    imapPort: 993,
    smtpHost: 'smtp.qq.com',
    smtpPort: 465,
  },
  {
    key: '163',
    label: '163 网易邮箱',
    icon: '📮',
    imapHost: 'imap.163.com',
    imapPort: 993,
    smtpHost: 'smtp.163.com',
    smtpPort: 465,
  },
  {
    key: 'outlook',
    label: 'Outlook / Office 365',
    icon: '📧',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
  },
  {
    key: 'gmail',
    label: 'Gmail',
    icon: '🔴',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
  },
  {
    key: 'custom',
    label: '自定义企业邮箱',
    icon: '🏢',
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 465,
  },
];

export const BuiltinSkillRuntimeConfigDrawer: React.FC<{
  skill: BuiltinSkillInventoryDTO | null;
  open: boolean;
  onClose: () => void;
}> = ({ skill, open, onClose }) => {
  const [form] = Form.useForm<Record<string, string>>();
  const [clearingKeys, setClearingKeys] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const statusQuery = useQuery(
    ['builtin-skill-runtime-config', skill?.capabilityKey],
    () => builtinSkillApi.getRuntimeConfig(skill!.capabilityKey),
    { enabled: open && Boolean(skill) }
  );

  const updateMutation = useMutation(
    (values: Record<string, string | null>) =>
      builtinSkillApi.updateRuntimeConfig(skill!.capabilityKey, values),
    {
      onSuccess: () => {
        message.success('运行配置已保存并即时生效');
        form.resetFields();
        setClearingKeys({});
        queryClient.invalidateQueries(['builtin-skill-runtime-config', skill?.capabilityKey]);
        queryClient.invalidateQueries(['builtin-skill-inventory']);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || '运行配置保存失败');
      },
    }
  );

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setClearingKeys({});
    }
  }, [form, open]);

  const fields = statusQuery.data?.fields || skill?.runtimeConfig?.fields || [];
  const isWebSearch = skill?.capabilityKey === 'platform.search.web';
  const isEmail =
    skill?.capabilityKey?.startsWith('platform.email') ||
    skill?.capabilityKey === 'email.messages' ||
    skill?.capabilityKey === 'email.send';

  const handleClearField = (configKey: string) => {
    setClearingKeys((prev) => ({ ...prev, [configKey]: true }));
    updateMutation.mutate({ [configKey]: null });
  };

  const renderEmailConfig = () => {
    const fieldMap = new Map(fields.map((f) => [f.key, f]));
    const addressField = fieldMap.get('EMAIL_ADDRESS');
    const passwordField = fieldMap.get('EMAIL_AUTH_PASSWORD');
    const hasConfigured = addressField?.configured && passwordField?.configured;

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="开箱即用的内置邮件服务"
          description="支持通过标准 IMAP / SMTP 协议连接主流邮箱（QQ、163、Outlook、Gmail 或企业私有邮箱）。密码与凭据已通过宿主安全信封加密存储。"
        />

        {/* 1. 常用服务商预设 */}
        <Card
          size="small"
          title={
            <Space>
              <MailOutlined style={{ color: '#1677ff' }} />
              <span style={{ fontWeight: 600 }}>快捷选择邮箱服务商（一键填入主机与端口）</span>
            </Space>
          }
        >
          <Space wrap size={[8, 8]}>
            {EMAIL_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                size="small"
                onClick={() => {
                  form.setFieldsValue({
                    EMAIL_IMAP_HOST: preset.imapHost,
                    EMAIL_IMAP_PORT: preset.imapPort ? String(preset.imapPort) : undefined,
                    EMAIL_SMTP_HOST: preset.smtpHost,
                    EMAIL_SMTP_PORT: preset.smtpPort ? String(preset.smtpPort) : undefined,
                  });
                  message.success(`已应用「${preset.label}」服务器预设配置`);
                }}
              >
                <span>{preset.icon}</span> {preset.label}
              </Button>
            ))}
          </Space>
        </Card>

        {/* 2. 核心凭据 */}
        <Card
          size="small"
          title={
            <Space>
              <KeyOutlined style={{ color: '#52c41a' }} />
              <span style={{ fontWeight: 600 }}>邮箱账号与认证凭据</span>
              {hasConfigured ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  已配置
                </Tag>
              ) : (
                <Tag color="warning">待配置</Tag>
              )}
            </Space>
          }
          extra={
            hasConfigured && (
              <Popconfirm
                title="确定要清空已配置的邮箱账号和凭据吗？"
                onConfirm={() => {
                  handleClearField('EMAIL_ADDRESS');
                  handleClearField('EMAIL_AUTH_PASSWORD');
                }}
                okText="清空"
                cancelText="取消"
              >
                <Button
                  danger
                  type="link"
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={clearingKeys['EMAIL_ADDRESS'] || clearingKeys['EMAIL_AUTH_PASSWORD']}
                >
                  清空凭据
                </Button>
              </Popconfirm>
            )
          }
        >
          <Form.Item
            name="EMAIL_ADDRESS"
            label="邮箱账号"
            required
            rules={[{ required: true, message: '请输入邮箱账号' }]}
            style={{ marginBottom: 12 }}
          >
            <Input
              placeholder={
                addressField?.configured
                  ? '已保存。留空保持当前值，或输入新邮箱替换'
                  : '例如: your_name@qq.com / your_name@163.com'
              }
            />
          </Form.Item>

          <Form.Item
            name="EMAIL_AUTH_PASSWORD"
            label="密码 / 专用授权码"
            required
            extra="国内主流邮箱（QQ、163）请使用在邮箱后台生成的客户端专用「授权码」，勿输入网页登录主密码"
            style={{ marginBottom: 12 }}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={
                passwordField?.configured
                  ? '已保存。留空保持当前值，或输入新授权码替换'
                  : '请输入 16 位邮箱授权码或登录密码'
              }
            />
          </Form.Item>

          <Form.Item
            name="EMAIL_SENDER_NAME"
            label="发件人外显名称 (可选)"
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="例如: 自动化运维助理 / Ops Bot" />
          </Form.Item>
        </Card>

        {/* 3. 服务器连接设置 */}
        <Card
          size="small"
          title={
            <Space>
              <GlobalOutlined style={{ color: '#722ed1' }} />
              <span style={{ fontWeight: 600 }}>服务器连接参数 (IMAP / SMTP)</span>
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item
                name="EMAIL_IMAP_HOST"
                label="IMAP 收信主机"
                style={{ flex: 1, marginBottom: 0 }}
              >
                <Input placeholder="如 imap.qq.com" />
              </Form.Item>
              <Form.Item
                name="EMAIL_IMAP_PORT"
                label="IMAP 端口"
                style={{ width: 120, marginBottom: 0 }}
              >
                <Input placeholder="993" />
              </Form.Item>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item
                name="EMAIL_SMTP_HOST"
                label="SMTP 发信主机"
                style={{ flex: 1, marginBottom: 0 }}
              >
                <Input placeholder="如 smtp.qq.com" />
              </Form.Item>
              <Form.Item
                name="EMAIL_SMTP_PORT"
                label="SMTP 端口"
                style={{ width: 120, marginBottom: 0 }}
              >
                <Input placeholder="465" />
              </Form.Item>
            </div>
          </Space>
        </Card>
      </Space>
    );
  };

  const renderWebSearchConfig = () => {
    const fieldMap = new Map(fields.map((f) => [f.key, f]));
    const tavilyField = fieldMap.get('TAVILY_API_KEY');
    const firecrawlField = fieldMap.get('FIRECRAWL_API_KEY');
    const exaField = fieldMap.get('EXA_API_KEY');

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="多 Provider 故障转移与多 Key 轮换体系"
          description="系统已支持多引擎故障转移（Failover）。密钥支持输入逗号分隔的多个 Key（如 key1, key2），遇到限流或欠费自动轮换并顺位降级。"
        />

        {/* 1. 优先级配置 */}
        <Card
          size="small"
          title={
            <Space>
              <NodeIndexOutlined style={{ color: '#1677ff' }} />
              <span>通道故障转移（Failover）优先级</span>
            </Space>
          }
          extra={
            <Button
              type="link"
              size="small"
              onClick={() => {
                form.setFieldsValue({
                  SEARCH_PROVIDER_ORDER: DEFAULT_PROVIDER_ORDER.join(','),
                });
              }}
            >
              恢复默认推荐顺序
            </Button>
          }
        >
          <Form.Item
            name="SEARCH_PROVIDER_ORDER"
            label="搜索通道调用顺序"
            extra="按顺序依次尝试，上一通道不可用或配额耗尽时自动降级到下一通道"
          >
            <Select
              mode="tags"
              style={{ width: '100%' }}
              placeholder="默认: tavily, firecrawl, exa, duckduckgo"
              options={DEFAULT_PROVIDER_ORDER.map((key) => ({
                label: `${PROVIDER_INFO[key].icon} ${PROVIDER_INFO[key].label}`,
                value: key,
              }))}
            />
          </Form.Item>
        </Card>

        {/* 2. 提供商卡片 */}
        <Title level={5} style={{ margin: '8px 0 0 0' }}>
          <GlobalOutlined /> 搜索引擎通道配置
        </Title>

        {/* Tavily */}
        <Card
          size="small"
          title={
            <Space>
              <span>{PROVIDER_INFO.tavily.icon}</span>
              <span style={{ fontWeight: 600 }}>{PROVIDER_INFO.tavily.label}</span>
              {tavilyField?.configured ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  已配置专属 Key
                </Tag>
              ) : (
                <Tag color="default">未配置</Tag>
              )}
            </Space>
          }
          extra={
            tavilyField?.configured && (
              <Popconfirm
                title="确定要清空已保存的 Tavily API Key 吗？"
                onConfirm={() => handleClearField('TAVILY_API_KEY')}
                okText="清空"
                cancelText="取消"
              >
                <Button
                  danger
                  type="link"
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={clearingKeys['TAVILY_API_KEY']}
                >
                  清空配置
                </Button>
              </Popconfirm>
            )
          }
        >
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 10 }}>
            {PROVIDER_INFO.tavily.desc}
          </Paragraph>
          <Form.Item
            name="TAVILY_API_KEY"
            label="Tavily API Key (支持逗号分隔多 Key 轮换)"
            style={{ marginBottom: 4 }}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={
                tavilyField?.configured
                  ? '已安全加密保存。留空保持当前值，输入新 Key 可替换'
                  : 'tvly-xxx 或 tvly-1, tvly-2'
              }
            />
          </Form.Item>
        </Card>

        {/* Firecrawl */}
        <Card
          size="small"
          title={
            <Space>
              <span>{PROVIDER_INFO.firecrawl.icon}</span>
              <span style={{ fontWeight: 600 }}>{PROVIDER_INFO.firecrawl.label}</span>
              {firecrawlField?.configured ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  已配置专属 Key
                </Tag>
              ) : (
                <Tag color="processing">免 Key 公开通道就绪 (1000次/月)</Tag>
              )}
            </Space>
          }
          extra={
            firecrawlField?.configured && (
              <Popconfirm
                title="确定要清空 Firecrawl API Key 吗？清空后将自动转为免 Key 公开通道。"
                onConfirm={() => handleClearField('FIRECRAWL_API_KEY')}
                okText="清空"
                cancelText="取消"
              >
                <Button
                  danger
                  type="link"
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={clearingKeys['FIRECRAWL_API_KEY']}
                >
                  清空配置
                </Button>
              </Popconfirm>
            )
          }
        >
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 10 }}>
            {PROVIDER_INFO.firecrawl.desc}
            <Text type="success"> {PROVIDER_INFO.firecrawl.keylessDesc}</Text>
          </Paragraph>
          <Form.Item
            name="FIRECRAWL_API_KEY"
            label="Firecrawl API Key (可选)"
            style={{ marginBottom: 4 }}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={
                firecrawlField?.configured
                  ? '已保存。留空保持当前值，或输入新 Key 替换'
                  : '留空默认走免 Key 通道，或输入 fc-xxx'
              }
            />
          </Form.Item>
        </Card>

        {/* Exa */}
        <Card
          size="small"
          title={
            <Space>
              <span>{PROVIDER_INFO.exa.icon}</span>
              <span style={{ fontWeight: 600 }}>{PROVIDER_INFO.exa.label}</span>
              {exaField?.configured ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  已配置专属 Key
                </Tag>
              ) : (
                <Tag color="default">未配置</Tag>
              )}
            </Space>
          }
          extra={
            exaField?.configured && (
              <Popconfirm
                title="确定要清空已保存的 Exa API Key 吗？"
                onConfirm={() => handleClearField('EXA_API_KEY')}
                okText="清空"
                cancelText="取消"
              >
                <Button
                  danger
                  type="link"
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={clearingKeys['EXA_API_KEY']}
                >
                  清空配置
                </Button>
              </Popconfirm>
            )
          }
        >
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 10 }}>
            {PROVIDER_INFO.exa.desc}
          </Paragraph>
          <Form.Item name="EXA_API_KEY" label="Exa API Key (可选)" style={{ marginBottom: 4 }}>
            <Input.Password
              autoComplete="new-password"
              placeholder={
                exaField?.configured
                  ? '已保存。留空保持当前值，输入新 Key 可替换'
                  : '输入 exa-xxx'
              }
            />
          </Form.Item>
        </Card>

        {/* DuckDuckGo */}
        <Card
          size="small"
          style={{ background: 'rgba(255, 255, 255, 0.03)' }}
          title={
            <Space>
              <span>{PROVIDER_INFO.duckduckgo.icon}</span>
              <span style={{ fontWeight: 600 }}>{PROVIDER_INFO.duckduckgo.label}</span>
              <Tag color="cyan">开箱即用 (零凭据)</Tag>
            </Space>
          }
        >
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 0 }}>
            {PROVIDER_INFO.duckduckgo.desc}
            <Text type="success"> {PROVIDER_INFO.duckduckgo.keylessDesc}</Text>
          </Paragraph>
        </Card>
      </Space>
    );
  };

  const renderGenericConfig = () => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="密钥由后端加密保存，保存后不会再次回显明文。留空表示保持当前值。"
      />
      {fields.map((field) => (
        <Card
          key={field.key}
          size="small"
          title={
            <Space>
              <KeyOutlined />
              <span>{field.label}</span>
              {field.configured ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  已配置
                </Tag>
              ) : (
                <Tag color="default">未配置</Tag>
              )}
            </Space>
          }
          extra={
            field.configured && (
              <Popconfirm
                title={`确定要清空 ${field.label} 吗？`}
                onConfirm={() => handleClearField(field.key)}
                okText="清空"
                cancelText="取消"
              >
                <Button
                  danger
                  type="link"
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={clearingKeys[field.key]}
                >
                  清空
                </Button>
              </Popconfirm>
            )
          }
        >
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 10 }}>
            {field.description}
          </Paragraph>
          <Form.Item name={field.key} style={{ marginBottom: 0 }}>
            {field.secret ? (
              <Input.Password
                autoComplete="new-password"
                placeholder={
                  field.configured
                    ? '留空保持当前值，输入新值可替换'
                    : `请输入 ${field.key}`
                }
              />
            ) : (
              <Input
                placeholder={
                  field.configured
                    ? '留空保持当前值，输入新值可替换'
                    : `请输入 ${field.key}`
                }
              />
            )}
          </Form.Item>
        </Card>
      ))}
    </Space>
  );

  return (
    <Drawer
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#1677ff' }} />
          <span>配置内置 Skill - {skill?.displayName || ''}</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={600}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            onClick={() => form.submit()}
            loading={updateMutation.isLoading}
          >
            保存配置
          </Button>
        </Space>
      }
    >
      {fields.length === 0 ? (
        <Text type="secondary">该内置 Skill 暂无可配置项。</Text>
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            const changed: Record<string, string> = {};
            for (const [key, val] of Object.entries(values || {})) {
              if (Array.isArray(val)) {
                changed[key] = val.join(',');
              } else if (typeof val === 'string' && val.trim()) {
                changed[key] = val.trim();
              }
            }
            if (!Object.keys(changed).length) {
              message.info('未做任何变更');
              return;
            }
            updateMutation.mutate(changed);
          }}
        >
          {isWebSearch
            ? renderWebSearchConfig()
            : isEmail
            ? renderEmailConfig()
            : renderGenericConfig()}
        </Form>
      )}
    </Drawer>
  );
};
