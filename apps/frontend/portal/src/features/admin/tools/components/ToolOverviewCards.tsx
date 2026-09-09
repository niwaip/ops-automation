import React from 'react';
import { Card, Col, Row, Space, Typography, Tag } from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  LinkOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { OVERVIEW_STAT_CARD_STYLE } from '@/components/page/PageScaffold';
import type { ToolCatalogItem, ToolCatalogStatus } from '@/api/tool-catalog';

const { Text } = Typography;

interface ToolOverviewCardsProps {
  tools: ToolCatalogItem[];
  selectedStatus?: ToolCatalogStatus;
  onFilterStatus?: (status?: ToolCatalogStatus) => void;
  onFilterRisk?: (riskLevel?: string) => void;
}

export const ToolOverviewCards: React.FC<ToolOverviewCardsProps> = ({
  tools,
  selectedStatus,
  onFilterStatus,
}) => {
  const totalCount = tools.length;
  const activeCount = tools.filter((t) => t.status === 'active').length;
  const promptExposedCount = tools.filter(
    (t) => t.promptExposure === 'prompt_and_runtime' || t.promptExposure === 'prompt_only'
  ).length;
  const boundSkillsTotal = tools.reduce(
    (sum, t) => sum + (t.usageSummary?.boundSkillCount || 0),
    0
  );
  const highRiskCount = tools.filter(
    (t) =>
      t.riskLevel === 'L2' ||
      t.riskLevel === 'L3' ||
      t.defaultRequiresConfirmation ||
      t.defaultRequiresApproval
  ).length;

  const cardItems = [
    {
      key: 'total',
      title: '原子能力总数',
      count: totalCount,
      extra: <Tag color="blue">全量资产</Tag>,
      icon: <AppstoreOutlined style={{ fontSize: 20, color: '#1677ff' }} />,
      color: '#1677ff',
      active: !selectedStatus,
      onClick: () => onFilterStatus?.(undefined),
    },
    {
      key: 'active',
      title: '运行活跃能力',
      count: activeCount,
      extra: <Tag color="success">就绪可用</Tag>,
      icon: <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a' }} />,
      color: '#52c41a',
      active: selectedStatus === 'active',
      onClick: () => onFilterStatus?.('active'),
    },
    {
      key: 'prompt_exposed',
      title: '大模型提示词可见',
      count: promptExposedCount,
      extra: <Tag color="cyan">Prompt 暴露</Tag>,
      icon: <EyeOutlined style={{ fontSize: 20, color: '#13c2c2' }} />,
      color: '#13c2c2',
    },
    {
      key: 'bound_skills',
      title: '已关联 Skill 总数',
      count: boundSkillsTotal,
      extra: <Tag color="purple">生产引用</Tag>,
      icon: <LinkOutlined style={{ fontSize: 20, color: '#722ed1' }} />,
      color: '#722ed1',
    },
    {
      key: 'high_risk',
      title: '高危与门禁管控',
      count: highRiskCount,
      extra: <Tag color="error">审批/确认</Tag>,
      icon: <WarningOutlined style={{ fontSize: 20, color: '#fa8c16' }} />,
      color: '#fa8c16',
    },
  ];

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {cardItems.map((item) => (
        <Col xs={24} sm={12} md={12} lg={item.key === 'total' || item.key === 'active' ? 4 : 5} xl={item.key === 'total' || item.key === 'active' ? 4 : 5} flex="1" key={item.key}>
          <Card
            hoverable={Boolean(item.onClick)}
            size="small"
            style={{
              ...OVERVIEW_STAT_CARD_STYLE,
              cursor: item.onClick ? 'pointer' : 'default',
              borderColor: item.active ? item.color : undefined,
              transition: 'all 0.2s ease',
            }}
            styles={{ body: { padding: '12px 16px' } }}
            onClick={item.onClick}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Space size={6}>
                {item.icon}
                <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                  {item.title}
                </Text>
              </Space>
              {item.extra}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: item.color,
                  lineHeight: 1.1,
                }}
              >
                {item.count}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                项
              </Text>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};
