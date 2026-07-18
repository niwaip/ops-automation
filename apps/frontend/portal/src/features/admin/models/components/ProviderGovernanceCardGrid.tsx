import React from 'react';
import { Button, Card, Col, Empty, Row, Space, Tag, Typography, theme, Modal, message } from 'antd';
import {
  CheckCircleFilled,
  EditOutlined,
  LinkOutlined,
  LockOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { AIProviderConfig, AIProviderSummary } from '@/api/ai';
import { aiModelApi } from '@/api/ai';
import { useMutation, useQueryClient } from 'react-query';

const { Paragraph, Text } = Typography;

type ScopeTagMeta = Record<string, { label: string; color: string }>;

const getProviderAccent = (provider: string) => {
  switch (provider) {
    case 'openai':
      return {
        solid: '#10b981',
        soft: 'rgba(16, 185, 129, 0.14)',
        gradient: 'linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, var(--bg-card) 100%)',
      };
    case 'anthropic':
      return {
        solid: '#f59e0b',
        soft: 'rgba(245, 158, 11, 0.14)',
        gradient: 'linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, var(--bg-card) 100%)',
      };
    case 'azure':
      return {
        solid: '#2563eb',
        soft: 'rgba(37, 99, 235, 0.14)',
        gradient: 'linear-gradient(180deg, rgba(37, 99, 235, 0.12) 0%, var(--bg-card) 100%)',
      };
    case 'deepseek':
      return {
        solid: '#7c3aed',
        soft: 'rgba(124, 58, 237, 0.14)',
        gradient: 'linear-gradient(180deg, rgba(124, 58, 237, 0.12) 0%, var(--bg-card) 100%)',
      };
    case 'minimax':
      return {
        solid: '#ec4899',
        soft: 'rgba(236, 72, 153, 0.14)',
        gradient: 'linear-gradient(180deg, rgba(236, 72, 153, 0.12) 0%, var(--bg-card) 100%)',
      };
    default:
      return {
        solid: '#6366f1',
        soft: 'rgba(99, 102, 241, 0.14)',
        gradient: 'linear-gradient(180deg, rgba(99, 102, 241, 0.12) 0%, var(--bg-card) 100%)',
      };
  }
};

const getProviderMonogram = (providerName: string) => {
  const sanitized = providerName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').trim();
  if (!sanitized) {
    return 'AI';
  }
  return sanitized.slice(0, sanitized.charCodeAt(0) > 255 ? 2 : 1).toUpperCase();
};

const metricCardStyle = (background: string): React.CSSProperties => ({
  borderRadius: 12,
  border: '1px solid var(--bg-secondary)',
  background,
  padding: '8px 12px',
});

interface ProviderGovernanceCardGridProps {
  items: Array<{
    providerConfig: AIProviderConfig;
    summary?: AIProviderSummary;
  }>;
  loading?: boolean;
  selectedProvider: string | null;
  providerNames: Record<string, string>;
  scopeTagMeta: ScopeTagMeta;
  healthCheckingId?: string;
  onSelectProvider: (provider: string) => void;
  onCheckHealth: (providerConfigId: string) => void;
  onEditProvider: (providerConfig: AIProviderConfig) => void;
  onAppendModel: (providerConfig: AIProviderConfig, summary?: AIProviderSummary) => void;
}

const ProviderGovernanceCardGrid: React.FC<ProviderGovernanceCardGridProps> = ({
  items,
  loading,
  selectedProvider,
  providerNames,
  scopeTagMeta,
  healthCheckingId,
  onSelectProvider,
  onCheckHealth,
  onEditProvider,
  onAppendModel,
}) => {
  const { token } = theme.useToken();
  const queryClient = useQueryClient();

  const deleteProviderMutation = useMutation((id: string) => aiModelApi.deleteProviderConfig(id), {
    onSuccess: () => {
      message.success('删除成功');
      void queryClient.invalidateQueries('ai-providers-configs');
      void queryClient.invalidateQueries('ai-models');
    },
    onError: (error: any) => {
      message.error(error.message || '删除失败');
    },
  });

  const handleDeleteProvider = (id: string) => {
    Modal.confirm({
      title: '确认删除 Provider',
      content: '删除此 Provider 配置将会影响到关联的模型和默认路由，确定要删除吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        deleteProviderMutation.mutate(id);
      },
    });
  };

  if (!loading && items.length === 0) {
    return (
      <div
        style={{
          borderRadius: 18,
          border: '1px dashed var(--bg-secondary)',
          background: 'var(--bg-card)',
          padding: 32,
        }}
      >
        <Empty description="暂无 provider 配置" />
      </div>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {items.map(({ providerConfig, summary }) => {
        const providerLabel = providerNames[providerConfig.provider] || providerConfig.provider;
        const accent = getProviderAccent(providerConfig.provider);
        const isSelected = selectedProvider === providerConfig.provider;
        const defaultScopes = summary?.defaultScopes || [];
        const metricBackground = token.colorFillAlter;

        return (
          <Col xs={24} sm={24} lg={12} xl={8} key={providerConfig.id}>
            <Card
              loading={loading}
              hoverable
              onClick={() => onSelectProvider(providerConfig.provider)}
              styles={{ body: { padding: 16 } }}
              style={{
                borderRadius: 20,
                border: isSelected
                  ? `1px solid ${accent.solid}`
                  : `1px solid ${token.colorBorderSecondary}`,
                background: isSelected ? accent.gradient : 'var(--bg-card)',
                boxShadow: isSelected
                  ? `0 18px 40px ${accent.soft}`
                  : '0 12px 24px rgba(15, 23, 42, 0.08)',
                transition: 'all 0.2s ease',
              }}
            >
              <Space
                align="start"
                style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}
              >
                <Space align="start" size={12}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: isSelected ? accent.solid : accent.soft,
                      color: isSelected ? '#fff' : accent.solid,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {getProviderMonogram(providerLabel)}
                  </div>
                  <Space direction="vertical" size={4}>
                    <Space size={8} wrap>
                      <Text strong style={{ fontSize: 16 }}>
                        {providerLabel}
                      </Text>
                      {isSelected && (
                        <Tag color="processing" icon={<CheckCircleFilled />}>
                          当前筛选
                        </Tag>
                      )}
                    </Space>
                  </Space>
                </Space>
                <Tag
                  color={providerConfig.hasCredential ? 'success' : 'default'}
                  icon={<LockOutlined />}
                >
                  {providerConfig.hasCredential ? '已配置凭据' : '未配置凭据'}
                </Tag>
              </Space>

              <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                <Col span={8}>
                  <div style={metricCardStyle(metricBackground)}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      已接入模型
                    </Text>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700 }}>
                      {summary?.modelCount || 0}
                    </div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={metricCardStyle(metricBackground)}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      已启用
                    </Text>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: '#10b981' }}>
                      {summary?.activeModelCount || 0}
                    </div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={metricCardStyle(metricBackground)}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      高级模型
                    </Text>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>
                      {summary?.advancedModelCount || 0}
                    </div>
                  </div>
                </Col>
              </Row>

              <div
                style={{
                  borderRadius: 14,
                  border: '1px solid var(--bg-secondary)',
                  background: token.colorBgContainer,
                  padding: '8px 12px',
                  marginBottom: 12,
                }}
              >
                <Space size={8} style={{ marginBottom: 8 }} wrap>
                  <LinkOutlined style={{ color: accent.solid }} />
                  <Text strong style={{ fontSize: 13 }}>
                    默认策略
                  </Text>
                </Space>
                <Space size={[0, 8]} wrap>
                  {defaultScopes.map((scope) => (
                    <Tag key={`${providerConfig.id}-${scope}`} color={scopeTagMeta[scope]?.color}>
                      {scopeTagMeta[scope]?.label || scope}
                    </Tag>
                  ))}
                  {defaultScopes.length === 0 && <Text type="secondary">当前未配置默认模型策略</Text>}
                </Space>
              </div>

              <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                <Space size={8} wrap>
                  <Button
                    icon={<EditOutlined />}
                    className="btn-pill"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditProvider(providerConfig);
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    className="btn-pill"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteProvider(providerConfig.id);
                    }}
                  >
                    删除
                  </Button>
                </Space>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  className="btn-pill"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAppendModel(providerConfig, summary);
                  }}
                >
                  模型
                </Button>
              </Space>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};

export default ProviderGovernanceCardGrid;
