import React from 'react';
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  CloseCircleFilled,
  CopyOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  HourglassOutlined,
  LoadingOutlined,
  RightOutlined,
  RobotOutlined,
  SafetyCertificateFilled,
  StopOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { message as antdMessage, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { ExecutionDto, ExecutionStatus } from '@/api/execution';
import {
  formatCompactExecutionTime,
  getExecutionTime,
  listStatusLabels,
} from '@/features/executions/list/lib/executionListView';
import { summarizeExecutionListInput } from '@/features/executions/list/lib/listHelpers';
import { formatDuration } from '@/features/executions/list/lib/listView';
import { summarizeExecutionListResult } from '@ops/user-core';
import styles from '../../pages/ExecutionListPage.module.css';

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
  statusFilterValue?: ExecutionStatus | 'all';
}

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
    label: '全部任务',
    value: summaryStats.visibleCount,
    accentClassName: 'is-primary',
    icon: <FileTextOutlined />,
    statusFilterValue: 'all',
  },
  {
    key: 'running',
    label: '进行中',
    value: summaryStats.runningCount,
    accentClassName: 'is-accent',
    icon: <HourglassOutlined />,
    statusFilterValue: 'running',
  },
  {
    key: 'attention',
    label: '异常 / 需关注',
    value: summaryStats.attentionCount,
    accentClassName: 'is-danger',
    icon: <WarningOutlined />,
    statusFilterValue: 'failed',
  },
  {
    key: 'completed',
    label: '已完成',
    value: summaryStats.completedCount,
    accentClassName: 'is-success',
    icon: <CheckCircleOutlined />,
    statusFilterValue: 'succeeded',
  },
  {
    key: 'skills',
    label: '涉及员工数',
    value: summaryStats.skillCoverageCount,
    accentClassName: 'is-neutral',
    icon: <RobotOutlined />,
  },
];

const renderStatusBadge = (status: ExecutionStatus | string, statusLabels: Record<string, string>) => {
  const label = listStatusLabels[status as ExecutionStatus] || statusLabels[status] || status;

  switch (status) {
    case 'succeeded':
    case 'completed':
      return (
        <span className={`${styles['execution-status-pill']} ${styles['status-succeeded']}`}>
          <CheckCircleFilled className={styles['execution-status-pill-icon']} />
          <span>{label}</span>
        </span>
      );
    case 'running':
      return (
        <span className={`${styles['execution-status-pill']} ${styles['status-running']}`}>
          <LoadingOutlined spin className={styles['execution-status-pill-icon']} />
          <span>{label}</span>
        </span>
      );
    case 'failed':
      return (
        <span className={`${styles['execution-status-pill']} ${styles['status-failed']}`}>
          <CloseCircleFilled className={styles['execution-status-pill-icon']} />
          <span>{label}</span>
        </span>
      );
    case 'waiting_input':
      return (
        <span className={`${styles['execution-status-pill']} ${styles['status-waiting']}`}>
          <HourglassOutlined className={styles['execution-status-pill-icon']} />
          <span>{label}</span>
        </span>
      );
    case 'pending_approval':
      return (
        <span className={`${styles['execution-status-pill']} ${styles['status-approval']}`}>
          <SafetyCertificateFilled className={styles['execution-status-pill-icon']} />
          <span>{label}</span>
        </span>
      );
    case 'human_control':
      return (
        <span className={`${styles['execution-status-pill']} ${styles['status-takeover']}`}>
          <TeamOutlined className={styles['execution-status-pill-icon']} />
          <span>{label}</span>
        </span>
      );
    case 'cancelled':
      return (
        <span className={`${styles['execution-status-pill']} ${styles['status-cancelled']}`}>
          <StopOutlined className={styles['execution-status-pill-icon']} />
          <span>{label}</span>
        </span>
      );
    default:
      return (
        <span className={`${styles['execution-status-pill']} ${styles['status-default']}`}>
          <span>{label}</span>
        </span>
      );
  }
};

