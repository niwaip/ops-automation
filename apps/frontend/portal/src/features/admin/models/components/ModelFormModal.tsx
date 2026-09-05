import React, { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Checkbox,
  Button,
  Space,
  Row,
  Col,
  message,
} from 'antd';
import { ExperimentOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  AIModel,
  AIProviderConfig,
  ModelProvider,
} from '@/api/ai';
import {
  PROVIDER_NAMES,
  DEFAULT_SCOPE_OPTIONS,
  ROUTING_TAG_OPTIONS,
  mapConfigToFormValues,
  buildConfigFromValues,
} from '../types';

interface ModelFormModalProps {
  open: boolean;
  editingModel: AIModel | null;
  defaultProviderConfigId?: string;
  providers: AIProviderConfig[];
  providerConfigMap: Map<string, AIProviderConfig>;
  confirmLoading: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    name: string;
    provider: ModelProvider;
    api_endpoint: string;
    providerConfigId?: string;
    api_key?: string;
    config: ReturnType<typeof buildConfigFromValues>;
  }) => Promise<void>;
  onLoadProviderModels: (providerConfigId: string) => Promise<{ models: string[] }>;
  onTestConfig: (endpoint: string, apiKey: string, modelName: string) => Promise<{ success: boolean; response?: string; error?: string }>;
  onTestStoredConfig: (modelId: string) => Promise<{ success: boolean; response?: string; error?: string }>;
}

