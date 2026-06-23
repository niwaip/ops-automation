import React from 'react';
import { Button, Card, Empty, Space, Tag, Tooltip, Typography, theme } from 'antd';
import { EditOutlined, EyeOutlined, MenuFoldOutlined, MenuUnfoldOutlined, RocketOutlined } from '@ant-design/icons';
import type { SemanticRuleSet, SemanticRuleSetStatus } from '@/api/browser-semantics';

const { Text } = Typography;

const STATUS_META: Record<SemanticRuleSetStatus, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '草稿' },
  VALIDATING: { color: 'processing', label: '校验中' },
  CANARY: { color: 'gold', label: '灰度' },
  ACTIVE: { color: 'success', label: '生效中' },
  ARCHIVED: { color: 'default', label: '已归档' },
  ROLLED_BACK: { color: 'error', label: '已回退' },
};

const buildPatternPreview = (ruleSet: SemanticRuleSet) => {
  const firstRule = ruleSet.rules?.[0];
  if (!firstRule || !Array.isArray(firstRule.patterns) || firstRule.patterns.length === 0) {
    return '-';
  }

  return firstRule.patterns.slice(0, 2).join(' | ');
};

const buildCategorySummary = (ruleSet: SemanticRuleSet) => {
  const categories = Array.from(
    new Set(
      (ruleSet.rules || [])
        .map((rule) => rule.category)
        .filter(Boolean)
    )
  );

  return categories.length ? categories.join(' / ') : '-';
};

interface SemanticRuleSetSidebarProps {
  ruleSets: SemanticRuleSet[];
  selectedRuleSetId: string | null;
  activeRuleSetId?: string;
  loading: boolean;
  collapsed: boolean;
  publishCanaryLoading: boolean;
  publishActiveLoading: boolean;
  onToggleCollapse: () => void;
  onSelectRuleSet: (ruleSetId: string) => void;
  onOpenDetail: (ruleSetId: string) => void;
  onPromoteCanary: (ruleSetId: string) => void;
  onPromoteActive: (ruleSetId: string) => void;
}

const SemanticRuleSetSidebar: React.FC<SemanticRuleSetSidebarProps> = ({
  ruleSets,
  selectedRuleSetId,
  activeRuleSetId,
  loading,
  collapsed,
  publishCanaryLoading,
  publishActiveLoading,
  onToggleCollapse,
  onSelectRuleSet,
  onOpenDetail,
  onPromoteCanary,
  onPromoteActive,
}) => {
  const { token } = theme.useToken();

  return (
    <Card
      size="small"
      title={
        collapsed ? (
          <Button type="text" icon={<MenuUnfoldOutlined />} onClick={onToggleCollapse} />
        ) : (
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <span>规则版本</span>
            <Button type="text" icon={<MenuFoldOutlined />} onClick={onToggleCollapse} />
          </Space>
        )
      }
      style={{
        borderRadius: 20,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: token.boxShadowSecondary,
        background: token.colorBgContainer,
        height: '100%',
      }}
      styles={{
        header: { paddingInline: 12, minHeight: 52 },
        body: {
          padding: collapsed ? 8 : 12,
          maxHeight: 'calc(100vh - 220px)',
          overflowY: 'auto',
        },
      }}
    >
      {collapsed ? (
        <Space direction="vertical" size={8} style={{ width: '100%', alignItems: 'center' }}>
          <Tag color="blue">{ruleSets.length}</Tag>
          {activeRuleSetId ? <Tag color="success">A</Tag> : null}
          <Text type="secondary" style={{ fontSize: 12 }}>版本</Text>
        </Space>
      ) : null}
      {!collapsed && loading ? (
        <Card size="small" loading />
      ) : null}
      {!collapsed && !loading && !ruleSets.length ? (
        <Empty description="暂无规则版本" />
      ) : null}
      {!collapsed && !loading && !!ruleSets.length ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {ruleSets.map((ruleSet) => {
            const selected = ruleSet.id === selectedRuleSetId;
            return (
              <Card
                key={ruleSet.id}
                size="small"
                hoverable
                onClick={() => onSelectRuleSet(ruleSet.id)}
                style={{
                  borderRadius: 16,
                  cursor: 'pointer',
                  border: selected
                    ? `1px solid ${token.colorPrimary}`
                    : `1px solid ${token.colorBorderSecondary}`,
                  background: selected ? token.colorPrimaryBg : token.colorBgContainer,
                  boxShadow: selected ? token.boxShadow : 'none',
                }}
                styles={{ body: { padding: 14 } }}
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Text strong>{ruleSet.version}</Text>
                    <Space size={4} wrap>
                      <Tag color={STATUS_META[ruleSet.status]?.color}>
                        {STATUS_META[ruleSet.status]?.label || ruleSet.status}
                      </Tag>
                      {ruleSet.id === activeRuleSetId ? <Tag color="success">ACTIVE</Tag> : null}
                    </Space>
                  </Space>

                  <div>
                    <div style={{ fontWeight: 600 }}>{ruleSet.key}</div>
                    <Text type="secondary">{ruleSet.name}</Text>
                  </div>

                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {buildCategorySummary(ruleSet)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {buildPatternPreview(ruleSet)}
                  </Text>

                  <Space wrap>
                    <Button
                      size="small"
                      type={selected ? 'primary' : 'default'}
                      icon={<EyeOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenDetail(ruleSet.id);
                      }}
                    >
                      查看
                    </Button>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenDetail(ruleSet.id);
                      }}
                    >
                      编辑
                    </Button>
                  </Space>

                  <Space wrap>
                    <Button
                      size="small"
                      icon={<RocketOutlined />}
                      disabled={ruleSet.status === 'CANARY'}
                      loading={publishCanaryLoading}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPromoteCanary(ruleSet.id);
                      }}
                    >
                      Canary
                    </Button>
                    <Tooltip
                      title={
                        ruleSet.status === 'DRAFT'
                          ? '后端当前仅支持从 CANARY 提升到 ACTIVE，草稿请先发布为 CANARY'
                          : ''
                      }
                    >
                      <Button
                        size="small"
                        type="primary"
                        disabled={ruleSet.status === 'ACTIVE' || ruleSet.status === 'DRAFT'}
                        loading={publishActiveLoading}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPromoteActive(ruleSet.id);
                        }}
                      >
                        Active
                      </Button>
                    </Tooltip>
                  </Space>
                </Space>
              </Card>
            );
          })}
        </Space>
      ) : null}
    </Card>
  );
};

export default SemanticRuleSetSidebar;
