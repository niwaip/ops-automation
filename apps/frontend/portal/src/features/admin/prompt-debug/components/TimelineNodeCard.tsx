import React, { useState } from 'react';
import { Card, Space, Tag, Typography, Button } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const renderSummaryChips = (
  items: Array<{ label: string; value: React.ReactNode; color?: string }>
) => {
  const visibleItems = items.filter((item) => {
    if (item.value === undefined || item.value === null) return false;
    if (typeof item.value === 'string') return item.value.trim().length > 0;
    return true;
  });

  if (!visibleItems.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}>
      {visibleItems.map((item) => (
        <Tag
          key={`${item.label}-${String(item.value)}`}
          color={item.color}
          style={{ marginInlineEnd: 0, paddingInline: 10, paddingBlock: 4, borderRadius: 999 }}
        >
          <Space size={4}>
            <Text type="secondary">{item.label}</Text>
            <Text strong>{item.value}</Text>
          </Space>
        </Tag>
      ))}
    </div>
  );
};

export const getTimelineCardTone = (color?: string) => {
  switch (color) {
    case 'green':
      return {
        borderColor: 'rgba(16, 185, 129, 0.28)',
        background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--success-color)',
      };
    case 'red':
      return {
        borderColor: 'rgba(239, 68, 68, 0.28)',
        background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--error-color)',
      };
    case 'processing':
      return {
        borderColor: 'rgba(59, 130, 246, 0.28)',
        background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--info-color)',
      };
    case 'gray':
      return {
        borderColor: 'var(--border-color)',
        background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-card) 100%)',
        accent: 'var(--text-light)',
      };
    case 'blue':
    default:
      return {
        borderColor: 'rgba(99, 102, 241, 0.28)',
        background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.12) 0%, var(--bg-card) 100%)',
        accent: 'var(--primary-color)',
      };
  }
};

export interface TimelineNodeCardProps {
  title: string;
  subtitle?: string;
  preview?: React.ReactNode;
  color?: string;
  details?: React.ReactNode;
}

export const TimelineNodeCard: React.FC<TimelineNodeCardProps> = ({
  title,
  subtitle,
  preview,
  color,
  details,
}) => {
  const [expanded, setExpanded] = useState(false);
  const canToggle = Boolean(details);
  const tone = getTimelineCardTone(color);

  return (
    <Card
      size="small"
      styles={{ body: { padding: 12 } }}
      style={{
        borderRadius: 12,
        borderColor: tone.borderColor,
        background: tone.background,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <div
          onClick={() => canToggle && setExpanded((v) => !v)}
          style={{ width: '100%', cursor: canToggle ? 'pointer' : 'default', padding: 4 }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
            <Space direction="vertical" size={2} style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div
                style={{
                  width: '100%',
                  height: 3,
                  borderRadius: 999,
                  background: tone.accent,
                  opacity: 0.18,
                  marginBottom: 6,
                }}
              />
              <Text strong style={{ textAlign: 'left' }}>{title}</Text>
              {subtitle ? <Text type="secondary" style={{ textAlign: 'left' }}>{subtitle}</Text> : null}
            </Space>
            {details ? (
              <Button
                type="text"
                size="small"
                icon={expanded ? <DownOutlined /> : <RightOutlined />}
                style={{ color: tone.accent, background: 'var(--bg-card)', borderRadius: 999 }}
              />
            ) : null}
          </Space>
        </div>
        {preview ? <div style={{ paddingTop: 4 }}>{preview}</div> : null}
        {expanded && details ? <div style={{ paddingTop: 4 }}>{details}</div> : null}
      </Space>
    </Card>
  );
};