export const ModelFormModal: React.FC<ModelFormModalProps> = ({
  open,
  editingModel,
  defaultProviderConfigId,
  providers,
  providerConfigMap,
  confirmLoading,
  onCancel,
  onSubmit,
  onLoadProviderModels,
  onTestConfig,
  onTestStoredConfig,
}) => {
  const [form] = Form.useForm();
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const selectedProviderConfigId = Form.useWatch('providerConfigId', form);
  const selectedProviderConfig = selectedProviderConfigId
    ? providerConfigMap.get(selectedProviderConfigId)
    : null;

  const isEditing = Boolean(editingModel);
  const canReuseCredential = Boolean(selectedProviderConfig?.hasCredential);

  useEffect(() => {
    if (open) {
      if (editingModel) {
        form.setFieldsValue({
          name: editingModel.name,
          providerConfigId: editingModel.providerConfigId,
          apiKey: '',
          ...mapConfigToFormValues(editingModel.config),
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          providerConfigId: defaultProviderConfigId || (providers[0]?.id),
          capability_tier: 'standard',
          defaultScopes: [],
          routing_tags: [],
          prefer_for_code: false,
        });
      }
      setAvailableModels([]);
    }
  }, [open, editingModel, defaultProviderConfigId, form, providers]);

  const handleFetchRemoteModels = async () => {
    const providerId = form.getFieldValue('providerConfigId');
    if (!providerId) {
      message.warning('请先选择服务商配置');
      return;
    }
    setIsLoadingModels(true);
    try {
      const res = await onLoadProviderModels(providerId);
      setAvailableModels(res.models);
      message.success(`成功加载 ${res.models.length} 个模型`);
    } catch {
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleRunTest = async () => {
    const values = form.getFieldsValue();
    const modelName = values.name;
    const apiKey = values.apiKey;
    const providerConfig = values.providerConfigId
      ? providerConfigMap.get(values.providerConfigId)
      : undefined;

    if (!modelName) {
      message.warning('请先输入或选择模型名称');
      return;
    }

    setIsTesting(true);
    try {
      if (isEditing && editingModel && !apiKey && providerConfig?.hasCredential) {
        const res = await onTestStoredConfig(editingModel.id);
        if (res.success) {
          message.success(`连通性测试通过: ${res.response || 'OK'}`);
        } else {
          message.error(`连通性测试失败: ${res.error}`);
        }
      } else if (providerConfig && (apiKey || providerConfig.hasCredential)) {
        const res = await onTestConfig(
          providerConfig.api_endpoint,
          apiKey || '',
          modelName
        );
        if (res.success) {
          message.success(`连通性测试通过: ${res.response || 'OK'}`);
        } else {
          message.error(`连通性测试失败: ${res.error}`);
        }
      } else {
        message.warning('请填写 API Key 或选择具有已存凭据的服务商');
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const providerConfig = providerConfigMap.get(values.providerConfigId);
      if (!providerConfig) {
        message.error('请选择有效的服务商配置');
        return;
      }

      await onSubmit({
        name: values.name.trim(),
        provider: providerConfig.provider as ModelProvider,
        api_endpoint: providerConfig.api_endpoint,
        providerConfigId: providerConfig.id,
        api_key: values.apiKey?.trim() || undefined,
        config: buildConfigFromValues(values),
      });
    } catch {
      // Form validation failed
    }
  };

  return (
    <Modal
      title={isEditing ? '编辑模型' : '接入新模型'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={confirmLoading}
      width={680}
      okText={isEditing ? '保存修改' : '确认添加'}
      cancelText="取消"
      footer={[
        <div
          key="footer-box"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
        >
          <Button
            icon={<ExperimentOutlined />}
            loading={isTesting}
            onClick={handleRunTest}
          >
            测试模型连通性
          </Button>
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" loading={confirmLoading} onClick={handleOk}>
              {isEditing ? '保存修改' : '确认添加'}
            </Button>
          </Space>
        </div>,
      ]}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {/* Section 1: Provider and Model */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="providerConfigId"
              label="服务商配置 (Provider)"
              rules={[{ required: true, message: '请选择服务商配置' }]}
            >
              <Select
                placeholder="选择服务商"
                disabled={isEditing}
                options={providers.map((p) => ({
                  value: p.id,
                  label: `${p.name || PROVIDER_NAMES[p.provider] || p.provider} (${p.hasCredential ? '已存凭据' : '未配凭据'})`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="name"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>模型标识 (Name/ID)</span>
                  <Button
                    type="link"
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={isLoadingModels}
                    onClick={handleFetchRemoteModels}
                    style={{ padding: 0, height: 'auto', fontSize: 12 }}
                  >
                    拉取列表
                  </Button>
                </div>
              }
              rules={[{ required: true, message: '请输入或选择模型名称' }]}
              extra={availableModels.length > 0 ? `已拉取 ${availableModels.length} 个模型` : undefined}
            >
              {availableModels.length > 0 ? (
                <Select
                  showSearch
                  placeholder="从拉取的列表中选择或直接输入"
                  options={availableModels.map((m) => ({ value: m, label: m }))}
                  onChange={(val) => form.setFieldsValue({ name: val })}
                />
              ) : (
                <Input placeholder="例如：gemini-3.7-flash / gpt-4o / deepseek-chat" />
              )}
            </Form.Item>
          </Col>
        </Row>

        {/* Section 2: Display & Capability */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="display_name" label="显示别名 (可选)">
              <Input placeholder="例如：Gemini 3.7 Flash 主力" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="capability_tier" label="能力层级" initialValue="standard">
              <Select
                options={[
                  { label: '标准模型 (Standard)', value: 'standard' },
                  { label: '高级深度模型 (Advanced)', value: 'advanced' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Section 3: Credentials */}
        <Form.Item
          name="apiKey"
          label="API Key (凭据覆盖)"
          rules={!canReuseCredential && !isEditing ? [{ required: true, message: '请输入 API Key' }] : []}
          extra={
            canReuseCredential
              ? '服务商已配置凭据，留空则自动复用服务商凭据；也可在此单独覆盖'
              : '当前服务商未保存凭据，需在此填入该模型的专属 API Key'
          }
        >
          <Input.Password
            placeholder={canReuseCredential ? '可留空（自动复用服务商凭据）' : '输入 API Key'}
          />
        </Form.Item>

        {/* Section 4: Routing Strategy */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="defaultScopes" label="默认场景策略 (可多选)">
              <Select
                mode="multiple"
                allowClear
                placeholder="设置该模型作为特定场景的默认模型"
                options={DEFAULT_SCOPE_OPTIONS}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="routing_tags" label="业务路由标签">
              <Select
                mode="multiple"
                allowClear
                placeholder="选择匹配标签"
                options={ROUTING_TAG_OPTIONS}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Section 5: Description & Preference */}
        <Form.Item name="description" label="模型说明">
          <Input.TextArea
            rows={2}
            placeholder="说明模型的定位、推荐调用场景或上下文长度等"
          />
        </Form.Item>

        <Form.Item name="prefer_for_code" valuePropName="checked">
          <Checkbox>代码生成任务优先调度该模型</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
};
