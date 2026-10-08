import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Input,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  LockOutlined,
  QuestionCircleOutlined,
  SendOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { imChannelApi, type DingtalkChannelStatus } from '@/api';

const { Text, Paragraph } = Typography;

const STATUS_CONFIG: Record<
  string,
  { color: string; text: string; icon: React.ReactNode; desc: string }
> = {
  unconfigured: {
    color: 'default',
    text: '未配置',
    icon: <CloseCircleOutlined />,
    desc: '尚未配置钉钉机器人 Webhook，请填写后保存并开启',
  },
  disabled: {
    color: 'warning',
    text: '已配置 · 待开启',
    icon: <InfoCircleOutlined />,
    desc: '钉钉接入点已配置，请打开右上角开关开始使用',
  },
  online: {
    color: 'success',
    text: '正常在线',
    icon: <CheckCircleOutlined />,
    desc: '钉钉机器人通道已连通，随时可接收自动化与协作消息',
  },
  error: {
    color: 'error',
    text: '连接异常',
    icon: <CloseCircleOutlined />,
    desc: '测试消息发送失败或网关响应异常，请检查配置与密钥',
  },
};

export default function DingtalkChannelCard() {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const cache = useQueryClient();

  const [webhookUrl, setWebhookUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [alias, setAlias] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const statusQuery = useQuery('dingtalk-channel', imChannelApi.getDingtalk, {
    refetchInterval: 5000,
  });

  const channel = statusQuery.data;
  const statusMeta =
    STATUS_CONFIG[channel?.status || 'unconfigured'] || STATUS_CONFIG.unconfigured;

  const refresh = (data?: DingtalkChannelStatus) => {
    if (data) cache.setQueryData('dingtalk-channel', data);
    void statusQuery.refetch();
  };

  const saveMutation = useMutation(
    () =>
      imChannelApi.saveDingtalk({
        webhookUrl: webhookUrl.trim(),
        secret: secret.trim() || undefined,
        alias: alias.trim() || undefined,
      }),
    {
      onSuccess: (data) => {
        setWebhookUrl('');
        setSecret('');
        setIsEditing(false);
        refresh(data);
        message.success('钉钉机器人接入点已加密保存');
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err?.message || '保存失败，请检查 Webhook 格式');
      },
    }
  );

  const enabledMutation = useMutation(
    (value: boolean) => imChannelApi.setDingtalkEnabled(value),
    {
      onSuccess: (data) => {
        refresh(data);
        message.success(data.enabled ? '钉钉通道已开启' : '钉钉通道已停用');
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err?.message || '更新连接状态失败');
      },
    }
  );

  const testMutation = useMutation(() => imChannelApi.testDingtalk(), {
    onSuccess: (res) => {
      void statusQuery.refetch();
      if (res.success) {
        message.success(res.message || '测试消息已成功推送到钉钉群！');
      } else {
        message.error(`连通性测试未通过：${res.error || '钉钉网关响应错误'}`);
      }
    },
    onError: (err: any) => {
      void statusQuery.refetch();
      message.error(err?.response?.data?.message || err?.message || '测试请求发送失败');
    },
  });

  const removeMutation = useMutation(imChannelApi.removeDingtalk, {
    onSuccess: () => {
      setIsEditing(false);
      setWebhookUrl('');
      setSecret('');
      setAlias('');
      void statusQuery.refetch();
      message.success('钉钉机器人配置已清除');
    },
    onError: () => {
      message.error('解除绑定失败');
    },
  });

  const handleStartEdit = () => {
    setAlias(channel?.alias || '');
    setIsEditing(true);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="钉钉群机器人 · 即时通讯与自动化协同"
        description="通过钉钉自定义机器人 Webhook 与加签安全密钥，将 OpsPilot 自动化助手无缝接入钉钉群聊。支持自动化任务进度汇报、Markdown 富文本消息推送与重要事件告警。"
      />

      {/* 主配置卡片 */}
      <Card
        title={
          <Space size={10}>
            <span style={{ fontWeight: 600, fontSize: 15, color: token.colorText }}>
              钉钉机器人集成
            </span>
            <Tag
              color={statusMeta.color}
              icon={statusMeta.icon}
              style={{ borderRadius: 10, padding: '0 8px', border: 'none' }}
            >
              {statusMeta.text}
            </Tag>
          </Space>
        }
        extra={
          <Space size={12}>
            <Text type="secondary" style={{ fontSize: 13, color: token.colorTextSecondary }}>
              {channel?.enabled ? '功能已开启' : '已停用'}
            </Text>
            <Switch
              checked={Boolean(channel?.enabled)}
              disabled={!channel?.configured || enabledMutation.isLoading}
              loading={enabledMutation.isLoading}
              checkedChildren="开启"
              unCheckedChildren="关闭"
              onChange={(value) => enabledMutation.mutate(value)}
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
        {/* Bento 网格信息栏 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
          <Col xs={24} sm={12}>
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
                style={{
                  fontSize: 12,
                  display: 'block',
                  marginBottom: 4,
                  color: token.colorTextTertiary,
                }}
              >
                <SettingOutlined style={{ marginRight: 6 }} />
                机器人别名 / 群聊标识
              </Text>
              <Text strong style={{ fontSize: 13, color: token.colorText }}>
                {channel?.alias || (channel?.configured ? '未命名机器人' : '尚未配置')}
              </Text>
            </div>
          </Col>

          <Col xs={24} sm={12}>
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
                style={{
                  fontSize: 12,
                  display: 'block',
                  marginBottom: 4,
                  color: token.colorTextTertiary,
                }}
              >
                <LockOutlined style={{ marginRight: 6 }} />
                安全加签认证
              </Text>
              <Text strong style={{ fontSize: 13, color: token.colorText }}>
                {channel?.hasSecret ? (
                  <Tag color="cyan" style={{ borderRadius: 8, margin: 0 }}>
                    已开启加签 (HMAC-SHA256)
                  </Tag>
                ) : channel?.configured ? (
                  <Tag style={{ borderRadius: 8, margin: 0 }}>未加签</Tag>
                ) : (
                  <Text type="secondary">尚未配置</Text>
                )}
              </Text>
            </div>
          </Col>

          <Col xs={24} sm={12}>
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
                style={{
                  fontSize: 12,
                  display: 'block',
                  marginBottom: 2,
                  color: token.colorTextTertiary,
                }}
              >
                <ClockCircleOutlined style={{ marginRight: 6 }} />
                最近连通时间
              </Text>
              <Text style={{ fontSize: 12, color: token.colorText }}>
                {channel?.lastConnectedAt
                  ? new Date(channel.lastConnectedAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '尚无连通记录'}
              </Text>
            </div>
          </Col>

          <Col xs={24} sm={12}>
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
                style={{
                  fontSize: 12,
                  display: 'block',
                  marginBottom: 2,
                  color: token.colorTextTertiary,
                }}
              >
                <SendOutlined style={{ marginRight: 6 }} />
                最近推送消息时间
              </Text>
              <Text style={{ fontSize: 12, color: token.colorText }}>
                {channel?.lastMessageAt
                  ? new Date(channel.lastMessageAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '尚无推送记录'}
              </Text>
            </div>
          </Col>
        </Row>

        {/* 异常提示 */}
        {channel?.lastError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="最近连接发生异常"
            description={channel.lastError}
          />
        )}

        {/* 配置表单区 */}
        {channel?.configured && !isEditing ? (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: token.borderRadius,
              background: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
              marginBottom: 16,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                当前 Webhook 接入点（已脱敏）
              </Text>
              <Text code copyable style={{ fontSize: 13, wordBreak: 'break-all' }}>
                {channel.webhookUrl}
              </Text>
            </div>

            <Space wrap size={10}>
              <Button onClick={handleStartEdit}>
                修改配置
              </Button>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={testMutation.isLoading}
                onClick={() => testMutation.mutate()}
              >
                测试连通性
              </Button>
              <Button
                danger
                onClick={() =>
                  modal.confirm({
                    title: '解除钉钉机器人绑定？',
                    content: '解除后将停止向该钉钉群发送通知，配置凭据将被清除。',
                    okText: '确认解除',
                    cancelText: '取消',
                    okType: 'danger',
                    onOk: async () => {
                      await removeMutation.mutateAsync();
                    },
                  })
                }
              >
                解除绑定
              </Button>
            </Space>
          </div>
        ) : (
          <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }} size={14}>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                机器人别名 / 群聊名称（选填）
              </Text>
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="例如：生产发布告警群 / 研发自动化小助手"
                maxLength={100}
              />
            </div>

            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Webhook 接入点地址 <span style={{ color: 'red' }}>*</span>
              </Text>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                autoComplete="off"
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                在钉钉电脑端群设置中添加自定义机器人获取，必须包含 access_token 参数
              </Text>
            </div>

            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                加签安全密钥 (Secret)（选填，推荐开启）
              </Text>
              <Input.Password
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="SEC..."
                autoComplete="off"
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                若在钉钉机器人中开启了「加签」安全设置，请粘贴 SEC 开头的密钥，用于 HMAC-SHA256 签名校验
              </Text>
            </div>

            <Space wrap size={10} style={{ marginTop: 6 }}>
              <Button
                type="primary"
                disabled={!webhookUrl.trim() || saveMutation.isLoading}
                loading={saveMutation.isLoading}
                onClick={() => saveMutation.mutate()}
              >
                保存接入点
              </Button>
              {isEditing && (
                <Button onClick={() => setIsEditing(false)}>
                  取消编辑
                </Button>
              )}
            </Space>
          </Space>
        )}
      </Card>

      {/* 钉钉自动化能力说明 */}
      <Card
        title="钉钉集成能力与协同特性"
        bordered
        style={{
          borderRadius: token.borderRadiusLG,
          background: token.colorBgContainer,
          borderColor: token.colorBorderSecondary,
        }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <div
              style={{
                background: token.colorFillAlter,
                borderRadius: token.borderRadius,
                padding: '14px 16px',
                border: `1px solid ${token.colorBorderSecondary}`,
                height: '100%',
              }}
            >
              <Text strong style={{ fontSize: 13, color: token.colorText, display: 'block', marginBottom: 6 }}>
                📢 结构化富文本通知
              </Text>
              <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
                支持 Markdown 格式排版、表格与颜色卡片，自动化巡检报告与指标统计直观呈现。
              </Text>
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div
              style={{
                background: token.colorFillAlter,
                borderRadius: token.borderRadius,
                padding: '14px 16px',
                border: `1px solid ${token.colorBorderSecondary}`,
                height: '100%',
              }}
            >
              <Text strong style={{ fontSize: 13, color: token.colorText, display: 'block', marginBottom: 6 }}>
                ⚡️ 自动化任务执行通知
              </Text>
              <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
                长周期多步骤执行、网页抓取与生成文档完成后，第一时间通过群机器人触达相关负责人。
              </Text>
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div
              style={{
                background: token.colorFillAlter,
                borderRadius: token.borderRadius,
                padding: '14px 16px',
                border: `1px solid ${token.colorBorderSecondary}`,
                height: '100%',
              }}
            >
              <Text strong style={{ fontSize: 13, color: token.colorText, display: 'block', marginBottom: 6 }}>
                🛡 企业级加签安全保障
              </Text>
              <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
                内置 HMAC-SHA256 防重放与防伪造加签机制，所有凭据均经 AES-256-GCM 本地加密保存。
              </Text>
            </div>
          </Col>
        </Row>
      </Card>

      {/* 帮助指引 */}
      <Collapse
        ghost
        items={[
          {
            key: 'guide',
            label: (
              <Space>
                <QuestionCircleOutlined style={{ color: '#007fff' }} />
                <Text strong style={{ color: token.colorText }}>
                  如何获取钉钉群自定义机器人 Webhook 与加签密钥？
                </Text>
              </Space>
            ),
            children: (
              <div style={{ padding: '0 8px', fontSize: 13, lineHeight: 1.8 }}>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  <ol style={{ paddingLeft: 20 }}>
                    <li>打开钉钉电脑端，进入需要接收通知的目标群聊；</li>
                    <li>点击右上角群设置图标，进入「机器人」或「智能群助手」；</li>
                    <li>点击「添加机器人」，在列表中选择「自定义（通过 Webhook 接入自定义服务）」；</li>
                    <li>设置机器人名称（如“OpsPilot 自动化助手”），并在安全设置中勾选「加签」；</li>
                    <li>复制页面显示的以 <code>SEC</code> 开头的加签密钥，粘贴到本页面加签密钥栏；</li>
                    <li>点击完成，复制生成的 <code>https://oapi.dingtalk.com/robot/send?access_token=...</code> Webhook 地址并填入本页面；</li>
                    <li>点击「保存接入点」，开启开关并点击「测试连通性」即可完成接入！</li>
                  </ol>
                </Paragraph>
              </div>
            ),
          },
        ]}
      />
    </Space>
  );
}
