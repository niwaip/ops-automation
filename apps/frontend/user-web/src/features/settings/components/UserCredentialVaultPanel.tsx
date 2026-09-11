import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  DeleteOutlined,
  KeyOutlined,
  LockOutlined,
  MobileOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  CredentialCategory,
  CreateCredentialRequest,
  UserCredentialItem,
  credentialApi,
} from '@/api/credentials';

const { Text, Title, Paragraph } = Typography;

const CATEGORY_META: Record<
  CredentialCategory,
  { label: string; color: string; icon: React.ReactNode }
> = {
  api_key: {
    label: 'API 密钥',
    color: 'green',
    icon: <KeyOutlined />,
  },
  basic_auth: {
    label: '账号与密码',
    color: 'blue',
    icon: <UserOutlined />,
  },
  device_key: {
    label: '设备识别码 / 密钥',
    color: 'orange',
    icon: <MobileOutlined />,
  },
  bearer_token: {
    label: '访问令牌 (Token)',
    color: 'cyan',
    icon: <SafetyCertificateOutlined />,
  },
  custom: {
    label: '通用自定义凭证',
    color: 'purple',
    icon: <LockOutlined />,
  },
};

export const UserCredentialVaultPanel: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CredentialCategory>('api_key');
  const [form] = Form.useForm();
  const { token } = theme.useToken();

  // 1. Fetch credentials
  const {
    data: rawCredentials,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery(
    ['user-credentials'],
    () => credentialApi.list(),
    { staleTime: 30000 }
  );

  const credentials: UserCredentialItem[] = Array.isArray(rawCredentials) ? rawCredentials : [];

  // 2. Mutations
  const createMutation = useMutation(
    (data: CreateCredentialRequest) => credentialApi.create(data),
    {
      onSuccess: () => {
        message.success('凭证保存成功');
        queryClient.invalidateQueries(['user-credentials']);
        closeModal();
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err.message || '保存凭证失败');
      },
    }
  );

  const deleteMutation = useMutation(
    (id: string) => credentialApi.delete(id),
    {
      onSuccess: () => {
        message.success('凭证已删除');
        queryClient.invalidateQueries(['user-credentials']);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err.message || '删除凭证失败');
      },
    }
  );

  const openCreateModal = (category: CredentialCategory = 'api_key') => {
    setSelectedCategory(category);
    form.resetFields();
    form.setFieldsValue({
      category,
      name: '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: Record<string, any> = {};

      if (values.category === 'device_key') {
        payload.deviceKey = values.deviceKey?.trim();
      } else if (values.category === 'basic_auth') {
        payload.username = values.username?.trim();
        payload.password = values.password;
      } else if (values.category === 'api_key' || values.category === 'bearer_token') {
        payload.token = values.token?.trim();
      } else {
        payload.customKey = values.customKey;
        payload.customValue = values.customValue;
      }

      await createMutation.mutateAsync({
        name: values.name.trim(),
        category: values.category,
        description: values.description?.trim() || undefined,
        payload,
      });
    } catch {
      // Form validation failed
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            个人凭证保管库
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            集中保管您为数字员工配置的安全凭证。所有密钥均采用 AES-256 加密保护，执行时仅在沙箱内存安全解密注入。
          </Text>
        </div>
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openCreateModal('api_key')}
          >
            新建凭证
          </Button>
        </Space>
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          message="凭证数据加载失败"
          description={(error as any)?.message || '无法获取个人凭证列表，请检查服务连接'}
          action={
            <Button size="small" onClick={() => refetch()}>
              重新加载
            </Button>
          }
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin tip="正在加载凭证..." />
        </div>
      ) : credentials.length === 0 ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: '48px 0' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <Paragraph strong style={{ fontSize: 16, marginBottom: 8 }}>
                  暂无已保存的运行凭据
                </Paragraph>
                <Paragraph type="secondary" style={{ maxWidth: 520, margin: '0 auto 24px', fontSize: 13 }}>
                  初期无需在此手动预置。您可以直接前往【在岗数字员工】列表，为需要专属密钥或账号密码的数字员工点击【配置】，配置后将自动在此处生成并安全保管。
                </Paragraph>
                <Space size={12}>
                  <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    onClick={() => navigate('/skills')}
                  >
                    前往在岗数字员工
                  </Button>
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => openCreateModal('api_key')}
                  >
                    手动新建凭据
                  </Button>
                </Space>
              </div>
            }
          />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {credentials.map((cred) => {
            const meta =
              (cred.category in CATEGORY_META
                ? CATEGORY_META[cred.category as CredentialCategory]
                : undefined) || CATEGORY_META.custom;
            return (
              <Col xs={24} sm={12} lg={8} key={cred.id}>
                <Card
                  hoverable
                  style={{
                    borderRadius: 12,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  styles={{
                    body: {
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    },
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <Tag color={meta.color} icon={meta.icon}>
                        {meta.label}
                      </Tag>
                      {cred.bindingCount && cred.bindingCount > 0 ? (
                        <Tag color="geekblue">{cred.bindingCount} 个数字员工使用中</Tag>
                      ) : (
                        <Tag>未绑定员工</Tag>
                      )}
                    </div>

                    <Title level={5} style={{ margin: '0 0 6px' }}>
                      {cred.name}
                    </Title>

                    {cred.description && (
                      <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2 }}
                        style={{ fontSize: 12, marginBottom: 10 }}
                      >
                        {cred.description}
                      </Paragraph>
                    )}

                    <div
                      style={{
                        background: 'var(--bg-card-secondary, #f8fafc)',
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: 'var(--text-secondary, #64748b)',
                        marginBottom: 12,
                        wordBreak: 'break-all',
                      }}
                    >
                      {cred.maskedPreview?.summary || '••••••••'}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTop: '1px solid var(--border-color, #f1f5f9)',
                      paddingTop: 10,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      更新于{' '}
                      {cred.updatedAt ? new Date(cred.updatedAt).toLocaleDateString() : '刚刚'}
                    </Text>
                    <Space size={8}>
                      <Popconfirm
                        title="确定删除此凭证？"
                        description="删除后，已关联该凭证的数字员工将无法自动读取。"
                        onConfirm={() => deleteMutation.mutate(cred.id)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </Space>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* 录入/创建凭证弹窗 */}
      <Modal
        title={
          <Space>
            <LockOutlined style={{ color: '#6366f1' }} />
            <span>添加安全凭证</span>
          </Space>
        }
        open={isModalOpen}
        onCancel={closeModal}
        onOk={handleFormSubmit}
        confirmLoading={createMutation.isLoading}
        okText="安全保存"
        cancelText="取消"
        destroyOnClose
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ category: selectedCategory }}
          style={{ marginTop: 16 }}
        >
          <Form.Item name="category" label="凭证类型" rules={[{ required: true }]}>
            <Radio.Group
              buttonStyle="solid"
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
            >
              <Radio.Button value="api_key">API 密钥</Radio.Button>
              <Radio.Button value="basic_auth">账号与密码</Radio.Button>
              <Radio.Button value="bearer_token">访问令牌 (Token)</Radio.Button>
              <Radio.Button value="device_key">设备密钥 / Key</Radio.Button>
              <Radio.Button value="custom">通用自定义</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="name"
            label="凭证名称"
            rules={[{ required: true, message: '请输入便于识别的凭证名称' }]}
            tooltip="例如：我的业务系统 API 密钥、OA 财务账号"
          >
            <Input placeholder="例如：我的 API 密钥、测试环境账号" />
          </Form.Item>

          {/* 动态凭证表单字段 */}
          {selectedCategory === 'device_key' && (
            <Form.Item
              name="deviceKey"
              label="设备识别码 / 密钥"
              rules={[{ required: true, message: '请输入设备识别码或密钥' }]}
            >
              <Input.Password
                placeholder="请输入设备专属识别码或密钥"
                iconRender={(visible) => (visible ? <KeyOutlined /> : <LockOutlined />)}
              />
            </Form.Item>
          )}

          {selectedCategory === 'basic_auth' && (
            <Card
              size="small"
              style={{
                marginBottom: 16,
                background: token.colorFillAlter,
                borderColor: token.colorBorderSecondary,
              }}
            >
              <Form.Item
                name="username"
                label="登录用户名 / 账号"
                rules={[{ required: true, message: '请输入登录账号' }]}
              >
                <Input placeholder="例如：admin@company.com" />
              </Form.Item>
              <Form.Item
                name="password"
                label="登录密码"
                rules={[{ required: true, message: '请输入登录密码' }]}
                style={{ marginBottom: 0 }}
              >
                <Input.Password placeholder="请输入目标系统的登录密码" />
              </Form.Item>
            </Card>
          )}

          {(selectedCategory === 'api_key' || selectedCategory === 'bearer_token') && (
            <Form.Item
              name="token"
              label={
                selectedCategory === 'api_key'
                  ? 'API 密钥明文 (API Key)'
                  : '访问令牌明文 (Bearer Token)'
              }
              rules={[{ required: true, message: '请输入密钥内容' }]}
            >
              <Input.Password placeholder="例如：sk-xxxxxxxxxxxxxx" />
            </Form.Item>
          )}

          {selectedCategory === 'custom' && (
            <Card
              size="small"
              style={{
                marginBottom: 16,
                background: token.colorFillAlter,
                borderColor: token.colorBorderSecondary,
              }}
            >
              <Form.Item
                name="customKey"
                label="参数名 / Key"
                rules={[{ required: true, message: '请输入参数名' }]}
              >
                <Input placeholder="例如：client_secret" />
              </Form.Item>
              <Form.Item
                name="customValue"
                label="参数值 / Value"
                rules={[{ required: true, message: '请输入参数值' }]}
                style={{ marginBottom: 0 }}
              >
                <Input.Password placeholder="请输入敏感参数值" />
              </Form.Item>
            </Card>
          )}

          <Form.Item name="description" label="备注说明 (可选)">
            <Input.TextArea rows={2} placeholder="可填写该密钥的使用用途或过期提示" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserCredentialVaultPanel;
