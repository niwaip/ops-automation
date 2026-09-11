import React, { useState, useMemo } from 'react';
import {
  Card,
  Space,
  Tag,
  Typography,
  Button,
  Input,
  Empty,
  Badge,
  theme,
} from 'antd';
import {
  EditOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  RobotOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { SemanticRuleCategory, SemanticRuleSet } from '@/api/browser-semantics';
import { getSemanticRuleCategoryLabel } from '../lib/semanticRulePresentation';

const { Text } = Typography;

const ALL_CATEGORIES: Array<{ key: SemanticRuleCategory | 'ALL'; label: string }> = [
  { key: 'ALL', label: '全部类别' },
  { key: 'LOGIN', label: '登录短语' },
  { key: 'NAVIGATION', label: '页面导航' },
  { key: 'FIELD_FILL', label: '表单填写' },
  { key: 'MENU_SELECTION', label: '菜单选择' },
  { key: 'DETAIL_OPEN', label: '详情展开' },
  { key: 'READ_VALUE', label: '数据读取' },
  { key: 'ROW_ACTION', label: '行操作' },
  { key: 'SEARCH', label: '搜索查询' },
  { key: 'GENERIC_ALIAS', label: '通用别名' },
];

export interface BrowserSemanticRulesListTabProps {
  currentRuleSet?: SemanticRuleSet;
  selectedCategory: SemanticRuleCategory | null;
  onSelectCategory: (cat: SemanticRuleCategory | null) => void;
  onEditRuleSet: () => void;
  onReplaceCategory: (cat: SemanticRuleCategory) => void;
  onGenerateCategoryDraft: (cat: SemanticRuleCategory) => void;
  generateCategoryLoading?: boolean;
  generatingCategory?: SemanticRuleCategory | null;
}

export const BrowserSemanticRulesListTab: React.FC<BrowserSemanticRulesListTabProps> = ({
  currentRuleSet,
  selectedCategory,
  onSelectCategory,
  onEditRuleSet,
  onReplaceCategory,
  onGenerateCategoryDraft,
  generateCategoryLoading,
  generatingCategory,
}) => {
  const { token } = theme.useToken();
  const [keyword, setKeyword] = useState('');

  const rules = currentRuleSet?.rules || [];

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      // Category match
      if (selectedCategory && (rule.category || 'GENERIC_ALIAS') !== selectedCategory) {
        return false;
      }
      // Keyword match
      if (keyword.trim()) {
        const query = keyword.trim().toLowerCase();
        const nameMatch = rule.name.toLowerCase().includes(query);
        const patternsStr = Array.isArray(rule.patterns) ? rule.patterns.join(' ').toLowerCase() : '';
        const patternsMatch = patternsStr.includes(query);
        const outputsMatch = JSON.stringify(rule.outputs || {}).toLowerCase().includes(query);
        return nameMatch || patternsMatch || outputsMatch;
      }
      return true;
    });
  }, [rules, selectedCategory, keyword]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Filter and Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
            placeholder="按规则名称、Pattern 模式或输出结果搜索..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 300, borderRadius: 8 }}
            allowClear
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {rules.length} 条规则 (当前展示 {filteredRules.length} 条)
          </Text>
        </div>

        <Space size={8}>
          {selectedCategory && (
            <>
              <Button
                size="small"
                icon={<RobotOutlined />}
                loading={generateCategoryLoading && generatingCategory === selectedCategory}
                onClick={() => onGenerateCategoryDraft(selectedCategory)}
                style={{ borderRadius: 6 }}
              >
                AI 生成【{getSemanticRuleCategoryLabel(selectedCategory)}】草案
              </Button>
              <Button
                size="small"
                icon={<SwapOutlined />}
                onClick={() => onReplaceCategory(selectedCategory)}
                style={{ borderRadius: 6 }}
              >
                全量替换本类规则
              </Button>
            </>
          )}
          <Button
            type="primary"
            size="small"
            icon={<EditOutlined />}
            onClick={onEditRuleSet}
            style={{ borderRadius: 6 }}
          >
            编辑规则集
          </Button>
        </Space>
      </div>

      {/* Categories Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ALL_CATEGORIES.map(({ key, label }) => {
          const isAll = key === 'ALL';
          const isSelected = isAll ? selectedCategory === null : selectedCategory === key;
          const count = isAll
            ? rules.length
            : rules.filter((r) => (r.category || 'GENERIC_ALIAS') === key).length;

          return (
            <Tag
              key={key}
              onClick={() => onSelectCategory(isAll ? null : (key as SemanticRuleCategory))}
              style={{
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 12,
                background: isSelected ? '#1677ff' : token.colorBgContainer,
                color: isSelected ? '#fff' : token.colorText,
                border: isSelected ? '1px solid #1677ff' : `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              {label} ({count})
            </Tag>
          );
        })}
      </div>

      {/* Rules Grid */}
      {filteredRules.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 14,
          }}
        >
          {filteredRules.map((rule) => {
            const patterns: string[] = Array.isArray(rule.patterns)
              ? rule.patterns.filter((p): p is string => typeof p === 'string')
              : [];

            return (
              <Card
                key={rule.id}
                size="small"
                style={{
                  borderRadius: 12,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  background: token.colorBgContainer,
                  boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.03))',
                }}
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space size={6} align="center">
                      <ThunderboltOutlined style={{ color: rule.enabled ? '#1677ff' : token.colorTextSecondary }} />
                      <Text strong style={{ fontSize: 13 }}>
                        {rule.name}
                      </Text>
                    </Space>
                    <Space size={4}>
                      <Badge status={rule.enabled ? 'success' : 'default'} text={rule.enabled ? '已启用' : '已停用'} />
                    </Space>
                  </div>

                  {/* Badges */}
                  <Space wrap size={4}>
                    <Tag color="blue" style={{ borderRadius: 4, marginInlineEnd: 0 }}>
                      {rule.category ? getSemanticRuleCategoryLabel(rule.category) : rule.type}
                    </Tag>
                    <Tag color="orange" style={{ borderRadius: 4, marginInlineEnd: 0 }}>
                      优先级: {rule.priority}
                    </Tag>
                    {rule.stopOnMatch && (
                      <Tag color="red" style={{ borderRadius: 4, marginInlineEnd: 0 }}>
                        StopOnMatch
                      </Tag>
                    )}
                  </Space>

                  {/* Patterns */}
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>匹配模式 (Patterns):</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {patterns.length > 0 ? (
                        patterns.map((p, idx) => (
                          <Tag key={idx} style={{ fontFamily: 'monospace', fontSize: 11, borderRadius: 4 }}>
                            /{p}/{rule.flags || 'i'}
                          </Tag>
                        ))
                      ) : (
                        <Text type="secondary" style={{ fontSize: 11 }}>（无模式定义）</Text>
                      )}
                    </div>
                  </div>

                  {/* Outputs */}
                  {rule.outputs && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 11 }}>归一化映射 (Outputs):</Text>
                      <pre
                        style={{
                          margin: '4px 0 0',
                          padding: '6px 8px',
                          background: token.colorFillAlter,
                          borderRadius: 6,
                          border: `1px solid ${token.colorBorderSecondary}`,
                          fontSize: 11,
                          maxHeight: 100,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {JSON.stringify(rule.outputs, null, 2)}
                      </pre>
                    </div>
                  )}
                </Space>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: '40px 0' }}>
          <Empty description="当前筛选条件下没有语义规则" />
        </Card>
      )}
    </div>
  );
};
