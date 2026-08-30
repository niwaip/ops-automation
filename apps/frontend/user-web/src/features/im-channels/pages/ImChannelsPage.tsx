import { DeleteOutlined, QrcodeOutlined, WechatOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Modal,
  QRCode,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { imChannelApi, type WechatChannelStatus } from '@/api';

const labels: Record<WechatChannelStatus['status'], { color: string; text: string }> = {
  unconfigured: { color: 'default', text: '未配置' },
  provisioning: { color: 'processing', text: '等待扫码' },
  disabled: { color: 'default', text: '已配置 · 未开启' },
  connecting: { color: 'processing', text: '连接中' },
  online: { color: 'success', text: '在线' },
  reauth_required: { color: 'warning', text: '需要重新授权' },
  error: { color: 'error', text: '异常' },
};

export default function ImChannelsPage() {
  const queryClient = useQueryClient();
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
        message.error(e?.response?.data?.message || '生成二维码失败');
      },
    }
  );
  const enable = useMutation<WechatChannelStatus, any, boolean>(
    (enabled) => imChannelApi.setWechatEnabled(enabled),
    {
      onSuccess: refresh,
      onError: (e) => {
        message.error(e?.response?.data?.message || '更新失败');
      },
    }
  );
  const interactionMode = useMutation<WechatChannelStatus, any, 'auto' | 'chat' | 'task'>(
    (mode) => imChannelApi.setWechatInteractionMode(mode),
    {
      onSuccess: refresh,
      onError: (e) => {
        message.error(e?.response?.data?.message || '模式更新失败');
      },
    }
  );
  const remove = useMutation<{ success: boolean }, unknown, void>(
    () => imChannelApi.removeWechat(),
    {
      onSuccess: () => {
        void query.refetch();
      },
      onError: () => {
        message.error('移除失败');
      },
    }
  );
  const status = query.data;
  const statusLabel = useMemo(() => labels[status?.status ?? 'unconfigured'], [status?.status]);

  if (query.isLoading)
    return (
      <div style={{ minHeight: 300, display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );

  return (
    <Space direction="vertical" size={20} style={{ width: '100%', maxWidth: 920 }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          IM 渠道
        </Typography.Title>
        <Typography.Text type="secondary">
          将 OpsPilot 接入你的即时通讯账号。渠道默认关闭，只有明确开启后才会建立长连接。
        </Typography.Text>
      </div>
      <Alert
        showIcon
        type="info"
        message="首版安全边界"
        description="目前仅支持微信，且只响应绑定微信账号本人的自聊消息；每位开启用户占用一条长轮询连接。"
      />
      <Card
        title={
          <Space>
            <WechatOutlined style={{ color: '#07c160', fontSize: 22 }} />
            <span>微信</span>
            <Tag color={statusLabel.color}>{statusLabel.text}</Tag>
          </Space>
        }
        extra={
          <Switch
            checked={Boolean(status?.enabled)}
            disabled={!status?.configured || enable.isLoading}
            checkedChildren="已开启"
            unCheckedChildren="未开启"
            onChange={(checked) => enable.mutate(checked)}
          />
        }
      >
        <Descriptions column={1} size="small">
          <Descriptions.Item label="连接策略">用户显式开启后按需连接</Descriptions.Item>
          <Descriptions.Item label="处理模式">
            <Select
              style={{ width: 240 }}
              value={status?.interactionMode ?? 'auto'}
              loading={interactionMode.isLoading}
              onChange={(mode) => interactionMode.mutate(mode)}
              options={[
                { value: 'auto', label: '自动识别（推荐）' },
                { value: 'chat', label: '仅聊天' },
                { value: 'task', label: '始终任务' },
              ]}
            />
          </Descriptions.Item>
          <Descriptions.Item label="微信账号">
            {status?.providerAccountId || '尚未绑定'}
          </Descriptions.Item>
          {status?.lastConnectedAt ? (
            <Descriptions.Item label="最近连接">
              {new Date(status.lastConnectedAt).toLocaleString()}
            </Descriptions.Item>
          ) : null}
          {status?.lastMessageAt ? (
            <Descriptions.Item label="最近消息">
              {new Date(status.lastMessageAt).toLocaleString()}
            </Descriptions.Item>
          ) : null}
        </Descriptions>
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="单条消息可临时覆盖模式"
          description="发送 /task 上海的天气 强制使用任务模式；发送 /chat 你好 强制使用聊天模式。自动识别会将天气、搜索、生成文件等请求路由到任务模式。"
        />
        {status?.lastError ? (
          <Alert style={{ marginTop: 16 }} type="error" showIcon message={status.lastError} />
        ) : null}
        <Space style={{ marginTop: 20 }}>
          <Button
            type={status?.configured ? 'default' : 'primary'}
            icon={<QrcodeOutlined />}
            loading={provision.isLoading}
            onClick={() => provision.mutate()}
          >
            {status?.configured ? '重新绑定' : '扫码绑定'}
          </Button>
          {status?.configured ? (
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={remove.isLoading}
              onClick={() =>
                Modal.confirm({
                  title: '移除微信渠道？',
                  content: '将停止连接并永久删除本地加密凭据。',
                  okText: '移除',
                  okButtonProps: { danger: true },
                  onOk: () => remove.mutateAsync(),
                })
              }
            >
              移除配置
            </Button>
          ) : null}
        </Space>
      </Card>
      <Modal
        open={Boolean(status?.provisioning)}
        title="使用微信扫码绑定"
        footer={<Button onClick={() => query.refetch()}>刷新状态</Button>}
        closable={false}
        maskClosable={false}
      >
        <div style={{ textAlign: 'center' }}>
          {status?.provisioning?.qrcodeUrl ? (
            <QRCode size={260} value={status.provisioning.qrcodeUrl} />
          ) : (
            <Spin />
          )}
        </div>
        <Alert
          style={{ marginTop: 16 }}
          type="warning"
          showIcon
          message="扫码只完成授权，不会自动开启连接"
          description="授权成功后请回到页面手动打开“已开启”开关。二维码约 5 分钟后失效。"
        />
      </Modal>
    </Space>
  );
}
