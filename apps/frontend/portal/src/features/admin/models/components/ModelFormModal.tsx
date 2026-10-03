import React, { useEffect, useState, useMemo } from 'react';
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
import {
  ExperimentOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import {
  AIModel,
  AIProviderConfig,
  ModelProvider,
} from '@/api/ai';
import {
  DEFAULT_SCOPE_OPTIONS,
  ROUTING_TAG_OPTIONS,
  getProviderAccent,
  getProviderMonogram,
  mapConfigToFormValues,
  buildConfigFromValues,
} from '../types';
import {
  recognizeModelProfile,
  RecognizedModelProfile,
} from '../utils/modelProfileRecognizer';
import { ModelIdentitySection } from './ModelIdentitySection';
import { ModelCapabilitiesSection } from './ModelCapabilitiesSection';
import './ModelFormModal.css';

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
  const [modalities, setModalities] = useState<string[]>(['text']);

  const selectedProviderConfigId = Form.useWatch('providerConfigId', form);
  const selectedProviderConfig = selectedProviderConfigId
    ? providerConfigMap.get(selectedProviderConfigId)
    : null;

  const currentModelName = Form.useWatch('name', form);
  const supportsReasoningWatch = Form.useWatch('supports_reasoning', form);

  const isEditing = Boolean(editingModel);
  const canReuseCredential = Boolean(selectedProviderConfig?.hasCredential);

  const detectedProfile = useMemo(() => {
    if (!currentModelName) return null;
    return recognizeModelProfile(currentModelName, selectedProviderConfig?.provider);
  }, [currentModelName, selectedProviderConfig?.provider]);

  useEffect(() => {
    if (open) {
      if (editingModel) {
        const formValues = mapConfigToFormValues(editingModel.config);
        const initModalities = formValues.input && formValues.input.length > 0 ? formValues.input : ['text'];
        setModalities(initModalities);
        form.setFieldsValue({
          name: editingModel.name,
          providerConfigId: editingModel.providerConfigId,
          apiKey: '',
          ...formValues,
          input: initModalities,
        });
      } else {
        form.resetFields();
        setModalities(['text']);
        form.setFieldsValue({
          providerConfigId: defaultProviderConfigId || (providers[0]?.id),
          capability_tier: 'standard',
          input: ['text'],
          defaultScopes: [],
          routing_tags: ['chat'],
          prefer_for_code: false,
          supports_reasoning: false,
          reasoning_effort: 'medium',
        });
      }
      setAvailableModels([]);
    }
  }, [open, editingModel, defaultProviderConfigId, form, providers]);

  const handleApplyAutoProfile = (
    profileToApply: RecognizedModelProfile | null = detectedProfile,
    showToast = true
  ) => {
    if (!profileToApply) {
      message.warning('请先输入或选择模型标识');
      return;
    }

    const nextModalities = profileToApply.input && profileToApply.input.length > 0 ? profileToApply.input : ['text'];
    setModalities(nextModalities);

    form.setFieldsValue({
      display_name: profileToApply.display_name || form.getFieldValue('display_name'),
      capability_tier: profileToApply.capability_tier || 'standard',
      supports_reasoning: Boolean(profileToApply.supports_reasoning),
      reasoning_effort: profileToApply.reasoning_effort || 'medium',
      input: nextModalities,
      routing_tags: profileToApply.routing_tags || form.getFieldValue('routing_tags'),
      defaultScopes: profileToApply.defaultScopes || form.getFieldValue('defaultScopes'),
      prefer_for_code: Boolean(profileToApply.prefer_for_code),
      description: profileToApply.description || form.getFieldValue('description'),
    });

    if (showToast) {
      message.success(`已智能识别模型特性，自动填充思考模式、模态与推荐策略！`);
    }
  };

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
      message.success(`成功拉取 ${res.models.length} 个模型`);
    } catch {
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSelectModelName = (val: string) => {
    form.setFieldsValue({ name: val });
    const profile = recognizeModelProfile(val, selectedProviderConfig?.provider);
    if (profile) {
      handleApplyAutoProfile(profile, false);
      message.info(`已识别模型 [${val}] 并匹配预设属性`);
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
        config: buildConfigFromValues({
          ...values,
          input: modalities,
        }),
      });
    } catch {
      // Form validation failed
    }
  };

  const providerAccent = getProviderAccent(selectedProviderConfig?.provider || '');
  const providerMonogram = getProviderMonogram(selectedProviderConfig?.name || selectedProviderConfig?.provider);

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: providerAccent.soft,
              color: providerAccent.solid,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {providerMonogram || <RobotOutlined />}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>
              {isEditing ? '编辑模型属性与能力' : '接入新大模型'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', fontWeight: 400 }}>
              支持智能识别、多模态自由多选与原生思考推理配置
            </div>
          </div>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={confirmLoading}
      width={700}
      okText={isEditing ? '保存修改' : '确认接入'}
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
            size="middle"
          >
            测试连通性
          </Button>
          <Space>
            <Button onClick={onCancel} size="middle">取消</Button>
            <Button type="primary" loading={confirmLoading} onClick={handleOk} size="middle">
              {isEditing ? '保存修改' : '确认添加'}
            </Button>
          </Space>
        </div>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        size="middle"
        className="model-form-modal-form"
        style={{ marginTop: 6 }}
      >
        {/* Section 1: 模型标识与智能探测 (高度严格对齐) */}
        <ModelIdentitySection
          isEditing={isEditing}
          providers={providers}
          availableModels={availableModels}
          isLoadingModels={isLoadingModels}
          detectedProfile={detectedProfile}
          onFetchRemoteModels={handleFetchRemoteModels}
          onSelectModelName={handleSelectModelName}
          onApplyAutoProfile={handleApplyAutoProfile}
        />

        {/* Section 2: 模态多选与原生思考模式 (支持问题/文本+视觉等自由多选) */}
        <ModelCapabilitiesSection
          selectedModalities={modalities}
          supportsReasoning={Boolean(supportsReasoningWatch)}
          onModalitiesChange={(next) => {
            setModalities(next);
            form.setFieldsValue({ input: next });
          }}
        />

        {/* Section 3: 接口凭据与凭据状态 (左右严格等高对齐) */}
        <Row gutter={12}>
          <Col span={13}>
            <Form.Item
              name="apiKey"
              label="API Key (凭据覆盖)"
              rules={!canReuseCredential && !isEditing ? [{ required: true, message: '请输入 API Key' }] : []}
            >
              <Input.Password
                placeholder={canReuseCredential ? '可留空（自动复用服务商凭据）' : '请输入该模型专属 API Key'}
              />
            </Form.Item>
          </Col>
          <Col span={11}>
            <Form.Item label="服务商凭据状态">
              <div
                style={{
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  background: canReuseCredential ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                  border: `1px solid ${canReuseCredential ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                  color: canReuseCredential ? '#10b981' : '#f59e0b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {canReuseCredential ? '✅ 已存服务商凭据，留空自动继承' : '⚠️ 服务商未存凭据，需在此填写'}
              </div>
            </Form.Item>
          </Col>
        </Row>

        {/* Section 4: 默认场景策略与业务路由 (左右严格等高对齐) */}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="defaultScopes"
              label="默认场景策略 (可选)"
            >
              <Select
                mode="multiple"
                allowClear
                placeholder="设置该模型作为特定业务默认模型"
                options={DEFAULT_SCOPE_OPTIONS}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="routing_tags"
              label="业务路由标签"
            >
              <Select
                mode="multiple"
                allowClear
                placeholder="匹配标签 (如 chat, code, multimodal)"
                options={ROUTING_TAG_OPTIONS}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Section 5: 代码优先偏好与说明 (左右严格等高对齐) */}
        <Row gutter={12}>
          <Col span={15}>
            <Form.Item name="description" label="模型说明 (可选)">
              <Input placeholder="说明模型特性、优势场景或上下文长度" />
            </Form.Item>
          </Col>
          <Col span={9}>
            <Form.Item label="代码任务偏好">
              <div
                style={{
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Form.Item name="prefer_for_code" valuePropName="checked" noStyle>
                  <Checkbox>
                    <span style={{ fontSize: 13 }}>💻 代码生成任务优先调度</span>
                  </Checkbox>
                </Form.Item>
              </div>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};
