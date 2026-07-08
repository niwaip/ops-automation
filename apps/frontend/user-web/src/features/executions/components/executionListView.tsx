import React from 'react';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  HourglassOutlined,
  RobotOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { ExecutionDto, ExecutionStatus } from '@/api/execution';
import {
  formatCompactExecutionTime,
  getExecutionTime,
  listStatusLabels,
} from '@/features/executions/lib/executionListView';
import { summarizeExecutionListInput } from '@/features/executions/lib/listHelpers';
import { formatDuration } from '@/features/executions/lib/listView';
import { summarizeExecutionListResult } from '@ops/user-core';

const { Text } = Typography;

export interface ExecutionListSummaryStats {
  visibleCount: number;
  runningCount: number;
  attentionCount: number;
  completedCount: number;
  skillCoverageCount: number;
}

export interface ExecutionListSummaryItem {
  key: string;
  label: string;
  value: number;
  accentClassName: string;
  icon: React.ReactNode;
}

const executionStatusTagStyle: React.CSSProperties = {
  marginInlineEnd: 0,
  width: 'fit-content',
  paddingInline: 8,
  borderRadius: 999,
  fontWeight: 600,
  fontSize: 12,
  lineHeight: '18px',
};

interface BuildExecutionListColumnsOptions {
  getSkillDisplayName: (skillId?: string) => string;
  statusColors: Record<string, string>;
  statusLabels: Record<string, string>;
}

export const buildExecutionListOverviewItems = (
  summaryStats: ExecutionListSummaryStats
): ExecutionListSummaryItem[] => [
  {
    key: 'visible',
    label: '当前结果',
    value: summaryStats.visibleCount,
    accentClassName: 'is-primary',
    icon: <AppstoreOutlined />,
  },
  {
    key: 'running',
    label: '进行中',
    value: summaryStats.runningCount,
    accentClassName: 'is-accent',
    icon: <HourglassOutlined />,
  },
  {
    key: 'attention',
    label: '需关注',
    value: summaryStats.attentionCount,
    accentClassName: 'is-danger',
    icon: <WarningOutlined />,
  },
  {
    key: 'completed',
    label: '已完成',
    value: summaryStats.completedCount,
    accentClassName: 'is-success',
    icon: <CheckCircleOutlined />,
  },
  {
    key: 'skills',
    label: '技能覆盖',
    value: summaryStats.skillCoverageCount,
    accentClassName: 'is-neutral',
    icon: <RobotOutlined />,
  },
];

export const buildExecutionListColumns = ({
  getSkillDisplayName,
  statusColors,
  statusLabels,
}: BuildExecutionListColumnsOptions): TableProps<ExecutionDto>['columns'] => [
  {
    title: '技能名称',
    key: 'execution',
    width: 188,
    render: (_: unknown, record: ExecutionDto) => (
      <div className="execution-list-skill-cell">
        <Text
          strong
          ellipsis={{ tooltip: getSkillDisplayName(record.skillId) }}
          className="execution-list-skill-name"
        >
          {getSkillDisplayName(record.skillId)}
        </Text>
      </div>
    ),
  },
  {
    title: '开始时间',
    dataIndex: 'startedAt',
    key: 'startedAt',
    width: 144,
    defaultSortOrder: 'descend',
    sorter: (a: ExecutionDto, b: ExecutionDto) => getExecutionTime(a) - getExecutionTime(b),
    render: (_: string | undefined, record: ExecutionDto) => (
      <div className="execution-list-time-cell">
        <Text className="execution-list-time-value">
          {formatCompactExecutionTime(record.startedAt || record.createdAt)}
        </Text>
        <Text type="secondary" className="execution-list-time-duration">
          {formatDuration(record)}
        </Text>
      </div>
    ),
  },
  {
    title: '状态',
    key: 'status',
    width: 76,
    render: (_: unknown, record: ExecutionDto) => (
      <Tag color={statusColors[record.status]} style={executionStatusTagStyle}>
        {listStatusLabels[record.status as ExecutionStatus] ||
          statusLabels[record.status] ||
          record.status}
      </Tag>
    ),
  },
  {
    title: '用户输入',
    key: 'input',
    width: 292,
    ellipsis: true,
    render: (_: unknown, record: ExecutionDto) => (
      <div className="execution-list-summary-cell">
        <Text className="execution-list-summary-text">{summarizeExecutionListInput(record)}</Text>
      </div>
    ),
  },
  {
    title: '结果摘要',
    key: 'result',
    width: 292,
    ellipsis: true,
    render: (_: unknown, record: ExecutionDto) => (
      <div className="execution-list-summary-cell is-result">
        <Text className="execution-list-summary-text">{summarizeExecutionListResult(record)}</Text>
      </div>
    ),
  },
];
