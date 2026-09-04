import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { message } from 'antd';
import {
  aiModelApi,
  AIModel,
  AIProviderConfig,
  AIProviderSummary,
  ModelBatchHealthCheckResponse,
  ModelHealthCheckItem,
  ModelProvider,
} from '@/api/ai';
import { getProviderIdentity, PROVIDER_NAMES } from '../types';

export function useAIModelsAdmin() {
  const queryClient = useQueryClient();

  // Filters
  const [searchText, setSearchText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [tierFilter, setTierFilter] = useState<'all' | 'advanced' | 'standard'>('all');

  // Health checks
  const [isBatchChecking, setIsBatchChecking] = useState(false);
  const [batchCheckModalVisible, setBatchCheckModalVisible] = useState(false);
  const [batchCheckData, setBatchCheckData] = useState<ModelBatchHealthCheckResponse | null>(null);
  const [healthStatusMap, setHealthStatusMap] = useState<Map<string, ModelHealthCheckItem>>(
    new Map()
  );

  // Queries
  const modelsQuery = useQuery(['ai-models'], () => aiModelApi.listForAdmin());
  const providersQuery = useQuery(['ai-model-providers'], () => aiModelApi.listProviders());
  const providerConfigsQuery = useQuery(['ai-provider-configs'], () =>
    aiModelApi.listProviderConfigs()
  );

  // Maps
  const providerConfigMap = useMemo(() => {
    return new Map<string, AIProviderConfig>(
      (providerConfigsQuery.data?.providers || []).map((p) => [p.id, p])
    );
  }, [providerConfigsQuery.data]);

  const providerSummaryMap = useMemo(() => {
    return new Map<string, AIProviderSummary>(
      (providersQuery.data?.providers || []).map((p) => [
        getProviderIdentity(p.provider, p.api_endpoint),
        p,
      ])
    );
  }, [providersQuery.data]);

  const providerGovernanceItems = useMemo(() => {
    return (providerConfigsQuery.data?.providers || [])
      .map((providerConfig) => ({
        providerConfig,
        summary: providerSummaryMap.get(
          getProviderIdentity(providerConfig.provider, providerConfig.api_endpoint)
        ),
      }))
      .sort((a, b) => {
        if ((a.providerConfig.hasCredential || false) !== (b.providerConfig.hasCredential || false)) {
          return a.providerConfig.hasCredential ? -1 : 1;
        }
        return a.providerConfig.provider.localeCompare(b.providerConfig.provider);
      });
  }, [providerConfigsQuery.data, providerSummaryMap]);

  // Overall Stats
  const totalModelCount = modelsQuery.data?.models.length || 0;
  const activeModelCount = (modelsQuery.data?.models || []).filter(
    (m) => m.status === 'active'
  ).length;
  const advancedModelCount = (modelsQuery.data?.models || []).filter(
    (m) => m.config?.capability_tier === 'advanced'
  ).length;
  const configuredProviderCount = providerGovernanceItems.filter(
    ({ providerConfig }) => providerConfig.hasCredential
  ).length;

  // Filtered models
  const filteredModels = useMemo(() => {
    const rawList = modelsQuery.data?.models || [];
    const keyword = searchText.trim().toLowerCase();

    return rawList.filter((model) => {
      // Provider filter
      if (selectedProvider) {
        const matches =
          model.provider === selectedProvider || model.providerConfigId === selectedProvider;
        if (!matches) return false;
      }

      // Status filter
      if (statusFilter === 'active' && model.status !== 'active') return false;
      if (statusFilter === 'disabled' && model.status === 'active') return false;

      // Tier filter
      if (tierFilter === 'advanced' && model.config?.capability_tier !== 'advanced') return false;
      if (tierFilter === 'standard' && model.config?.capability_tier === 'advanced') return false;

      // Search keyword
      if (!keyword) return true;
      const providerLabel = PROVIDER_NAMES[model.provider] || model.provider;
      const haystack = [
        model.name,
        model.config?.display_name,
        model.config?.description,
        providerLabel,
        model.provider,
      ]
        .filter((val): val is string => typeof val === 'string')
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [modelsQuery.data, selectedProvider, statusFilter, tierFilter, searchText]);

  // Invalidate helper
  const invalidateAll = () => {
    void queryClient.invalidateQueries(['ai-models']);
    void queryClient.invalidateQueries(['ai-model-providers']);
    void queryClient.invalidateQueries(['ai-provider-configs']);
  };

  // Mutations
  const enableMutation = useMutation(aiModelApi.enable, {
    onSuccess: () => {
      message.success('模型已启用');
      invalidateAll();
    },
    onError: (err: Error) => {
      message.error(`启用失败: ${err.message || '未知错误'}`);
    },
  });

  const disableMutation = useMutation(aiModelApi.disable, {
    onSuccess: () => {
      message.success('模型已停用');
      invalidateAll();
    },
    onError: (err: Error) => {
      message.error(`停用失败: ${err.message || '未知错误'}`);
    },
  });

  const deleteModelMutation = useMutation(aiModelApi.delete, {
    onSuccess: () => {
      message.success('模型已删除');
      invalidateAll();
    },
    onError: (err: Error) => {
      message.error(`删除失败: ${err.message || '未知错误'}`);
    },
  });

  const createModelMutation = useMutation(aiModelApi.create, {
    onSuccess: () => {
      message.success('模型创建成功');
      invalidateAll();
    },
    onError: (err: Error) => {
      message.error(`创建失败: ${err.message || '未知错误'}`);
    },
  });

  const updateModelMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<AIModel> }) => aiModelApi.update(id, data),
    {
      onSuccess: () => {
        message.success('模型更新成功');
        invalidateAll();
      },
      onError: (err: Error) => {
        message.error(`更新失败: ${err.message || '未知错误'}`);
      },
    }
  );

  const deleteProviderMutation = useMutation(
    (id: string) => aiModelApi.deleteProviderConfig(id),
    {
      onSuccess: () => {
        message.success('服务商配置已删除');
        invalidateAll();
      },
      onError: (err: Error) => {
        message.error(`删除失败: ${err.message || '未知错误'}`);
      },
    }
  );

  const createProviderMutation = useMutation(aiModelApi.createProviderConfig, {
    onSuccess: () => {
      message.success('服务商配置已创建');
      invalidateAll();
    },
    onError: (err: Error) => {
      message.error(`创建失败: ${err.message || '未知错误'}`);
    },
  });

  const updateProviderMutation = useMutation(
    ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; provider?: ModelProvider; api_endpoint?: string; api_key?: string };
    }) => aiModelApi.updateProviderConfig(id, data),
    {
      onSuccess: () => {
        message.success('服务商配置已更新');
        invalidateAll();
      },
      onError: (err: Error) => {
        message.error(`更新失败: ${err.message || '未知错误'}`);
      },
    }
  );

  const checkProviderHealthMutation = useMutation(
    (id: string) => aiModelApi.checkProviderHealth(id),
    {
      onSuccess: (res) => {
        if (res.success) {
          message.success(`连通性检查通过: ${res.response || '响应正常'}`);
        } else {
          message.error(`连通性检查失败: ${res.error}`);
        }
      },
      onError: (err: Error) => {
        message.error(`连通性检查异常: ${err.message}`);
      },
    }
  );

  const loadProviderModelsMutation = useMutation(
    (id: string) => aiModelApi.listProviderModels(id),
    {
      onError: (error: Error) => {
        message.error(`加载模型列表失败: ${error.message}`);
      },
    }
  );

  // Batch health check
  const runClientSideBatchCheck = async (allModels: AIModel[]) => {
    const results: ModelHealthCheckItem[] = await Promise.all(
      allModels.map(async (model) => {
        const startTime = Date.now();
        try {
          const res = await aiModelApi.testConfigWithStoredKey(model.id);
          return {
            modelId: model.id,
            modelName: model.name,
            displayName: model.config?.display_name,
            provider: model.provider,
            status: model.status,
            success: res.success,
            latencyMs: Date.now() - startTime,
            response: res.response,
            error: res.error,
            checkedAt: new Date().toISOString(),
          };
        } catch (err: unknown) {
          return {
            modelId: model.id,
            modelName: model.name,
            displayName: model.config?.display_name,
            provider: model.provider,
            status: model.status,
            success: false,
            latencyMs: Date.now() - startTime,
            error: err instanceof Error ? err.message : String(err),
            checkedAt: new Date().toISOString(),
          };
        }
      })
    );

    const passed = results.filter((r) => r.success).length;
    const batchResponse: ModelBatchHealthCheckResponse = {
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    };

    setBatchCheckData(batchResponse);
    const newMap = new Map<string, ModelHealthCheckItem>();
    results.forEach((r) => newMap.set(r.modelId, r));
    setHealthStatusMap(newMap);
    setBatchCheckModalVisible(true);

    if (batchResponse.failed > 0) {
      message.warning(`检测完成：${passed} 个可用，${batchResponse.failed} 个异常`);
    } else {
      message.success(`全部 ${results.length} 个模型检测通过，均正常可用！`);
    }
  };

  const handleCheckAllModels = async () => {
    const allModels = modelsQuery.data?.models || [];
    if (allModels.length === 0) {
      message.info('当前没有已注册的模型可供检测');
      return;
    }

    setIsBatchChecking(true);
    try {
      const data = await aiModelApi.checkAllModels();
      setBatchCheckData(data);
      const newMap = new Map<string, ModelHealthCheckItem>();
      data.results.forEach((r) => newMap.set(r.modelId, r));
      setHealthStatusMap(newMap);
      setBatchCheckModalVisible(true);
      if (data.failed > 0) {
        message.warning(`检测完成：${data.passed} 个可用，${data.failed} 个异常`);
      } else {
        message.success(`全部 ${data.total} 个模型检测通过，均正常可用！`);
      }
    } catch {
      await runClientSideBatchCheck(allModels);
    } finally {
      setIsBatchChecking(false);
    }
  };

  const handleRecheckSingleModel = async (modelId: string) => {
    const startTime = Date.now();
    try {
      const res = await aiModelApi.testConfigWithStoredKey(modelId);
      const latencyMs = Date.now() - startTime;
      const updatedItem: ModelHealthCheckItem = {
        modelId,
        modelName: modelId,
        provider: 'unknown',
        status: 'active',
        success: res.success,
        latencyMs,
        response: res.response,
        error: res.error,
        checkedAt: new Date().toISOString(),
      };
      setHealthStatusMap((prev) => {
        const next = new Map(prev);
        const prevItem = next.get(modelId);
        next.set(modelId, { ...prevItem, ...updatedItem });
        return next;
      });
      setBatchCheckData((prev) => {
        if (!prev) return null;
        const nextResults = prev.results.map((r) =>
          r.modelId === modelId ? { ...r, ...updatedItem } : r
        );
        const passed = nextResults.filter((r) => r.success).length;
        return {
          ...prev,
          passed,
          failed: nextResults.length - passed,
          results: nextResults,
        };
      });
      if (res.success) {
        message.success('该模型重新检测通过！');
      } else {
        message.error(`该模型检测失败: ${res.error}`);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      message.error(`检测失败: ${errorMsg}`);
    }
  };

  return {
    // Data
    models: modelsQuery.data?.models || [],
    filteredModels,
    providers: providerConfigsQuery.data?.providers || [],
    providerConfigMap,
    providerGovernanceItems,
    isLoading: modelsQuery.isLoading || providersQuery.isLoading || providerConfigsQuery.isLoading,
    refetchAll: () => {
      void modelsQuery.refetch();
      void providersQuery.refetch();
      void providerConfigsQuery.refetch();
    },

    // Stats
    totalModelCount,
    activeModelCount,
    advancedModelCount,
    configuredProviderCount,

    // Filters
    searchText,
    setSearchText,
    selectedProvider,
    setSelectedProvider,
    statusFilter,
    setStatusFilter,
    tierFilter,
    setTierFilter,

    // Health Checks
    healthStatusMap,
    batchCheckData,
    batchCheckModalVisible,
    setBatchCheckModalVisible,
    isBatchChecking,
    handleCheckAllModels,
    handleRecheckSingleModel,

    // Operations
    enableModel: (id: string) => enableMutation.mutate(id),
    disableModel: (id: string) => disableMutation.mutate(id),
    deleteModel: (id: string) => deleteModelMutation.mutate(id),
    createModel: createModelMutation.mutateAsync,
    updateModel: updateModelMutation.mutateAsync,
    deleteProvider: (id: string) => deleteProviderMutation.mutate(id),
    createProvider: createProviderMutation.mutateAsync,
    updateProvider: updateProviderMutation.mutateAsync,
    checkProviderHealth: (id: string) => checkProviderHealthMutation.mutate(id),
    isCheckingProviderHealth: checkProviderHealthMutation.isLoading,
    checkingProviderId: checkProviderHealthMutation.isLoading
      ? checkProviderHealthMutation.variables
      : undefined,
    loadProviderModels: (id: string) => loadProviderModelsMutation.mutateAsync(id),
    isLoadingProviderModels: loadProviderModelsMutation.isLoading,
  };
}
