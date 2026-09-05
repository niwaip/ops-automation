import React, { useState } from 'react';
import { Button, Space, Typography, Tabs } from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { AIModel, AIProviderConfig, CreateAIModelRequest, aiModelApi } from '@/api/ai';
import { PROVIDER_NAMES } from '../types';
import { useAIModelsAdmin } from '../hooks/useAIModelsAdmin';
import { ModelStatsBar } from '../components/ModelStatsBar';
import { ProviderWorkspaceView } from '../components/ProviderWorkspaceView';
import { ModelListTab } from '../components/ModelListTab';
import { ProviderListTab } from '../components/ProviderListTab';
import { ModelFormModal } from '../components/ModelFormModal';
import { ProviderFormModal } from '../components/ProviderFormModal';
import { ModelTestModal } from '../components/ModelTestModal';
import { ModelBatchHealthCheckModal } from '../components/ModelBatchHealthCheckModal';

const { Title, Text } = Typography;

const AIModelAdminPage: React.FC = () => {
  const admin = useAIModelsAdmin();
  const [activeTab, setActiveTab] = useState<'workspace' | 'table' | 'providers'>('workspace');

  // Modal states
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [defaultProviderConfigId, setDefaultProviderConfigId] = useState<string | undefined>(undefined);
  const [submittingModel, setSubmittingModel] = useState(false);

  const [providerModalVisible, setProviderModalVisible] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProviderConfig | null>(null);
  const [submittingProvider, setSubmittingProvider] = useState(false);

  const [testModalVisible, setTestModalVisible] = useState(false);
  const [testingModel, setTestingModel] = useState<AIModel | null>(null);

  // Model modal triggers
  const handleOpenCreateModel = (presetProviderId?: string) => {
    setEditingModel(null);
    setDefaultProviderConfigId(presetProviderId);
    setModelModalVisible(true);
  };

  const handleOpenEditModel = (model: AIModel) => {
    setEditingModel(model);
    setDefaultProviderConfigId(model.providerConfigId);
    setModelModalVisible(true);
  };

  const handleModelFormSubmit = async (payload: CreateAIModelRequest) => {
    setSubmittingModel(true);
    try {
      if (editingModel) {
        await admin.updateModel({ id: editingModel.id, data: payload });
      } else {
        await admin.createModel(payload);
      }
      setModelModalVisible(false);
    } finally {
      setSubmittingModel(false);
    }
  };

  // Provider modal triggers
  const handleOpenCreateProvider = () => {
    setEditingProvider(null);
    setProviderModalVisible(true);
  };

  const handleOpenEditProvider = (providerConfig: AIProviderConfig) => {
    setEditingProvider(providerConfig);
    setProviderModalVisible(true);
  };

  const handleProviderFormSubmit = async (payload: Parameters<typeof admin.createProvider>[0]) => {
    setSubmittingProvider(true);
    try {
      if (editingProvider) {
        await admin.updateProvider({ id: editingProvider.id, data: payload });
      } else {
        await admin.createProvider(payload);
      }
      setProviderModalVisible(false);
    } finally {
      setSubmittingProvider(false);
    }
  };

  // Quick Append model from provider card
  const handleAppendModelFromProvider = (providerConfig: AIProviderConfig) => {
    handleOpenCreateModel(providerConfig.id);
  };

  // Model test trigger
  const handleOpenTestModel = (model: AIModel) => {
    setTestingModel(model);
    setTestModalVisible(true);
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 32 }}>
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 16,
          padding: '4px 0',
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
            AI 模型与服务商管理
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            按服务商组织管理接入的语言模型、场景默认路由策略及服务商凭据与连通性
          </Text>
        </div>

        <Space size={10} wrap>
          <Button
            icon={<ThunderboltOutlined />}
            loading={admin.isBatchChecking}
            onClick={admin.handleCheckAllModels}
          >
            一键全量健康检测
          </Button>

          <Button
            icon={<ApiOutlined />}
            onClick={handleOpenCreateProvider}
          >
            新建服务商
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenCreateModel()}
          >
            接入新模型
          </Button>

          <Button
            icon={<ReloadOutlined />}
            onClick={admin.refetchAll}
          />
        </Space>
      </div>

      {/* KPI Stats Bar */}
      <ModelStatsBar
        totalModels={admin.totalModelCount}
        activeModels={admin.activeModelCount}
        advancedModels={admin.advancedModelCount}
        configuredProviders={admin.configuredProviderCount}
        totalProviders={admin.providers.length}
      />

      {/* Navigation Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as any)}
        items={[
          {
            key: 'workspace',
            label: (
              <Space size={6}>
                <AppstoreOutlined />
                <span>按服务商管理 ({admin.providers.length})</span>
              </Space>
            ),
            children: (
              <ProviderWorkspaceView
                providers={admin.providers}
                providerGovernanceItems={admin.providerGovernanceItems}
                models={admin.models}
                healthStatusMap={admin.healthStatusMap}
                loading={admin.isLoading}
                checkingProviderId={admin.checkingProviderId}
                onCheckHealth={admin.checkProviderHealth}
                onEditProvider={handleOpenEditProvider}
                onDeleteProvider={admin.deleteProvider}
                onCreateProvider={handleOpenCreateProvider}
                onAppendModel={handleAppendModelFromProvider}
                onEnableModel={admin.enableModel}
                onDisableModel={admin.disableModel}
                onEditModel={handleOpenEditModel}
                onTestModel={handleOpenTestModel}
                onDeleteModel={admin.deleteModel}
              />
            ),
          },
          {
            key: 'table',
            label: (
              <Space size={6}>
                <UnorderedListOutlined />
                <span>全量清单视图 ({admin.totalModelCount})</span>
              </Space>
            ),
            children: (
              <ModelListTab
                models={admin.models}
                filteredModels={admin.filteredModels}
                providers={admin.providers}
                providerConfigMap={admin.providerConfigMap}
                healthStatusMap={admin.healthStatusMap}
                loading={admin.isLoading}
                searchText={admin.searchText}
                onSearchChange={admin.setSearchText}
                selectedProvider={admin.selectedProvider}
                onProviderChange={admin.setSelectedProvider}
                statusFilter={admin.statusFilter}
                onStatusFilterChange={admin.setStatusFilter}
                tierFilter={admin.tierFilter}
                onTierFilterChange={admin.setTierFilter}
                onEnableModel={admin.enableModel}
                onDisableModel={admin.disableModel}
                onEditModel={handleOpenEditModel}
                onTestModel={handleOpenTestModel}
                onDeleteModel={admin.deleteModel}
              />
            ),
          },
          {
            key: 'providers',
            label: (
              <Space size={6}>
                <ApiOutlined />
                <span>服务商网格卡片</span>
              </Space>
            ),
            children: (
              <ProviderListTab
                items={admin.providerGovernanceItems}
                loading={admin.isLoading}
                checkingProviderId={admin.checkingProviderId}
                onCheckHealth={admin.checkProviderHealth}
                onEditProvider={handleOpenEditProvider}
                onDeleteProvider={admin.deleteProvider}
                onAppendModel={handleAppendModelFromProvider}
                onCreateProvider={handleOpenCreateProvider}
              />
            ),
          },
        ]}
      />

      {/* Modals */}
      <ModelFormModal
        open={modelModalVisible}
        editingModel={editingModel}
        defaultProviderConfigId={defaultProviderConfigId}
        providers={admin.providers}
        providerConfigMap={admin.providerConfigMap}
        confirmLoading={submittingModel}
        onCancel={() => setModelModalVisible(false)}
        onSubmit={handleModelFormSubmit}
        onLoadProviderModels={admin.loadProviderModels}
        onTestConfig={aiModelApi.testConfig}
        onTestStoredConfig={aiModelApi.testConfigWithStoredKey}
      />

      <ProviderFormModal
        open={providerModalVisible}
        editingProvider={editingProvider}
        confirmLoading={submittingProvider}
        onCancel={() => setProviderModalVisible(false)}
        onSubmit={handleProviderFormSubmit}
      />

      <ModelTestModal
        open={testModalVisible}
        model={testingModel}
        onCancel={() => setTestModalVisible(false)}
        onRunTest={aiModelApi.test}
      />

      <ModelBatchHealthCheckModal
        open={admin.batchCheckModalVisible}
        onClose={() => admin.setBatchCheckModalVisible(false)}
        loading={admin.isBatchChecking}
        data={admin.batchCheckData}
        onRecheckAll={admin.handleCheckAllModels}
        onRecheckSingle={admin.handleRecheckSingleModel}
        providerNames={PROVIDER_NAMES}
      />
    </div>
  );
};

export default AIModelAdminPage;
