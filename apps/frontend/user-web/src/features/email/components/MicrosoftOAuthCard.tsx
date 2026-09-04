import {
  CheckCircleOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  LoadingOutlined,
  WindowsOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Collapse,
  Input,
  Modal,
  Row,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from 'react-query';
import {
  userEmailApi,
  type MicrosoftDeviceCodeResponse,
  type UserEmailConnectionStatus,
} from '@/api';

const { Text, Paragraph } = Typography;

interface MicrosoftOAuthCardProps {
  connection: UserEmailConnectionStatus | undefined;
}

export function MicrosoftOAuthCard({ connection }: MicrosoftOAuthCardProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();

  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [customClientId, setCustomClientId] = useState<string>('');
  const [deviceAuthInfo, setDeviceAuthInfo] = useState<MicrosoftDeviceCodeResponse | null>(null);
  const [isPollingOAuth, setIsPollingOAuth] = useState(false);
  const pollTimerRef = useRef<any>(null);

  const isCurrentActive = connection?.configured && connection?.providerType === 'microsoft_oauth';

  const handleStartOAuth = async (overrideClientId?: string) => {
    try {
      const clientIdToUse = overrideClientId !== undefined ? overrideClientId : customClientId;
      message.loading({ content: '正在向微软官方申请设备授权码...', key: 'oauth_init' });
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
          void queryClient.invalidateQueries('user-email-connection');
          void queryClient.invalidateQueries('email-sync-status');
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

  return (
    <>
      <Card
        bordered
        style={{
          marginBottom: 20,
          borderRadius: token.borderRadiusLG,
          background: isCurrentActive
            ? 'linear-gradient(135deg, rgba(82, 196, 26, 0.05) 0%, rgba(22, 119, 255, 0.03) 100%)'
            : 'linear-gradient(135deg, rgba(0, 120, 212, 0.06) 0%, rgba(22, 119, 255, 0.02) 100%)',
          borderColor: isCurrentActive ? token.colorSuccessBorder : 'rgba(0, 120, 212, 0.25)',
          boxShadow: token.boxShadowTertiary,
        }}
        styles={{ body: { padding: '18px 22px' } }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={17}>
            <Space align="start" size={14}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: isCurrentActive ? token.colorSuccess : '#0078D4',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  fontSize: 22,
                }}
              >
                <WindowsOutlined />
              </div>
              <div>
                <Space size={8} align="center">
                  <Text strong style={{ fontSize: 15, color: token.colorText }}>
                    微软官方 OAuth 2.0 快捷授权 (Outlook / Hotmail / Office 365)
                  </Text>
                  {isCurrentActive ? (
                    <Tag color="success" icon={<CheckCircleOutlined />}>
                      当前连接生效中
                    </Tag>
                  ) : null}
                </Space>
                <Paragraph style={{ margin: '4px 0 0 0', fontSize: 12, color: token.colorTextSecondary }}>
                  微软个人与企业邮箱已停用传统密码连接。点击右侧按钮，通过微软官方页面快速完成身份验证（Graph API 现代协议），无需配置密码或授权码。
                </Paragraph>
              </div>
            </Space>
          </Col>
          <Col xs={24} md={7} style={{ textAlign: 'right' }}>
            <Button
              type={isCurrentActive ? 'default' : 'primary'}
              icon={<WindowsOutlined />}
              onClick={() => handleStartOAuth()}
              style={{
                background: isCurrentActive ? undefined : '#0078D4',
                borderColor: isCurrentActive ? undefined : '#0078D4',
                height: 38,
                fontWeight: 500,
                borderRadius: 6,
              }}
            >
              {isCurrentActive ? '重新授权微软账号' : '一键登录微软官方绑定'}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 微软官方 Device Code 授权弹窗 */}
      <Modal
        title={
          <Space>
            <WindowsOutlined style={{ color: '#0078D4', fontSize: 20 }} />
            <span>微软官方账号授权 (Microsoft Device Login)</span>
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

          {/* 可折叠的常见问题解决指引 */}
          <Collapse
            ghost
            items={[
              {
                key: 'azure_guide',
                label: (
                  <Space size={6}>
                    <InfoCircleOutlined style={{ color: token.colorPrimary }} />
                    <Text style={{ fontSize: 12 }}>若遇到微软「第一方应用不可同意」提示？点击展开 1 分钟解决指引</Text>
                  </Space>
                ),
                children: (
                  <div
                    style={{
                      textAlign: 'left',
                      fontSize: 12,
                      background: token.colorFillAlter,
                      padding: 12,
                      borderRadius: 6,
                    }}
                  >
                    <Paragraph style={{ fontSize: 12, margin: 0, color: token.colorTextSecondary }}>
                      微软安全策略要求个人账号（Hotmail）授权给已注册的 Azure 应用程序。只需免费注册一次：
                    </Paragraph>
                    <ol style={{ paddingLeft: 18, margin: '6px 0 10px 0', color: token.colorTextSecondary }}>
                      <li>
                        访问{' '}
                        <a
                          href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Azure 应用注册 (免费)
                        </a>
                        ；
                      </li>
                      <li>
                        点击「新注册」，支持的账户类型选择<strong>「任何组织目录中的账户和个人 Microsoft 账户」</strong>；
                      </li>
                      <li>
                        重定向 URI 选择「公共客户端/移动和桌面」填入{' '}
                        <code>https://login.microsoftonline.com/common/oauth2/nativeclient</code> 并注册；
                      </li>
                      <li>
                        复制页面上的<strong>「应用程序(客户端) ID」</strong>，填入下方输入框后点击「使用此 ID 授权」。
                      </li>
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
                        onClick={() => handleStartOAuth(customClientId)}
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
    </>
  );
}
