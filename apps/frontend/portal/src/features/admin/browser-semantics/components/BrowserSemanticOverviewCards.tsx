import React, { useMemo } from 'react';
import { Card, Space, Typography, Tag, Progress, theme } from 'antd';
import {
  ThunderboltOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { SemanticRuleSet, SemanticRuleCategory } from '@/api/browser-semantics';
import { getSemanticRuleCategoryLabel } from '../lib/semanticRulePresentation';

const { Text } = Typography;

export interface BrowserSemanticOverviewCardsProps {
  selectedRuleSet?: SemanticRuleSet;
  activeRuleSet?: SemanticRuleSet;
  hitLogsCount?: number;
  errorLogsCount?: number;
  loading?: boolean;
}

export const BrowserSemanticOverviewCards: React.FC<BrowserSemanticOverviewCardsProps> = ({
  selectedRuleSet,
  activeRuleSet,
  hitLogsCount = 0,
  errorLogsCount = 0,
  loading = false,
}) => {
  const { token } = theme.useToken();

  const rules = selectedRuleSet?.rules || [];
  const enabledCount = rules.filter((r) => r.enabled).length;

  const categories = useMemo(() => {
    const set = new Set<SemanticRuleCategory>();
    for (const rule of rules) {
      if (rule.category) {
        set.add(rule.category);
      }
    }
    return Array.from(set);
  }, [rules]);

  const enabledPercent = rules.length > 0 ? Math.round((enabledCount / rules.length) * 100) : 100;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 14,
        marginBottom: 20,
      }}
    >
      {/* 1. 当前生效版本 */}
      <Card
        size="small"
        loading={loading}
        style={{
          borderRadius: 12,
          border: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
        }}
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
              当前线上生效版本
            </Text>
            <Tag color={activeRuleSet ? 'green' : 'default'} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
              {activeRuleSet ? 'ACTIVE' : '未发布'}
            </Tag>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: token.colorText }}>
            {activeRuleSet ? `${activeRuleSet.version} (${activeRuleSet.name})` : '暂无正式版本'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <ClockCircleOutlined style={{ color: token.colorTextSecondary }} />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {activeRuleSet?.activatedAt
                ? `激活时间: ${new Date(activeRuleSet.activatedAt).toLocaleString()}`
                : '选中规则集: ' + (selectedRuleSet?.version || '-')}
            </Text>
          </div>
        </Space>
      </Card>

      {/* 2. 规则配置总量 */}
      <Card
        size="small"
        loading={loading}
        style={{
          borderRadius: 12,
          border: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
        }}
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
              已配置语义规则数
            </Text>
            <Tag color="blue" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
              {selectedRuleSet?.version || '草案'}
            </Tag>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: token.colorText }}>
              {rules.length}
            </span>
            <Text type="secondary" style={{ fontSize: 12 }}>条规则 ({enabledCount} 条启用)</Text>
          </div>
          <Progress
            percent={enabledPercent}
            size="small"
            status="active"
            showInfo={false}
            strokeColor="#1677ff"
          />
        </Space>
      </Card>

      {/* 3. 业务场景覆盖 */}
      <Card
        size="small"
        loading={loading}
        style={{
          borderRadius: 12,
          border: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
        }}
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
              操作场景覆盖类别
            </Text>
            <Tag color="purple" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
              {categories.length} / 9 类
            </Tag>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 48, overflowY: 'auto' }}>
            {categories.length > 0 ? (
              categories.map((c) => (
                <Tag key={c} style={{ fontSize: 11, marginInlineEnd: 2, borderRadius: 4 }}>
                  {getSemanticRuleCategoryLabel(c)}
                </Tag>
              ))
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>（暂无分类标签）</Text>
            )}
          </div>
        </Space>
      </Card>

      {/* 4. 执行与自愈健康度 */}
      <Card
        size="small"
        loading={loading}
        style={{
          borderRadius: 12,
          border: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
        }}
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
              执行命中与错误自愈
            </Text>
            <ThunderboltOutlined style={{ color: '#fa8c16' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}>
                {hitLogsCount} 次
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>规则成功命中</Text>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: errorLogsCount > 0 ? '#ff4d4f' : token.colorTextSecondary }}>
                {errorLogsCount} 条
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>待分析错误日志</Text>
            </div>
          </div>
        </Space>
      </Card>
    </div>
  );
};
