import {
  ApiOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  MessageOutlined,
  QrcodeOutlined,
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
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { imChannelApi, type WechatChannelStatus } from '@/api';

const { Title, Text, Paragraph } = Typography;

interface StatusMeta {
  color: string;
  badgeStatus: 'success' | 'processing' | 'default' | 'error' | 'warning';
  text: string;
  desc: string;
  icon: React.ReactNode;
}

const STATUS_CONFIG: Record<WechatChannelStatus['status'], StatusMeta> = {
  unconfigured: {
    color: '#8c8c8c',
    badgeStatus: 'default',
    text: '未配置',
    desc: '尚未绑定微信账号，点击“扫码绑定”即可接入',
    icon: <CloseCircleOutlined style={{ color: '#8c8c8c' }} />,
  },
  provisioning: {
    color: '#1677ff',
    badgeStatus: 'processing',
    text: '等待扫码',
    desc: '请使用微信 App 扫描二维码并确认授权',
    icon: <SyncOutlined spin style={{ color: '#1677ff' }} />,
  },
  disabled: {
    color: '#faad14',
    badgeStatus: 'warning',
    text: '已配置 · 待开启',
    desc: '已成功绑定微信账号，打开右上角开关即可开始接收消息',
    icon: <InfoCircleOutlined style={{ color: '#faad14' }} />,
  },
  connecting: {
    color: '#1677ff',
    badgeStatus: 'processing',
    text: '连接中...',
    desc: '正在与微信 Bot 网关建立长轮询长连接通道',
    icon: <LoadingOutlined style={{ color: '#1677ff' }} />,
  },
  online: {
    color: '#52c41a',
    badgeStatus: 'success',
    text: '正常在线',
    desc: '长连接通道已建立，微信自聊消息将实时响应',
    icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  },
  reauth_required: {
    color: '#fa8c16',
    badgeStatus: 'warning',
    text: '需要重新授权',
    desc: '微信授权凭据已过期或失效，请重新扫码绑定',
    icon: <InfoCircleOutlined style={{ color: '#fa8c16' }} />,
  },
  error: {
    color: '#ff4d4f',
    badgeStatus: 'error',
    text: '连接异常',
    desc: '长连接发生网络或协议错误，系统将自动尝试重连',
    icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
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
  const queryClient = useQueryClient();
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
      {/* 页面顶栏 Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #07c16012 0%, #1677ff0d 100%)',
          borderRadius: 16,
          padding: '28px 32px',
          marginBottom: 24,
          border: '1px solid #07c16024',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <Space align="center" size={12} style={{ marginBottom: 6 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: '#07c160',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 4px 12px rgba(7, 193, 96, 0.25)',
                }}
              >
                <WechatOutlined style={{ color: '#fff', fontSize: 24 }} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, fontWeight: 600 }}>
                  IM 即时通讯集成
                </Title>
              </div>
            </Space>
            <Paragraph type="secondary" style={{ margin: 0, fontSize: 14, maxWidth: 640 }}>
              将 OpsPilot 自动化助手接入微信，支持在手机端通过微信自聊直接进行 AI 对话、触发多步骤自动化工作流，并享受原生“正在输入...”实时状态反馈。
            </Paragraph>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Space direction="vertical" align="end" size={4}>
              <Badge status={statusMeta.badgeStatus} text={<Text strong style={{ fontSize: 15 }}>{statusMeta.text}</Text>} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {status?.enabled ? '长连接通道运行中' : '长连接已暂停'}
              </Text>
            </Space>
          </Col>
        </Row>
      </div>

      <Row gutter={[24, 24]}>
        {/* 左侧：主渠道配置卡片 */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space size={10}>
                <WechatOutlined style={{ color: '#07c160', fontSize: 20 }} />
                <span style={{ fontWeight: 600, fontSize: 16 }}>微信个人自聊通道</span>
                <Tag color={statusMeta.color} style={{ borderRadius: 10, padding: '0 8px', border: 'none' }}>
                  {statusMeta.text}
                </Tag>
              </Space>
            }
            extra={
              <Space size={12}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {status?.enabled ? '服务已连接' : '已停用'}
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
              borderRadius: 14,
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            }}
          >
            {/* Bento 信息小卡片网格 */}
            <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
              <Col span={12}>
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: 10,
                    padding: '14px 16px',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    <UserOutlined style={{ marginRight: 6 }} />
                    绑定微信账号
                  </Text>
                  <Text strong style={{ fontSize: 14 }}>
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
                    background: '#f8fafc',
                    borderRadius: 10,
                    padding: '14px 16px',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
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
                    background: '#f8fafc',
                    borderRadius: 10,
                    padding: '12px 16px',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                    <ClockCircleOutlined style={{ marginRight: 6 }} />
                    最近心跳连接
                  </Text>
                  <Text style={{ fontSize: 13 }}>
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
                    background: '#f8fafc',
                    borderRadius: 10,
                    padding: '12px 16px',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                    <MessageOutlined style={{ marginRight: 6 }} />
                    最近消息交互
                  </Text>
                  <Text style={{ fontSize: 13 }}>
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

            {/* 错误提示 */}
            {status?.lastError ? (
              <Alert
                style={{ marginBottom: 16, borderRadius: 8 }}
                type="error"
                showIcon
                message="连接异常信息"
                description={status.lastError}
              />
            ) : null}

            {/* 安全说明 */}
            <div
              style={{
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 20,
              }}
            >
              <Space align="start" size={8}>
                <SafetyCertificateOutlined style={{ color: '#52c41a', fontSize: 16, marginTop: 2 }} />
                <div>
                  <Text strong style={{ color: '#274916', fontSize: 13 }}>
                    隐私与通信安全
                  </Text>
                  <Paragraph style={{ color: '#389e0d', fontSize: 12, margin: 0 }}>
                    当前通道仅接收并响应你微信账号向文件传输助手/Bot 的**自聊消息**；通信凭证在数据库中采用 AES-256-GCM 强加密存储。
                  </Paragraph>
                </div>
              </Space>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            {/* 操作按钮组 */}
            <Space size={12}>
              <Button
                type={status?.configured ? 'default' : 'primary'}
                icon={<QrcodeOutlined />}
                loading={provision.isLoading}
                onClick={() => provision.mutate()}
                style={
                  status?.configured
                    ? undefined
                    : { background: '#07c160', borderColor: '#07c160', boxShadow: '0 2px 8px rgba(7, 193, 96, 0.3)' }
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

        {/* 右侧：快捷指令与特性卡片 */}
        <Col xs={24} lg={10}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 快捷指令速查 */}
            <Card
              title={
                <Space size={8}>
                  <ThunderboltOutlined style={{ color: '#fa8c16' }} />
                  <span style={{ fontWeight: 600, fontSize: 15 }}>微信端快捷短命令速查</span>
                </Space>
              }
              bordered
              style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)' }}
              styles={{ body: { padding: '12px 16px' } }}
            >
              <Paragraph style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                在微信自聊窗口中，发送以短命令开头的消息可精准控制单次会话行为：
              </Paragraph>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {SHORTCUT_COMMANDS.map((item) => (
                  <div
                    key={item.cmd}
                    style={{
                      background: '#f8fafc',
                      borderRadius: 8,
                      padding: '10px 12px',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Space size={6}>
                        <Tag color={item.tagColor} style={{ fontFamily: 'monospace', fontWeight: 600, margin: 0 }}>
                          {item.cmd}
                        </Tag>
                        <Text strong style={{ fontSize: 13 }}>
                          {item.name}
                        </Text>
                      </Space>
                      <Tooltip title="复制示例">
                        <Button
                          type="text"
                          size="small"
                          icon={copiedCmd === item.example ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
                          onClick={() => copyToClipboard(item.example)}
                        />
                      </Tooltip>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      {item.desc}
                    </Text>
                    <div
                      style={{
                        background: '#ffffff',
                        padding: '3px 8px',
                        borderRadius: 4,
                        border: '1px dashed #cbd5e1',
                        display: 'inline-block',
                      }}
                    >
                      <Text style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
                        示例：{item.example}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* 特性介绍卡片 */}
            <Card
              title={
                <Space size={8}>
                  <ApiOutlined style={{ color: '#1677ff' }} />
                  <span style={{ fontWeight: 600, fontSize: 15 }}>微信端核心体验优化</span>
                </Space>
              }
              bordered
              style={{ borderRadius: 14, boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)' }}
              styles={{ body: { padding: '14px 16px' } }}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Badge status="processing" style={{ marginTop: 4 }} />
                  <div>
                    <Text strong style={{ fontSize: 13 }}>
                      ✍️ 对方正在输入... 原生状态
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      发送消息后，微信顶部毫秒级显示正在输入提示，并在多步自动化执行中保持心跳。
                    </Text>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Badge status="success" style={{ marginTop: 4 }} />
                  <div>
                    <Text strong style={{ fontSize: 13 }}>
                      ⚡️ 动态两阶段任务拆解
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      支持自动识别“打开网页 然后进行总结”等多步骤复合指令，智能调度浏览器和 LLM 算子。
                    </Text>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Badge status="warning" style={{ marginTop: 4 }} />
                  <div>
                    <Text strong style={{ fontSize: 13 }}>
                      🔄 连续会话与参数追问
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      任务缺少关键参数时支持在微信端直接回复补齐，上下文无缝衔接。
                    </Text>
                  </div>
                </div>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      {/* 扫码授权弹窗 */}
      <Modal
        open={Boolean(status?.provisioning)}
        title={
          <Space align="center" size={10}>
            <WechatOutlined style={{ color: '#07c160', fontSize: 20 }} />
            <span style={{ fontWeight: 600 }}>使用微信扫码授权绑定</span>
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
        styles={{ body: { padding: '24px 16px' } }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              padding: 16,
              background: '#ffffff',
              borderRadius: 16,
              display: 'inline-block',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
              border: '1px solid #f1f5f9',
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

