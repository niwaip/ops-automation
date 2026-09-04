import React from 'react';
import { Card, Row, Col, Space, Typography } from 'antd';
import {
  RobotOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  KeyOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

interface ModelStatsBarProps {
  totalModels: number;
  activeModels: number;
  advancedModels: number;
  configuredProviders: number;
  totalProviders: number;
}

export const ModelStatsBar: React.FC<ModelStatsBarProps> = ({
  totalModels,
  activeModels,
  advancedModels,
  configuredProviders,
  totalProviders,
}) => {
  const statItems = [
    {
      key: 'total',
      label: '接入模型',
      value: totalModels,
      unit: '个',
      icon: <RobotOutlined style={{ fontSize: 18, color: '#6366f1' }} />,
      bg: 'rgba(99, 102, 241, 0.08)',
    },
    {
      key: 'active',
      label: '正常启用',
      value: activeModels,
      unit: '个',
      icon: <CheckCircleOutlined style={{ fontSize: 18, color: '#10b981' }} />,
      bg: 'rgba(16, 185, 129, 0.08)',
    },
    {
      key: 'advanced',
      label: '高级深度模型',
      value: advancedModels,
      unit: '个',
      icon: <ThunderboltOutlined style={{ fontSize: 18, color: '#f59e0b' }} />,
      bg: 'rgba(245, 158, 11, 0.08)',
    },
    {
      key: 'providers',
      label: '已配置服务商',
      value: `${configuredProviders} / ${totalProviders}`,
      unit: '',
      icon: <KeyOutlined style={{ fontSize: 18, color: '#06b6d4' }} />,
      bg: 'rgba(6, 182, 212, 0.08)',
    },
  ];

  return (
    <Card
      size="small"
      style={{
        borderRadius: 16,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        marginBottom: 16,
        boxShadow: 'var(--shadow-sm)',
      }}
      styles={{ body: { padding: '12px 20px' } }}
    >
      <Row gutter={[24, 12]} align="middle">
        {statItems.map((item, idx) => (
          <Col xs={12} sm={12} md={6} key={item.key}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderRight:
                  idx < statItems.length - 1 ? '1px solid var(--border-color)' : 'none',
                paddingRight: 8,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: item.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>
              <Space direction="vertical" size={0}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {item.label}
                </Text>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <Text strong style={{ fontSize: 20, lineHeight: 1.2 }}>
                    {item.value}
                  </Text>
                  {item.unit && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.unit}
                    </Text>
                  )}
                </div>
              </Space>
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  );
};
