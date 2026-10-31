import React, { useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleFilled,
  CompassOutlined,
  DeleteOutlined,
  EditOutlined,
  FireOutlined,
  GlobalOutlined,
  KeyOutlined,
  LinkOutlined,
  LockOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { UserCredentialItem, credentialApi } from '@/api/credentials';

const { Text, Title, Paragraph } = Typography;

export const PersonalApiKeyPanel: React.FC = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();

  // Fetch all credentials
  const { data: rawCredentials, isLoading } = useQuery(
    ['user-credentials'],
    () => credentialApi.list(),
    { staleTime: 30000 }
  );

  const credentials: UserCredentialItem[] = Array.isArray(rawCredentials) ? rawCredentials : [];

  // Identify specific personal service credentials
  const jinaCredential = credentials.find(
    (c) =>
      c.category === 'api_key' &&
      (/JINA/i.test(c.name) || /jina/i.test(c.description || ''))
  );

  const tavilyCredential = credentials.find(
    (c) =>
      c.category === 'api_key' &&
      (/TAVILY/i.test(c.name) || /tavily/i.test(c.description || ''))
  );

  const firecrawlCredential = credentials.find(
    (c) =>
      c.category === 'api_key' &&
      (/FIRECRAWL/i.test(c.name) || /firecrawl/i.test(c.description || ''))
  );

  // Other personal custom API keys (category === 'api_key' not Jina, Firecrawl or Tavily)
  const otherCustomKeys = credentials.filter(
    (c) =>
      c.category === 'api_key' &&
      !/JINA/i.test(c.name) &&
      !/jina/i.test(c.description || '') &&
      !/TAVILY/i.test(c.name) &&
      !/tavily/i.test(c.description || '') &&
      !/FIRECRAWL/i.test(c.name) &&
      !/firecrawl/i.test(c.description || '')
  );

  // Modal states
  const [isJinaModalOpen, setIsJinaModalOpen] = useState(false);
  const [isFirecrawlModalOpen, setIsFirecrawlModalOpen] = useState(false);
  const [isTavilyModalOpen, setIsTavilyModalOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isVerifyingJina, setIsVerifyingJina] = useState(false);
  const [isVerifyingFirecrawl, setIsVerifyingFirecrawl] = useState(false);
  const [isVerifyingTavily, setIsVerifyingTavily] = useState(false);
  const [jinaForm] = Form.useForm();
  const [firecrawlForm] = Form.useForm();
  const [tavilyForm] = Form.useForm();
  const [customForm] = Form.useForm();

  // Save / Update Mutation
  const saveMutation = useMutation(
    async ({
      id,
      name,
      tokenVal,
      description,
    }: {
      id?: string;
      name: string;
      tokenVal: string;
      description?: string;
    }) => {
      if (id) {
        return credentialApi.update(id, {
          name,
          description,
          payload: { token: tokenVal.trim() },
        });
      }
      return credentialApi.create({
        name,
        category: 'api_key',
        description,
        payload: { token: tokenVal.trim() },
      });
    },
    {
      onSuccess: () => {
        message.success('API 密钥保存成功并已加密存储');
        queryClient.invalidateQueries(['user-credentials']);
        setIsJinaModalOpen(false);
        setIsFirecrawlModalOpen(false);
        setIsTavilyModalOpen(false);
        setIsCustomModalOpen(false);
        jinaForm.resetFields();
        firecrawlForm.resetFields();
        tavilyForm.resetFields();
        customForm.resetFields();
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err.message || '保存失败');
      },
    }
  );

  // Delete Mutation
  const deleteMutation = useMutation(
    (id: string) => credentialApi.delete(id),
    {
      onSuccess: () => {
        message.success('凭据已成功清除');
        queryClient.invalidateQueries(['user-credentials']);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err.message || '清除失败');
      },
    }
  );

  // Verify Jina Key
  const handleVerifyJina = async (tokenInput?: string) => {
    let testKey = tokenInput?.trim();
    if (!testKey && isJinaModalOpen) {
      testKey = jinaForm.getFieldValue('token')?.trim();
    }
    if (!testKey && !jinaCredential) {
      message.warning('请先输入需要验证的 Jina API Key');
      return;
    }

    setIsVerifyingJina(true);
    try {
      const res = await credentialApi.verifyJinaApiKey(testKey || 'SAVED_KEY', jinaCredential?.id);
      if (res.valid) {
        message.success(res.message || 'Jina API Key 验证通过，服务连接正常！');
      } else {
        message.error(res.message || 'Jina API Key 验证未通过，请检查有效性');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message || '连通性测试请求失败');
    } finally {
      setIsVerifyingJina(false);
    }
  };

  // Verify Firecrawl Key
  const handleVerifyFirecrawl = async (tokenInput?: string) => {
    let testKey = tokenInput?.trim();
    if (!testKey && isFirecrawlModalOpen) {
      testKey = firecrawlForm.getFieldValue('token')?.trim();
    }
    if (!testKey && !firecrawlCredential) {
      message.warning('请先输入需要验证的 Firecrawl API Key');
      return;
    }

    setIsVerifyingFirecrawl(true);
    try {
      const res = await credentialApi.verifyFirecrawlApiKey(testKey || 'SAVED_KEY', firecrawlCredential?.id);
      if (res.valid) {
        message.success(res.message || 'Firecrawl API Key 验证通过，服务连接正常！');
      } else {
        message.error(res.message || 'Firecrawl API Key 验证未通过，请检查有效性');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message || '连通性测试请求失败');
    } finally {
      setIsVerifyingFirecrawl(false);
    }
  };

  // Verify Tavily Key
  const handleVerifyTavily = async (tokenInput?: string) => {
    let testKey = tokenInput?.trim();
    if (!testKey && isTavilyModalOpen) {
      testKey = tavilyForm.getFieldValue('token')?.trim();
    }
    if (!testKey && !tavilyCredential) {
      message.warning('请先输入需要验证的 Tavily API Key');
      return;
    }

    setIsVerifyingTavily(true);
    try {
      const res = await credentialApi.verifyTavilyApiKey(testKey || 'SAVED_KEY', tavilyCredential?.id);
      if (res.valid) {
        message.success(res.message || 'Tavily API Key 验证通过，搜索通道连接正常！');
      } else {
        message.error(res.message || 'Tavily API Key 验证未通过，请检查有效性');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message || '连通性测试请求失败');
    } finally {
      setIsVerifyingTavily(false);
    }
  };

  const popularServices = [
    {
      key: 'jina',
      title: 'Jina AI 网页解析',
      envKey: 'JINA_API_KEY',
      subTitle: '智能反爬穿透与 Markdown 提取',
      icon: <GlobalOutlined />,
      iconBg: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
      iconShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
      activeBorderColor: 'rgba(34, 197, 94, 0.4)',
      activeShadow: '0 4px 16px rgba(34, 197, 94, 0.06)',
      credential: jinaCredential,
      unconfiguredBadge: '公共匿名限流模式',
      desc: '用于知乎专栏、动态 SPA、技术社区等强反爬或 JS 渲染页面的快速解析。配置专属 Key 后享有独立并发额度（免费赠送 100 万 Token），避免公共限流与 403 阻断。',
      unconfiguredHint: '未配置时沙箱使用共享公共限流模式，高峰期受限于并发速率。',
      docUrl: 'https://jina.ai/reader/',
      docText: '申请免费 Jina Key',
      brandColor: '#3b82f6',
      onConfigure: () => {
        jinaForm.resetFields();
        jinaForm.setFieldsValue({ description: 'Jina AI 网页解析专属密钥' });
        setIsJinaModalOpen(true);
      },
      onEdit: () => {
        jinaForm.resetFields();
        jinaForm.setFieldsValue({ description: jinaCredential?.description || 'Jina AI 网页解析专属密钥' });
        setIsJinaModalOpen(true);
      },
      onVerify: () => handleVerifyJina(),
      isVerifying: isVerifyingJina,
    },
    {
      key: 'firecrawl',
      title: 'Firecrawl 智能抓取',
      envKey: 'FIRECRAWL_API_KEY',
      subTitle: '单页 Scrape 与深度全网 Crawl',
      icon: <FireOutlined />,
      iconBg: 'linear-gradient(135deg, #c2410c, #f97316)',
      iconShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
      activeBorderColor: 'rgba(249, 115, 22, 0.4)',
      activeShadow: '0 4px 16px rgba(249, 115, 22, 0.06)',
      credential: firecrawlCredential,
      unconfiguredBadge: '可选配置 (云端备选)',
      desc: '专为大模型打造的结构化网页抓取与爬虫服务。支持 JS 动态页面精准转 Markdown，在 Jina 失败或受限时自动兜底救场，亦可作为深度搜索增强。',
      unconfiguredHint: '未配置时作为备选跳过，在 Jina 失败后将直接回退至本地 Chromium 无头浏览器接盘。',
      docUrl: 'https://firecrawl.dev',
      docText: '申请 Firecrawl Key',
      brandColor: '#ea580c',
      onConfigure: () => {
        firecrawlForm.resetFields();
        firecrawlForm.setFieldsValue({ description: 'Firecrawl 智能抓取与爬虫 API Key' });
        setIsFirecrawlModalOpen(true);
      },
      onEdit: () => {
        firecrawlForm.resetFields();
        firecrawlForm.setFieldsValue({ description: firecrawlCredential?.description || 'Firecrawl 智能抓取与爬虫 API Key' });
        setIsFirecrawlModalOpen(true);
      },
      onVerify: () => handleVerifyFirecrawl(),
      isVerifying: isVerifyingFirecrawl,
    },
    {
      key: 'tavily',
      title: 'Tavily 智能全网检索',
      envKey: 'TAVILY_API_KEY',
      subTitle: 'AI Agent 深度事实溯源搜索',
      icon: <CompassOutlined />,
      iconBg: 'linear-gradient(135deg, #047857, #10b981)',
      iconShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
      activeBorderColor: 'rgba(16, 185, 129, 0.4)',
      activeShadow: '0 4px 16px rgba(16, 185, 129, 0.06)',
      credential: tavilyCredential,
      unconfiguredBadge: '可选配置 (内置通道)',
      desc: '专为自主 Agent 打造的权威事实搜索引擎，具备多源比对、去广告与正文提炼能力。配置后沙箱任务将自动优先使用您绑定的专属高配额 Tavily 通道。',
      unconfiguredHint: '未配置时系统默认使用平台内置搜索链路；配置后享受您专属的高速配额。',
      docUrl: 'https://tavily.com',
      docText: '申请 Tavily Search Key',
      brandColor: '#10b981',
      onConfigure: () => {
        tavilyForm.resetFields();
        tavilyForm.setFieldsValue({ description: 'Tavily 互联网深度搜索 API Key' });
        setIsTavilyModalOpen(true);
      },
      onEdit: () => {
        tavilyForm.resetFields();
        tavilyForm.setFieldsValue({ description: tavilyCredential?.description || 'Tavily 互联网深度搜索 API Key' });
        setIsTavilyModalOpen(true);
      },
      onVerify: () => handleVerifyTavily(),
      isVerifying: isVerifyingTavily,
    },
  ];

  return (
    <div>
      {/* 顶部标题与说明 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Title level={4} style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyOutlined style={{ color: '#6366f1' }} />
            个人专属 API 密钥配置
          </Title>
          <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
            此处配置面向当前个人账号的专属外部模型、网页解析与检索 API Key。采用 AES-256-GCM 独立加密存储，任务执行时仅注入您本人的隔离沙箱环境。
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            customForm.resetFields();
            setIsCustomModalOpen(true);
          }}
        >
          添加自定义 Key
        </Button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin tip="正在加载个人密钥..." />
        </div>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* 常用服务核心推荐卡片与快速添加卡片 */}
          <Row gutter={[16, 16]}>
            {popularServices.map((service) => (
              <Col xs={24} lg={12} xxl={8} key={service.key}>
                <Card
                  hoverable
                  style={{
                    borderRadius: 14,
                    height: '100%',
                    borderColor: service.credential ? service.activeBorderColor : token.colorBorderSecondary,
                    boxShadow: service.credential ? service.activeShadow : '0 2px 8px rgba(0, 0, 0, 0.03)',
                    transition: 'all 0.25s ease',
                  }}
                  styles={{
                    body: {
                      padding: '22px 24px',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    },
                  }}
                >
                  <div>
                    {/* 服务头部：左侧图标与服务名，右侧微胶囊状态 */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 14,
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: service.iconBg,
                            display: 'grid',
                            placeItems: 'center',
                            color: '#fff',
                            fontSize: 22,
                            flexShrink: 0,
                            boxShadow: service.iconShadow,
                          }}
                        >
                          {service.icon}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Text
                            strong
                            style={{
                              fontSize: 16,
                              color: token.colorTextHeading,
                              display: 'block',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              lineHeight: 1.3,
                            }}
                          >
                            {service.title}
                          </Text>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              marginTop: 4,
                              flexWrap: 'wrap',
                            }}
                          >
                            <code
                              style={{
                                fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                                fontSize: 11,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: token.colorFillAlter,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                color: token.colorTextSecondary,
                                lineHeight: '18px',
                              }}
                            >
                              {service.envKey}
                            </code>
                            <Text
                              type="secondary"
                              style={{
                                fontSize: 12,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {service.subTitle}
                            </Text>
                          </div>
                        </div>
                      </div>

                      {/* 状态徽标 */}
                      <div style={{ flexShrink: 0 }}>
                        {service.credential ? (
                          <Tag
                            color="success"
                            style={{
                              margin: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 500,
                            }}
                          >
                            <CheckCircleFilled style={{ fontSize: 11 }} />
                            <span>专属已生效</span>
                          </Tag>
                        ) : (
                          <Tag
                            style={{
                              margin: 0,
                              borderRadius: 12,
                              padding: '2px 8px',
                              fontSize: 12,
                              color: token.colorTextTertiary,
                              background: token.colorFillAlter,
                              border: `1px solid ${token.colorBorderSecondary}`,
                            }}
                          >
                            {service.unconfiguredBadge}
                          </Tag>
                        )}
                      </div>
                    </div>

                    {/* 简介说明 */}
                    <Paragraph
                      type="secondary"
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        marginBottom: 16,
                        minHeight: 42,
                      }}
                    >
                      {service.desc}
                    </Paragraph>

                    {/* 凭证信息条 */}
                    {service.credential ? (
                      <div
                        style={{
                          background: token.colorFillAlter,
                          border: `1px solid ${token.colorBorderSecondary}`,
                          borderRadius: 8,
                          padding: '9px 12px',
                          marginBottom: 16,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontFamily: 'monospace',
                          fontSize: 13,
                        }}
                      >
                        <Space size={8}>
                          <LockOutlined style={{ color: '#10b981', fontSize: 13 }} />
                          <span style={{ color: token.colorText, letterSpacing: 1 }}>
                            {service.credential.maskedPreview?.summary || '••••••••••••••••'}
                          </span>
                        </Space>
                        <Tag color="green" bordered={false} style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                          AES-256 加密
                        </Tag>
                      </div>
                    ) : (
                      <div
                        style={{
                          background: token.colorFillAlter,
                          borderRadius: 8,
                          padding: '9px 12px',
                          marginBottom: 16,
                          fontSize: 12,
                          color: token.colorTextTertiary,
                          border: `1px dashed ${token.colorBorderSecondary}`,
                          minHeight: 40,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {service.unconfiguredHint}
                      </div>
                    )}
                  </div>

                  {/* 卡片底栏操作 */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTop: `1px solid ${token.colorBorderSecondary}`,
                      paddingTop: 14,
                      marginTop: 8,
                    }}
                  >
                    <a
                      href={service.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 13,
                        color: service.brandColor,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>{service.docText}</span>
                      <LinkOutlined style={{ fontSize: 11 }} />
                    </a>

                    <Space size={6}>
                      {service.credential ? (
                        <>
                          {service.onVerify && (
                            <Button
                              size="small"
                              icon={<ThunderboltOutlined />}
                              loading={service.isVerifying}
                              onClick={service.onVerify}
                            >
                              测试
                            </Button>
                          )}
                          <Button size="small" icon={<EditOutlined />} onClick={service.onEdit}>
                            修改
                          </Button>
                          <Popconfirm
                            title={`确定清除 ${service.title}？`}
                            description="清除后，沙箱将自动回退为公共匿名或备选模式。"
                            onConfirm={() => deleteMutation.mutate(service.credential!.id)}
                            okText="清除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                          >
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </>
                      ) : (
                        <Button
                          type="primary"
                          ghost
                          size="small"
                          icon={<ThunderboltOutlined />}
                          onClick={service.onConfigure}
                        >
                          配置专属 Key
                        </Button>
                      )}
                    </Space>
                  </div>
                </Card>
              </Col>
            ))}

            {/* 第 4 个卡片：添加自定义环境变量 / API Key 引导卡片 */}
            <Col xs={24} lg={12} xxl={8}>
              <Card
                hoverable
                onClick={() => {
                  customForm.resetFields();
                  setIsCustomModalOpen(true);
                }}
                style={{
                  borderRadius: 14,
                  borderStyle: 'dashed',
                  borderColor: token.colorBorderSecondary,
                  background: 'transparent',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  minHeight: 280,
                  transition: 'all 0.25s ease',
                }}
                styles={{
                  body: {
                    padding: '24px',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                  },
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: token.colorFillAlter,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    display: 'grid',
                    placeItems: 'center',
                    color: token.colorPrimary,
                    fontSize: 22,
                    marginBottom: 14,
                  }}
                >
                  <PlusOutlined />
                </div>
                <Text strong style={{ fontSize: 16, color: token.colorTextHeading, marginBottom: 8 }}>
                  添加自定义环境变量 / API Key
                </Text>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    maxWidth: 320,
                    margin: '0 auto',
                  }}
                >
                  支持配置 OpenAI、Serper、Google 等外部模型或任意私有凭据，任务执行时自动安全注入您的沙箱环境。
                </Text>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  style={{ marginTop: 18 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    customForm.resetFields();
                    setIsCustomModalOpen(true);
                  }}
                >
                  添加私有 Key
                </Button>
              </Card>
            </Col>
          </Row>

          {/* 其他自定义个人环境变量与模型 API Keys */}
          {otherCustomKeys.length > 0 && (
            <Card
              style={{
                borderRadius: 14,
                borderColor: token.colorBorderSecondary,
                marginTop: 8,
              }}
              styles={{ body: { padding: '20px 24px' } }}
            >
              <Title level={5} style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ApiOutlined style={{ color: '#8b5cf6' }} />
                <span>其他自定义环境变量 / 模型 Key</span>
                <Tag color="purple">{otherCustomKeys.length} 个</Tag>
              </Title>

              <Row gutter={[12, 12]}>
                {otherCustomKeys.map((keyItem) => (
                  <Col xs={24} sm={12} md={8} key={keyItem.id}>
                    <div
                      style={{
                        background: token.colorFillAlter,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: 8,
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 6,
                        }}
                      >
                        <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>
                          {keyItem.name}
                        </Text>
                        <Popconfirm
                          title={`确定删除 ${keyItem.name}？`}
                          onConfirm={() => deleteMutation.mutate(keyItem.id)}
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          fontFamily: 'monospace',
                          color: token.colorTextSecondary,
                        }}
                      >
                        {keyItem.maskedPreview?.summary || '••••••••'}
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>
          )}
        </Space>
      )}

      {/* Jina API Key 配置弹窗 */}
      <Modal
        title={
          <Space>
            <GlobalOutlined style={{ color: '#3b82f6' }} />
            <span>配置 Jina AI API 密钥 (JINA_API_KEY)</span>
          </Space>
        }
        open={isJinaModalOpen}
        onCancel={() => setIsJinaModalOpen(false)}
        onOk={async () => {
          try {
            const values = await jinaForm.validateFields();
            await saveMutation.mutateAsync({
              id: jinaCredential?.id,
              name: 'JINA_API_KEY',
              tokenVal: values.token,
              description: values.description?.trim(),
            });
          } catch {
            // validation error
          }
        }}
        confirmLoading={saveMutation.isLoading}
        okText="安全保存"
        cancelText="取消"
        width={500}
        destroyOnClose
      >
        <Form form={jinaForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="token"
            label="Jina API Key 明文"
            rules={[
              { required: true, message: '请输入 Jina API Key' },
              {
                validator: (_, value) => {
                  if (!value || value.trim().length >= 8) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('请输入格式正确的 API Key'));
                },
              },
            ]}
            tooltip="通常以 jina_ 开头，可在 jina.ai/reader 免费申请"
          >
            <Input.Password
              placeholder="例如：jina_99e902b781a94e1e813a07817cf2d9c4..."
              prefix={<KeyOutlined style={{ color: token.colorTextQuaternary }} />}
              autoFocus
            />
          </Form.Item>

          <Form.Item name="description" label="备注说明 (可选)">
            <Input placeholder="Jina AI 网页解析专属密钥" />
          </Form.Item>

          <div
            style={{
              background: token.colorFillAlter,
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12,
              color: token.colorTextSecondary,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>可通过测试按钮提前验证连通性：</span>
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              loading={isVerifyingJina}
              onClick={() => handleVerifyJina()}
            >
              在线测试连通性
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Tavily Key 配置弹窗 */}
      <Modal
        title={
          <Space>
            <CompassOutlined style={{ color: '#10b981' }} />
            <span>配置 Tavily Search API 密钥 (TAVILY_API_KEY)</span>
          </Space>
        }
        open={isTavilyModalOpen}
        onCancel={() => setIsTavilyModalOpen(false)}
        onOk={async () => {
          try {
            const values = await tavilyForm.validateFields();
            await saveMutation.mutateAsync({
              id: tavilyCredential?.id,
              name: 'TAVILY_API_KEY',
              tokenVal: values.token,
              description: values.description?.trim(),
            });
          } catch {
            // validation error
          }
        }}
        confirmLoading={saveMutation.isLoading}
        okText="安全保存"
        cancelText="取消"
        width={500}
        destroyOnClose
      >
        <Form form={tavilyForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="token"
            label="Tavily API Key 明文"
            rules={[{ required: true, message: '请输入 Tavily API Key' }]}
            tooltip="可在 tavily.com 控制台免费获取"
          >
            <Input.Password
              placeholder="例如：tvly-xxxxxxxxxxxx"
              prefix={<KeyOutlined style={{ color: token.colorTextQuaternary }} />}
              autoFocus
            />
          </Form.Item>

          <Form.Item name="description" label="备注说明 (可选)">
            <Input placeholder="Tavily 互联网深度搜索 API Key" />
          </Form.Item>

          <div
            style={{
              background: token.colorFillAlter,
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12,
              color: token.colorTextSecondary,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>可在保存前在线测试可用性：</span>
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              loading={isVerifyingTavily}
              onClick={() => handleVerifyTavily()}
            >
              在线测试连通性
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Firecrawl Key 配置弹窗 */}
      <Modal
        title={
          <Space>
            <FireOutlined style={{ color: '#ea580c' }} />
            <span>配置 Firecrawl API 密钥 (FIRECRAWL_API_KEY)</span>
          </Space>
        }
        open={isFirecrawlModalOpen}
        onCancel={() => setIsFirecrawlModalOpen(false)}
        onOk={async () => {
          try {
            const values = await firecrawlForm.validateFields();
            await saveMutation.mutateAsync({
              id: firecrawlCredential?.id,
              name: 'FIRECRAWL_API_KEY',
              tokenVal: values.token,
              description: values.description?.trim(),
            });
          } catch {
            // validation error
          }
        }}
        confirmLoading={saveMutation.isLoading}
        okText="安全保存"
        cancelText="取消"
        width={500}
        destroyOnClose
      >
        <Form form={firecrawlForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="token"
            label="Firecrawl API Key 明文"
            rules={[{ required: true, message: '请输入 Firecrawl API Key' }]}
            tooltip="通常以 fc- 开头，可在 firecrawl.dev 控制台免费获取"
          >
            <Input.Password
              placeholder="例如：fc-xxxxxxxxxxxxxxxxxxxx"
              prefix={<KeyOutlined style={{ color: token.colorTextQuaternary }} />}
              autoFocus
            />
          </Form.Item>

          <Form.Item name="description" label="备注说明 (可选)">
            <Input placeholder="Firecrawl 智能抓取与爬虫 API Key" />
          </Form.Item>

          <div
            style={{
              background: token.colorFillAlter,
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12,
              color: token.colorTextSecondary,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>可在保存前在线测试可用性：</span>
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              loading={isVerifyingFirecrawl}
              onClick={() => handleVerifyFirecrawl()}
            >
              在线测试连通性
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 自定义环境变量弹窗 */}
      <Modal
        title={
          <Space>
            <KeyOutlined style={{ color: '#6366f1' }} />
            <span>添加个人环境变量 / API Key</span>
          </Space>
        }
        open={isCustomModalOpen}
        onCancel={() => setIsCustomModalOpen(false)}
        onOk={async () => {
          try {
            const values = await customForm.validateFields();
            const sanitizedName = values.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            await saveMutation.mutateAsync({
              name: sanitizedName,
              tokenVal: values.token,
              description: values.description?.trim(),
            });
          } catch {
            // validation error
          }
        }}
        confirmLoading={saveMutation.isLoading}
        okText="安全保存"
        cancelText="取消"
        width={500}
        destroyOnClose
      >
        <Form form={customForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="环境变量名 / 标识"
            rules={[{ required: true, message: '请输入环境变量名，如 SERPER_API_KEY' }]}
            tooltip="沙箱执行时将以此变量名注入当前用户的容器环境"
          >
            <Input placeholder="例如：SERPER_API_KEY、OPENAI_API_KEY" autoFocus />
          </Form.Item>

          <Form.Item
            name="token"
            label="密钥明文 (API Key / Token)"
            rules={[{ required: true, message: '请输入密钥内容' }]}
          >
            <Input.Password placeholder="请输入对应的 API Key 或 Token" />
          </Form.Item>

          <Form.Item name="description" label="备注说明 (可选)">
            <Input placeholder="例如：我的专属检索 API Key" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PersonalApiKeyPanel;
