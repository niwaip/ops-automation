import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  InboxOutlined,
  LoadingOutlined,
  MailOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  WindowsOutlined,
} from '@ant-design/icons';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Popconfirm,
  Row,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import type { UserEmailConnectionStatus } from '@/api';
import { workbenchInboxApi } from '@/api/workbenchInbox';
import { formatMonthDayTime } from '@/shared/utils/dateText';

const { Title, Text, Paragraph } = Typography;

interface EmailStatusOverviewCardProps {
  connection: UserEmailConnectionStatus | undefined;
  onDeleteConnection: () => void;
  isDeleting: boolean;
}

export function EmailStatusOverviewCard({
  connection,
  onDeleteConnection,
  isDeleting,
}: EmailStatusOverviewCardProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 查询 GTD 同步状态
  const { data: syncStatus } = useQuery(
    'email-sync-status',
    () => workbenchInboxApi.getEmailSyncStatus(),
    {
      staleTime: 15000,
      refetchInterval: 30000,
      enabled: Boolean(connection?.configured),
    }
  );

  // 手动触发同步
  const syncMutation = useMutation(
    async () => {
      return await workbenchInboxApi.syncEmail();
    },
    {
      onSuccess: (res) => {
        void queryClient.invalidateQueries('email-sync-status');
        void queryClient.invalidateQueries('workbench-inbox');
        void queryClient.invalidateQueries('workbench-inbox-summary');
        if (res.success) {
          message.success({
            content: (
              <Space>
                <span>{res.message}</span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => navigate('/dashboard')}
                  style={{ padding: 0 }}
                >
                  前往工作台查看
                </Button>
              </Space>
            ),
            duration: 4,
          });
        } else {
          message.warning(res.message);
        }
      },
      onError: (err: any) => {
        message.error(`同步失败: ${err?.message || '网络请求异常'}`);
      },
    }
  );

  const isConfigured = Boolean(connection?.configured);

  return (
    <Card
      bordered
      style={{
        marginBottom: 20,
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
        borderColor: isConfigured ? token.colorPrimaryBorder : token.colorBorderSecondary,
        boxShadow: token.boxShadowTertiary,
      }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      <Row gutter={[24, 20]} align="middle">
        {/* 左半区：邮箱连接核心情报 */}
        <Col xs={24} lg={12}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space size={10}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: isConfigured
                      ? 'linear-gradient(135deg, #52c41a 0%, #1677ff 100%)'
                      : token.colorFillSecondary,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    fontSize: 18,
                  }}
                >
                  <MailOutlined style={{ color: isConfigured ? '#fff' : token.colorTextTertiary }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Title level={5} style={{ margin: 0, fontWeight: 600 }}>
                      个人邮箱连接
                    </Title>
                    <Badge
                      status={isConfigured ? 'success' : 'default'}
                      text={
                        <Text strong style={{ fontSize: 13, color: isConfigured ? token.colorSuccess : token.colorTextSecondary }}>
                          {isConfigured ? '已连接' : '未绑定'}
                        </Text>
                      }
                    />
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {isConfigured ? '已建立安全加密通道，可随时发起 AI 查发信' : '请选择下方任一方式完成邮箱绑定'}
                  </Text>
                </div>
              </Space>
            </div>

            {isConfigured ? (
              <div
                style={{
                  background: token.colorFillAlter,
                  borderRadius: token.borderRadius,
                  padding: '10px 14px',
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <Row gutter={[8, 8]}>
                  <Col span={24}>
                    <Space size={6}>
                      <Text type="secondary" style={{ fontSize: 12 }}>绑定账号：</Text>
                      <Text strong style={{ fontSize: 13, fontFamily: 'monospace' }}>
                        {connection?.emailAddress}
                      </Text>
                      {connection?.providerType === 'microsoft_oauth' ? (
                        <Tag color="geekblue" icon={<WindowsOutlined />} style={{ marginLeft: 4 }}>
                          微软官方 OAuth 2.0
                        </Tag>
                      ) : (
                        <Tag color="cyan">标准 IMAP/SMTP</Tag>
                      )}
                    </Space>
                  </Col>
                  <Col span={14}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      外显昵称：{connection?.senderName || '未指定（默认邮箱名）'}
                    </Text>
                  </Col>
                  <Col span={10} style={{ textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      更新于：{connection?.updatedAt ? formatMonthDayTime(connection.updatedAt) : '无记录'}
                    </Text>
                  </Col>
                </Row>
              </div>
            ) : null}
          </Space>
        </Col>

        {/* 右半区：GTD 收件箱自动流转情报 */}
        <Col xs={24} lg={12}>
          <div
            style={{
              background: token.colorFillAlter,
              borderRadius: token.borderRadius,
              padding: '14px 16px',
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Space size={6}>
                <InboxOutlined style={{ color: '#1677ff', fontSize: 16 }} />
                <Text strong style={{ fontSize: 13 }}>GTD 收件箱自动同步服务</Text>
              </Space>
              {isConfigured ? (
                syncStatus?.lastSyncStatus === 'success' ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>
                    自动调度就绪
                  </Tag>
                ) : syncStatus?.lastSyncStatus === 'failed' ? (
                  <Tag color="error">同步异常</Tag>
                ) : (
                  <Tag color="processing">待触发</Tag>
                )
              ) : (
                <Tag color="default">未启用</Tag>
              )}
            </div>

            <Paragraph style={{ fontSize: 12, color: token.colorTextSecondary, margin: '0 0 10px 0' }}>
              调度周期：<Tag color="geekblue" icon={<ClockCircleOutlined />}>每小时整点 (0 * * * *)</Tag>
              ｜ 策略：<Text style={{ fontSize: 12 }}>未读入收件箱 ➔ 自动置为已读</Text>
            </Paragraph>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                上次同步时间：
                {syncStatus?.lastSyncedAt
                  ? formatMonthDayTime(syncStatus.lastSyncedAt)
                  : isConfigured
                  ? '等待首次整点触发'
                  : '未配置'}
              </Text>
              <Space size={8}>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={syncMutation.isLoading ? <LoadingOutlined spin /> : <SyncOutlined />}
                  onClick={() => syncMutation.mutate()}
                  loading={syncMutation.isLoading}
                  disabled={!isConfigured}
                >
                  立即同步一次
                </Button>
                <Button
                  size="small"
                  type="link"
                  onClick={() => navigate('/dashboard')}
                  style={{ padding: '0 4px', fontSize: 12 }}
                >
                  前往工作台 <RightOutlined style={{ fontSize: 10 }} />
                </Button>
              </Space>
            </div>
          </div>
        </Col>
      </Row>

      {/* 底部操作条（仅在已配置时展示解绑与安全提示） */}
      {isConfigured && (
        <>
          <Divider style={{ margin: '14px 0 10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={6}>
              <SafetyCertificateOutlined style={{ color: token.colorSuccess, fontSize: 14 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                账号凭证已通过 AES-256-GCM 本地安全加密存储，仅在本人会话中授权解密。
              </Text>
            </Space>
            <Popconfirm
              title="确定要解除绑定并清除个人邮箱凭据吗？"
              onConfirm={onDeleteConnection}
              okText="确定解除"
              cancelText="取消"
            >
              <Button danger size="small" type="text" icon={<DeleteOutlined />} loading={isDeleting}>
                解除绑定
              </Button>
            </Popconfirm>
          </div>
        </>
      )}
    </Card>
  );
}
