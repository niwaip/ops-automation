import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Alert } from 'antd';
import { AIProviderConfig, ModelProvider } from '@/api/ai';
import { PROVIDER_NAMES, PRESET_ENDPOINTS, PROVIDER_OPTIONS } from '../types';

interface ProviderFormModalProps {
  open: boolean;
  editingProvider: AIProviderConfig | null;
  confirmLoading: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    name?: string;
    provider: ModelProvider;
    api_endpoint: string;
    api_key?: string;
  }) => Promise<void>;
}

export const ProviderFormModal: React.FC<ProviderFormModalProps> = ({
  open,
  editingProvider,
  confirmLoading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [selectedProviderType, setSelectedProviderType] = useState<string>('');
  const isEditing = Boolean(editingProvider);

  useEffect(() => {
    if (open) {
      if (editingProvider) {
        setSelectedProviderType(editingProvider.provider);
        form.setFieldsValue({
          name: editingProvider.name || '',
          provider: editingProvider.provider,
          api_endpoint: editingProvider.api_endpoint,
          apiKey: '',
        });
      } else {
        form.resetFields();
        setSelectedProviderType('openai');
        form.setFieldsValue({
          provider: 'openai',
          api_endpoint: PRESET_ENDPOINTS['openai'],
        });
      }
    }
  }, [open, editingProvider, form]);

  const handleProviderTypeChange = (val: string) => {
    setSelectedProviderType(val);
    if (!isEditing && PRESET_ENDPOINTS[val]) {
      form.setFieldsValue({
        api_endpoint: PRESET_ENDPOINTS[val],
      });
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await onSubmit({
        name: values.name?.trim() || undefined,
        provider: values.provider,
        api_endpoint: values.api_endpoint.trim(),
        api_key: values.apiKey?.trim() || undefined,
      });
    } catch {
      // Form validation failed
    }
  };

  return (
    <Modal
      title={isEditing ? '编辑服务商配置' : '新建服务商配置'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={confirmLoading}
      width={560}
      okText={isEditing ? '保存修改' : '确认创建'}
      cancelText="取消"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20, borderRadius: 8 }}
        message={
          isEditing
            ? '修改服务商地址或凭据后，所有绑定该服务商的模型将自动复用最新配置。'
            : '配置全局服务商后，可在其下快捷追加多个模型，无需重复配置 API Key。'
        }
      />

      <Form form={form} layout="vertical">
        <Form.Item
          name="provider"
          label="服务商类型 (Provider)"
          rules={[{ required: true, message: '请选择服务商类型' }]}
        >
          <Select
            onChange={handleProviderTypeChange}
            options={PROVIDER_OPTIONS.map((p) => ({
              value: p,
              label: `${PROVIDER_NAMES[p] || p} (${p})`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="name"
          label="服务商别名 / 显示名称 (可选)"
          extra="当配置多个同类型服务商（如多个本地 Ollama 或不同地域的百炼）时，设置别名便于区分"
        >
          <Input placeholder="例如：Google Gemini 主力账号 / 本地 Ollama 32B" />
        </Form.Item>

        <Form.Item
          name="api_endpoint"
          label="API Endpoint (Base URL)"
          rules={[{ required: true, message: '请输入 API 端点地址' }]}
          extra={
            PRESET_ENDPOINTS[selectedProviderType]
              ? `已自动填入官方推荐地址，亦可替换为自定义中转或内网反代 URL`
              : undefined
          }
        >
          <Input placeholder="例如：https://api.openai.com/v1" />
        </Form.Item>

        <Form.Item
          name="apiKey"
          label="API Key (密钥凭据)"
          extra={
            isEditing
              ? '不修改凭据请留空；输入新 Key 将覆盖当前已保存的凭据'
              : '建议在此配置全局 API Key，以便后续在该服务商下一键追加模型'
          }
        >
          <Input.Password placeholder={isEditing ? '留空表示保持当前凭据不变' : '输入 API Key'} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
