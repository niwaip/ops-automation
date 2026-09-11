import React, { useState, useMemo } from 'react';
import { Card, Input, Space, Tag, Typography, theme } from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import type { SemanticRule, SemanticRuleSet } from '@/api/browser-semantics';
import { getSemanticRuleCategoryLabel } from '../lib/semanticRulePresentation';

const { Text } = Typography;

export interface BrowserSemanticPlaygroundProps {
  currentRuleSet?: SemanticRuleSet;
}

const PRESET_TEST_COMMANDS = [
  '登进系统',
  '点击登录',
  '进入采购订单列表',
  '录入纳税人识别号 91330100MA2345',
  '打开第1行记录的详情',
  '读取表格总记录数',
  '搜索最近一个月的订单',
];

export const BrowserSemanticPlayground: React.FC<BrowserSemanticPlaygroundProps> = ({
  currentRuleSet,
}) => {
  const { token } = theme.useToken();
  const [testInput, setTestInput] = useState('登进系统');

  // Client-side rule evaluation engine
  const simulationResult = useMemo(() => {
    const trimmed = testInput.trim();
    if (!trimmed) {
      return null;
    }

    const rules = [...(currentRuleSet?.rules || [])]
      .filter((r) => r.enabled)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const matchedRules: Array<{
      rule: SemanticRule;
      matchedPattern: string;
      matchDetails?: RegExpMatchArray;
    }> = [];

    let currentNormalized = trimmed;

    for (const rule of rules) {
      const patterns: string[] = Array.isArray(rule.patterns)
        ? rule.patterns.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
        : [];

      for (const pattern of patterns) {
        try {
          const regex = new RegExp(pattern, rule.flags || 'i');
          const match = currentNormalized.match(regex);
          if (match) {
            matchedRules.push({
              rule,
              matchedPattern: pattern,
              matchDetails: match,
            });

            // If rule has normalized_input in outputs, simulate substitution
            if (rule.outputs && typeof (rule.outputs as any).normalized_input === 'string') {
              currentNormalized = (rule.outputs as any).normalized_input;
            }

            if (rule.stopOnMatch) {
              return {
                inputText: trimmed,
                matchedRules,
                finalNormalized: currentNormalized,
                stoppedBy: rule,
              };
            }
            break;
          }
        } catch {
          // Ignore invalid regex in user input
        }
      }
    }

    return {
      inputText: trimmed,
      matchedRules,
      finalNormalized: currentNormalized,
      stoppedBy: null,
    };
  }, [testInput, currentRuleSet]);

  return (
    <Card
      size="small"
      style={{
        borderRadius: 14,
        border: '1px solid rgba(22, 119, 255, 0.25)',
        background: 'rgba(22, 119, 255, 0.02)',
        marginBottom: 20,
      }}
      title={
        <Space size={8}>
          <PlayCircleOutlined style={{ color: '#1677ff' }} />
          <Text strong style={{ fontSize: 14 }}>
            在线语义规则模拟演练台 (Interactive Rule Playground)
          </Text>
          <Tag color="blue" style={{ fontSize: 11, borderRadius: 4 }}>
            即时模拟匹配
          </Tag>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            输入自然语言指令，测试当前规则集对动词、字段名、区域与行操作的归一化映射逻辑：
          </Text>
        </div>

        {/* Input & Action */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Input
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="例如: 登进系统、录入纳税人识别号 123456、查看第1行明细..."
            style={{ flex: 1, minWidth: 260, borderRadius: 8 }}
            allowClear
          />
        </div>

        {/* Preset quick test chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Space size={4}>
            <BulbOutlined style={{ color: '#faad14', fontSize: 12 }} />
            <Text type="secondary" style={{ fontSize: 11 }}>快速示例:</Text>
          </Space>
          {PRESET_TEST_COMMANDS.map((sample) => (
            <Tag
              key={sample}
              onClick={() => setTestInput(sample)}
              style={{
                cursor: 'pointer',
                borderRadius: 999,
                fontSize: 11,
                border: testInput === sample ? '1px solid #1677ff' : undefined,
                color: testInput === sample ? '#1677ff' : undefined,
              }}
            >
              {sample}
            </Tag>
          ))}
        </div>

        {/* Simulation Output Card */}
        {simulationResult && (
          <div
            style={{
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 10,
              padding: '12px 14px',
              marginTop: 4,
            }}
          >
            {simulationResult.matchedRules.length > 0 ? (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <Space size={8}>
                    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                    <Text strong style={{ color: '#52c41a' }}>
                      成功命中 {simulationResult.matchedRules.length} 条语义规则
                    </Text>
                  </Space>
                  <Tag color="cyan">
                    归一化指令: {simulationResult.finalNormalized}
                  </Tag>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {simulationResult.matchedRules.map(({ rule, matchedPattern }, idx) => (
                    <div
                      key={`${rule.id}-${idx}`}
                      style={{
                        background: token.colorFillAlter,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid var(--border-color, #e2e8f0)',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <Space size={6}>
                          <ThunderboltOutlined style={{ color: '#1677ff' }} />
                          <Text strong>{rule.name}</Text>
                          <Tag color="blue">{rule.category ? getSemanticRuleCategoryLabel(rule.category) : rule.type}</Tag>
                          <Tag color="orange">优先级: {rule.priority}</Tag>
                          {rule.stopOnMatch && <Tag color="red">匹配后终止 (stopOnMatch)</Tag>}
                        </Space>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <Text type="secondary">命中的正则模式: </Text>
                          <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 4px', borderRadius: 4 }}>
                            /{matchedPattern}/{rule.flags || 'i'}
                          </code>
                        </div>
                        {rule.outputs && (
                          <div>
                            <Text type="secondary">规则输出: </Text>
                            <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 4px', borderRadius: 4 }}>
                              {JSON.stringify(rule.outputs)}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Space>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CloseCircleOutlined style={{ color: '#fa8c16' }} />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  当前规则集未匹配到该指令。指令将直接透传给通用浏览器解析器。如需精确归一化，可在下方对应分类中添加规则。
                </Text>
              </div>
            )}
          </div>
        )}
      </Space>
    </Card>
  );
};
