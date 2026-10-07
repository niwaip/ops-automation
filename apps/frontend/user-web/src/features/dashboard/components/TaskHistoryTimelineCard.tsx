import React from 'react';
import { Card, Space, Tag, Button } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { formatMonthDayTime } from '../../../shared/utils/dateText';

export interface TaskHistoryTimelineCardProps {
  cleanedRawContent?: string | null;
  itemTitle?: string;
  hasParams: boolean;
  params: Record<string, any>;
  initiatorName?: string;
  createdAt?: string;
  actions?: Array<{
    operatorName?: string;
    action?: string;
    comment?: string;
    timestamp?: string;
  }>;
  isHistoryCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const TaskHistoryTimelineCard: React.FC<TaskHistoryTimelineCardProps> = ({
  cleanedRawContent,
  itemTitle,
  hasParams,
  params,
  initiatorName,
  createdAt,
  actions = [],
  isHistoryCollapsed,
  onToggleCollapse,
}) => {
  const hasInitialNote = Boolean(
    cleanedRawContent &&
    cleanedRawContent !== itemTitle &&
    (!hasParams || !Object.values(params).some((val) => typeof val === 'string' && val.trim() === cleanedRawContent?.trim()))
  );
  const actionList = Array.isArray(actions) ? actions : [];
  const totalHistoryCount = (hasInitialNote ? 1 : 0) + actionList.length;

  if (totalHistoryCount === 0) return null;

  return (
    <Card
      size="small"
      title={
        <div
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          onClick={onToggleCollapse}
        >
          <Space size={6}>
            {isHistoryCollapsed ? (
              <DownOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
            ) : (
              <UpOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
            )}
            <span style={{ fontSize: 12, fontWeight: 600 }}>🕒 历史流转历程与留言记录</span>
            <Tag color="default" bordered={false} style={{ fontSize: 11, margin: 0 }}>
              {totalHistoryCount} 条记录
            </Tag>
          </Space>
        </div>
      }
      extra={
        <Button
          type="link"
          size="small"
          icon={isHistoryCollapsed ? <DownOutlined /> : <UpOutlined />}
          onClick={onToggleCollapse}
          style={{ fontSize: 12, padding: 0 }}
        >
          {isHistoryCollapsed ? '展开记录' : '收起记录'}
        </Button>
      }
      styles={{
        body: isHistoryCollapsed
          ? { display: 'none' }
          : { padding: '10px 14px' },
      }}
      style={{
        background: 'var(--bg-secondary, rgba(148, 163, 184, 0.05))',
        borderColor: 'var(--border-color, rgba(148, 163, 184, 0.14))',
        borderRadius: 8,
      }}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {/* 1. 初始发起附言 */}
        {hasInitialNote ? (
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            <Space size={6} wrap align="center">
              <strong style={{ color: 'var(--text-primary)' }}>
                @{initiatorName || '经办发起人'}
              </strong>
              <Tag color="cyan" style={{ fontSize: 11, margin: 0 }}>
                初始发起需求
              </Tag>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {formatMonthDayTime(createdAt)}
              </span>
            </Space>
            <div
              style={{
                marginTop: 4,
                color: 'var(--text-secondary)',
                paddingLeft: 8,
                borderLeft: '2px solid rgba(22, 119, 255, 0.4)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
              dangerouslySetInnerHTML={{
                __html: (cleanedRawContent || '')
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\n/g, '<br />'),
              }}
            />
          </div>
        ) : null}

        {/* 2. 各节点审批与流转记录 */}
        {actionList.map((act, idx) => (
          <div key={idx} style={{ fontSize: 12, lineHeight: 1.5 }}>
            <Space size={6} wrap align="center">
              <strong style={{ color: 'var(--text-primary)' }}>
                @{act.operatorName || '协同成员'}
              </strong>
              <Tag
                color={
                  act.action === 'reject'
                    ? 'error'
                    : act.action === 'complete'
                    ? 'purple'
                    : 'blue'
                }
                style={{ fontSize: 11, margin: 0 }}
              >
                {act.action === 'reject'
                  ? '驳回修改'
                  : act.action === 'complete'
                  ? '办结提交'
                  : '确认流转'}
              </Tag>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {formatMonthDayTime(act.timestamp)}
              </span>
            </Space>
            {act.comment ? (
              <div
                style={{
                  marginTop: 4,
                  color: 'var(--text-secondary)',
                  paddingLeft: 8,
                  borderLeft: `2px solid ${
                    act.action === 'reject'
                      ? 'rgba(255, 77, 79, 0.5)'
                      : 'rgba(148, 163, 184, 0.3)'
                  }`,
                }}
              >
                {act.comment}
              </div>
            ) : null}
          </div>
        ))}
      </Space>
    </Card>
  );
};
