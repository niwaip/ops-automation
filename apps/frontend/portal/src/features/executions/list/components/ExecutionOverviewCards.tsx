import React from 'react';
import { Card, Col, Row, Space, Typography, Tag } from 'antd';
import {
  HistoryOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { OVERVIEW_STAT_CARD_STYLE } from '@/components/page/PageScaffold';

const { Text } = Typography;

export type ExecutionQuickTab = 'all' | 'attention' | 'running' | 'failed' | 'succeeded';

interface ExecutionOverviewCardsProps {
  total: number;
  runningCount?: number;
  attentionCount?: number;
  failedCount: number;
  succeededCount: number;
  activeTab: ExecutionQuickTab;
  onSelectTab: (tab: ExecutionQuickTab) => void;
}

export const ExecutionOverviewCards: React.FC<ExecutionOverviewCardsProps> = ({
  total,
  failedCount,
  succeededCount,
  activeTab,
  onSelectTab,
}) => {
  const successRate = total > 0 ? Math.round((succeededCount / total) * 100) : 100;
  const failRate = total > 0 ? Math.round((failedCount / total) * 100) : 0;

  const cards = [
    {
      key: 'all' as ExecutionQuickTab,
      label: '累计执行审计记录',
      value: total,
      extra: <Tag color="blue">全量审计归档</Tag>,
      color: '#1890ff',
      activeColor: 'rgba(24, 144, 255, 0.12)',
      icon: <HistoryOutlined style={{ color: '#1890ff', fontSize: 20 }} />,
    },
    {
      key: 'succeeded' as ExecutionQuickTab,
      label: '执行成功',
      value: `${succeededCount} (${successRate}%)`,
      extra: <Tag color="success">正常完成</Tag>,
      color: '#52c41a',
      activeColor: 'rgba(82, 196, 26, 0.12)',
      icon: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />,
    },
    {
      key: 'failed' as ExecutionQuickTab,
      label: '异常与失败 (排障重点)',
      value: `${failedCount} (${failRate}%)`,
      extra: failedCount > 0 ? <Tag color="error">故障排查重点</Tag> : <Text type="secondary" style={{ fontSize: 12 }}>系统平稳无故障</Text>,
      color: '#ff4d4f',
      activeColor: 'rgba(255, 77, 79, 0.12)',
      icon: <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />,
    },
  ];

  return (
    <Row gutter={14} style={{ marginBottom: 16 }}>
      {cards.map((card) => {
        const isSelected = activeTab === card.key;
        return (
          <Col xs={24} sm={8} md={8} key={card.key}>
            <div
              onClick={() => onSelectTab(activeTab === card.key ? 'all' : card.key)}
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
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
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
