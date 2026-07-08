import {
  AppstoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  HourglassOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Card } from 'antd';
import {
  statCardBodyStyle,
  statCardStyle,
  statContentStyle,
  statGridStyle,
  statIconStyle,
  statTitleStyle,
  statValueStyle,
} from '@/features/skills/components/publishedSkillListStyles';
import type {
  PublishedSkillCounts,
  PublishedSkillOverviewItem,
} from '@/features/skills/lib/publishedSkillList';

interface PublishedSkillOverviewProps {
  counts: PublishedSkillCounts;
}

export function PublishedSkillOverview({ counts }: PublishedSkillOverviewProps) {
  const overviewItems: PublishedSkillOverviewItem[] = [
    {
      key: 'total',
      label: '已发布技能总数',
      value: counts.total,
      icon: <AppstoreOutlined />,
      iconStyle: { color: '#4f46e5', background: 'rgba(99, 102, 241, 0.12)' },
    },
    {
      key: 'authorized',
      label: '已授权',
      value: counts.authorized,
      icon: <CheckCircleOutlined />,
      iconStyle: { color: '#059669', background: 'rgba(16, 185, 129, 0.12)' },
    },
    {
      key: 'requested',
      label: '申请中',
      value: counts.requested,
      icon: <HourglassOutlined />,
      iconStyle: { color: '#2563eb', background: 'rgba(59, 130, 246, 0.12)' },
    },
    {
      key: 'rejected',
      label: '最近被拒绝',
      value: counts.rejected,
      icon: <CloseCircleOutlined />,
      iconStyle: { color: '#dc2626', background: 'rgba(239, 68, 68, 0.12)' },
    },
    {
      key: 'available',
      label: '可直接申请',
      value: counts.available,
      icon: <SendOutlined />,
      iconStyle: { color: '#475569', background: 'rgba(148, 163, 184, 0.16)' },
    },
  ];

  return (
    <div style={statGridStyle}>
      {overviewItems.map((item) => (
        <Card key={item.key} size="small" style={statCardStyle} styles={{ body: statCardBodyStyle }}>
          <div style={{ ...statIconStyle, ...item.iconStyle }}>{item.icon}</div>
          <div style={statContentStyle}>
            <span style={statTitleStyle}>{item.label}</span>
            <span style={statValueStyle}>{item.value}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
