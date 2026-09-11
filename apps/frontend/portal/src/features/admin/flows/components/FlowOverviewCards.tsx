import React from 'react';
import { Card, Col, Row, Space, Typography, Tag } from 'antd';
import {
  OrderedListOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { OVERVIEW_STAT_CARD_STYLE } from '@/components/page/PageScaffold';
import type { ExecutionFlowTemplateDTO } from '@/api/flows';

const { Text } = Typography;

export type FlowQuickFilter = 'all' | 'public' | 'verified' | string;

interface FlowOverviewCardsProps {
  templates: ExecutionFlowTemplateDTO[];
  activeFilter: FlowQuickFilter;
  onSelectFilter: (filter: FlowQuickFilter) => void;
}

export const FlowOverviewCards: React.FC<FlowOverviewCardsProps> = ({
  templates,
  activeFilter,
  onSelectFilter,
}) => {
  const total = templates.length;
  const publicCount = templates.filter((t) => t.isPublic).length;

  const verifiedTemplates = templates.filter((t) => t.validation?.isValid);
  const verifiedCount = verifiedTemplates.length;

  const validScores = templates
    .map((t) => t.validation?.score)
    .filter((score): score is number => typeof score === 'number' && !isNaN(score));

  const avgScore =
    validScores.length > 0
      ? Math.round(validScores.reduce((sum, s) => sum + s, 0) / validScores.length)
      : null;

  // Category counts
  const categoryCounts = templates.reduce((acc, t) => {
    const cat = t.category || 'custom';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalSteps = templates.reduce((acc, t) => acc + (t.steps?.length || 0), 0);

  const cards = [
    {
      key: 'all',
      label: '全部工作流组合',
      value: total,
      extra: (
        <Text type="secondary" style={{ fontSize: 12 }}>
          共编排 {totalSteps} 个任务步骤
        </Text>
      ),
      color: 'var(--primary-color)',
      activeColor: 'rgba(24, 144, 255, 0.12)',
      icon: <OrderedListOutlined style={{ color: 'var(--primary-color)', fontSize: 20 }} />,
    },
    {
      key: 'public',
      label: '公开生产组合',
      value: `${publicCount} / ${total}`,
      extra: (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          跨技能共享就绪
        </Tag>
      ),
      color: '#52c41a',
      activeColor: 'rgba(82, 196, 26, 0.12)',
      icon: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />,
    },
    {
      key: 'verified',
      label: 'AI 验证健康度',
      value: avgScore !== null ? `${avgScore} 分` : '已校验',
      extra: (
        <Tag color="blue" icon={<SafetyCertificateOutlined />}>
          已验证 {verifiedCount} 项
        </Tag>
      ),
      color: '#1890ff',
      activeColor: 'rgba(24, 144, 255, 0.12)',
      icon: <SafetyCertificateOutlined style={{ color: '#1890ff', fontSize: 20 }} />,
    },
    {
      key: 'category-overview',
      label: '核心领域覆盖',
      value: `${Object.keys(categoryCounts).length} 个分类`,
      extra: (
        <Space size={4} wrap style={{ justifyContent: 'center' }}>
          {categoryCounts['document'] && <Tag color="blue">文档 {categoryCounts['document']}</Tag>}
          {categoryCounts['automation'] && <Tag color="purple">自动化 {categoryCounts['automation']}</Tag>}
          {categoryCounts['query'] && <Tag color="orange">查询 {categoryCounts['query']}</Tag>}
        </Space>
      ),
      color: '#8b5cf6',
      activeColor: 'rgba(139, 92, 246, 0.12)',
      icon: <AppstoreOutlined style={{ color: '#8b5cf6', fontSize: 20 }} />,
    },
  ];

  return (
    <Row gutter={14} style={{ marginBottom: 16 }}>
      {cards.map((card) => {
        const isSelected = activeFilter === card.key;
        return (
          <Col xs={24} sm={12} md={6} key={card.key}>
            <div
              onClick={() => onSelectFilter(activeFilter === card.key ? 'all' : card.key)}
              style={{ cursor: 'pointer' }}
            >
              <Card
                size="small"
                style={{
                  ...OVERVIEW_STAT_CARD_STYLE,
                  borderColor: isSelected ? card.color : undefined,
                  background: isSelected ? card.activeColor : 'var(--bg-card)',
                  transform: isSelected ? 'translateY(-2px)' : undefined,
                  transition: 'all 0.2s ease',
                }}
                styles={{ body: { padding: '14px 16px', textAlign: 'center' } }}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {card.icon}
                    <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                      {card.label}
                    </Text>
                  </div>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: card.color,
                      lineHeight: 1.2,
                    }}
                  >
                    {card.value}
                  </Text>
                  <div style={{ minHeight: 22 }}>{card.extra}</div>
                </Space>
              </Card>
            </div>
          </Col>
        );
      })}
    </Row>
  );
};

export default FlowOverviewCards;