export const buildExecutionListColumns = ({
  getSkillDisplayName,
  statusLabels,
}: BuildExecutionListColumnsOptions): TableProps<ExecutionDto>['columns'] => [
  {
    title: '任务 / 执行单号',
    key: 'task',
    width: 210,
    align: 'left',
    render: (_: unknown, record: ExecutionDto) => {
      const skillName = getSkillDisplayName(record.skillId);
      const shortId = record.id.slice(0, 8);
      const runtimeLabel = record.runtimeType
        ? record.runtimeType.charAt(0).toUpperCase() + record.runtimeType.slice(1)
        : null;

      return (
        <div className={styles['execution-list-task-cell']}>
          <div className={styles['execution-list-task-name-row']}>
            <RobotOutlined className={styles['execution-list-task-icon']} />
            <Text
              strong
              ellipsis={{ tooltip: skillName }}
              className={styles['execution-list-task-name']}
            >
              {skillName}
            </Text>
          </div>
          <div className={styles['execution-list-task-sub-row']}>
            <Tooltip title={`执行单完整 ID: ${record.id} (点击复制)`}>
              <span
                className={styles['execution-list-id-tag']}
                onClick={(e) => {
                  e.stopPropagation();
                  void navigator.clipboard.writeText(record.id);
                  void antdMessage.success('已复制执行单 ID');
                }}
              >
                #{shortId}
                <CopyOutlined className={styles['execution-list-id-copy-icon']} />
              </span>
            </Tooltip>
            {runtimeLabel && (
              <span className={styles['execution-list-runtime-tag']}>{runtimeLabel}</span>
            )}
            {record.riskLevel && record.riskLevel !== 'L0' && (
              <span
                className={`${styles['execution-list-risk-tag']} ${
                  styles[`risk-${record.riskLevel.toLowerCase()}`] || ''
                }`}
              >
                {record.riskLevel}
              </span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 105,
    align: 'center',
    render: (_: unknown, record: ExecutionDto) => renderStatusBadge(record.status, statusLabels),
  },
  {
    title: '输入目标',
    key: 'input',
    width: 220,
    align: 'left',
    ellipsis: true,
    render: (_: unknown, record: ExecutionDto) => {
      const inputText = summarizeExecutionListInput(record);
      return (
        <div className={styles['execution-list-summary-cell']}>
          <Text className={styles['execution-list-summary-text']} ellipsis={{ tooltip: inputText }}>
            {inputText || '-'}
          </Text>
        </div>
      );
    },
  },
  {
    title: '交付成果 / 异常排查',
    key: 'result',
    align: 'left',
    ellipsis: true,
    render: (_: unknown, record: ExecutionDto) => {
      const isFailed = record.status === 'failed';
      const isRunning = ['running', 'waiting_input', 'pending_approval'].includes(record.status);
      const resultText = summarizeExecutionListResult(record);
      const failureReason =
        record.failureReason?.trim() || record.failureCode?.trim() || record.takeoverReason?.trim();
      const artifactsCount = record.normalizedResult?.artifacts?.length || 0;
      const hasDownload = Boolean(
        record.normalizedResult?.downloadUrl || (record.normalizedResult as any)?.fileUrl
      );

      if (isFailed) {
        return (
          <div className={`${styles['execution-list-summary-cell']} ${styles['is-failed']}`}>
            <div className={styles['execution-failure-badge']}>
              <WarningOutlined style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
              <Text
                className={styles['execution-failure-text']}
                ellipsis={{ tooltip: failureReason || resultText || '执行异常中断' }}
              >
                {failureReason || resultText || '执行异常中断，请查看任务详情'}
              </Text>
            </div>
          </div>
        );
      }

      if (isRunning) {
        return (
          <div className={`${styles['execution-list-summary-cell']} ${styles['is-running']}`}>
            <div className={styles['execution-running-badge']}>
              <LoadingOutlined style={{ color: '#3b82f6', flexShrink: 0 }} />
              <Text className={styles['execution-running-text']}>
                {record.currentPhaseStatus || '流程正在执行中...'}
              </Text>
            </div>
          </div>
        );
      }

      return (
        <div className={`${styles['execution-list-summary-cell']} ${styles['is-result']}`}>
          <Text className={styles['execution-list-summary-text']} ellipsis={{ tooltip: resultText }}>
            {resultText || '任务执行成功完成'}
          </Text>
          {artifactsCount > 0 || hasDownload ? (
            <div className={styles['execution-artifact-chip']}>
              <FileDoneOutlined style={{ fontSize: 11, color: '#10b981' }} />
              <span>{artifactsCount > 0 ? `生成 ${artifactsCount} 个产物` : '产物文件已就绪'}</span>
            </div>
          ) : null}
        </div>
      );
    },
  },
  {
    title: '开始时间 / 耗时',
    dataIndex: 'startedAt',
    key: 'startedAt',
    width: 130,
    align: 'center',
    defaultSortOrder: 'descend',
    sorter: (a: ExecutionDto, b: ExecutionDto) => getExecutionTime(a) - getExecutionTime(b),
    render: (_: string | undefined, record: ExecutionDto) => (
      <div className={styles['execution-list-time-cell']}>
        <span className={styles['execution-list-time-value']}>
          {formatCompactExecutionTime(record.startedAt || record.createdAt)}
        </span>
        <span className={styles['execution-list-duration-pill']}>
          {formatDuration(record)}
        </span>
      </div>
    ),
  },
  {
    title: '详情',
    key: 'action',
    width: 75,
    align: 'center',
    render: () => (
      <div className={styles['execution-list-action-cell']}>
        <span className={styles['execution-list-view-link']}>
          查看 <RightOutlined style={{ fontSize: 10, marginLeft: 2 }} />
        </span>
      </div>
    ),
  },
];
