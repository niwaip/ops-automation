import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select, Divider, Alert, Tooltip } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  StopOutlined,
  ExperimentOutlined,
  LockOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { aiModelApi, AIModel, ModelProvider } from '../../api/ai';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;

// Provider display names
const PROVIDER_NAMES: Record<string, string> = {
  'alibaba-coding': '阿里云 Coding',
  'alibaba-bailian': '阿里云百炼',
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'azure': 'Azure OpenAI',
  'deepseek': 'DeepSeek',
  'minimax': 'MiniMax',
  'local': '本地模型',
};

// Fixed endpoints for preset providers (user only needs to enter API key)
const PRESET_ENDPOINTS: Record<string, string> = {
  'alibaba-coding': 'https://coding.dashscope.aliyuncs.com/v1',
  'alibaba-bailian': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'openai': 'https://api.openai.com/v1',
  'deepseek': 'https://api.deepseek.com/v1',
  'minimax': 'https://api.minimax.chat/v1',
};

// Available models for each provider (for switching)
const PROVIDER_MODELS: Record<string, string[]> = {
  'alibaba-coding': [
    'qwen3.5-plus',
    'qwen3-max-2026-01-23',
    'qwen3-coder-next',
    'qwen3-coder-plus',
    'MiniMax-M2.5',
    'glm-5',
    'glm-4.7',
    'kimi-k2.5',
  ],
  'alibaba-bailian': ['qwen-plus', 'qwen-turbo'],
  'openai': ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  'deepseek': ['deepseek-coder', 'deepseek-chat'],
  'minimax': ['MiniMax-Text-01', 'abab6.5s-chat', 'abab6.5-chat', 'MiniMax-M2.7'],
  'anthropic': ['claude-3-opus', 'claude-3-sonnet'],
  'azure': [],
  'local': [],
};

const AIModelAdminPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [switchModelVisible, setSwitchModelVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [testPrompt, setTestPrompt] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedPresetModel, setSelectedPresetModel] = useState<string>('');
  const [newModelName, setNewModelName] = useState<string>('');

  const modelsQuery = useQuery(['ai-models'], () => aiModelApi.list());
  const presetsQuery = useQuery(['ai-model-presets'], () => aiModelApi.listPresets());

  // Get available models for selected provider
  const availablePresetModels = presetsQuery.data?.presets?.filter(
    (p) => p.provider === selectedProvider
  ) || [];

  // Auto-fill endpoint when provider changes
  useEffect(() => {
    if (selectedProvider && PRESET_ENDPOINTS[selectedProvider]) {
      createForm.setFieldsValue({
        api_endpoint: PRESET_ENDPOINTS[selectedProvider],
      });
    }
  }, [selectedProvider, createForm]);

  // Auto-fill model name when preset model is selected
  useEffect(() => {
    if (selectedPresetModel) {
      createForm.setFieldsValue({
        name: selectedPresetModel,
      });
    }
  }, [selectedPresetModel, createForm]);

  const enableMutation = useMutation(aiModelApi.enable, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['ai-models']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const disableMutation = useMutation(aiModelApi.disable, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['ai-models']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const createMutation = useMutation(aiModelApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['ai-models']);
      handleCreateModalClose();
    },
    onError: (error: Error) => {
      message.error(`创建失败: ${error.message || t('common:error')}`);
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<AIModel> }) => aiModelApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['ai-models']);
        setEditModalVisible(false);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const deleteMutation = useMutation(aiModelApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['ai-models']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const testMutation = useMutation(
    ({ id, prompt }: { id: string; prompt: string }) => aiModelApi.test(id, prompt),
    {
      onSuccess: (result: { success: boolean; response?: string; error?: string }) => {
        if (result.success) {
          message.success(`测试成功: ${result.response}`);
        } else {
          message.error(`测试失败: ${result.error}`);
        }
        setTestModalVisible(false);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const testConfigMutation = useMutation(
    ({ endpoint, apiKey, modelName }: { endpoint: string; apiKey: string; modelName: string }) =>
      aiModelApi.testConfig(endpoint, apiKey, modelName),
    {
      onSuccess: (result: { success: boolean; response?: string; error?: string }) => {
        if (result.success) {
          message.success(`配置测试成功: ${result.response}`);
        } else {
          message.error(`配置测试失败: ${result.error}`);
        }
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const handleEnable = (id: string) => {
    enableMutation.mutate(id);
  };

  const handleDisable = (id: string) => {
    disableMutation.mutate(id);
  };

  const handleEdit = (model: AIModel) => {
    setEditingModel(model);
    editForm.setFieldsValue(model);
    setEditModalVisible(true);
  };

  const handleSaveEdit = () => {
    editForm.validateFields().then((values) => {
      if (editingModel) {
        const payload = {
          name: values.name,
          api_endpoint: values.api_endpoint,
          api_key: values.apiKey,
        };
        updateMutation.mutate({ id: editingModel.id, data: payload });
      }
    });
  };

  const handleCreate = () => {
    createForm.validateFields().then((values) => {
      const payload = {
        name: values.name,
        provider: values.provider,
        api_endpoint: values.api_endpoint,
        api_key: values.apiKey,
        config: {},
      };
      createMutation.mutate(payload);
    });
  };

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    setSelectedPresetModel('');
    if (PRESET_ENDPOINTS[provider]) {
      createForm.setFieldsValue({
        api_endpoint: PRESET_ENDPOINTS[provider],
        name: '',
      });
    } else {
      createForm.setFieldsValue({
        api_endpoint: '',
        name: '',
      });
    }
  };

  const handlePresetModelChange = (modelName: string) => {
    setSelectedPresetModel(modelName);
    createForm.setFieldsValue({
      name: modelName,
    });
  };

  const handleCreateModalClose = () => {
    setCreateModalVisible(false);
    setSelectedProvider('');
    setSelectedPresetModel('');
    createForm.resetFields();
  };

  const handleTest = (model: AIModel) => {
    setEditingModel(model);
    setTestPrompt('');
    setTestModalVisible(true);
  };

  const handleRunTest = () => {
    if (editingModel && testPrompt) {
      testMutation.mutate({ id: editingModel.id, prompt: testPrompt });
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const handleSwitchModel = (model: AIModel) => {
    setEditingModel(model);
    setNewModelName(model.name);
    setSwitchModelVisible(true);
  };

  const handleConfirmSwitchModel = () => {
    if (editingModel && newModelName && newModelName !== editingModel.name) {
      updateMutation.mutate({
        id: editingModel.id,
        data: { name: newModelName, api_endpoint: editingModel.api_endpoint },
      });
      setSwitchModelVisible(false);
    }
  };

  const columns: ColumnsType<AIModel> = [
    {
      title: t('admin:modelName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space>
          <Text strong>{name}</Text>
          {PROVIDER_MODELS[record.provider] && PROVIDER_MODELS[record.provider].length > 0 && (
            <Button
              type="link"
              size="small"
              icon={<SwapOutlined />}
              onClick={() => handleSwitchModel(record)}
            >
              切换
            </Button>
          )}
        </Space>
      ),
    },
    {
      title: t('admin:modelProvider'),
      dataIndex: 'provider',
      key: 'provider',
      render: (provider: ModelProvider) => (
        <Tag color={provider.startsWith('alibaba') ? 'orange' : 'blue'}>
          {PROVIDER_NAMES[provider] || provider}
        </Tag>
      ),
    },
    {
      title: t('admin:modelEndpoint'),
      dataIndex: 'api_endpoint',
      key: 'api_endpoint',
      ellipsis: true,
    },
    {
      title: t('admin:userStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'error'}>
          {status === 'active' ? t('admin:modelEnabled') : t('admin:modelDisabled')}
        </Tag>
      ),
    },
    {
      title: t('common:createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            {t('common:edit')}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ExperimentOutlined />}
            onClick={() => handleTest(record)}
          >
            {t('admin:testModel')}
          </Button>
          {record.status === 'active' ? (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => handleDisable(record.id)}
            >
              {t('admin:disableModel')}
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleEnable(record.id)}
            >
              {t('admin:enableModel')}
            </Button>
          )}
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            {t('common:delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const providerOptions: ModelProvider[] = ['alibaba-coding', 'alibaba-bailian', 'openai', 'anthropic', 'azure', 'deepseek', 'minimax', 'local'];

  return (
    <div>
      <Title level={4}>{t('admin:modelManagement')}</Title>

      {/* Registered Models Card */}
      <Card style={{ marginTop: 16 }}>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder={t('common:search')}
            prefix={<SearchOutlined />}
            style={{ width: 200 }}
            allowClear
          />
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => modelsQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
            >
              {t('admin:createModel')}
            </Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={modelsQuery.data?.models || []}
          rowKey="id"
          loading={modelsQuery.isLoading}
          pagination={false}
        />
      </Card>

      <Modal
        title={t('admin:createModel')}
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={handleCreateModalClose}
        confirmLoading={createMutation.isLoading}
        width={600}
      >
        <Alert
          type="info"
          showIcon
          message="选择预设供应商时，Endpoint 已自动配置，只需填写 API Key"
          style={{ marginBottom: 16 }}
        />
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="provider"
            label={t('admin:modelProvider')}
            rules={[{ required: true }]}
          >
            <Select onChange={handleProviderChange}>
              {providerOptions.map((p) => (
                <Option key={p} value={p}>{PROVIDER_NAMES[p] || p}</Option>
              ))}
            </Select>
          </Form.Item>

          {selectedProvider && availablePresetModels.length > 0 && (
            <Form.Item label="预设模型">
              <Select
                value={selectedPresetModel}
                onChange={handlePresetModelChange}
                placeholder="选择预设模型或自定义模型名称"
                allowClear
              >
                {availablePresetModels.map((m) => (
                  <Option key={m.name} value={m.name}>
                    <Space>
                      {m.name}
                      {m.default && <Tag color="blue">默认</Tag>}
                    </Space>
                  </Option>
                ))}
              </Select>
              <Text type="secondary" style={{ fontSize: 12 }}>
                选择预设模型可自动填充名称
              </Text>
            </Form.Item>
          )}

          <Form.Item
            name="name"
            label={t('admin:modelName')}
            rules={[{ required: true }]}
          >
            <Input placeholder="输入模型名称或从预设模型中选择" />
          </Form.Item>
          <Form.Item
            name="api_endpoint"
            label={t('admin:modelEndpoint')}
            rules={[{ required: true }]}
          >
            <Input
              readOnly={PRESET_ENDPOINTS[selectedProvider]}
              disabled={PRESET_ENDPOINTS[selectedProvider]}
              prefix={PRESET_ENDPOINTS[selectedProvider] ? <LockOutlined /> : null}
              suffix={PRESET_ENDPOINTS[selectedProvider] ? (
                <Tooltip title="预设供应商 Endpoint 已固定">
                  <span style={{ color: '#999' }}>固定</span>
                </Tooltip>
              ) : null}
            />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={t('admin:modelApiKey')}
            rules={[{ required: true }]}
          >
            <Input.Password placeholder="输入 API Key" />
          </Form.Item>
          <Divider />
          <Button
            type="default"
            icon={<ExperimentOutlined />}
            onClick={() => {
              const values = createForm.getFieldsValue();
              if (values.api_endpoint && values.apiKey && values.name) {
                testConfigMutation.mutate({
                  endpoint: values.api_endpoint,
                  apiKey: values.apiKey,
                  modelName: values.name,
                });
              } else {
                message.warning('请先填写供应商、模型名称和 API Key');
              }
            }}
            loading={testConfigMutation.isLoading}
          >
            测试配置
          </Button>
        </Form>
      </Modal>

      <Modal
        title={t('admin:editModel')}
        open={editModalVisible}
        onOk={handleSaveEdit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={updateMutation.isLoading}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label={t('admin:modelName')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="api_endpoint"
            label={t('admin:modelEndpoint')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={t('admin:modelApiKey')}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('admin:testModel')}
        open={testModalVisible}
        onOk={handleRunTest}
        onCancel={() => setTestModalVisible(false)}
        confirmLoading={testMutation.isLoading}
      >
        <Form.Item label="Test Prompt">
          <Input.TextArea
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Enter a test prompt..."
            rows={4}
          />
        </Form.Item>
      </Modal>

      {/* Switch Model Modal */}
      <Modal
        title="切换模型"
        open={switchModelVisible}
        onOk={handleConfirmSwitchModel}
        onCancel={() => setSwitchModelVisible(false)}
        confirmLoading={updateMutation.isLoading}
      >
        <Form layout="vertical">
          <Form.Item label="当前模型">
            <Text>{editingModel?.name}</Text>
          </Form.Item>
          <Form.Item label="选择新模型">
            <Select
              value={newModelName}
              onChange={setNewModelName}
              style={{ width: '100%' }}
            >
              {PROVIDER_MODELS[editingModel?.provider || '']?.map((model) => (
                <Option key={model} value={model}>
                  {model}
                  {model === 'qwen3.5-plus' && <Tag color="blue" style={{ marginLeft: 8 }}>默认</Tag>}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="切换模型会使用同一个 API Key，无需重新输入"
            style={{ marginTop: 16 }}
          />
        </Form>
      </Modal>
    </div>
  );
};

export default AIModelAdminPage;