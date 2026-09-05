import { MailOutlined } from '@ant-design/icons';
import {
  App,
  Col,
  Collapse,
  Form,
  Row,
  Space,
  Spin,
  Typography,
  theme,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  userEmailApi,
  type SaveUserEmailRequest,
} from '@/api';
import { EmailPromptGuideCard } from '../components/EmailPromptGuideCard';
import { EmailStatusOverviewCard } from '../components/EmailStatusOverviewCard';
import { ImapSmtpConfigCard } from '../components/ImapSmtpConfigCard';
import { MicrosoftOAuthCard } from '../components/MicrosoftOAuthCard';

const { Title, Text, Paragraph } = Typography;

export default function UserEmailSettingsPage() {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<SaveUserEmailRequest>();

  // 加载当前邮箱连接详情
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

  // 保存 IMAP/SMTP 配置
  const saveMutation = useMutation(userEmailApi.saveConnection, {
    onSuccess: () => {
      message.success('个人邮箱配置已保存并安全加密存储');
      void queryClient.invalidateQueries('user-email-connection');
      void queryClient.invalidateQueries('email-sync-status');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || '保存邮箱配置失败');
    },
  });

  // 测试连通性
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

  // 解除绑定
  const deleteMutation = useMutation(userEmailApi.deleteConnection, {
    onSuccess: () => {
      message.success('已解除绑定并清除个人邮箱凭据');
      form.resetFields();
      void queryClient.invalidateQueries('user-email-connection');
      void queryClient.invalidateQueries('email-sync-status');
    },
    onError: () => {
      message.error('解除绑定失败');
    },
  });

  const connection = query.data;
  const isMicrosoftActive = Boolean(connection?.configured && connection?.providerType === 'microsoft_oauth');

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
    <div style={{ width: '100%', maxWidth: 1120, margin: '0 auto', paddingBottom: 48 }}>
      {/* 顶部简明标题与定位 */}
      <div style={{ marginBottom: 20 }}>
        <Space align="center" size={10}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: token.borderRadius,
              background: 'linear-gradient(135deg, #1677ff 0%, #722ed1 100%)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <MailOutlined style={{ color: '#fff', fontSize: 18 }} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, fontWeight: 600 }}>
              个人邮箱连接与自动流转设置
            </Title>
          </div>
        </Space>
        <Paragraph type="secondary" style={{ margin: '4px 0 0 42px', fontSize: 13 }}>
          在此管理你的个人邮箱集成。系统每小时整点自动同步未读邮件入 GTD 收件箱，同时支持在智能协同中自然语言查发信。
        </Paragraph>
      </div>

      {/* 🌟 核心情报看板：全局连接状态 + GTD 收件箱同步指标 + 快捷操作 */}
      <EmailStatusOverviewCard
        connection={connection}
        onDeleteConnection={() => deleteMutation.mutate()}
        isDeleting={deleteMutation.isLoading}
      />

      {/* 绑定配置区与智能指引 */}
      <Row gutter={[20, 20]}>
        {/* 左侧主要配置区 */}
        <Col xs={24} lg={15}>
          {/* 1. 微软官方 OAuth 2.0 快捷授权 */}
          <MicrosoftOAuthCard connection={connection} />

          {/* 2. 传统 IMAP / SMTP 账号配置 */}
          {isMicrosoftActive ? (
            // 如果已激活微软官方授权，将传统 IMAP 表单收起为折叠卡片，避免页面臃肿
            <Collapse
              style={{
                borderRadius: token.borderRadiusLG,
                background: token.colorBgContainer,
                borderColor: token.colorBorderSecondary,
                boxShadow: token.boxShadowTertiary,
              }}
              items={[
                {
                  key: 'imap_config_collapsed',
                  label: (
                    <Text strong style={{ fontSize: 14 }}>
                      切换/配置为传统 IMAP/SMTP 邮箱（点击展开表单）
                    </Text>
                  ),
                  children: (
                    <ImapSmtpConfigCard
                      connection={connection}
                      form={form}
                      onSave={(values) => saveMutation.mutate(values)}
                      onTest={(values) => testMutation.mutate(values)}
                      onDelete={() => deleteMutation.mutate()}
                      isSaving={saveMutation.isLoading}
                      isTesting={testMutation.isLoading}
                      isDeleting={deleteMutation.isLoading}
                    />
                  ),
                },
              ]}
            />
          ) : (
            <ImapSmtpConfigCard
              connection={connection}
              form={form}
              onSave={(values) => saveMutation.mutate(values)}
              onTest={(values) => testMutation.mutate(values)}
              onDelete={() => deleteMutation.mutate()}
              isSaving={saveMutation.isLoading}
              isTesting={testMutation.isLoading}
              isDeleting={deleteMutation.isLoading}
            />
          )}
        </Col>

        {/* 右侧辅助情报区：AI 对话调用范例与技巧 */}
        <Col xs={24} lg={9}>
          <EmailPromptGuideCard />
        </Col>
      </Row>
    </div>
  );
}
