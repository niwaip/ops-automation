import React, { useMemo } from 'react';
import { Card, Col, Row, Space, Typography, Tag } from 'antd';
import {
  RocketOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SendOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { OVERVIEW_STAT_CARD_STYLE } from '@/components/page/PageScaffold';
import type { CapabilityRelease } from '@/api/capabilities';
import { resolvePipelineInfo } from '../utils/capabilitiesHelpers';

const { Text } = Typography;

export type CapabilityQuickTab =
  | 'all'
  | 'pending_deploy'
  | 'pending_publish'
  | 'published'
  | 'failed';

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
  const stats = useMemo(() => {
    let pendingDeploy = 0;
    let pendingPublish = 0;
    let published = 0;
    let failed = 0;

    for (const r of releases) {
      const info = resolvePipelineInfo(r);
      if (info.stage === 'failed') {
        failed++;
      } else if (info.stage === 'published') {
        published++;
      } else if (info.stage === 'deployed_pending') {
        pendingPublish++;
      } else {
        pendingDeploy++;
      }
    }

    return {
      total: releases.length,
      pendingDeploy,
      pendingPublish,
      published,
      failed,
    };
  }, [releases]);

  const cards = [
    {
      key: 'all' as CapabilityQuickTab,
      label: '全量流程资产',
      value: stats.total,
      extra: <Text type="secondary" style={{ fontSize: 12 }}>编排 / 录制 / 模板全量</Text>,
      color: '#1890ff',
      activeColor: 'rgba(24, 144, 255, 0.12)',
      icon: <RocketOutlined style={{ color: '#1890ff', fontSize: 20 }} />,
    },
    {
      key: 'pending_deploy' as CapabilityQuickTab,
      label: '待部署验证',
      value: stats.pendingDeploy,
      extra:
        stats.pendingDeploy > 0 ? (
          <Tag color="warning">Step 1 · 待测试部署</Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>暂无待部署</Text>
        ),
      color: '#fa8c16',
      activeColor: 'rgba(250, 140, 22, 0.12)',
      icon: <ClockCircleOutlined style={{ color: '#fa8c16', fontSize: 20 }} />,
    },
    {
      key: 'pending_publish' as CapabilityQuickTab,
      label: '部署就绪·待发布',
      value: stats.pendingPublish,
      extra:
        stats.pendingPublish > 0 ? (
          <Tag color="cyan">Step 2 · 待发布为技能</Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>暂无待发布</Text>
        ),
      color: '#13c2c2',
      activeColor: 'rgba(19, 194, 194, 0.12)',
      icon: <SendOutlined style={{ color: '#13c2c2', fontSize: 20 }} />,
    },
    {
      key: 'published' as CapabilityQuickTab,
      label: '已发布上线',
      value: stats.published,
      extra:
        stats.published > 0 ? (
          <Tag color="success">在线运行中</Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>尚未发布技能</Text>
        ),
      color: '#52c41a',
      activeColor: 'rgba(82, 196, 26, 0.12)',
      icon: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />,
    },
    {
      key: 'failed' as CapabilityQuickTab,
      label: '异常与排障',
      value: stats.failed,
      extra:
        stats.failed > 0 ? (
          <Tag color="error">需人工排障</Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>运行状态健康</Text>
        ),
      color: '#ff4d4f',
      activeColor: 'rgba(255, 77, 79, 0.12)',
      icon: <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />,
    },
  ];

  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      {cards.map((card) => {
        const isSelected = activeTab === card.key;
        return (
          <Col xs={24} sm={12} md={8} style={{ flex: '1 1 180px' }} key={card.key}>
            <div
              onClick={() => onSelectTab(activeTab === card.key ? 'all' : card.key)}
              style={{ cursor: 'pointer', height: '100%' }}
            >
              <Card
                size="small"
                style={{
                  ...OVERVIEW_STAT_CARD_STYLE,
                  borderColor: isSelected ? card.color : undefined,
                  background: isSelected ? card.activeColor : 'var(--bg-card)',
                  transform: isSelected ? 'translateY(-2px)' : undefined,
                  transition: 'all 0.2s ease',
                  height: '100%',
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
