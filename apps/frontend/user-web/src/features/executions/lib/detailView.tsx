import type { ReactNode } from 'react';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { Space, Tag, Typography } from 'antd';
import type { BrowserExecutionStepResult } from './browser';
import { asRecord } from './common';

const { Text } = Typography;

export const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n')
    .replace(/^[\s\n]+|[\s\n]+$/g, '');
};

export const previewText = (value: unknown, maxLength = 180) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const formatWaitSeconds = (durationMs: number | undefined): string | undefined => {
  if (typeof durationMs !== 'number' || Number.isNaN(durationMs) || durationMs < 0) {
    return undefined;
  }
  const seconds = durationMs / 1000;
  return Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
};

export const resolveBrowserWaitSeconds = (
  stepResult: BrowserExecutionStepResult,
  output: Record<string, unknown> | null | undefined
): string | undefined => {
  if (stepResult.action !== 'wait') {
    return undefined;
  }
  const outputRecord = asRecord(output) || {};
  const data = asRecord(outputRecord.data) || {};
  const rawDuration = data.duration;
  return typeof rawDuration === 'number' ? formatWaitSeconds(rawDuration) : undefined;
};

export const renderSummaryChips = (
  items: Array<{ label: string; value: ReactNode; color?: string }>
) => {
  const visibleItems = items.filter(
    (item) => item.value !== undefined && item.value !== null && item.value !== ''
  );
  if (!visibleItems.length) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'flex-start',
      }}
    >
      {visibleItems.map((item) => (
        <Tag
          key={`${item.label}-${String(item.value)}`}
          color={item.color}
          style={{
            marginInlineEnd: 0,
            paddingInline: 10,
            paddingBlock: 4,
            borderRadius: 999,
          }}
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

export const renderTimelineDetails = (sections: Array<{ label: string; value: unknown }>) => {
  const visibleSections = sections.filter((section) => {
    if (section.value === undefined || section.value === null) {
      return false;
    }
    if (typeof section.value === 'string') {
      return section.value.trim().length > 0;
    }
    if (Array.isArray(section.value)) {
      return section.value.length > 0;
    }
    if (typeof section.value === 'object') {
      return Object.keys(section.value as Record<string, unknown>).length > 0;
    }
    return true;
  });

  if (!visibleSections.length) {
    return null;
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {visibleSections.map((section) => (
        <div key={section.label}>
          <Text strong>{section.label}</Text>
          <pre
            style={{
              margin: '8px 0 0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 320,
              overflow: 'auto',
            }}
          >
            {typeof section.value === 'string'
              ? section.value
              : JSON.stringify(section.value, null, 2)}
          </pre>
        </div>
      ))}
    </Space>
  );
};

export const stepTypeLabels: Record<string, { zh: string; en: string }> = {
  input_collection: { zh: '输入采集', en: 'Input Collection' },
  approval: { zh: '审批', en: 'Approval' },
  activity: { zh: '活动', en: 'Activity' },
  skill: { zh: '技能', en: 'Skill' },
};

export const stepStatusLabels: Record<string, { zh: string; en: string }> = {
  pending: { zh: '待执行', en: 'Pending' },
  running: { zh: '执行中', en: 'Running' },
  succeeded: { zh: '已成功', en: 'Succeeded' },
  failed: { zh: '失败', en: 'Failed' },
  skipped: { zh: '已跳过', en: 'Skipped' },
  waiting_input: { zh: '待补输入', en: 'Waiting Input' },
  pending_approval: { zh: '待审批', en: 'Pending Approval' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
};

export const stepStatusIcons: Record<string, ReactNode> = {
  pending: <ClockCircleOutlined />,
  running: <PlayCircleOutlined />,
  succeeded: <CheckCircleOutlined style={{ color: 'green' }} />,
  failed: <CloseCircleOutlined style={{ color: 'red' }} />,
  skipped: <PauseCircleOutlined />,
};

export const getBrowserStepColor = (
  _stepResult: BrowserExecutionStepResult,
  index: number,
  stepCount: number,
  hasFailure: boolean
) => {
  if (hasFailure && index === stepCount - 1) {
    return 'red' as const;
  }
  return 'green' as const;
};
