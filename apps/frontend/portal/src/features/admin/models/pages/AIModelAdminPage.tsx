import React, { useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Space,
  Tag,
  Typography,
  Modal,
  message,
  Form,
  Select,
  Divider,
  Alert,
  Tooltip,
  Checkbox,
  Col,
  Row,
} from 'antd';
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
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  aiModelApi,
  AIModel,
  AIModelConfig,
  AIProviderConfig,
  AIProviderSummary,
  ModelCapabilityTier,
  ModelProvider,
} from '@/api/ai';
import type { ColumnsType } from 'antd/es/table';
import ProviderGovernanceCardGrid from '@/features/admin/models/components/ProviderGovernanceCardGrid';

const { Title, Text } = Typography;
const { Option } = Select;

// Provider display names
const PROVIDER_NAMES: Record<string, string> = {
  'alibaba-coding': '阿里云 Coding',
  'alibaba-bailian': '阿里云百炼',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure: 'Azure OpenAI',
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  bigmodel: '智谱 BigModel',
  siliconflow: 'SiliconFlow',
  local: '本地模型',
};

// Recommended endpoints for common providers
const PRESET_ENDPOINTS: Record<string, string> = {
  'alibaba-coding': 'https://coding.dashscope.aliyuncs.com/v1',
  'alibaba-bailian': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  minimax: 'https://api.minimax.chat/v1',
  bigmodel: 'https://open.bigmodel.cn/api/paas/v4',
  siliconflow: 'https://api.siliconflow.cn/v1',
};

const DEFAULT_SCOPE_OPTIONS = [
  { label: '全体默认模型', value: 'global' },
  { label: '管理员 AI 默认', value: 'admin_chat' },
  { label: '管理员任务默认', value: 'admin_task' },
  { label: '语音识别默认', value: 'audio_transcription' },
];

const ROUTING_TAG_OPTIONS = [
  { label: '聊天', value: 'chat' },
  { label: '代码', value: 'code' },
  { label: '文档', value: 'document' },
  { label: '流程', value: 'flow' },
  { label: '查询', value: 'query' },
  { label: '多模态', value: 'multimodal' },
];

const scopeTagMeta: Record<string, { label: string; color: string }> = {
  global: { label: '全体默认', color: 'blue' },
  admin_chat: { label: '管理员 AI', color: 'purple' },
  admin_task: { label: '管理员任务', color: 'magenta' },
  audio_transcription: { label: '语音识别', color: 'orange' },
};

const SECTION_CARD_STYLE: React.CSSProperties = {
  marginTop: 16,
  borderRadius: 20,
  border: '1px solid var(--bg-secondary)',
  boxShadow: 'var(--shadow-md)',
};

const OVERVIEW_METRIC_STYLE: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid var(--bg-secondary)',
  background: 'var(--bg-card)',
  boxShadow: 'var(--shadow-sm)',
};

function mapConfigToFormValues(config?: AIModelConfig) {
  const safeConfig = config || {};
  const defaultScopes = DEFAULT_SCOPE_OPTIONS.map((item) => item.value).filter(
    (scope) =>
      safeConfig.default_scope?.[scope as keyof NonNullable<AIModelConfig['default_scope']>] ===
      true
  );

  return {
    display_name: safeConfig.display_name,
    description: safeConfig.description,
    capability_tier: safeConfig.capability_tier || 'standard',
    defaultScopes,
    routing_tags: Array.isArray(safeConfig.routing_tags) ? safeConfig.routing_tags : [],
    prefer_for_code: safeConfig.routing_preferences?.prefer_for_code === true,
  };
}

function buildConfigFromValues(values: Record<string, unknown>): AIModelConfig {
  const defaultScopes = Array.isArray(values.defaultScopes)
    ? values.defaultScopes.filter((item): item is string => typeof item === 'string')
    : [];
  const routingTags = Array.isArray(values.routing_tags)
    ? values.routing_tags.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0
      )
    : [];

  return {
    display_name:
      typeof values.display_name === 'string' && values.display_name.trim()
        ? values.display_name.trim()
        : undefined,
    description:
      typeof values.description === 'string' && values.description.trim()
        ? values.description.trim()
        : undefined,
    capability_tier: (values.capability_tier === 'advanced'
      ? 'advanced'
      : 'standard') as ModelCapabilityTier,
    routing_tags: routingTags,
    default_scope: {
      global: defaultScopes.includes('global'),
      admin_chat: defaultScopes.includes('admin_chat'),
      admin_task: defaultScopes.includes('admin_task'),
      audio_transcription: defaultScopes.includes('audio_transcription'),
    },
    routing_preferences: {
      prefer_for_code: values.prefer_for_code === true,
    },
  };
}

function getProviderIdentity(provider: string, apiEndpoint: string) {
  return `${provider}::${apiEndpoint}`;
}

