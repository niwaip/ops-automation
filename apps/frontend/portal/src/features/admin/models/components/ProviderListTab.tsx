import React from 'react';
import {
  Card,
  Row,
  Col,
  Space,
  Tag,
  Typography,
  Button,
  Popconfirm,
  Empty,
  Tooltip,
} from 'antd';
import {
  LockOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { AIProviderConfig, AIProviderSummary } from '@/api/ai';
import { PROVIDER_NAMES, SCOPE_TAG_META } from '../types';

const { Text } = Typography;

interface ProviderListTabProps {
  items: Array<{
    providerConfig: AIProviderConfig;
    summary?: AIProviderSummary;
  }>;
  loading: boolean;
  checkingProviderId?: string;
  onCheckHealth: (id: string) => void;
  onEditProvider: (providerConfig: AIProviderConfig) => void;
  onDeleteProvider: (id: string) => void;
  onAppendModel: (providerConfig: AIProviderConfig, summary?: AIProviderSummary) => void;
  onCreateProvider: () => void;
}

const getProviderAccent = (provider: string) => {
  switch (provider) {
    case 'gemini':
    case 'google':
      return { solid: '#1a73e8', soft: 'rgba(26, 115, 232, 0.1)' };
    case 'openai':
      return { solid: '#10b981', soft: 'rgba(16, 185, 129, 0.1)' };
    case 'deepseek':
      return { solid: '#7c3aed', soft: 'rgba(124, 58, 237, 0.1)' };
    case 'anthropic':
      return { solid: '#f59e0b', soft: 'rgba(245, 158, 11, 0.1)' };
    case 'azure':
      return { solid: '#2563eb', soft: 'rgba(37, 99, 235, 0.1)' };
    case 'alibaba-coding':
    case 'alibaba-bailian':
      return { solid: '#ea580c', soft: 'rgba(234, 88, 12, 0.1)' };
    default:
      return { solid: '#6366f1', soft: 'rgba(99, 102, 241, 0.1)' };
  }
};

const getProviderMonogram = (name?: string) => {
  if (!name) return 'AI';
  const clean = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').trim();
  if (!clean) return 'AI';
  return clean.slice(0, clean.charCodeAt(0) > 255 ? 2 : 1).toUpperCase();
};

export const ProviderListTab: React.FC<ProviderListTabProps> = ({
  items,
  loading,
  checkingProviderId,
  onCheckHealth,
  onEditProvider,
  onDeleteProvider,
  onAppendModel,
  onCreateProvider,
}) => {
  if (!loading && items.length === 0) {
    return (
      <Card
        style={{
          borderRadius: 16,
          border: '1px dashed var(--border-color)',
          background: 'var(--bg-card)',
          textAlign: 'center',
          padding: 32,
        }}
      >
        <Empty description="暂无配置的服务商" />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onCreateProvider}
          style={{ marginTop: 16 }}
        >
          新建服务商配置
        </Button>
      </Card>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {items.map(({ providerConfig, summary }) => {
        const rawKey = providerConfig.provider || 'AI';
        const providerLabel = PROVIDER_NAMES[rawKey] || rawKey;
        const displayName = providerConfig.name || summary?.name || providerLabel;
        const accent = getProviderAccent(rawKey);
        const isChecking = checkingProviderId === providerConfig.id;
        const defaultScopes = summary?.defaultScopes || [];

        return (
          <Col xs={24} sm={12} lg={8} key={providerConfig.id}>
            <Card
              size="small"
              style={{
                borderRadius: 16,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                boxShadow: 'var(--shadow-sm)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
              styles={{
                body: {
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                },
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 12,
                }}
              >
                <Space align="center" size={10}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: accent.soft,
                      color: accent.solid,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {getProviderMonogram(displayName)}
                  </div>
                  <Space direction="vertical" size={1}>
                    <Text strong style={{ fontSize: 15 }}>
                      {displayName}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {providerLabel}
                    </Text>
                  </Space>
                </Space>

                <Tag
                  color={providerConfig.hasCredential ? 'success' : 'default'}
                  icon={<LockOutlined />}
                  style={{ margin: 0 }}
                >
                  {providerConfig.hasCredential ? '已存凭据' : '未配凭据'}
                </Tag>
              </div>

              {/* Endpoint */}
              <div
                style={{
                  padding: '6px 10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginBottom: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={providerConfig.api_endpoint}
              >
                {providerConfig.api_endpoint}
              </div>

              {/* Metrics compact row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-around',
                  padding: '8px 0',
                  borderTop: '1px solid var(--border-color)',
                  borderBottom: '1px solid var(--border-color)',
                  marginBottom: 12,
                  fontSize: 12,
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>关联模型</Text>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{summary?.modelCount || 0}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>启用中</Text>
                  <div style={{ fontWeight: 600, fontSize: 16, color: '#10b981' }}>
                    {summary?.activeModelCount || 0}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>高级模型</Text>
                  <div style={{ fontWeight: 600, fontSize: 16, color: '#f59e0b' }}>
                    {summary?.advancedModelCount || 0}
                  </div>
                </div>
              </div>

              {/* Default scopes preview */}
              <div style={{ minHeight: 28, marginBottom: 12 }}>
                {defaultScopes.length > 0 ? (
                  <Space size={[4, 4]} wrap>
                    {defaultScopes.map((scope) => (
                      <Tag
                        key={scope}
                        color={SCOPE_TAG_META[scope]?.color || 'blue'}
                        style={{ margin: 0, fontSize: 11 }}
                      >
                        {SCOPE_TAG_META[scope]?.label || scope}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    暂无绑定默认策略
                  </Text>
                )}
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'auto',
                  paddingTop: 8,
                }}
              >
                <Space size={4}>
                  <Tooltip title="测试服务商接口连通性">
                    <Button
                      size="small"
                      icon={<ThunderboltOutlined />}
                      loading={isChecking}
                      onClick={() => onCheckHealth(providerConfig.id)}
                    >
                      检测
                    </Button>
                  </Tooltip>
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    type="dashed"
                    onClick={() => onAppendModel(providerConfig, summary)}
                  >
                    加模型
                  </Button>
                </Space>

                <Space size={4}>
                  <Tooltip title="编辑服务商">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => onEditProvider(providerConfig)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确认删除该服务商配置？"
                    okText="删除"
                    cancelText="取消"
                    okType="danger"
                    onConfirm={() => onDeleteProvider(providerConfig.id)}
                  >
                    <Tooltip title="删除">
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              </div>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};
