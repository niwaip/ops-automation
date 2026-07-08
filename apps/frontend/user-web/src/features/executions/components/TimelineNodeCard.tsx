import React from 'react';
import { Button, Space, Typography } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import ExecutionDetailSectionCard from '@/features/executions/components/ExecutionDetailSectionCard';

const { Text } = Typography;

export interface TimelineNodeCardProps {
  title: string;
  subtitle?: string;
  preview?: React.ReactNode;
  color?: 'green' | 'red' | 'processing' | 'gray' | 'blue';
  details?: React.ReactNode;
}

const getTimelineCardTone = (color?: TimelineNodeCardProps['color']) => {
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

const TimelineNodeCard: React.FC<TimelineNodeCardProps> = ({
  title,
  subtitle,
  preview,
  color,
  details,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const canToggle = Boolean(details);
  const tone = getTimelineCardTone(color);

  const toggleExpanded = () => {
    if (!canToggle) {
      return;
    }
    setExpanded((value) => !value);
  };

  return (
    <ExecutionDetailSectionCard
      style={{
        borderRadius: 12,
        borderColor: tone.borderColor,
        background: tone.background,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <div
          onClick={toggleExpanded}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && canToggle) {
              event.preventDefault();
              toggleExpanded();
            }
          }}
          role={canToggle ? 'button' : undefined}
          tabIndex={canToggle ? 0 : undefined}
          style={{
            width: '100%',
            cursor: canToggle ? 'pointer' : 'default',
            borderRadius: 10,
            padding: 6,
          }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
            <Space
              direction="vertical"
              size={2}
              style={{ minWidth: 0, flex: 1, alignItems: 'flex-start', textAlign: 'left' }}
            >
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
              <Text strong style={{ width: '100%', textAlign: 'left' }}>
                {title}
              </Text>
              {subtitle ? (
                <Text type="secondary" style={{ width: '100%', textAlign: 'left' }}>
                  {subtitle}
                </Text>
              ) : null}
            </Space>
            {details ? (
              <Button
                type="text"
                size="small"
                icon={expanded ? <DownOutlined /> : <RightOutlined />}
                style={{
                  color: tone.accent,
                  background: 'var(--bg-card)',
                  borderRadius: 999,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpanded();
                }}
              />
            ) : null}
          </Space>
        </div>
        {preview ? <div style={{ paddingTop: 4 }}>{preview}</div> : null}
        {expanded && details ? <div style={{ paddingTop: 4 }}>{details}</div> : null}
      </Space>
    </ExecutionDetailSectionCard>
  );
};

export default TimelineNodeCard;