function getProviderConfigLabel(providerConfig: AIProviderConfig) {
  return `${PROVIDER_NAMES[providerConfig.provider] || providerConfig.provider} · ${providerConfig.api_endpoint}`;
}

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
  const [newModelName, setNewModelName] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [providerModalVisible, setProviderModalVisible] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProviderConfig | null>(null);
  const [providerFormProvider, setProviderFormProvider] = useState<string>('');
  const [createAvailableModels, setCreateAvailableModels] = useState<string[]>([]);
  const [editAvailableModels, setEditAvailableModels] = useState<string[]>([]);
  const [switchAvailableModels, setSwitchAvailableModels] = useState<string[]>([]);

  const modelsQuery = useQuery(['ai-models'], () => aiModelApi.listForAdmin());
  const providersQuery = useQuery(['ai-model-providers'], () => aiModelApi.listProviders());
  const providerConfigsQuery = useQuery(['ai-provider-configs'], () =>
    aiModelApi.listProviderConfigs()
  );
  const [providerForm] = Form.useForm();
  const selectedCreateProviderConfigId = Form.useWatch('providerConfigId', createForm);
  const selectedEditProviderConfigId = Form.useWatch('providerConfigId', editForm);

  // Get available models for selected provider
  const providerConfigMap = new Map(
    (providerConfigsQuery.data?.providers || []).map((providerConfig) => [
      providerConfig.id,
      providerConfig,
    ])
  );
  const selectedCreateProviderConfig = selectedCreateProviderConfigId
    ? providerConfigMap.get(selectedCreateProviderConfigId)
    : null;
  const selectedEditProviderConfig = selectedEditProviderConfigId
    ? providerConfigMap.get(selectedEditProviderConfigId)
    : null;

  const enableMutation = useMutation(aiModelApi.enable, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['ai-models']);
      queryClient.invalidateQueries(['ai-model-providers']);
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
      queryClient.invalidateQueries(['ai-model-providers']);
      queryClient.invalidateQueries(['ai-provider-configs']);
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
        queryClient.invalidateQueries(['ai-model-providers']);
        queryClient.invalidateQueries(['ai-provider-configs']);
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
      queryClient.invalidateQueries(['ai-model-providers']);
      queryClient.invalidateQueries(['ai-provider-configs']);
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

  const testConfigWithStoredKeyMutation = useMutation(
    (id: string) => aiModelApi.testConfigWithStoredKey(id),
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

  const createProviderMutation = useMutation(aiModelApi.createProviderConfig, {
    onSuccess: () => {
      message.success('Provider 已创建');
      queryClient.invalidateQueries(['ai-model-providers']);
      queryClient.invalidateQueries(['ai-provider-configs']);
      handleProviderModalClose();
    },
    onError: (error: Error) => {
      message.error(`Provider 创建失败: ${error.message || t('common:error')}`);
    },
  });

  const updateProviderMutation = useMutation(
    ({
      id,
      data,
    }: {
      id: string;
      data: { provider?: ModelProvider; api_endpoint?: string; api_key?: string };
    }) => aiModelApi.updateProviderConfig(id, data),
    {
      onSuccess: () => {
        message.success('Provider 已更新');
        queryClient.invalidateQueries(['ai-models']);
        queryClient.invalidateQueries(['ai-model-providers']);
        queryClient.invalidateQueries(['ai-provider-configs']);
        handleProviderModalClose();
      },
      onError: (error: Error) => {
        message.error(`Provider 更新失败: ${error.message || t('common:error')}`);
      },
    }
  );

  const checkProviderHealthMutation = useMutation(
    (id: string) => aiModelApi.checkProviderHealth(id),
    {
      onSuccess: (result: { success: boolean; response?: string; error?: string }) => {
        if (result.success) {
          message.success(`健康检查通过: ${result.response}`);
        } else {
          message.error(`健康检查失败: ${result.error}`);
        }
      },
      onError: (error: Error) => {
        message.error(`健康检查异常: ${error.message || t('common:error')}`);
      },
    }
  );

  const loadProviderModelsMutation = useMutation(
    (id: string) => aiModelApi.listProviderModels(id),
    {
      onError: (error: Error) => {
        message.error(`加载模型列表失败: ${error.message || t('common:error')}`);
      },
    }
  );

  const loadModelsForProvider = async (
    providerConfigId: string,
    target: 'create' | 'edit' | 'switch'
  ) => {
    const providerConfig = providerConfigMap.get(providerConfigId);
    if (!providerConfig) {
      message.warning('请先选择有效的 Provider 配置');
      return;
    }

    try {
      const result = await loadProviderModelsMutation.mutateAsync(providerConfigId);
      if (target === 'create') {
        setCreateAvailableModels(result.models);
      } else if (target === 'edit') {
        setEditAvailableModels(result.models);
      } else {
        setSwitchAvailableModels(result.models);
      }
      message.success(`已加载 ${result.models.length} 个模型`);
    } catch {
      if (target === 'create') {
        setCreateAvailableModels([]);
      } else if (target === 'edit') {
        setEditAvailableModels([]);
      } else {
        setSwitchAvailableModels([]);
      }
    }
  };

  const handleEnable = (id: string) => {
    enableMutation.mutate(id);
  };

  const handleDisable = (id: string) => {
    disableMutation.mutate(id);
  };

  const handleEdit = (model: AIModel) => {
    setEditingModel(model);
    setEditAvailableModels([]);
    editForm.setFieldsValue({
      ...model,
      providerConfigId: model.providerConfigId,
      apiKey: '', // Don't pre-fill API key for security
      ...mapConfigToFormValues(model.config),
    });
    setEditModalVisible(true);
  };

  const handleSaveEdit = () => {
    editForm.validateFields().then((values) => {
      if (editingModel) {
        const selectedProviderConfig = values.providerConfigId
          ? providerConfigMap.get(values.providerConfigId)
          : undefined;
        const payload = {
          name: values.name,
          providerConfigId: values.providerConfigId,
          api_endpoint: selectedProviderConfig?.api_endpoint,
          api_key: values.apiKey,
          config: buildConfigFromValues(values),
        };
        updateMutation.mutate({ id: editingModel.id, data: payload });
      }
    });
  };

  const handleCreate = () => {
    createForm.validateFields().then((values) => {
      const selectedProviderConfig = values.providerConfigId
        ? providerConfigMap.get(values.providerConfigId)
        : undefined;
      if (!selectedProviderConfig) {
        message.warning('请先选择 Provider 配置');
        return;
      }
      const payload = {
        name: values.name,
        provider: selectedProviderConfig.provider as ModelProvider,
        api_endpoint: selectedProviderConfig.api_endpoint,
        providerConfigId: selectedProviderConfig.id,
        api_key: values.apiKey,
        config: buildConfigFromValues(values),
      };
      createMutation.mutate(payload);
    });
  };

  const handleCreateProviderConfigChange = (providerConfigId: string) => {
    const providerConfig = providerConfigMap.get(providerConfigId);
    setCreateAvailableModels([]);
    createForm.setFieldsValue({
      name: '',
      apiKey: '',
    });
    if (!providerConfig) {
      return;
    }
  };

  const handleEditProviderConfigChange = (providerConfigId: string) => {
    const providerConfig = providerConfigMap.get(providerConfigId);
    setEditAvailableModels([]);
    if (!providerConfig) {
      return;
    }
  };

  const handleCreateModalClose = () => {
    setCreateModalVisible(false);
    setCreateAvailableModels([]);
    createForm.resetFields();
  };

  const openCreateProviderModal = () => {
    setEditingProvider(null);
    setProviderFormProvider('');
    providerForm.resetFields();
    setProviderModalVisible(true);
  };

  const openEditProviderModal = (providerConfig: AIProviderConfig) => {
    setEditingProvider(providerConfig);
    setProviderFormProvider(providerConfig.provider);
    providerForm.setFieldsValue({
      provider: providerConfig.provider,
      api_endpoint: providerConfig.api_endpoint,
      apiKey: '',
    });
    setProviderModalVisible(true);
  };

  const handleProviderModalClose = () => {
    setProviderModalVisible(false);
    setEditingProvider(null);
    setProviderFormProvider('');
    providerForm.resetFields();
  };

  const handleProviderConfigProviderChange = (provider: string) => {
    setProviderFormProvider(provider);
    if (!editingProvider && PRESET_ENDPOINTS[provider]) {
      providerForm.setFieldsValue({
        api_endpoint: PRESET_ENDPOINTS[provider],
      });
    }
  };

  const handleSaveProviderConfig = () => {
    providerForm.validateFields().then((values) => {
      const payload = {
        provider: values.provider,
        api_endpoint: values.api_endpoint,
        api_key: values.apiKey,
      };

      if (editingProvider) {
        updateProviderMutation.mutate({
          id: editingProvider.id,
          data: payload,
        });
        return;
      }

      createProviderMutation.mutate(payload);
    });
  };

  const openCreateModal = (providerSummary?: AIProviderSummary) => {
    setCreateModalVisible(true);
    setCreateAvailableModels([]);

    if (!providerSummary) {
      createForm.resetFields();
      return;
    }

    const matchedProviderConfig = (providerConfigsQuery.data?.providers || []).find(
      (providerConfig) => {
        return (
          providerConfig.provider === providerSummary.provider &&
          providerConfig.api_endpoint === providerSummary.api_endpoint
        );
      }
    );
    createForm.resetFields();
    createForm.setFieldsValue({
      providerConfigId: matchedProviderConfig?.id,
      capability_tier: 'standard',
      defaultScopes: [],
      routing_tags: [],
      prefer_for_code: false,
    });
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
    setSwitchAvailableModels([]);
    setSwitchModelVisible(true);
  };

  const handleConfirmSwitchModel = () => {
    if (editingModel && newModelName && newModelName !== editingModel.name) {
      updateMutation.mutate({
        id: editingModel.id,
        data: {
          name: newModelName,
          api_endpoint: editingModel.api_endpoint,
          providerConfigId: editingModel.providerConfigId,
        },
      });
      setSwitchModelVisible(false);
    }
  };

  const filteredModels = (modelsQuery.data?.models || []).filter((model) => {
    const keyword = searchText.trim().toLowerCase();
    const matchesProvider = !providerFilter || model.provider === providerFilter;
    if (!matchesProvider) return false;
    if (!keyword) return true;

    const haystack = [
      model.name,
      model.config?.display_name,
      model.config?.description,
      PROVIDER_NAMES[model.provider],
      model.provider,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();

    return haystack.includes(keyword);
  });

  const groupedModels = useMemo(() => {
    const groups: Map<string, { providerConfig?: AIProviderConfig; models: AIModel[] }> = new Map();

    filteredModels.forEach((model) => {
      const key = model.providerConfigId || 'unlinked';
      if (!groups.has(key)) {
        groups.set(key, {
          providerConfig: model.providerConfigId
            ? providerConfigMap.get(model.providerConfigId)
            : undefined,
          models: [],
        });
      }
      groups.get(key)!.models.push(model);
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (!a.providerConfig) return 1;
      if (!b.providerConfig) return -1;
      return a.providerConfig.provider.localeCompare(b.providerConfig.provider);
    });
  }, [filteredModels, providerConfigMap]);

  const providerSummaryMap = new Map(
    (providersQuery.data?.providers || []).map((provider) => [
      getProviderIdentity(provider.provider, provider.api_endpoint),
      provider,
    ])
  );

  const providerGovernanceItems = (providerConfigsQuery.data?.providers || [])
    .map((providerConfig) => ({
      providerConfig,
      summary: providerSummaryMap.get(
        getProviderIdentity(providerConfig.provider, providerConfig.api_endpoint)
      ),
    }))
    .sort((left, right) => {
      if (
        (left.providerConfig.hasCredential || false) !==
        (right.providerConfig.hasCredential || false)
      ) {
        return left.providerConfig.hasCredential ? -1 : 1;
      }
      return left.providerConfig.provider.localeCompare(right.providerConfig.provider);
    });

  const canReuseProviderCredential = Boolean(selectedCreateProviderConfig?.hasCredential);

  const canSwitchModel = Boolean(editingModel?.providerConfigId || editingModel?.provider);

  const handleAppendModelFromProvider = (
    providerConfig: AIProviderConfig,
    summary?: AIProviderSummary
  ) => {
    openCreateModal(
      summary || {
        id: providerConfig.id,
        provider: providerConfig.provider,
        api_endpoint: providerConfig.api_endpoint,
        modelCount: 0,
        activeModelCount: 0,
        hasCredential: providerConfig.hasCredential || false,
        advancedModelCount: 0,
        defaultScopes: [],
      }
    );
  };

  const refreshOverview = () => {
    void modelsQuery.refetch();
    void providersQuery.refetch();
    void providerConfigsQuery.refetch();
  };

  const totalModelCount = modelsQuery.data?.models.length || 0;
  const activeModelCount = (modelsQuery.data?.models || []).filter(
    (model) => model.status === 'active'
  ).length;
  const advancedModelCount = (modelsQuery.data?.models || []).filter(
    (model) => model.config?.capability_tier === 'advanced'
  ).length;
  const configuredProviderCount = providerGovernanceItems.filter(
    ({ providerConfig }) => providerConfig.hasCredential
  ).length;

  const columns: ColumnsType<AIModel> = [
    {
      title: '模型',
      dataIndex: 'name',
      key: 'name',
      width: 320,
      render: (name: string, record) => (
        <Space direction="vertical" size={4}>
          <Space size={8} wrap>
            <Text strong>{record.config?.display_name || name}</Text>
            {record.config?.capability_tier === 'advanced' && <Tag color="gold">高级</Tag>}
          </Space>
          {record.config?.display_name && <Text type="secondary">{name}</Text>}
          {record.config?.description ? (
            <Text type="secondary">{record.config.description}</Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '供应商',
      dataIndex: 'provider',
      key: 'provider',
      width: 140,
      align: 'center',
      render: (provider: ModelProvider) => (
        <Tag color={provider.startsWith('alibaba') ? 'orange' : 'blue'}>
          {PROVIDER_NAMES[provider] || provider}
        </Tag>
      ),
    },
    {
      title: '策略',
      key: 'strategy',
      width: 320,
      render: (_, record) => (
        <Space size={[0, 8]} wrap>
          {DEFAULT_SCOPE_OPTIONS.map((item) => item.value)
            .filter(
              (scope) =>
                record.config?.default_scope?.[
                  scope as keyof NonNullable<AIModel['config']['default_scope']>
                ] === true
            )
            .map((scope) => (
              <Tag key={scope} color={scopeTagMeta[scope].color}>
                {scopeTagMeta[scope].label}
              </Tag>
            ))}
          {record.config?.routing_preferences?.prefer_for_code === true && (
            <Tag color="cyan" icon={<ThunderboltOutlined />}>
              代码优先
            </Tag>
          )}
          {(record.config?.routing_tags || []).map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
          {!record.config?.default_scope?.global &&
            !record.config?.default_scope?.admin_chat &&
            !record.config?.default_scope?.admin_task &&
            !record.config?.default_scope?.audio_transcription &&
            record.config?.routing_preferences?.prefer_for_code !== true &&
            (!record.config?.routing_tags || record.config.routing_tags.length === 0) && (
              <Text type="secondary">常规模型</Text>
            )}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      align: 'center',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'error'}>
          {status === 'active' ? t('admin:modelEnabled') : t('admin:modelDisabled')}
        </Tag>
      ),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 220,
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
        <Space size={4} wrap>
          <Tooltip title="切换模型">
            <Button
              size="small"
              icon={<SwapOutlined />}
              onClick={() => handleSwitchModel(record)}
            />
          </Tooltip>
          <Tooltip title={t('common:edit')}>
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Tooltip title={t('admin:testModel')}>
            <Button size="small" icon={<ExperimentOutlined />} onClick={() => handleTest(record)} />
          </Tooltip>
          {record.status === 'active' ? (
            <Tooltip title={t('admin:disableModel')}>
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => handleDisable(record.id)}
              />
            </Tooltip>
          ) : (
            <Tooltip title={t('admin:enableModel')}>
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handleEnable(record.id)}
              />
            </Tooltip>
          )}
          <Tooltip title={t('common:delete')}>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const providerOptions: ModelProvider[] = [
    'alibaba-coding',
    'alibaba-bailian',
    'openai',
    'anthropic',
    'azure',
    'deepseek',
    'minimax',
    'bigmodel',
    'siliconflow',
    'local',
  ];

  return (
    <div>
      <Card
        style={{
          ...SECTION_CARD_STYLE,
          background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, var(--bg-card) 100%)',
        }}
        styles={{ body: { padding: 24 } }}
      >
        <Space
          align="start"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }}
          wrap
        >
          <Space direction="vertical" size={6}>
            <Space size={10} wrap>
              <Title level={4} style={{ margin: 0 }}>
                {t('admin:modelManagement')}
              </Title>
              <Tag color="gold">{advancedModelCount} 个高级模型</Tag>
              {providerFilter && (
                <Tag closable color="processing" onClose={() => setProviderFilter(null)}>
                  当前筛选: {PROVIDER_NAMES[providerFilter] || providerFilter}
                </Tag>
              )}
            </Space>
            <Text type="secondary">
              统一管理 Provider 凭据、模型接入与默认路由策略。Provider 区采用卡片视图，优先突出接入状态、策略覆盖和操作入口。
            </Text>
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={refreshOverview}>
              刷新概览
            </Button>
            <Button icon={<PlusOutlined />} onClick={openCreateProviderModal}>
              新建 Provider
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateModal()}>
              {t('admin:createModel')}
            </Button>
          </Space>
        </Space>

        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} xl={6}>
            <Card size="small" style={OVERVIEW_METRIC_STYLE} styles={{ body: { padding: 16 } }}>
              <Text type="secondary">Provider 配置</Text>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>
                {providerGovernanceItems.length}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card size="small" style={OVERVIEW_METRIC_STYLE} styles={{ body: { padding: 16 } }}>
              <Text type="secondary">已配置凭据</Text>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: '#10b981' }}>
                {configuredProviderCount}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card size="small" style={OVERVIEW_METRIC_STYLE} styles={{ body: { padding: 16 } }}>
              <Text type="secondary">注册模型</Text>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>
                {totalModelCount}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card size="small" style={OVERVIEW_METRIC_STYLE} styles={{ body: { padding: 16 } }}>
              <Text type="secondary">启用中</Text>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: '#6366f1' }}>
                {activeModelCount}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Card style={SECTION_CARD_STYLE} styles={{ body: { padding: 20 } }}>
        <Space
          align="start"
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 18 }}
          wrap
        >
          <Space direction="vertical" size={4}>
            <Text strong style={{ fontSize: 16 }}>
              Provider 视图
            </Text>
            <Text type="secondary">
              每张卡片对应一个接入配置，集中展示 endpoint、凭据状态、默认策略与模型覆盖情况。
            </Text>
          </Space>
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void providersQuery.refetch();
                void providerConfigsQuery.refetch();
              }}
            >
              刷新 Provider
            </Button>
          </Space>
        </Space>

        <ProviderGovernanceCardGrid
          items={providerGovernanceItems}
          loading={providersQuery.isLoading || providerConfigsQuery.isLoading}
          selectedProvider={providerFilter}
          providerNames={PROVIDER_NAMES}
          scopeTagMeta={scopeTagMeta}
          healthCheckingId={
            checkProviderHealthMutation.isLoading ? checkProviderHealthMutation.variables : undefined
          }
          onSelectProvider={(provider) =>
            setProviderFilter((current) => (current === provider ? null : provider))
          }
          onCheckHealth={(providerConfigId) => checkProviderHealthMutation.mutate(providerConfigId)}
          onEditProvider={openEditProviderModal}
          onAppendModel={handleAppendModelFromProvider}
        />
      </Card>

      <Card style={SECTION_CARD_STYLE} styles={{ body: { padding: 20 } }}>
        <Space
          align="start"
          style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}
          wrap
        >
          <Space direction="vertical" size={4}>
            <Space size={8} wrap>
              <Text strong style={{ fontSize: 16 }}>
                已注册模型
              </Text>
              <Tag color="blue">{filteredModels.length} 条结果</Tag>
            </Space>
            <Text type="secondary">
              模型列表按 Provider 配置分组展示，便于对比同一接入点下的启用状态和路由策略。
            </Text>
          </Space>
          <Space wrap>
            <Input
              placeholder={t('common:search')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void modelsQuery.refetch();
              }}
            >
              {t('common:refresh')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateModal()}>
              {t('admin:createModel')}
            </Button>
          </Space>
        </Space>

        {providerFilter && (
          <div style={{ marginBottom: 16 }}>
            <Tag closable color="processing" onClose={() => setProviderFilter(null)}>
              当前 Provider: {PROVIDER_NAMES[providerFilter] || providerFilter}
            </Tag>
          </div>
        )}

        {groupedModels.length === 0 ? (
          <Alert message={searchText ? '未找到匹配的模型' : '暂无模型配置'} type="info" showIcon />
        ) : (
          groupedModels.map(({ providerConfig, models }) => (
            <Card
              key={providerConfig?.id || 'unlinked'}
              size="small"
              style={{
                marginBottom: 16,
                borderRadius: 16,
                border: '1px solid var(--bg-secondary)',
                boxShadow: 'var(--shadow-sm)',
              }}
              styles={{ body: { padding: 0 } }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--bg-secondary)',
                  background:
                    'linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, var(--bg-card) 100%)',
                }}
              >
                <Space
                  align="start"
                  style={{ width: '100%', justifyContent: 'space-between' }}
                  wrap
                >
                  <Space direction="vertical" size={4}>
                    <Space size={8} wrap>
                      <Text strong style={{ fontSize: 15 }}>
                        {providerConfig
                          ? getProviderConfigLabel(providerConfig)
                          : '未绑定 Provider (旧版)'}
                      </Text>
                      {providerConfig?.hasCredential && <Tag color="success">已复用凭据</Tag>}
                    </Space>
                    <Text type="secondary">
                      {providerConfig?.api_endpoint || '旧版模型未绑定 provider 配置'}
                    </Text>
                  </Space>
                  <Space size={[0, 8]} wrap>
                    <Tag color="blue">{models.length} 个模型</Tag>
                    <Tag color="success">
                      {models.filter((model) => model.status === 'active').length} 个启用
                    </Tag>
                    <Tag color="gold">
                      {
                        models.filter((model) => model.config?.capability_tier === 'advanced')
                          .length
                      }{' '}
                      个高级
                    </Tag>
                  </Space>
                </Space>
              </div>
              <Table
                columns={columns.filter((c) => c.key !== 'provider')}
                dataSource={models}
                rowKey="id"
                loading={modelsQuery.isLoading}
                scroll={{ x: 1040 }}
                pagination={false}
                size="small"
              />
            </Card>
          ))
        )}
      </Card>

      <Modal
        title={editingProvider ? '编辑 Provider' : '新建 Provider'}
        open={providerModalVisible}
        onOk={handleSaveProviderConfig}
        onCancel={handleProviderModalClose}
        confirmLoading={createProviderMutation.isLoading || updateProviderMutation.isLoading}
        width={560}
      >
        <Alert
          type="info"
          showIcon
          message={
            editingProvider
              ? '修改 Provider 的 endpoint 或凭据后，关联模型会复用最新 Provider 配置'
              : '建议先配置 Provider，再从 Provider 卡片中追加模型'
          }
          style={{ marginBottom: 16 }}
        />
        <Form form={providerForm} layout="vertical">
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select onChange={handleProviderConfigProviderChange}>
              {providerOptions.map((p) => (
                <Option key={p} value={p}>
                  {PROVIDER_NAMES[p] || p}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="api_endpoint"
            label="Endpoint"
            rules={[{ required: true }]}
            extra={
              providerFormProvider && PRESET_ENDPOINTS[providerFormProvider]
                ? `已自动填入推荐 Endpoint，也可以按网关策略改成自定义地址`
                : undefined
            }
          >
            <Input
              prefix={
                providerFormProvider && PRESET_ENDPOINTS[providerFormProvider] ? (
                  <LockOutlined />
                ) : null
              }
            />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            extra={
              editingProvider
                ? '留空表示保持当前 Provider 凭据不变'
                : '建议先配置 Provider 凭据，后续追加模型可直接复用'
            }
          >
            <Input.Password
              placeholder={editingProvider ? '不修改则留空' : '输入 Provider API Key'}
            />
          </Form.Item>
        </Form>
      </Modal>

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
          message={
            canReuseProviderCredential
              ? '当前 Provider 配置已存在可复用凭据，追加模型时 API Key 可留空'
              : '请先选择 Provider 配置；若该配置尚未保存凭据，可在本次创建时补充 API Key'
          }
          style={{ marginBottom: 16 }}
        />
        <Form form={createForm} layout="vertical">
          <Form.Item name="providerConfigId" label="Provider 配置" rules={[{ required: true }]}>
            <Select
              placeholder="选择已配置的 Provider"
              onChange={handleCreateProviderConfigChange}
              options={(providerConfigsQuery.data?.providers || []).map((providerConfig) => ({
                value: providerConfig.id,
                label: getProviderConfigLabel(providerConfig),
              }))}
              notFoundContent="请先在上方创建 Provider"
            ></Select>
          </Form.Item>
          {selectedCreateProviderConfig && (
            <Form.Item label="已绑定 Provider">
              <Space direction="vertical" size={4}>
                <Tag color="blue">
                  {PROVIDER_NAMES[selectedCreateProviderConfig.provider] ||
                    selectedCreateProviderConfig.provider}
                </Tag>
                <Text type="secondary">{selectedCreateProviderConfig.api_endpoint}</Text>
                {!selectedCreateProviderConfig.hasCredential && (
                  <Text type="warning">当前 Provider 未保存凭据，本次创建建议输入 API Key</Text>
                )}
              </Space>
            </Form.Item>
          )}

          {(!providerConfigsQuery.data?.providers ||
            providerConfigsQuery.data.providers.length === 0) && (
            <Alert
              type="warning"
              showIcon
              message="还没有可用的 Provider 配置，请先在上方新建 Provider"
              style={{ marginBottom: 16 }}
              action={
                <Button size="small" type="primary" onClick={openCreateProviderModal}>
                  新建 Provider
                </Button>
              }
            />
          )}

          <Form.Item label="模型列表">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space wrap>
                <Button
                  onClick={() => {
                    if (selectedCreateProviderConfig) {
                      void loadModelsForProvider(selectedCreateProviderConfig.id, 'create');
                    } else {
                      message.warning('请先选择 Provider 配置');
                    }
                  }}
                  loading={
                    loadProviderModelsMutation.isLoading &&
                    selectedCreateProviderConfigId === loadProviderModelsMutation.variables
                  }
                >
                  加载模型名列表
                </Button>
                {createAvailableModels.length > 0 && (
                  <Text type="secondary">已加载 {createAvailableModels.length} 个模型</Text>
                )}
              </Space>
              <Select
                showSearch
                allowClear
                placeholder="先加载模型列表，再选择模型"
                value={createForm.getFieldValue('name')}
                onChange={(value) => createForm.setFieldsValue({ name: value })}
                options={createAvailableModels.map((model) => ({
                  value: model,
                  label: model,
                }))}
                notFoundContent="暂无已加载模型，请点击上方按钮加载"
              />
            </Space>
          </Form.Item>

          <Form.Item name="name" label={t('admin:modelName')} rules={[{ required: true }]}>
            <Input placeholder="输入模型名称，或从已加载列表中选择" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={t('admin:modelApiKey')}
            rules={canReuseProviderCredential ? [] : [{ required: true }]}
            extra={
              canReuseProviderCredential ? '留空将复用当前 Provider 配置中的 API Key' : undefined
            }
          >
            <Input.Password
              placeholder={canReuseProviderCredential ? '可留空，复用已有 API Key' : '输入 API Key'}
            />
          </Form.Item>
          <Form.Item name="display_name" label="显示名称">
            <Input placeholder="例如：SiliconFlow 高级代码模型" />
          </Form.Item>
          <Form.Item name="description" label="模型说明">
            <Input.TextArea rows={2} placeholder="用于说明模型定位，例如高级代码生成模型" />
          </Form.Item>
          <Form.Item name="capability_tier" label="能力层级" initialValue="standard">
            <Select
              options={[
                { label: '标准模型', value: 'standard' },
                { label: '高级模型', value: 'advanced' },
              ]}
            />
          </Form.Item>
          <Form.Item name="defaultScopes" label="默认策略">
            <Select
              mode="multiple"
              allowClear
              options={DEFAULT_SCOPE_OPTIONS}
              placeholder="可同时设置多个默认策略"
            />
          </Form.Item>
          <Form.Item name="routing_tags" label="路由标签">
            <Select
              mode="multiple"
              allowClear
              options={ROUTING_TAG_OPTIONS}
              placeholder="可选：聊天 / 代码 / 文档 / 流程 / 查询 / 多模态"
            />
          </Form.Item>
          <Form.Item name="prefer_for_code" valuePropName="checked">
            <Checkbox>代码生成优先使用该模型</Checkbox>
          </Form.Item>
          <Divider />
          <Button
            type="default"
            icon={<ExperimentOutlined />}
            onClick={() => {
              const values = createForm.getFieldsValue();
              const providerConfig = values.providerConfigId
                ? providerConfigMap.get(values.providerConfigId)
                : undefined;
              if (providerConfig && values.apiKey && values.name) {
                testConfigMutation.mutate({
                  endpoint: providerConfig.api_endpoint,
                  apiKey: values.apiKey,
                  modelName: values.name,
                });
              } else if (providerConfig?.hasCredential && values.name) {
                message.warning(
                  '当前走的是已保存 Provider 凭据，请先保存模型后再测试，或临时输入 API Key 测试'
                );
              } else {
                message.warning('请先填写 Provider 配置、模型名称和 API Key');
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
        onCancel={() => {
          setEditModalVisible(false);
          setEditAvailableModels([]);
        }}
        confirmLoading={updateMutation.isLoading}
        width={600}
      >
        <Alert
          type="info"
          showIcon
          message="模型优先绑定到 Provider 配置；如需修改 endpoint 或凭据，也可以直接去编辑对应 Provider"
          style={{ marginBottom: 16 }}
        />
        <Form form={editForm} layout="vertical">
          <Form.Item name="providerConfigId" label="Provider 配置" rules={[{ required: true }]}>
            <Select
              placeholder="选择 Provider 配置"
              onChange={handleEditProviderConfigChange}
              options={(providerConfigsQuery.data?.providers || []).map((providerConfig) => ({
                value: providerConfig.id,
                label: getProviderConfigLabel(providerConfig),
              }))}
            ></Select>
          </Form.Item>
          {selectedEditProviderConfig && (
            <Form.Item label="当前绑定">
              <Space direction="vertical" size={4}>
                <Tag color="blue">
                  {PROVIDER_NAMES[selectedEditProviderConfig.provider] ||
                    selectedEditProviderConfig.provider}
                </Tag>
                <Text type="secondary">{selectedEditProviderConfig.api_endpoint}</Text>
              </Space>
            </Form.Item>
          )}

          <Form.Item label="模型列表">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space wrap>
                <Button
                  onClick={() => {
                    if (selectedEditProviderConfig) {
                      void loadModelsForProvider(selectedEditProviderConfig.id, 'edit');
                    } else {
                      message.warning('请先选择 Provider 配置');
                    }
                  }}
                  loading={
                    loadProviderModelsMutation.isLoading &&
                    selectedEditProviderConfigId === loadProviderModelsMutation.variables
                  }
                >
                  加载模型名列表
                </Button>
                {editAvailableModels.length > 0 && (
                  <Text type="secondary">已加载 {editAvailableModels.length} 个模型</Text>
                )}
              </Space>
              <Select
                showSearch
                allowClear
                placeholder="先加载模型列表，再选择模型"
                value={editForm.getFieldValue('name')}
                onChange={(value) => editForm.setFieldsValue({ name: value })}
                options={editAvailableModels.map((model) => ({
                  value: model,
                  label: model,
                }))}
                notFoundContent="暂无已加载模型，请点击上方按钮加载"
              />
            </Space>
          </Form.Item>

          <Form.Item name="name" label={t('admin:modelName')} rules={[{ required: true }]}>
            <Input placeholder="输入模型名称，或从已加载列表中选择" />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label={t('admin:modelApiKey')}
            extra={
              selectedEditProviderConfig?.hasCredential
                ? '留空将复用当前 provider 已配置的 API Key'
                : '若 Provider 未配置凭据，建议在此输入 API Key'
            }
          >
            <Input.Password
              placeholder={
                selectedEditProviderConfig?.hasCredential
                  ? '可留空，复用已有 API Key'
                  : '输入 API Key'
              }
            />
          </Form.Item>
          <Form.Item name="display_name" label="显示名称">
            <Input placeholder="例如：SiliconFlow 高级代码模型" />
          </Form.Item>
          <Form.Item name="description" label="模型说明">
            <Input.TextArea rows={2} placeholder="用于说明模型定位，例如高级代码生成模型" />
          </Form.Item>
          <Form.Item name="capability_tier" label="能力层级">
            <Select
              options={[
                { label: '标准模型', value: 'standard' },
                { label: '高级模型', value: 'advanced' },
              ]}
            />
          </Form.Item>
          <Form.Item name="defaultScopes" label="默认策略">
            <Select
              mode="multiple"
              allowClear
              options={DEFAULT_SCOPE_OPTIONS}
              placeholder="可同时设置多个默认策略"
            />
          </Form.Item>
          <Form.Item name="routing_tags" label="路由标签">
            <Select
              mode="multiple"
              allowClear
              options={ROUTING_TAG_OPTIONS}
              placeholder="可选：聊天 / 代码 / 文档 / 流程 / 查询 / 多模态"
            />
          </Form.Item>
          <Form.Item name="prefer_for_code" valuePropName="checked">
            <Checkbox>代码生成优先使用该模型</Checkbox>
          </Form.Item>
          <Divider />
          <Button
            type="default"
            icon={<ExperimentOutlined />}
            onClick={() => {
              const values = editForm.getFieldsValue();
              const providerConfig = values.providerConfigId
                ? providerConfigMap.get(values.providerConfigId)
                : undefined;

              if (
                editingModel?.hasApiKey &&
                !values.apiKey &&
                editingModel.providerConfigId === values.providerConfigId
              ) {
                testConfigWithStoredKeyMutation.mutate(editingModel.id);
              } else if (providerConfig && values.apiKey && values.name) {
                testConfigMutation.mutate({
                  endpoint: providerConfig.api_endpoint,
                  apiKey: values.apiKey,
                  modelName: values.name,
                });
              } else {
                message.warning('请先填写模型名称，并提供可测试的 Provider 凭据');
              }
            }}
            loading={testConfigMutation.isLoading || testConfigWithStoredKeyMutation.isLoading}
          >
            测试配置
          </Button>
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
          <Form.Item label="可用模型">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space wrap>
                <Button
                  onClick={() => {
                    if (editingModel?.providerConfigId) {
                      void loadModelsForProvider(editingModel.providerConfigId, 'switch');
                    } else {
                      message.warning('当前模型未绑定 Provider 配置，无法加载模型列表');
                    }
                  }}
                  loading={
                    loadProviderModelsMutation.isLoading &&
                    editingModel?.providerConfigId === loadProviderModelsMutation.variables
                  }
                  disabled={!canSwitchModel}
                >
                  加载模型名列表
                </Button>
                {switchAvailableModels.length > 0 && (
                  <Text type="secondary">已加载 {switchAvailableModels.length} 个模型</Text>
                )}
              </Space>
            </Space>
          </Form.Item>
          <Form.Item label="选择新模型">
            <Select
              value={newModelName}
              onChange={setNewModelName}
              style={{ width: '100%' }}
              showSearch
              options={switchAvailableModels.map((model) => ({
                value: model,
                label: model,
              }))}
              notFoundContent="暂无已加载模型，请先点击上方按钮"
            ></Select>
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
