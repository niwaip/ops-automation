import React from 'react';
import {
  Table,
  Card,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  Tooltip,
  Switch,
  Button,
  Popconfirm,
  Empty,
} from 'antd';
import {
  SearchOutlined,
  ExperimentOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { AIModel, AIProviderConfig, ModelHealthCheckItem } from '@/api/ai';
import {
  DEFAULT_SCOPE_OPTIONS,
  SCOPE_TAG_META,
  getProviderDisplayName,
} from '../types';

const { Text } = Typography;

interface ModelListTabProps {
  models: AIModel[];
  filteredModels: AIModel[];
  providers: AIProviderConfig[];
  providerConfigMap: Map<string, AIProviderConfig>;
  healthStatusMap: Map<string, ModelHealthCheckItem>;
  loading: boolean;
  searchText: string;
  onSearchChange: (val: string) => void;
  selectedProvider: string | null;
  onProviderChange: (provider: string | null) => void;
  statusFilter: 'all' | 'active' | 'disabled';
  onStatusFilterChange: (status: 'all' | 'active' | 'disabled') => void;
  tierFilter: 'all' | 'advanced' | 'standard';
  onTierFilterChange: (tier: 'all' | 'advanced' | 'standard') => void;
  onEnableModel: (id: string) => void;
  onDisableModel: (id: string) => void;
  onEditModel: (model: AIModel) => void;
  onTestModel: (model: AIModel) => void;
  onDeleteModel: (id: string) => void;
}

export const ModelListTab: React.FC<ModelListTabProps> = ({
  models,
  filteredModels,
  providerConfigMap,
  healthStatusMap,
  loading,
  searchText,
  onSearchChange,
  selectedProvider,
  onProviderChange,
  statusFilter,
  onStatusFilterChange,
  tierFilter,
  onTierFilterChange,
  onEnableModel,
  onDisableModel,
  onEditModel,
  onTestModel,
  onDeleteModel,
}) => {
  // Compute model counts per provider for the filter pills
  const providerCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    models.forEach((m) => {
      const key = m.providerConfigId || m.provider;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [models]);

  // Unique list of providers present in models or configs
  const providerFilterOptions = React.useMemo(() => {
    const uniqueKeys = new Set<string>();
    models.forEach((m) => {
      uniqueKeys.add(m.providerConfigId || m.provider);
    });
    return Array.from(uniqueKeys);
  }, [models]);

  const columns: ColumnsType<AIModel> = [
    {
      title: '模型信息',
      key: 'model_info',
      width: 320,
      render: (_, record) => {
        const health = healthStatusMap.get(record.id);
        const displayName = record.config?.display_name || record.name;
        const hasCustomDisplay = Boolean(record.config?.display_name);

        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Space size={8} wrap align="center">
              <Text strong style={{ fontSize: 14 }}>
                {displayName}
              </Text>
              {record.config?.capability_tier === 'advanced' && (
                <Tag color="gold" style={{ margin: 0 }}>
                  高级
                </Tag>
              )}
              {health &&
                (health.success ? (
                  <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>
                    有效 ({health.latencyMs}ms)
                  </Tag>
                ) : (
                  <Tooltip title={health.error}>
                    <Tag color="error" icon={<CloseCircleOutlined />} style={{ margin: 0 }}>
                      异常
                    </Tag>
                  </Tooltip>
                ))}
            </Space>

            {hasCustomDisplay && (
              <Text
                copyable
                code
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-secondary)',
                  borderRadius: 4,
                  padding: '1px 4px',
                }}
              >
                {record.name}
              </Text>
            )}

            {record.config?.description && (
              <Text
                type="secondary"
                ellipsis={{ tooltip: record.config.description }}
                style={{ fontSize: 12, maxWidth: 300 }}
              >
                {record.config.description}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '服务商',
      key: 'provider',
      width: 160,
      render: (_, record) => {
        const config = record.providerConfigId
          ? providerConfigMap.get(record.providerConfigId)
          : null;
        const providerName = getProviderDisplayName(config, record.provider);

        return (
          <Space direction="vertical" size={2}>
            <Tag
              color={
                record.provider === 'gemini' || record.provider === 'google'
                  ? 'blue'
                  : record.provider.startsWith('alibaba')
                  ? 'orange'
                  : record.provider === 'deepseek'
                  ? 'purple'
                  : 'default'
              }
              style={{ margin: 0 }}
            >
              {providerName}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: '路由与定位策略',
      key: 'strategy',
      width: 300,
      render: (_, record) => {
        const scopes = DEFAULT_SCOPE_OPTIONS.map((item) => item.value).filter(
          (scope) =>
            record.config?.default_scope?.[
              scope as keyof NonNullable<AIModel['config']['default_scope']>
            ] === true
        );
        const preferCode = record.config?.routing_preferences?.prefer_for_code === true;
        const routingTags = record.config?.routing_tags || [];
        const isPlainModel =
          scopes.length === 0 && !preferCode && routingTags.length === 0;

        if (isPlainModel) {
          return <Text type="secondary" style={{ fontSize: 12 }}>常规模型</Text>;
        }

        return (
          <Space size={[4, 6]} wrap>
            {scopes.map((scope) => (
              <Tag
                key={scope}
                color={SCOPE_TAG_META[scope]?.color || 'blue'}
                style={{ margin: 0, fontSize: 11 }}
              >
                {SCOPE_TAG_META[scope]?.label || scope}
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
            {routingTags.map((tag) => (
              <Tag key={tag} style={{ margin: 0, fontSize: 11 }}>
                {tag}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '启用状态',
      key: 'status',
      width: 100,
      align: 'center',
      render: (_, record) => {
        const isActive = record.status === 'active';
        return (
          <Tooltip title={isActive ? '点击停用' : '点击启用'}>
            <Switch
              size="small"
              checked={isActive}
              onChange={(checked) => {
                if (checked) {
                  onEnableModel(record.id);
                } else {
                  onDisableModel(record.id);
                }
              }}
            />
          </Tooltip>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      align: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="测试可用性">
            <Button
              type="text"
              size="small"
              icon={<ExperimentOutlined />}
              onClick={() => onTestModel(record)}
            />
          </Tooltip>
          <Tooltip title="编辑模型">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEditModel(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除该模型？"
            okText="删除"
            cancelText="取消"
            okType="danger"
            onConfirm={() => onDeleteModel(record.id)}
          >
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      style={{
        borderRadius: 16,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-sm)',
      }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      {/* Search and Filters Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {/* Left: Quick Provider Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginRight: 4 }}>
            服务商:
          </span>
          <Tag.CheckableTag
            checked={selectedProvider === null}
            onChange={() => onProviderChange(null)}
            style={{ borderRadius: 12, padding: '2px 10px', fontSize: 12 }}
          >
            全部 ({models.length})
          </Tag.CheckableTag>
          {providerFilterOptions.map((key) => {
            const config = providerConfigMap.get(key);
            const label = getProviderDisplayName(config, config?.provider || key);
            const count = providerCounts.get(key) || 0;
            const isChecked = selectedProvider === key;

            return (
              <Tag.CheckableTag
                key={key}
                checked={isChecked}
                onChange={() => onProviderChange(isChecked ? null : key)}
                style={{ borderRadius: 12, padding: '2px 10px', fontSize: 12 }}
              >
                {label} ({count})
              </Tag.CheckableTag>
            );
          })}
        </div>

        {/* Right: Search & Dropdowns */}
        <Space size={8} wrap>
          <Input
            placeholder="搜索模型名称、描述..."
            prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            allowClear
            style={{
              width: 220,
              borderRadius: 8,
              background: 'var(--bg-secondary)',
              border: 'none',
            }}
          />

          <Select
            value={statusFilter}
            onChange={onStatusFilterChange}
            style={{ width: 110 }}
            options={[
              { label: '状态: 全部', value: 'all' },
              { label: '仅启用', value: 'active' },
              { label: '仅停用', value: 'disabled' },
            ]}
          />

          <Select
            value={tierFilter}
            onChange={onTierFilterChange}
            style={{ width: 120 }}
            options={[
              { label: '层级: 全部', value: 'all' },
              { label: '高级模型', value: 'advanced' },
              { label: '标准模型', value: 'standard' },
            ]}
          />
        </Space>
      </div>

      {/* Model Table */}
      <Table
        columns={columns}
        dataSource={filteredModels}
        rowKey="id"
        loading={loading}
        pagination={{
          defaultPageSize: 10,
          pageSizeOptions: ['10', '20', '50'],
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个模型`,
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={searchText || selectedProvider ? '未找到符合筛选条件的模型' : '暂无接入模型'}
            />
          ),
        }}
      />
    </Card>
  );
};
