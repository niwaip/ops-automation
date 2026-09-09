import React from 'react';
import { Card, Col, Row, Typography, Tag } from 'antd';
import {
  FileTextOutlined,
  CheckCircleOutlined,
  EditOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { OVERVIEW_STAT_CARD_STYLE } from '@/components/page/PageScaffold';
import type { Template, TemplateStatus } from '@/api/template';
import { readTemplateWorkflowComposition } from '../lib/templateWorkflowComposition';

const { Text } = Typography;

interface TemplateOverviewCardsProps {
  templates: Template[];
  total?: number;
  selectedStatus?: TemplateStatus;
  onFilterStatus?: (status?: TemplateStatus) => void;
}

export const TemplateOverviewCards: React.FC<TemplateOverviewCardsProps> = ({
  templates,
  total,
  selectedStatus,
  onFilterStatus,
}) => {
  const totalCount = total !== undefined ? total : templates.length;
  const publishedCount = templates.filter((t) => t.status === 'PUBLISHED').length;
  const draftCount = templates.filter((t) => t.status === 'DRAFT' || t.status === 'REVIEW').length;
  const composedCount = templates.filter((t) => {
    const composition = readTemplateWorkflowComposition(t.config || {});
    return (composition?.postProcessingSteps || []).length > 0;
  }).length;

  const cards = [
    {
      key: 'total',
      title: '执行模版总数',
      count: totalCount,
      extra: <Tag color="blue">全量资产</Tag>,
      icon: <FileTextOutlined style={{ fontSize: 22, color: '#1677ff' }} />,
      color: '#1677ff',
      active: !selectedStatus,
      onClick: () => onFilterStatus?.(undefined),
      subtext: '已收录的自动化执行模版',
    },
    {
      key: 'published',
      title: '已发布模版',
      count: publishedCount,
      extra: <Tag color="success">稳定运行</Tag>,
      icon: <CheckCircleOutlined style={{ fontSize: 22, color: '#52c41a' }} />,
      color: '#52c41a',
      active: selectedStatus === 'PUBLISHED',
      onClick: () => onFilterStatus?.(selectedStatus === 'PUBLISHED' ? undefined : 'PUBLISHED'),
      subtext: '可直接用于会话与业务流执行',
    },
    {
      key: 'draft',
      title: '草稿 / 待审核',
      count: draftCount,
      extra: <Tag color="warning">开发调试</Tag>,
      icon: <EditOutlined style={{ fontSize: 22, color: '#fa8c16' }} />,
      color: '#fa8c16',
      active: selectedStatus === 'DRAFT',
      onClick: () => onFilterStatus?.(selectedStatus === 'DRAFT' ? undefined : 'DRAFT'),
      subtext: '录制生成或处于编辑中的版本',
    },
    {
      key: 'composed',
      title: '复合编排模版',
      count: composedCount,
      extra: <Tag color="purple">智能增强</Tag>,
      icon: <RocketOutlined style={{ fontSize: 22, color: '#722ed1' }} />,
      color: '#722ed1',
      active: false,
      subtext: '含 LLM 总结或工作流后处理节点',
    },
  ];

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {cards.map((item) => (
        <Col xs={24} sm={12} md={12} lg={6} xl={6} key={item.key}>
          <Card
            hoverable={Boolean(item.onClick)}
            size="small"
            style={{
              ...OVERVIEW_STAT_CARD_STYLE,
              cursor: item.onClick ? 'pointer' : 'default',
              borderColor: item.active ? item.color : undefined,
              boxShadow: item.active
                ? `0 0 0 2px ${item.color}22, var(--shadow-sm)`
                : 'var(--shadow-sm)',
              transition: 'all 0.25s ease',
            }}
            styles={{ body: { padding: '16px 18px' } }}
            onClick={item.onClick}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: `${item.color}14`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                    {item.title}
                  </Text>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: 2 }}>
                    {item.count}
                  </div>
                </div>
              </div>
              {item.extra}
            </div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-color-split, #f0f0f0)' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {item.subtext}
              </Text>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};
