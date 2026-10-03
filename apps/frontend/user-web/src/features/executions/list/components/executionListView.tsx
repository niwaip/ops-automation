import React from 'react';
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleFilled,
  CopyOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  FileExcelFilled,
  FileImageFilled,
  FilePdfFilled,
  FileProtectOutlined,
  FileTextFilled,
  FileTextOutlined,
  FileWordFilled,
  FileZipFilled,
  HourglassOutlined,
  LoadingOutlined,
  RightOutlined,
  RobotOutlined,
  SafetyCertificateFilled,
  StopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, message as antdMessage, Popover, Tag, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { ExecutionDto, ExecutionStatus } from '@/api/execution';
import {
  getExecutionTime,
  listStatusLabels,
} from '@/features/executions/list/lib/executionListView';
import {
  extractRecordBusinessTitle,
  extractRecordDeliverables,
  formatCustomerFacingResult,
  formatExecutionTimeDisplay,
} from '@/features/executions/list/lib/executionListHelpers';
import styles from '../../pages/ExecutionListPage.module.css';

const { Text } = Typography;

export interface ExecutionListSummaryStats {
  visibleCount: number;
  runningCount: number;
  attentionCount: number;
  completedCount: number;
  skillCoverageCount: number;
  deliverablesCount?: number;
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
  onOpenDetailPage?: (executionId: string) => void;
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
    icon: <HourglassOutlined />,
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
    key: 'deliverables',
    label: '产物已交付',
    value: summaryStats.deliverablesCount ?? summaryStats.skillCoverageCount,
    accentClassName: 'is-neutral',
    icon: <FileDoneOutlined />,
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

const resolveDeliverableIcon = (extension?: string) => {
  const ext = (extension || '').toLowerCase().replace(/^\./, '');
  if (ext === 'doc' || ext === 'docx') {
    return <FileWordFilled style={{ color: '#2563eb', fontSize: 16 }} />;
  }
  if (ext === 'pdf') {
    return <FilePdfFilled style={{ color: '#ef4444', fontSize: 16 }} />;
  }
  if (ext === 'html' || ext === 'htm') {
    return <FileProtectOutlined style={{ color: '#0284c7', fontSize: 16 }} />;
  }
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
    return <FileExcelFilled style={{ color: '#16a34a', fontSize: 16 }} />;
  }
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
    return <FileZipFilled style={{ color: '#d97706', fontSize: 16 }} />;
  }
  if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) {
    return <FileImageFilled style={{ color: '#8b5cf6', fontSize: 16 }} />;
  }
  return <FileTextFilled style={{ color: '#6366f1', fontSize: 16 }} />;
};

