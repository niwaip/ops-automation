import React, { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  CheckCircleOutlined,
  EditOutlined,
  KeyOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  credentialApi,
  SkillCredentialFieldRequirement,
} from '@/api/credentials';
import type { PublishedSkillCatalogItem } from '@ops/user-core';

const { Text, Paragraph } = Typography;

interface SkillCredentialModalProps {
  skill: PublishedSkillCatalogItem | null;
  open: boolean;
  onClose: () => void;
}

export const SkillCredentialModal: React.FC<SkillCredentialModalProps> = ({
  skill,
  open,
  onClose,
}) => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();

  // Local state for inline inputs
  const [editingParam, setEditingParam] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [authValues, setAuthValues] = useState<Record<string, { username?: string; password?: string }>>({});
  const [savingParam, setSavingParam] = useState<string | null>(null);

  // 1. Fetch credential requirements & current binding status for this skill
  const {
    data: status,
    isLoading: isStatusLoading,
    refetch: refetchStatus,
  } = useQuery(
    ['skill-credential-status', skill?.id],
    () => credentialApi.getSkillStatus(skill!.id),
    {
      enabled: Boolean(open && skill?.id),
    }
  );

  // 2. Fetch all user credentials from vault (for optional reusing)
  const { data: rawCredentials = [] } = useQuery(
    ['user-credentials'],
    () => credentialApi.list(),
    {
      enabled: open,
    }
  );
  const userCredentials = Array.isArray(rawCredentials) ? rawCredentials : [];

  // 3. Bind mutation
  const bindMutation = useMutation(
    (data: { paramName: string; credentialId: string }) =>
      credentialApi.bindSkill(skill!.id, {
        paramName: data.paramName,
        credentialId: data.credentialId,
      }),
    {
      onSuccess: () => {
        message.success('已关联指定凭据并生效');
        refetchStatus();
        queryClient.invalidateQueries(['skill-credential-status', skill?.id]);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err.message || '关联凭据失败');
      },
    }
  );

  // 4. Unbind mutation
  const unbindMutation = useMutation(
    (paramName: string) => credentialApi.unbindSkill(skill!.id, paramName),
    {
      onSuccess: () => {
        message.success('已解除凭据绑定');
        refetchStatus();
        queryClient.invalidateQueries(['skill-credential-status', skill?.id]);
        queryClient.invalidateQueries(['user-credentials']);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err.message || '解除绑定失败');
      },
    }
  );

  // 5. Direct inline save and bind
  const handleDirectSaveAndBind = async (field: SkillCredentialFieldRequirement) => {
    let payload: Record<string, any> = {};

    if (field.credentialCategory === 'device_key') {
      const key = fieldValues[field.paramName]?.trim();
      if (!key) {
        message.warning('请输入设备密钥 (DeviceKey)');
        return;
      }
      payload = { deviceKey: key };
    } else if (field.credentialCategory === 'basic_auth') {
      const auth = authValues[field.paramName];
      if (!auth?.username?.trim() || !auth?.password) {
        message.warning('请输入完整的登录账号和密码');
        return;
      }
      payload = { username: auth.username.trim(), password: auth.password };
    } else {
      const token = fieldValues[field.paramName]?.trim();
      if (!token) {
        message.warning('请输入密钥明文');
        return;
      }
      payload = { token };
    }

    try {
      setSavingParam(field.paramName);
      const credName = `${skill?.name || '数字员工'} - ${field.title || field.paramName}`;
      const newCred = await credentialApi.create({
        name: credName,
        category: field.credentialCategory,
        description: `由数字员工【${skill?.name}】配置生成`,
        payload,
      });

      await credentialApi.bindSkill(skill!.id, {
        paramName: field.paramName,
        credentialId: newCred.id,
      });

      message.success('配置已保存并生效，已存入您的个人凭证库！');
      setEditingParam(null);
      // Clean up input
      setFieldValues((prev) => ({ ...prev, [field.paramName]: '' }));
      setAuthValues((prev) => ({ ...prev, [field.paramName]: {} }));
      refetchStatus();
      queryClient.invalidateQueries(['user-credentials']);
      queryClient.invalidateQueries(['skill-credential-status', skill?.id]);
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message || '保存配置失败');
    } finally {
      setSavingParam(null);
    }
  };

  const fields = status?.fields || [];
  const hasRequirements = status?.hasCredentialRequirements;

  return (
    <Modal
      title={
        <Space>
          <SafetyCertificateOutlined style={{ color: '#6366f1' }} />
          <span>配置数字员工凭证 — {skill?.name}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          完成
        </Button>,
      ]}
      width={640}
      destroyOnClose
    >
      <div style={{ margin: '16px 0 24px' }}>
        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
          为该数字员工关联您的专属运行凭证（如 Bark 设备密钥、系统账号密码）。配置后，数字员工在协同问答与自动调度时将自动使用，全程加密绝不硬编码。
        </Paragraph>

        {isStatusLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="正在检查凭证要求..." />
          </div>
        ) : !hasRequirements ? (
          <Alert
            type="info"
            showIcon
            message="无需专属凭证"
            description="该数字员工不需要私密凭据（如 DeviceKey 或登录账号），可直接指派任务或协同对话。"
            style={{ borderRadius: 8 }}
          />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {status?.isFullyConfigured ? (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message="所有必要凭据已配置就绪"
                description="该员工已成功关联所需凭证，发起任务或调度时将自动在内存安全注入。"
                style={{ borderRadius: 8 }}
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message="尚有必要凭证未配置"
                description="请在下方关联您的凭证，否则指派该员工执行时可能因缺少授权而失败。"
                style={{ borderRadius: 8 }}
              />
            )}

            {fields.map((field: SkillCredentialFieldRequirement) => {
              const isBound = Boolean(field.boundCredential);
              const isEditing = editingParam === field.paramName;
              const isBarkCredential = /bark/i.test(
                `${skill?.name || ''} ${field.title || ''} ${field.description || ''}`
              );
              const matchedCredentials = userCredentials.filter((c) =>
                field.credentialCategory === 'device_key'
                  ? c.category === 'device_key'
                  : field.credentialCategory === 'basic_auth'
                    ? c.category === 'basic_auth'
                    : true
              );

              return (
                <Card
                  key={field.paramName}
                  size="small"
                  style={{
                    borderRadius: 10,
                    borderColor: isBound && !isEditing ? token.colorSuccessBorder : token.colorWarningBorder,
                    background: isBound && !isEditing ? token.colorSuccessBg : token.colorBgContainer,
                  }}
                  styles={{
                    body: {
                      padding: 16,
                    },
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <Space>
                        <Text strong style={{ fontSize: 14 }}>
                          {field.title || field.paramName}
                        </Text>
                        <Tag color={isBound ? 'success' : 'warning'}>
                          {isBound ? '已配置' : '未配置'}
                        </Tag>
                        {field.required && <Tag color="red">必须项</Tag>}
                      </Space>
                      {field.description && (
                        <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
                          {field.description}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 1. 已配置展示态 */}
                  {isBound && !isEditing ? (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: token.colorSuccessBg,
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: `1px solid ${token.colorSuccessBorder}`,
                      }}
                    >
                      <div>
                        <Text strong style={{ color: token.colorSuccess }}>
                          {field.boundCredential!.name}
                        </Text>
                        <div
                          style={{
                            fontSize: 12,
                            color: token.colorTextSecondary,
                            fontFamily: 'monospace',
                            marginTop: 3,
                          }}
                        >
                          掩码预览: {field.boundCredential!.maskedPreview?.summary}
                        </div>
                      </div>
                      <Space size={8}>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => setEditingParam(field.paramName)}
                        >
                          修改
                        </Button>
                        <Popconfirm
                          title="确定解绑此凭据？"
                          description="解绑后该数字员工将无法自动读取此凭据。"
                          onConfirm={() => unbindMutation.mutate(field.paramName)}
                          okText="解绑"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Button size="small" danger loading={unbindMutation.isLoading}>
                            解绑
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  ) : (
                    /* 2. 直接录入/修改配置表单 */
                    <div
                      style={{
                        background: token.colorFillAlter,
                        padding: '14px',
                        borderRadius: 8,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      {field.credentialCategory === 'device_key' && (
                        <div>
                          {isBarkCredential && (
                            <Alert
                              type="warning"
                              showIcon={false}
                              message={
                                <span style={{ fontSize: 12 }}>
                                  💡 打开手机上的 Bark App，首页链接中 <code>https://api.day.app/&lt;DeviceKey&gt;/</code> 后面的一串字符即为您的专属设备密钥。
                                </span>
                              }
                              style={{ marginBottom: 10, borderRadius: 6 }}
                            />
                          )}
                          <Space.Compact style={{ width: '100%' }}>
                            <Input.Password
                              placeholder={
                                isBarkCredential
                                  ? '请输入 Bark 设备密钥 (DeviceKey)'
                                  : `请输入${field.title || '设备密钥'}`
                              }
                              iconRender={(visible) => (visible ? <KeyOutlined /> : <LockOutlined />)}
                              value={fieldValues[field.paramName] || ''}
                              onChange={(e) =>
                                setFieldValues((prev) => ({
                                  ...prev,
                                  [field.paramName]: e.target.value,
                                }))
                              }
                            />
                            <Button
                              type="primary"
                              loading={savingParam === field.paramName}
                              onClick={() => handleDirectSaveAndBind(field)}
                            >
                              保存配置
                            </Button>
                          </Space.Compact>
                        </div>
                      )}

                      {field.credentialCategory === 'basic_auth' && (
                        <div>
                          <Alert
                            type="info"
                            showIcon={false}
                            message={
                              <span style={{ fontSize: 12 }}>
                                💡 密码将在存入数据库前经由 AES-256 高强度加密，执行任务时仅在沙箱内存安全解密注入。
                              </span>
                            }
                            style={{ marginBottom: 10, borderRadius: 6 }}
                          />
                          <Space direction="vertical" style={{ width: '100%' }} size={10}>
                            <Input
                              placeholder="请输入登录用户名 / 账号"
                              value={authValues[field.paramName]?.username || ''}
                              onChange={(e) =>
                                setAuthValues((prev) => ({
                                  ...prev,
                                  [field.paramName]: {
                                    ...prev[field.paramName],
                                    username: e.target.value,
                                  },
                                }))
                              }
                            />
                            <Input.Password
                              placeholder="请输入登录密码"
                              value={authValues[field.paramName]?.password || ''}
                              onChange={(e) =>
                                setAuthValues((prev) => ({
                                  ...prev,
                                  [field.paramName]: {
                                    ...prev[field.paramName],
                                    password: e.target.value,
                                  },
                                }))
                              }
                            />
                            <Button
                              type="primary"
                              loading={savingParam === field.paramName}
                              onClick={() => handleDirectSaveAndBind(field)}
                              style={{ width: '100%' }}
                            >
                              保存配置
                            </Button>
                          </Space>
                        </div>
                      )}

                      {field.credentialCategory !== 'device_key' && field.credentialCategory !== 'basic_auth' && (
                        <div>
                          <Space.Compact style={{ width: '100%' }}>
                            <Input.Password
                              placeholder={`请输入 ${field.title || '密钥明文'}`}
                              value={fieldValues[field.paramName] || ''}
                              onChange={(e) =>
                                setFieldValues((prev) => ({
                                  ...prev,
                                  [field.paramName]: e.target.value,
                                }))
                              }
                            />
                            <Button
                              type="primary"
                              loading={savingParam === field.paramName}
                              onClick={() => handleDirectSaveAndBind(field)}
                            >
                              保存配置
                            </Button>
                          </Space.Compact>
                        </div>
                      )}

                      {/* 可选：从已有凭证库选择关联 */}
                      {matchedCredentials.length > 0 && (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 10,
                            borderTop: `1px dashed ${token.colorBorderSecondary}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            或从已有凭据中选择：
                          </Text>
                          <Select
                            size="small"
                            placeholder="选择已有凭据直接绑定..."
                            style={{ flex: 1, minWidth: 200 }}
                            allowClear
                            onChange={(val) => {
                              if (val) {
                                bindMutation.mutate({
                                  paramName: field.paramName,
                                  credentialId: val,
                                });
                                setEditingParam(null);
                              }
                            }}
                            options={matchedCredentials.map((c) => ({
                              label: `${c.name} (${c.maskedPreview?.summary || ''})`,
                              value: c.id,
                            }))}
                          />
                        </div>
                      )}

                      {isEditing && (
                        <div style={{ marginTop: 8, textAlign: 'right' }}>
                          <Button size="small" type="text" onClick={() => setEditingParam(null)}>
                            取消修改
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </Space>
        )}
      </div>
    </Modal>
  );
};

export default SkillCredentialModal;
