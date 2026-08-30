import {
  ApiOutlined,
  AppstoreAddOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  MessageOutlined,
  NotificationOutlined,
  QrcodeOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Modal,
  QRCode,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { imChannelApi, type WechatChannelStatus } from '@/api';

const { Title, Text, Paragraph } = Typography;

type ChannelType = 'wechat' | 'feishu' | 'dingtalk' | 'slack';

interface StatusMeta {
  color: string;
  badgeStatus: 'success' | 'processing' | 'default' | 'error' | 'warning';
  text: string;
  desc: string;
  icon: React.ReactNode;
}

const STATUS_CONFIG: Record<WechatChannelStatus['status'], StatusMeta> = {
  unconfigured: {
    color: 'default',
    badgeStatus: 'default',
    text: '未配置',
    desc: '尚未绑定微信账号，点击“扫码绑定”即可接入',
    icon: <CloseCircleOutlined />,
  },
  provisioning: {
    color: 'processing',
    badgeStatus: 'processing',
    text: '等待扫码',
    desc: '请使用微信 App 扫描二维码并确认授权',
    icon: <SyncOutlined spin />,
  },
  disabled: {
    color: 'warning',
    badgeStatus: 'warning',
    text: '已配置 · 待开启',
    desc: '已成功绑定微信账号，打开右上角开关即可开始接收消息',
    icon: <InfoCircleOutlined />,
  },
  connecting: {
    color: 'processing',
    badgeStatus: 'processing',
    text: '连接中...',
    desc: '正在与微信 Bot 网关建立长轮询长连接通道',
    icon: <LoadingOutlined />,
  },
  online: {
    color: 'success',
    badgeStatus: 'success',
    text: '正常在线',
    desc: '长连接通道已建立，微信自聊消息将实时响应',
    icon: <CheckCircleOutlined />,
  },
  reauth_required: {
    color: 'warning',
    badgeStatus: 'warning',
    text: '需要重新授权',
    desc: '微信授权凭据已过期或失效，请重新扫码绑定',
    icon: <InfoCircleOutlined />,
  },
  error: {
    color: 'error',
    badgeStatus: 'error',
    text: '连接异常',
    desc: '长连接发生网络或协议错误，系统将自动尝试重连',
    icon: <CloseCircleOutlined />,
  },
};

const SHORTCUT_COMMANDS = [
  {
    cmd: '/t [任务内容]',
    aliases: ['/task', '/任务'],
    name: '强制任务模式',
    tagColor: 'blue',
    desc: '强制进入多步拓扑规划与技能编排，自动拆解步骤并调用自动化能力。',
    example: '/t 打开网页获取热榜并总结',
  },
  {
    cmd: '/c [对话内容]',
    aliases: ['/chat', '/聊天'],
    name: '直接问答模式',
    tagColor: 'green',
    desc: '跳过工具与技能规划，直接使用大模型进行自然对话问答。',
    example: '/c 解释一下量子力学的叠加态',
  },
  {
    cmd: '/n',
    aliases: ['/new', '/reset', '/clear', '/新会话'],
    name: '重置新会话',
    tagColor: 'purple',
    desc: '立即轮换 Session ID，清空上下文记忆，开启全新对话。',
    example: '/n 或者 /n /t 总结最新文档',
  },
  {
    cmd: '/help',
    aliases: ['/?', '/帮助'],
    name: '指令帮助',
    tagColor: 'default',
    desc: '查看支持的全部快捷指令与使用说明。',
    example: '/help',
  },
];

export default function ImChannelsPage() {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<ChannelType>('wechat');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const query = useQuery('wechat-channel', imChannelApi.getWechat, {
    refetchInterval: (data) =>
      data?.status === 'provisioning' || data?.status === 'connecting' ? 2000 : 10000,
  });

  const refresh = (data?: WechatChannelStatus) => {
    queryClient.setQueryData('wechat-channel', data);
  };

  const provision = useMutation<WechatChannelStatus, any, void>(
    () => imChannelApi.beginWechatProvisioning(),
    {
      onSuccess: refresh,
      onError: (e) => {
        message.error(e?.response?.data?.message || '生成微信绑定二维码失败');
      },
    }
  );

  const enable = useMutation<WechatChannelStatus, any, boolean>(
    (enabled) => imChannelApi.setWechatEnabled(enabled),
    {
      onSuccess: (data) => {
        refresh(data);
        message.success(data.enabled ? '微信长连接已开启' : '微信渠道已停用');
      },
      onError: (e) => {
        message.error(e?.response?.data?.message || '更新开关状态失败');
      },
    }
  );

  const interactionMode = useMutation<WechatChannelStatus, any, 'auto' | 'chat' | 'task'>(
    (mode) => imChannelApi.setWechatInteractionMode(mode),
    {
      onSuccess: (data) => {
        refresh(data);
        message.success('默认处理模式已更新');
      },
      onError: (e) => {
        message.error(e?.response?.data?.message || '模式更新失败');
      },
    }
  );

  const remove = useMutation<{ success: boolean }, unknown, void>(
    () => imChannelApi.removeWechat(),
    {
      onSuccess: () => {
        message.success('已移除微信渠道配置并清除本地凭据');
        void query.refetch();
      },
      onError: () => {
        message.error('移除配置失败');
      },
    }
  );

  const status = query.data;
  const statusMeta = useMemo(
    () => STATUS_CONFIG[status?.status ?? 'unconfigured'],
    [status?.status]
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    message.success(`已复制: ${text}`);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  if (query.isLoading) {
    return (
      <div style={{ minHeight: 400, display: 'grid', placeItems: 'center' }}>
        <Space direction="vertical" align="center" size="middle">
          <Spin size="large" />
          <Text type="secondary">正在加载 IM 渠道配置...</Text>
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
          position: 'relative',
          overflow: 'hidden',
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
                  background: '#07c160',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 4px 12px rgba(7, 193, 96, 0.25)',
                }}
              >
                <WechatOutlined style={{ color: '#fff', fontSize: 22 }} />
              </div>
              <div>
                <Title level={4} style={{ margin: 0, fontWeight: 600, color: token.colorText }}>
                  IM 即时通讯集成中心
                </Title>
              </div>
            </Space>
            <Paragraph
              type="secondary"
              style={{ margin: 0, fontSize: 13, color: token.colorTextSecondary, maxWidth: 660 }}
            >
              将 OpsPilot 自动化助手连接至你的即时通讯工具。支持微信自聊双向收发、原生打字状态反馈、多步骤自动化任务触发，并预留飞书、钉钉、Slack 等多渠道扩展。
            </Paragraph>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Space direction="vertical" align="end" size={4}>
              <Badge
                status={statusMeta.badgeStatus}
                text={
                  <Text strong style={{ fontSize: 14, color: token.colorText }}>
                    微信通道：{statusMeta.text}
                  </Text>
                }
              />
              <Text type="secondary" style={{ fontSize: 12, color: token.colorTextTertiary }}>
                {status?.enabled ? '长连接通道运行中' : '长连接已暂停'}
              </Text>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 渠道切换栏 */}
      <div style={{ marginBottom: 20 }}>
        <Segmented
          size="large"
          value={activeChannel}
          onChange={(val) => setActiveChannel(val as ChannelType)}
          options={[
            {
              value: 'wechat',
              label: (
                <Space size={8} style={{ padding: '4px 8px' }}>
                  <WechatOutlined style={{ color: '#07c160', fontSize: 16 }} />
                  <span>微信个人通道</span>
                  <Tag
                    color={status?.enabled ? 'success' : 'default'}
                    bordered={false}
                    style={{ margin: 0, borderRadius: 10, fontSize: 11, lineHeight: '18px' }}
                  >
                    {status?.enabled ? '在线' : '就绪'}
                  </Tag>
                </Space>
              ),
            },
            {
              value: 'feishu',
              label: (
                <Space size={8} style={{ padding: '4px 8px' }}>
                  <RocketOutlined style={{ color: '#00d6b9', fontSize: 16 }} />
                  <span>飞书 (Lark)</span>
                  <Tag
                    color="cyan"
                    bordered={false}
                    style={{ margin: 0, borderRadius: 10, fontSize: 11, lineHeight: '18px' }}
                  >
                    内测筹备
                  </Tag>
                </Space>
              ),
            },
            {
              value: 'dingtalk',
              label: (
                <Space size={8} style={{ padding: '4px 8px' }}>
                  <AppstoreAddOutlined style={{ color: '#007fff', fontSize: 16 }} />
                  <span>钉钉 (DingTalk)</span>
                  <Tag
                    bordered={false}
                    style={{ margin: 0, borderRadius: 10, fontSize: 11, lineHeight: '18px' }}
                  >
                    规划中
                  </Tag>
                </Space>
              ),
            },
            {
              value: 'slack',
              label: (
                <Space size={8} style={{ padding: '4px 8px' }}>
                  <ApiOutlined style={{ color: '#e01e5a', fontSize: 16 }} />
                  <span>Slack</span>
                  <Tag
                    bordered={false}
                    style={{ margin: 0, borderRadius: 10, fontSize: 11, lineHeight: '18px' }}
                  >
                    规划中
                  </Tag>
                </Space>
              ),
            },
          ]}
        />
      </div>

      {/* 微信渠道主界面 */}
      {activeChannel === 'wechat' ? (
        <Row gutter={[20, 20]}>
          {/* 左侧：微信通道状态与操作 */}
          <Col xs={24} lg={14}>
            <Card
              title={
                <Space size={10}>
                  <WechatOutlined style={{ color: '#07c160', fontSize: 20 }} />
                  <span style={{ fontWeight: 600, fontSize: 15, color: token.colorText }}>
                    微信个人自聊通道
                  </span>
                  <Tag
                    color={statusMeta.color}
                    style={{ borderRadius: 10, padding: '0 8px', border: 'none' }}
                  >
                    {statusMeta.text}
                  </Tag>
                </Space>
              }
              extra={
                <Space size={12}>
                  <Text type="secondary" style={{ fontSize: 13, color: token.colorTextSecondary }}>
                    {status?.enabled ? '长连接已开启' : '已停用'}
                  </Text>
                  <Switch
                    checked={Boolean(status?.enabled)}
                    disabled={!status?.configured || enable.isLoading}
                    loading={enable.isLoading}
                    checkedChildren="开启"
                    unCheckedChildren="关闭"
                    onChange={(checked) => enable.mutate(checked)}
                  />
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
              {/* Bento 网格 */}
              <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
                <Col span={12}>
                  <div
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '12px 14px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, display: 'block', marginBottom: 4, color: token.colorTextTertiary }}
                    >
                      <UserOutlined style={{ marginRight: 6 }} />
                      绑定微信账号
                    </Text>
                    <Text strong style={{ fontSize: 13, color: token.colorText }}>
                      {status?.providerAccountId ? (
                        <span style={{ fontFamily: 'monospace' }}>{status.providerAccountId}</span>
                      ) : (
                        <Text type="secondary">尚未绑定</Text>
                      )}
                    </Text>
                  </div>
                </Col>
                <Col span={12}>
                  <div
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '12px 14px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, display: 'block', marginBottom: 4, color: token.colorTextTertiary }}
                    >
                      <SettingOutlined style={{ marginRight: 6 }} />
                      默认交互模式
                    </Text>
                    <Select
                      size="small"
                      style={{ width: '100%', marginTop: 2 }}
                      value={status?.interactionMode ?? 'auto'}
                      loading={interactionMode.isLoading}
                      onChange={(mode) => interactionMode.mutate(mode)}
                      options={[
                        { value: 'auto', label: '⚡️ 智能路由（推荐）' },
                        { value: 'chat', label: '💬 仅日常问答' },
                        { value: 'task', label: '🤖 始终任务规划' },
                      ]}
                    />
                  </div>
                </Col>
                <Col span={12}>
                  <div
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '10px 14px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, display: 'block', marginBottom: 2, color: token.colorTextTertiary }}
                    >
                      <ClockCircleOutlined style={{ marginRight: 6 }} />
                      最近心跳连接
                    </Text>
                    <Text style={{ fontSize: 12, color: token.colorText }}>
                      {status?.lastConnectedAt
                        ? new Date(status.lastConnectedAt).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '无连接记录'}
                    </Text>
                  </div>
                </Col>
                <Col span={12}>
                  <div
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '10px 14px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, display: 'block', marginBottom: 2, color: token.colorTextTertiary }}
                    >
                      <MessageOutlined style={{ marginRight: 6 }} />
                      最近消息交互
                    </Text>
                    <Text style={{ fontSize: 12, color: token.colorText }}>
                      {status?.lastMessageAt
                        ? new Date(status.lastMessageAt).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '无消息记录'}
                    </Text>
                  </div>
                </Col>
              </Row>

              {/* 异常警示 */}
              {status?.lastError ? (
                <Alert
                  style={{ marginBottom: 16, borderRadius: token.borderRadius }}
                  type="error"
                  showIcon
                  message="长连接异常"
                  description={status.lastError}
                />
              ) : null}

              {/* 安全说明 */}
              <div
                style={{
                  background: token.colorSuccessBg,
                  border: `1px solid ${token.colorSuccessBorder}`,
                  borderRadius: token.borderRadius,
                  padding: '10px 14px',
                  marginBottom: 18,
                }}
              >
                <Space align="start" size={8}>
                  <SafetyCertificateOutlined
                    style={{ color: token.colorSuccess, fontSize: 16, marginTop: 2 }}
                  />
                  <div>
                    <Text strong style={{ color: token.colorSuccessText, fontSize: 13 }}>
                      隐私与通信安全
                    </Text>
                    <Paragraph
                      style={{ color: token.colorSuccessText, fontSize: 12, margin: 0, opacity: 0.9 }}
                    >
                      当前通道仅接收并响应你微信账号向文件传输助手/Bot 的**自聊消息**；通信凭据在数据库中采用 AES-256-GCM 强加密存储。
                    </Paragraph>
                  </div>
                </Space>
              </div>

              <Divider style={{ margin: '14px 0' }} />

              {/* 底部按钮 */}
              <Space size={12}>
                <Button
                  type={status?.configured ? 'default' : 'primary'}
                  icon={<QrcodeOutlined />}
                  loading={provision.isLoading}
                  onClick={() => provision.mutate()}
                  style={
                    status?.configured
                      ? undefined
                      : {
                          background: '#07c160',
                          borderColor: '#07c160',
                          boxShadow: '0 2px 8px rgba(7, 193, 96, 0.3)',
                        }
                  }
                >
                  {status?.configured ? '重新扫码绑定' : '扫码授权接入'}
                </Button>
                {status?.configured ? (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={remove.isLoading}
                    onClick={() =>
                      Modal.confirm({
                        title: '移除微信渠道配置？',
                        content: '将立即断开长连接并永久删除本地加密存储的微信通信凭据。',
                        okText: '确认移除',
                        okButtonProps: { danger: true },
                        cancelText: '取消',
                        onOk: () => remove.mutateAsync(),
                      })
                    }
                  >
                    解除绑定
                  </Button>
                ) : null}
              </Space>
            </Card>
          </Col>

          {/* 右侧：快捷短命令与特性说明 */}
          <Col xs={24} lg={10}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {/* 短命令速查卡片 */}
              <Card
                title={
                  <Space size={8}>
                    <ThunderboltOutlined style={{ color: '#fa8c16' }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: token.colorText }}>
                      微信端快捷短命令速查
                    </span>
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
                <Paragraph
                  style={{
                    fontSize: 12,
                    color: token.colorTextSecondary,
                    marginBottom: 10,
                  }}
                >
                  在微信自聊窗口中，以短命令开头发送消息可精准控制单次会话模式：
                </Paragraph>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SHORTCUT_COMMANDS.map((item) => (
                    <div
                      key={item.cmd}
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
                        <Space size={6}>
                          <Tag
                            color={item.tagColor}
                            style={{ fontFamily: 'monospace', fontWeight: 600, margin: 0 }}
                          >
                            {item.cmd}
                          </Tag>
                          <Text strong style={{ fontSize: 12, color: token.colorText }}>
                            {item.name}
                          </Text>
                        </Space>
                        <Tooltip title="复制示例">
                          <Button
                            type="text"
                            size="small"
                            icon={
                              copiedCmd === item.example ? (
                                <CheckOutlined style={{ color: token.colorSuccess }} />
                              ) : (
                                <CopyOutlined />
                              )
                            }
                            onClick={() => copyToClipboard(item.example)}
                          />
                        </Tooltip>
                      </div>
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, display: 'block', marginBottom: 4, color: token.colorTextTertiary }}
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
                        <Text
                          style={{
                            fontSize: 11,
                            color: token.colorTextSecondary,
                            fontFamily: 'monospace',
                          }}
                        >
                          示例：{item.example}
                        </Text>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* 特性卡片 */}
              <Card
                title={
                  <Space size={8}>
                    <ApiOutlined style={{ color: token.colorPrimary }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: token.colorText }}>
                      微信端核心体验亮点
                    </span>
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
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Badge status="processing" style={{ marginTop: 3 }} />
                    <div>
                      <Text strong style={{ fontSize: 12, color: token.colorText }}>
                        ✍️ 对方正在输入... 原生状态
                      </Text>
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, display: 'block', color: token.colorTextTertiary }}
                      >
                        发送消息后微信顶部瞬间显示正在输入状态，并在复杂任务执行中保持心跳。
                      </Text>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Badge status="success" style={{ marginTop: 3 }} />
                    <div>
                      <Text strong style={{ fontSize: 12, color: token.colorText }}>
                        ⚡️ 动态两阶段任务拆解
                      </Text>
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, display: 'block', color: token.colorTextTertiary }}
                      >
                        自动识别复合指令（如“打开网页 然后进行总结”），智能调度算子。
                      </Text>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Badge status="warning" style={{ marginTop: 3 }} />
                    <div>
                      <Text strong style={{ fontSize: 12, color: token.colorText }}>
                        🔄 连续多轮与会话重置
                      </Text>
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, display: 'block', color: token.colorTextTertiary }}
                      >
                        支持长效记忆与参数补齐追问，发送 `/n` 可一键开启全新会话。
                      </Text>
                    </div>
                  </div>
                </Space>
              </Card>
            </Space>
          </Col>
        </Row>
      ) : null}

      {/* 飞书 (Lark) 筹备中面板 */}
      {activeChannel === 'feishu' ? (
        <Card
          bordered
          style={{
            borderRadius: token.borderRadiusLG,
            background: token.colorBgContainer,
            borderColor: token.colorBorderSecondary,
            boxShadow: token.boxShadowTertiary,
            padding: '20px 10px',
          }}
        >
          <Row gutter={[24, 24]} align="middle">
            <Col xs={24} md={14}>
              <Space direction="vertical" size={14}>
                <Space size={10}>
                  <RocketOutlined style={{ fontSize: 24, color: '#00d6b9' }} />
                  <Title level={4} style={{ margin: 0, color: token.colorText }}>
                    飞书企业机器人与卡片交互（内测筹备中）
                  </Title>
                </Space>
                <Paragraph type="secondary" style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                  即将支持通过飞书自建应用对接 OpsPilot 自动化引擎，具备以下企业级协作能力：
                </Paragraph>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '10px 14px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Text strong style={{ fontSize: 13, color: token.colorText }}>
                      💬 飞书群聊 `@OpsPilot` 自动化触发
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', color: token.colorTextTertiary }}>
                      在项目群中 @ 机器人直接派发自动化任务、抓取网页分析或生成周报。
                    </Text>
                  </div>
                  <div
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '10px 14px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Text strong style={{ fontSize: 13, color: token.colorText }}>
                      📋 飞书交互式卡片（Interactive Card）
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', color: token.colorTextTertiary }}>
                      实时流式呈现多步骤执行进度、图表结果展示及关键节点人工审批卡片。
                    </Text>
                  </div>
                  <div
                    style={{
                      background: token.colorFillAlter,
                      borderRadius: token.borderRadius,
                      padding: '10px 14px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Text strong style={{ fontSize: 13, color: token.colorText }}>
                      📑 飞书云文档直接同步
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', color: token.colorTextTertiary }}>
                      生成的 Markdown 或结构化报表可一键同步至飞书知识库或个人云文档。
                    </Text>
                  </div>
                </div>
                <Button
                  type="primary"
                  icon={<NotificationOutlined />}
                  onClick={() => message.info('已记录你的飞书通道体验意向，上线后将第一时间通知！')}
                  style={{ marginTop: 8 }}
                >
                  登记飞书内测体验意向
                </Button>
              </Space>
            </Col>
            <Col xs={24} md={10} style={{ textAlign: 'center' }}>
              <div
                style={{
                  background: token.colorFillAlter,
                  borderRadius: token.borderRadiusLG,
                  padding: 24,
                  border: `1px dashed ${token.colorBorderSecondary}`,
                }}
              >
                <RocketOutlined style={{ fontSize: 48, color: '#00d6b9', marginBottom: 12 }} />
                <Title level={5} style={{ color: token.colorText, marginBottom: 4 }}>
                  Feishu App Webhook
                </Title>
                <Text type="secondary" style={{ fontSize: 12, color: token.colorTextTertiary }}>
                  支持 App ID / App Secret 与事件订阅 Webhook 接入
                </Text>
              </div>
            </Col>
          </Row>
        </Card>
      ) : null}

      {/* 钉钉 / Slack 规划中面板 */}
      {activeChannel === 'dingtalk' || activeChannel === 'slack' ? (
        <Card
          bordered
          style={{
            borderRadius: token.borderRadiusLG,
            background: token.colorBgContainer,
            borderColor: token.colorBorderSecondary,
            boxShadow: token.boxShadowTertiary,
            textAlign: 'center',
            padding: '40px 20px',
          }}
        >
          <Space direction="vertical" size={14} align="center">
            <AppstoreAddOutlined style={{ fontSize: 48, color: token.colorTextTertiary }} />
            <Title level={4} style={{ margin: 0, color: token.colorText }}>
              {activeChannel === 'dingtalk' ? '钉钉 (DingTalk)' : 'Slack'} 渠道接入规划中
            </Title>
            <Paragraph
              type="secondary"
              style={{ maxWidth: 480, fontSize: 13, color: token.colorTextSecondary }}
            >
              我们正在设计企业统一 IM 网关适配器架构，支持标准 Bot Webhook、群聊 Mention 派发与流式卡片消息回传。
            </Paragraph>
            <Button onClick={() => setActiveChannel('wechat')}>返回微信渠道配置</Button>
          </Space>
        </Card>
      ) : null}

      {/* 微信扫码授权弹窗 */}
      <Modal
        open={Boolean(status?.provisioning)}
        title={
          <Space align="center" size={10}>
            <WechatOutlined style={{ color: '#07c160', fontSize: 20 }} />
            <span style={{ fontWeight: 600, color: token.colorText }}>使用微信扫码授权绑定</span>
          </Space>
        }
        footer={[
          <Button key="refresh" type="primary" onClick={() => query.refetch()}>
            已完成扫码，刷新状态
          </Button>,
        ]}
        closable={false}
        maskClosable={false}
        centered
        width={440}
        styles={{ body: { padding: '20px 16px' } }}
      >
        <div style={{ textAlign: 'center' }}>
          {/* 二维码始终保留纯白背景衬底，确保在深色模式下手机依然能精准扫码识别 */}
          <div
            style={{
              padding: 16,
              background: '#ffffff',
              borderRadius: 16,
              display: 'inline-block',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
              border: '1px solid #e2e8f0',
              marginBottom: 16,
            }}
          >
            {status?.provisioning?.qrcodeUrl ? (
              <QRCode size={240} value={status.provisioning.qrcodeUrl} />
            ) : (
              <div style={{ width: 240, height: 240, display: 'grid', placeItems: 'center' }}>
                <Spin size="large" tip="正在生成授权二维码..." />
              </div>
            )}
          </div>
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
            打开手机微信，使用「扫一扫」扫描上方二维码完成授权
          </Paragraph>
        </div>

        <Alert
          type="info"
          showIcon
          message="扫码步骤说明"
          description={
            <ol style={{ paddingLeft: 18, margin: '4px 0 0 0', fontSize: 12 }}>
              <li>手机微信扫描二维码并点击授权登录</li>
              <li>授权完成后，点击下方「已完成扫码」按钮</li>
              <li>在主界面将微信渠道开关切换为「开启」即可正常使用</li>
            </ol>
          }
        />
      </Modal>
    </div>
  );
}