export const buildExecutionListColumns = ({
  getSkillDisplayName,
  statusLabels,
  onOpenDetailPage,
}: BuildExecutionListColumnsOptions): TableProps<ExecutionDto>['columns'] => [
  {
    title: '执行时间',
    key: 'time',
    width: 145,
    align: 'left',
    defaultSortOrder: 'descend',
    sorter: (a: ExecutionDto, b: ExecutionDto) => getExecutionTime(a) - getExecutionTime(b),
    render: (_: unknown, record: ExecutionDto) => {
      const timeInfo = formatExecutionTimeDisplay(record);
      return (
        <Tooltip
          title={<div style={{ whiteSpace: 'pre-line' }}>{timeInfo.tooltip}</div>}
          placement="topLeft"
        >
          <div className={styles['execution-list-time-cell']}>
            <span className={styles['execution-list-time-value']}>{timeInfo.compactTime}</span>
            <span
              className={`${styles['execution-list-duration-pill']} ${
                timeInfo.isRunning ? styles['is-running'] : ''
              }`}
            >
              <ClockCircleOutlined style={{ fontSize: 10, marginRight: 3 }} />
              {timeInfo.durationLabel}
            </span>
          </div>
        </Tooltip>
      );
    },
  },
  {
    title: '运行任务',
    key: 'task',
    width: 230,
    align: 'left',
    render: (_: unknown, record: ExecutionDto) => {
      const skillName = getSkillDisplayName(record.skillId);
      const shortId = record.id.slice(0, 8);
      const businessTitle = extractRecordBusinessTitle(record, skillName);
      const runtimeLabel = record.runtimeType
        ? record.runtimeType.charAt(0).toUpperCase() + record.runtimeType.slice(1)
        : null;

      return (
        <div className={styles['execution-list-task-cell']}>
          <div className={styles['execution-list-task-name-row']}>
            <Text
              strong
              ellipsis={{ tooltip: businessTitle }}
              className={styles['execution-list-task-name']}
            >
              {businessTitle}
            </Text>
          </div>
          <div className={styles['execution-list-task-sub-row']}>
            <Tag className={styles['execution-list-skill-tag']} bordered={false}>
              <RobotOutlined style={{ marginRight: 3, fontSize: 11 }} />
              {skillName}
            </Tag>
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
            {record.riskLevel && record.riskLevel !== 'L0' && (
              <span
                className={`${styles['execution-list-risk-tag']} ${
                  styles[`risk-${record.riskLevel.toLowerCase()}`] || ''
                }`}
              >
                {record.riskLevel}
              </span>
            )}
            {runtimeLabel && (
              <span className={styles['execution-list-runtime-tag']}>{runtimeLabel}</span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    title: '运行结果',
    key: 'result',
    minWidth: 260,
    align: 'left',
    render: (_: unknown, record: ExecutionDto) => {
      const resultInfo = formatCustomerFacingResult(record);
      return (
        <div className={styles['execution-list-result-cell']}>
          <div className={styles['execution-list-result-top-row']}>
            {renderStatusBadge(record.status, statusLabels)}
            {resultInfo.subline && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {resultInfo.subline}
              </Text>
            )}
          </div>
          <Tooltip
            title={
              <div style={{ whiteSpace: 'pre-wrap', maxHeight: 280, overflowY: 'auto' }}>
                {resultInfo.tooltipText}
              </div>
            }
            placement="topLeft"
            mouseEnterDelay={0.2}
          >
            <div
              className={`${styles['execution-list-result-text']} ${
                styles[`result-${resultInfo.status}`] || ''
              }`}
            >
              {resultInfo.headline}
            </div>
          </Tooltip>
        </div>
      );
    },
  },
  {
    title: '交付物 / 产物',
    key: 'deliverables',
    width: 220,
    align: 'left',
    render: (_: unknown, record: ExecutionDto) => {
      const deliverables = extractRecordDeliverables(record);
      if (deliverables.length === 0) {
        return (
          <div className={styles['execution-list-deliverable-cell']}>
            <span className={styles['execution-no-deliverable']}>无文件产物 (纯数据)</span>
          </div>
        );
      }

      const primaryItem = deliverables[0];
      const moreCount = deliverables.length - 1;

      const popoverContent = (
        <div className={styles['execution-deliverables-popover-list']}>
          {deliverables.map((item, idx) => (
            <div key={item.id || idx} className={styles['execution-deliverable-popover-item']}>
              <span className={styles['execution-deliverable-icon']}>
                {resolveDeliverableIcon(item.extension)}
              </span>
              <Text ellipsis={{ tooltip: item.name }} className={styles['execution-deliverable-name']}>
                {item.name}
              </Text>
              {item.url && (
                <Button
                  type="link"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(item.url, '_blank');
                  }}
                >
                  下载
                </Button>
              )}
            </div>
          ))}
        </div>
      );

      return (
        <div className={styles['execution-list-deliverable-cell']}>
          <div className={styles['execution-deliverable-primary']}>
            <span className={styles['execution-deliverable-icon']}>
              {resolveDeliverableIcon(primaryItem.extension)}
            </span>
            <Tooltip title={primaryItem.name} placement="top">
              <span className={styles['execution-deliverable-name']}>{primaryItem.name}</span>
            </Tooltip>
            {primaryItem.url && (
              <Tooltip title="直接下载或在新窗口打开预览">
                <Button
                  type="link"
                  size="small"
                  className={styles['execution-deliverable-download-btn']}
                  icon={<DownloadOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(primaryItem.url, '_blank');
                  }}
                >
                  下载
                </Button>
              </Tooltip>
            )}
          </div>
          {moreCount > 0 && (
            <Popover content={popoverContent} title="全部交付成果产物" trigger="hover">
              <Tag className={styles['execution-deliverable-more-tag']}>+ {moreCount} 份产物</Tag>
            </Popover>
          )}
        </div>
      );
    },
  },
  {
    title: '详情',
    key: 'action',
    width: 85,
    align: 'center',
    render: (_: unknown, record: ExecutionDto) => (
      <Tooltip title="进入完整执行详情页面">
        <div className={styles['execution-list-action-cell']}>
          <span
            className={styles['execution-list-view-link']}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetailPage?.(record.id);
            }}
          >
            详情 <RightOutlined style={{ fontSize: 10, marginLeft: 2 }} />
          </span>
        </div>
      </Tooltip>
    ),
  },
];
