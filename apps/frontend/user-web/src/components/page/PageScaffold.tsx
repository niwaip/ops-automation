import React from 'react';
import { Card, Col, Row, Space, Typography } from 'antd';

const { Text, Title } = Typography;

export interface OverviewStatItem {
  key: string;
  label: string;
  value: React.ReactNode;
  color?: string;
  icon?: React.ReactNode;
  span?: number;
}

export const OVERVIEW_STAT_CARD_STYLE: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--bg-secondary)',
  background: 'var(--bg-card)',
  boxShadow: 'var(--shadow-sm)',
};

interface PageTitleBlockProps {
  title: string;
  subtitle: string;
}

export const PageTitleBlock: React.FC<PageTitleBlockProps> = ({ title, subtitle }) => (
  <div style={{ marginBottom: 24, textAlign: 'center' }}>
    <Title level={2} style={{ marginBottom: 8 }}>
      {title}
    </Title>
    <Text type="secondary">{subtitle}</Text>
  </div>
);

interface OverviewStatGridProps {
  items: OverviewStatItem[];
  gutter?: number;
}

export const OverviewStatGrid: React.FC<OverviewStatGridProps> = ({ items, gutter = 16 }) => (
  <Row gutter={gutter} style={{ marginBottom: 24 }}>
    {items.map((item) => (
      <Col span={item.span || 6} key={item.key}>
        <Card
          size="small"
          style={OVERVIEW_STAT_CARD_STYLE}
          styles={{ body: { padding: '14px 16px', textAlign: 'center' } }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {item.icon}
            <Text type="secondary" style={{ fontSize: 13 }}>
              {item.label}
            </Text>
            <Text
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: item.color || 'var(--text-primary)',
                lineHeight: 1,
              }}
            >
              {item.value}
            </Text>
          </Space>
        </Card>
      </Col>
    ))}
  </Row>
);

interface ListSectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  tip?: React.ReactNode;
  extra?: React.ReactNode;
}

export const ListSectionHeader: React.FC<ListSectionHeaderProps> = ({
  title,
  subtitle,
  tip,
  extra,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '4px 8px 12px',
      flexWrap: 'wrap',
    }}
  >
    <Space direction="vertical" size={2}>
      <Space size={6} align="center">
        <Text strong style={{ fontSize: 16 }}>
          {title}
        </Text>
        {tip}
      </Space>
      {subtitle ? <Text type="secondary">{subtitle}</Text> : null}
    </Space>
    {extra}
  </div>
);
