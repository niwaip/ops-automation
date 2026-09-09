import React from 'react';
import { Card, Col, Row, Space, Typography, Tag } from 'antd';
import {
  BuildOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { OVERVIEW_STAT_CARD_STYLE } from '@/components/page/PageScaffold';
import type { ActivityDTO, BuiltinActivityDTO } from '@/api/activity';

const { Text } = Typography;

export type ActivityQuickFilter =
  | 'all'
  | 'custom'
  | 'builtin'
  | 'script'
  | 'api'
  | 'browser'
  | 'carbone';

interface ActivityOverviewCardsProps {
  customActivities: ActivityDTO[];
  builtinActivities: BuiltinActivityDTO[];
  activeFilter: ActivityQuickFilter;
  onSelectFilter: (filter: ActivityQuickFilter) => void;
}

export const ActivityOverviewCards: React.FC<ActivityOverviewCardsProps> = ({
  customActivities,
  builtinActivities,
  activeFilter,
  onSelectFilter,
}) => {
  const customCount = customActivities.length;
  const builtinCount = builtinActivities.length;
  const total = customCount + builtinCount;

  // Active state count
  const activeCustomCount = customActivities.filter((a) => a.isActive !== false).length;

  // Handler distributions
  const scriptCount =
    customActivities.filter((a) => (a.handler || 'script') === 'script').length +
    builtinActivities.filter((a) => (a.handler || 'script') === 'script').length;
  const apiCount =
    customActivities.filter((a) => a.handler === 'api').length +
    builtinActivities.filter((a) => a.handler === 'api').length;
  const browserCount =
    customActivities.filter((a) => a.handler === 'browser').length +
    builtinActivities.filter((a) => a.handler === 'browser').length;
  const carboneCount =
    customActivities.filter((a) => a.handler === 'carbone').length +
    builtinActivities.filter((a) => a.handler === 'carbone').length;

  const cards = [
    {
      key: 'all' as ActivityQuickFilter,
      label: '全部工作单元',
      value: total,
      extra: (
        <Text type="secondary" style={{ fontSize: 12 }}>
          工作流原子能力库 (自定义 + 内置)
        </Text>
      ),
      color: 'var(--primary-color)',
      activeColor: 'rgba(24, 144, 255, 0.12)',
      icon: <BuildOutlined style={{ color: 'var(--primary-color)', fontSize: 20 }} />,
    },
    {
      key: 'custom' as ActivityQuickFilter,
      label: '自定义 Activity',
      value: customCount,
      extra: (
        <Space size={4}>
          <Tag color="purple">已就绪 {activeCustomCount}</Tag>
          {customCount - activeCustomCount > 0 && (
            <Tag color="default">停用 {customCount - activeCustomCount}</Tag>
          )}
        </Space>
      ),
      color: '#8b5cf6',
      activeColor: 'rgba(139, 92, 246, 0.12)',
      icon: <ThunderboltOutlined style={{ color: '#8b5cf6', fontSize: 20 }} />,
    },
    {
      key: 'builtin' as ActivityQuickFilter,
      label: '系统内置 Activity',
      value: builtinCount,
      extra: (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          高可靠原生驱动
        </Tag>
      ),
      color: '#10b981',
      activeColor: 'rgba(16, 185, 129, 0.12)',
      icon: <CheckCircleOutlined style={{ color: '#10b981', fontSize: 20 }} />,
    },
    {
      key: 'script' as ActivityQuickFilter,
      label: '自动化处理器分布',
      value: `${scriptCount + apiCount + browserCount + carboneCount} 项`,
      extra: (
        <Space size={4} wrap style={{ justifyContent: 'center' }}>
          <Tag color="orange">脚本 {scriptCount}</Tag>
          <Tag color="green">API {apiCount}</Tag>
          <Tag color="purple">浏览器 {browserCount}</Tag>
          {carboneCount > 0 && <Tag color="blue">报表 {carboneCount}</Tag>}
        </Space>
      ),
      color: '#fa8c16',
      activeColor: 'rgba(250, 140, 22, 0.12)',
      icon: <AppstoreOutlined style={{ color: '#fa8c16', fontSize: 20 }} />,
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

export default ActivityOverviewCards;
