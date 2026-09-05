import React, { useState, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Space,
  Tag,
  Typography,
  Button,
  Switch,
  Tooltip,
  Popconfirm,
  Empty,
  Input,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  LockOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import {
  AIModel,
  AIProviderConfig,
  AIProviderSummary,
  ModelHealthCheckItem,
} from '@/api/ai';
import {
  PROVIDER_NAMES,
  DEFAULT_SCOPE_OPTIONS,
  SCOPE_TAG_META,
  getProviderDisplayName,
  getProviderAccent,
  getProviderMonogram,
} from '../types';

const { Text, Title } = Typography;

interface ProviderWorkspaceViewProps {
  providers: AIProviderConfig[];
  providerGovernanceItems: Array<{
    providerConfig: AIProviderConfig;
    summary?: AIProviderSummary;
  }>;
  models: AIModel[];
  healthStatusMap: Map<string, ModelHealthCheckItem>;
  loading: boolean;
  checkingProviderId?: string;
  onCheckHealth: (id: string) => void;
  onEditProvider: (providerConfig: AIProviderConfig) => void;
  onDeleteProvider: (id: string) => void;
  onCreateProvider: () => void;
  onAppendModel: (providerConfig: AIProviderConfig) => void;
  onEnableModel: (id: string) => void;
  onDisableModel: (id: string) => void;
  onEditModel: (model: AIModel) => void;
  onTestModel: (model: AIModel) => void;
  onDeleteModel: (id: string) => void;
}

export const ProviderWorkspaceView: React.FC<ProviderWorkspaceViewProps> = ({
  providers,
  providerGovernanceItems,
  models,
  healthStatusMap,
  checkingProviderId,
  onCheckHealth,
  onEditProvider,
  onDeleteProvider,
  onCreateProvider,
  onAppendModel,
  onEnableModel,
  onDisableModel,
  onEditModel,
  onTestModel,
  onDeleteModel,
}) => {
  // Currently selected provider ID (defaults to first provider)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');

  // Active provider
  const activeProvider = useMemo(() => {
    if (selectedProviderId) {
      const found = providers.find((p) => p.id === selectedProviderId);
      if (found) return found;
    }
    return providers[0] || null;
  }, [providers, selectedProviderId]);

  // Active provider's governance summary
  const activeGovernance = useMemo(() => {
    if (!activeProvider) return null;
    return providerGovernanceItems.find((g) => g.providerConfig.id === activeProvider.id);
  }, [activeProvider, providerGovernanceItems]);

  // Models under the active provider
  const activeModels = useMemo(() => {
    if (!activeProvider) return [];
    return models.filter((m) => {
      const matchesProvider =
        m.providerConfigId === activeProvider.id ||
        (!m.providerConfigId && m.provider === activeProvider.provider);
      if (!matchesProvider) return false;

      if (!modelSearch.trim()) return true;
      const kw = modelSearch.trim().toLowerCase();
      return (
        m.name.toLowerCase().includes(kw) ||
        (m.config?.display_name && m.config.display_name.toLowerCase().includes(kw)) ||
        (m.config?.description && m.config.description.toLowerCase().includes(kw))
      );
    });
  }, [models, activeProvider, modelSearch]);

  // Model count map per provider ID
  const modelCountPerProvider = useMemo(() => {
    const map = new Map<string, number>();
    models.forEach((m) => {
      if (m.providerConfigId) {
        map.set(m.providerConfigId, (map.get(m.providerConfigId) || 0) + 1);
      } else {
        map.set(m.provider, (map.get(m.provider) || 0) + 1);
      }
    });
    return map;
  }, [models]);

  // Filtered providers list on the left
  const filteredProviders = useMemo(() => {
    if (!providerSearch.trim()) return providers;
    const kw = providerSearch.trim().toLowerCase();
    return providers.filter((p) => {
      const name = getProviderDisplayName(p).toLowerCase();
      const endpoint = p.api_endpoint.toLowerCase();
      return name.includes(kw) || endpoint.includes(kw);
    });
  }, [providers, providerSearch]);

  if (providers.length === 0) {
    return (
      <Card
        style={{
          borderRadius: 16,
          border: '1px dashed var(--border-color)',
          background: 'var(--bg-card)',
          textAlign: 'center',
          padding: 48,
        }}
      >
        <Empty description="尚未配置任何 AI 服务商" />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onCreateProvider}
          style={{ marginTop: 16 }}
        >
          立即配置服务商
        </Button>
      </Card>
    );
  }

  const activeAccent = activeProvider ? getProviderAccent(activeProvider.provider) : getProviderAccent('');
  const activeDisplayName = activeProvider ? getProviderDisplayName(activeProvider) : '';

  return (
    <Row gutter={16} style={{ minHeight: 600 }}>
      {/* Left Column: Provider List (Sidebar) */}
      <Col xs={24} md={8} lg={7} xl={6}>
        <Card
          size="small"
          style={{
            borderRadius: 16,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            boxShadow: 'var(--shadow-sm)',
            height: '100%',
          }}
          styles={{ body: { padding: '12px 14px' } }}
        >
          {/* Header & Add Provider button */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              padding: '0 2px',
            }}
          >
            <Text strong style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              服务商列表 ({providers.length})
            </Text>
            <Button
              type="link"
              size="small"
              icon={<PlusOutlined />}
              onClick={onCreateProvider}
              style={{ padding: 0, height: 'auto', fontSize: 12 }}
            >
              新建服务商
            </Button>
          </div>

          {/* Search box */}
          <Input
            size="small"
            prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
            placeholder="搜索服务商..."
            value={providerSearch}
            onChange={(e) => setProviderSearch(e.target.value)}
            allowClear
            style={{
              marginBottom: 10,
              borderRadius: 8,
              background: 'var(--bg-secondary)',
              border: 'none',
            }}
          />

          {/* Provider Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 650, overflowY: 'auto' }}>
            {filteredProviders.map((p) => {
              const isSelected = activeProvider?.id === p.id;
              const accent = getProviderAccent(p.provider);
              const displayName = getProviderDisplayName(p);
              const count = modelCountPerProvider.get(p.id) || 0;

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProviderId(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: isSelected ? `1.5px solid ${accent.solid}` : '1px solid transparent',
                    background: isSelected ? accent.soft : 'var(--bg-secondary)',
                  }}
                >
                  <Space size={10} style={{ overflow: 'hidden', flex: 1 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: accent.solid,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      {getProviderMonogram(displayName)}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <Text
                        strong={isSelected}
                        style={{
                          fontSize: 13,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: isSelected ? accent.solid : 'var(--text-primary)',
                        }}
                      >
                        {displayName}
                      </Text>
                      <Text
                        type="secondary"
                        style={{
                          fontSize: 11,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.api_endpoint}
                      </Text>
                    </div>
                  </Space>

                  <Space size={4} style={{ flexShrink: 0, marginLeft: 8 }}>
                    <Tag
                      style={{
                        margin: 0,
                        borderRadius: 10,
                        padding: '0 6px',
                        fontSize: 11,
                        background: isSelected ? accent.solid : 'var(--bg-card)',
                        color: isSelected ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                      }}
                    >
                      {count}
                    </Tag>
                  </Space>
                </div>
              );
            })}
          </div>
        </Card>
      </Col>

      {/* Right Column: Selected Provider Detail & Models */}
      <Col xs={24} md={16} lg={17} xl={18}>
        {activeProvider ? (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {/* Provider Details Card */}
            <Card
              size="small"
              style={{
                borderRadius: 16,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                boxShadow: 'var(--shadow-sm)',
              }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                {/* Left: Info */}
                <Space size={14} align="center">
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      background: activeAccent.soft,
                      color: activeAccent.solid,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {getProviderMonogram(activeDisplayName)}
                  </div>
                  <div>
                    <Space size={8} align="center" wrap>
                      <Title level={5} style={{ margin: 0, fontWeight: 700 }}>
                        {activeDisplayName}
                      </Title>
                      <Tag color="blue" style={{ margin: 0 }}>
                        {PROVIDER_NAMES[activeProvider.provider] || activeProvider.provider}
                      </Tag>
                      <Tag
                        color={activeProvider.hasCredential ? 'success' : 'default'}
                        icon={<LockOutlined />}
                        style={{ margin: 0 }}
                      >
                        {activeProvider.hasCredential ? '已存凭据' : '未配凭据'}
                      </Tag>
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Text
                        copyable={{ icon: [<CopyOutlined key="copy" style={{ color: 'var(--text-light)' }} />] }}
                        code
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-secondary)',
                          borderRadius: 4,
                          padding: '2px 6px',
                        }}
                      >
                        {activeProvider.api_endpoint}
                      </Text>
                    </div>
                  </div>
                </Space>

                {/* Right: Actions */}
                <Space size={8} wrap>
                  <Tooltip title="测试该服务商接口连通性">
                    <Button
                      size="small"
                      icon={<ThunderboltOutlined />}
                      loading={checkingProviderId === activeProvider.id}
                      onClick={() => onCheckHealth(activeProvider.id)}
                    >
                      检测连通性
                    </Button>
                  </Tooltip>

                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => onAppendModel(activeProvider)}
                  >
                    接入模型
                  </Button>

                  <Tooltip title="编辑端点与凭据">
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => onEditProvider(activeProvider)}
                    >
                      编辑
                    </Button>
                  </Tooltip>

                  <Popconfirm
                    title="确认删除该服务商？"
                    description="删除将影响其下所有模型的调用与凭据复用"
                    okText="删除"
                    cancelText="取消"
                    okType="danger"
                    onConfirm={() => onDeleteProvider(activeProvider.id)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
            </Card>

            {/* Models under this Provider Card */}
            <Card
              size="small"
              style={{
                borderRadius: 16,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                boxShadow: 'var(--shadow-sm)',
              }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              {/* Header & Search */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <Space size={8} align="center">
                  <Text strong style={{ fontSize: 15 }}>
                    已接入模型 ({activeModels.length})
                  </Text>
                  {activeGovernance?.summary?.defaultScopes &&
                    activeGovernance.summary.defaultScopes.length > 0 && (
                      <Space size={4} wrap>
                        {activeGovernance.summary.defaultScopes.map((sc) => (
                          <Tag
                            key={sc}
                            color={SCOPE_TAG_META[sc]?.color || 'blue'}
                            style={{ margin: 0, fontSize: 11 }}
                          >
                            {SCOPE_TAG_META[sc]?.label || sc}
                          </Tag>
                        ))}
                      </Space>
                    )}
                </Space>

                <Space size={8}>
                  <Input
                    size="small"
                    prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
                    placeholder="过滤当前模型..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    allowClear
                    style={{
                      width: 180,
                      borderRadius: 8,
                      background: 'var(--bg-secondary)',
                      border: 'none',
                    }}
                  />
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => onAppendModel(activeProvider)}
                  >
                    添加模型
                  </Button>
                </Space>
              </div>

              {/* Models List */}
              {activeModels.length === 0 ? (
                <div
                  style={{
                    padding: '36px 0',
                    textAlign: 'center',
                    borderRadius: 12,
                    background: 'var(--bg-secondary)',
                  }}
                >
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      modelSearch ? '未找到匹配的模型' : '该服务商下暂无接入的模型'
                    }
                  />
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => onAppendModel(activeProvider)}
                    style={{ marginTop: 8 }}
                  >
                    点击接入模型
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activeModels.map((model) => {
                    const health = healthStatusMap.get(model.id);
                    const displayName = model.config?.display_name || model.name;
                    const hasCustomName = Boolean(model.config?.display_name);
                    const scopes = DEFAULT_SCOPE_OPTIONS.map((item) => item.value).filter(
                      (scope) =>
                        model.config?.default_scope?.[
                          scope as keyof NonNullable<AIModel['config']['default_scope']>
                        ] === true
                    );
                    const preferCode = model.config?.routing_preferences?.prefer_for_code === true;
                    const isActive = model.status === 'active';

                    return (
                      <div
                        key={model.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: 12,
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                          boxShadow: 'var(--shadow-sm)',
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        {/* Left: Model Identity */}
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <Space size={8} wrap align="center">
                            <Text strong style={{ fontSize: 14 }}>
                              {displayName}
                            </Text>
                            {model.config?.capability_tier === 'advanced' && (
                              <Tag color="gold" style={{ margin: 0, fontSize: 11 }}>
                                高级
                              </Tag>
                            )}
                            {health &&
                              (health.success ? (
                                <Tag
                                  color="success"
                                  icon={<CheckCircleOutlined />}
                                  style={{ margin: 0, fontSize: 11 }}
                                >
                                  有效 ({health.latencyMs}ms)
                                </Tag>
                              ) : (
                                <Tooltip title={health.error}>
                                  <Tag
                                    color="error"
                                    icon={<CloseCircleOutlined />}
                                    style={{ margin: 0, fontSize: 11 }}
                                  >
                                    异常
                                  </Tag>
                                </Tooltip>
                              ))}
                          </Space>

                          <div style={{ marginTop: 3 }}>
                            {hasCustomName && (
                              <Text
                                copyable
                                code
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  background: 'var(--bg-secondary)',
                                  borderRadius: 4,
                                  padding: '1px 4px',
                                  marginRight: 8,
                                }}
                              >
                                {model.name}
                              </Text>
                            )}
                            {model.config?.description && (
                              <Text
                                type="secondary"
                                style={{ fontSize: 12 }}
                              >
                                {model.config.description}
                              </Text>
                            )}
                          </div>
                        </div>

                        {/* Middle: Strategy Tags */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {scopes.map((sc) => (
                            <Tag
                              key={sc}
                              color={SCOPE_TAG_META[sc]?.color || 'blue'}
                              style={{ margin: 0, fontSize: 11 }}
                            >
                              {SCOPE_TAG_META[sc]?.label || sc}
                            </Tag>
                          ))}
                          {preferCode && (
                            <Tag
                              color="cyan"
                              icon={<ThunderboltOutlined />}
                              style={{ margin: 0, fontSize: 11 }}
                            >
                              代码优先
                            </Tag>
                          )}
                          {(model.config?.routing_tags || []).map((t) => (
                            <Tag key={t} style={{ margin: 0, fontSize: 11 }}>
                              {t}
                            </Tag>
                          ))}
                          {scopes.length === 0 && !preferCode && (!model.config?.routing_tags || model.config.routing_tags.length === 0) && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              常规调用
                            </Text>
                          )}
                        </div>

                        {/* Right: Switch & Actions */}
                        <Space size={10} align="center" style={{ flexShrink: 0 }}>
                          <Tooltip title={isActive ? '点击停用' : '点击启用'}>
                            <Switch
                              size="small"
                              checked={isActive}
                              onChange={(checked) => {
                                if (checked) {
                                  onEnableModel(model.id);
                                } else {
                                  onDisableModel(model.id);
                                }
                              }}
                            />
                          </Tooltip>

                          <Tooltip title="测试可用性">
                            <Button
                              type="text"
                              size="small"
                              icon={<ExperimentOutlined />}
                              onClick={() => onTestModel(model)}
                            />
                          </Tooltip>

                          <Tooltip title="编辑模型">
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => onEditModel(model)}
                            />
                          </Tooltip>

                          <Popconfirm
                            title="确认删除该模型？"
                            okText="删除"
                            cancelText="取消"
                            okType="danger"
                            onConfirm={() => onDeleteModel(model.id)}
                          >
                            <Tooltip title="删除">
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                            </Tooltip>
                          </Popconfirm>
                        </Space>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </Space>
        ) : (
          <Empty description="请在左侧选择服务商" />
        )}
      </Col>
    </Row>
  );
};
