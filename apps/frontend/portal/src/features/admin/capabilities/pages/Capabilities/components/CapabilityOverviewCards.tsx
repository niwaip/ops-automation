import React from 'react';
import { Card, Col, Row, Space, Typography, Tag } from 'antd';
import {
  RocketOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { OVERVIEW_STAT_CARD_STYLE } from '@/components/page/PageScaffold';
import type { CapabilityRelease } from '@/api/capabilities';

const { Text } = Typography;

export type CapabilityQuickTab = 'all' | 'deployed' | 'pending' | 'failed' | 'browser' | 'temporal';

interface CapabilityOverviewCardsProps {
  releases: CapabilityRelease[];
  activeTab: CapabilityQuickTab;
  onSelectTab: (tab: CapabilityQuickTab) => void;
}

export const CapabilityOverviewCards: React.FC<CapabilityOverviewCardsProps> = ({
  releases,
  activeTab,
  onSelectTab,
}) => {
  const total = releases.length;

  const deployedCount = releases.filter(
    (r) =>
      r.deploymentStatus === 'deployed' ||
      r.deploymentStatus === 'succeeded' ||
      r.status === 'published' ||
      r.status === 'deployed' ||
      Boolean(r.publishedSkillId)
  ).length;

  const pendingCount = releases.filter(
    (r) =>
      r.approvalStatus === 'pending_approval' ||
      r.status === 'draft' ||
      r.status === 'draft_ready' ||
      r.approvalStatus === 'pending'
  ).length;

  const failedCount = releases.filter(
    (r) =>
      r.status === 'build_failed' ||
      r.status === 'validation_failed' ||
      r.status === 'deploy_failed' ||
      r.deploymentStatus === 'deploy_failed' ||
      r.deploymentStatus === 'failed'
  ).length;

  const deployedRate = total > 0 ? Math.round((deployedCount / total) * 100) : 100;

  const cards = [
    {
      key: 'all' as CapabilityQuickTab,
      label: '全量流程发布资产',
      value: total,
      extra: <Text type="secondary" style={{ fontSize: 12 }}>覆盖编排/录制/模板资产</Text>,
      color: '#1890ff',
      activeColor: 'rgba(24, 144, 255, 0.12)',
      icon: <RocketOutlined style={{ color: '#1890ff', fontSize: 20 }} />,
    },
    {
      key: 'deployed' as CapabilityQuickTab,
      label: '已发布上线 / 部署就绪',
      value: `${deployedCount} (${deployedRate}%)`,
      extra: deployedCount > 0 ? <Tag color="success">在线运行中</Tag> : undefined,
      color: '#52c41a',
      activeColor: 'rgba(82, 196, 26, 0.12)',
      icon: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />,
    },
    {
      key: 'pending' as CapabilityQuickTab,
      label: '待审批 / 草稿待发',
      value: pendingCount,
      extra: pendingCount > 0 ? <Tag color="warning">需审核发布</Tag> : undefined,
      color: '#fa8c16',
      activeColor: 'rgba(250, 140, 22, 0.12)',
      icon: <ExclamationCircleOutlined style={{ color: '#fa8c16', fontSize: 20 }} />,
    },
    {
      key: 'failed' as CapabilityQuickTab,
      label: '异常与校验失败',
      value: failedCount,
      extra: failedCount > 0 ? <Tag color="error">需人工排障</Tag> : undefined,
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
          <Col xs={24} sm={12} md={6} key={card.key}>
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

export default CapabilityOverviewCards;
