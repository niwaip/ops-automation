import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select, Divider, Alert, Row, Col, Tooltip } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  StopOutlined,
  ExperimentOutlined,
  CloudServerOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LockOutlined,
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
  'local': '本地模型',
};

// Fixed endpoints for preset providers (user only needs to enter API key)
const PRESET_ENDPOINTS: Record<string, string> = {
  'alibaba-coding': 'https://coding.dashscope.aliyuncs.com/v1',
  'alibaba-bailian': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'openai': 'https://api.openai.com/v1',
  'deepseek': 'https://api.deepseek.com/v1',
};

const AIModelAdminPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [testPrompt, setTestPrompt] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedPresetModel, setSelectedPresetModel] = useState<string>('');

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
      setCreateModalVisible(false);
      createForm.resetFields();
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
        updateMutation.mutate({ id: editingModel.id, data: values });
      }
    });
  };

  const handleCreate = () => {
    createForm.validateFields().then((values) => {
      // Map frontend field names to backend API names
      const payload = {
        name: values.name,
        provider: values.provider,
        api_endpoint: values.api_endpoint,
        api_key: values.apiKey, // Map apiKey to api_key
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

  const columns: ColumnsType<AIModel> = [
    {
      title: t('admin:modelName'),
      dataIndex: 'name',
      key: 'name',
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

  const providerOptions: ModelProvider[] = ['alibaba-coding', 'alibaba-bailian', 'openai', 'anthropic', 'azure', 'deepseek', 'local'];

  // Group presets by provider
  const groupedPresets = presetsQuery.data?.presets?.reduce((acc, preset) => {
    if (!acc[preset.provider]) {
      acc[preset.provider] = [];
    }
    acc[preset.provider].push(preset);
    return acc;
  }, {} as Record<string, typeof presetsQuery.data.presets>) || {};

  return (
    <div>
      <Title level={4}>{t('admin:modelManagement')}</Title>

      {/* Preset Models Status Card */}
      <Card
        style={{ marginTop: 16 }}
        title={
          <Space>
            <CloudServerOutlined />
            <span>预设模型状态</span>
          </Space>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => presetsQuery.refetch()}
            loading={presetsQuery.isLoading}
          >
            {t('common:refresh')}
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          message="配置 API Key 后，预设模型会在服务启动时自动初始化"
          style={{ marginBottom: 16 }}
        />

        {Object.entries(groupedPresets).map(([provider, presets]) => (
          <div key={provider} style={{ marginBottom: 16 }}>
            <Title level={5} style={{ marginBottom: 8 }}>
              {PROVIDER_NAMES[provider] || provider}
              {PRESET_ENDPOINTS[provider] && (
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                  ({PRESET_ENDPOINTS[provider]})
                </Text>
              )}
            </Title>
            <Row gutter={[8, 8]}>
              {(presets as typeof presetsQuery.data.presets).map((preset) => (
                <Col key={preset.name}>
                  <Space>
                    <Tag
                      icon={preset.configured ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                      color={preset.configured ? 'success' : 'default'}
                      style={{ padding: '4px 8px' }}
                    >
                      {preset.name}
                      {preset.configured ? ' (已配置)' : ' (未配置)'}
                    </Tag>
                    {preset.default && (
                      <Tag color="blue" style={{ marginLeft: 4 }}>默认</Tag>
                    )}
                    {preset.configured && (
                      <Button
                        type="link"
                        size="small"
                        icon={<CheckOutlined />}
                        onClick={() => {
                          // Open create modal with preset model pre-filled
                          setSelectedProvider(provider);
                          setSelectedPresetModel(preset.name);
                          setCreateModalVisible(true);
                          createForm.setFieldsValue({
                            provider: provider,
                            name: preset.name,
                            api_endpoint: PRESET_ENDPOINTS[provider] || '',
                          });
                        }}
                      >
                        激活
                      </Button>
                    )}
                  </Space>
                </Col>
              ))}
            </Row>
          </div>
        ))}
      </Card>

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
                      {m.configured ? (
                        <Tag color="success" style={{ marginLeft: 4 }}>已配置</Tag>
                      ) : (
                        <Tag color="warning" style={{ marginLeft: 4 }}>未配置</Tag>
                      )}
                    </Space>
                  </Option>
                ))}
              </Select>
              <Text type="secondary" style={{ fontSize: 12 }}>
                选择预设模型可自动填充名称和配置
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
            rules={[{ required: !presetsQuery.data?.presets?.some(p => p.provider === selectedProvider && p.configured) }]}
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
    </div>
  );
};

export default AIModelAdminPage;