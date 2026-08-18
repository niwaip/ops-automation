import { ArrowRightOutlined, CheckCircleFilled, ClockCircleOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Tooltip, Typography } from 'antd';
import { summarizeExecutionListResult, type ExecutionDto } from '@ops/user-core';
import { formatMonthDayTime } from '@/shared/utils/dateText';
import styles from '../pages/DashboardPage.module.css';

const formatExecutionDuration = (item: ExecutionDto): string | null => {
  if (!item.startedAt || !item.endedAt) return null;
  const start = new Date(item.startedAt).getTime();
  const end = new Date(item.endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  return `${mins}分${remSecs}秒`;
};

const compactText = (value: string, max = 52): string =>
  value.length > max ? `${value.slice(0, max).trim()}...` : value;

interface RecentExecutionsCardProps {
  items: ExecutionDto[];
  getExecutionDisplayDescription: (execution: ExecutionDto) => string;
  getExecutionDisplayTime: (execution: ExecutionDto) => string;
  onOpenExecution: (executionId: string) => void;
  onViewAll: () => void;
}

export function RecentExecutionsCard({
  items,
  getExecutionDisplayDescription,
  getExecutionDisplayTime,
  onOpenExecution,
  onViewAll,
}: RecentExecutionsCardProps) {
  return (
    <Card
      className={styles['workbench-panel']}
      title={
        <div className={styles['workbench-panel-header']}>
          <Typography.Text strong className={styles['workbench-panel-title']}>
            最近完成
          </Typography.Text>
        </div>
      }
      extra={
        <Button type="link" className={styles['workbench-action-button']} onClick={onViewAll}>
          查看列表
        </Button>
      }
    >
      {items.length === 0 ? (
        <Empty description="最近还没有正常完成的执行" />
      ) : (
        <div className={styles['workbench-history-grid']}>
          {items.map((item) => {
            const rawSummary = summarizeExecutionListResult(item);
            const fullResultText =
              rawSummary ||
              getExecutionDisplayDescription(item) ||
              '已正常完成执行';
            const displayText = compactText(fullResultText, 52);
            const displayTime = formatMonthDayTime(getExecutionDisplayTime(item));
            const duration = formatExecutionDuration(item);
            const shortId = item.id.slice(0, 8);

            return (
              <div
                key={item.id}
                className={styles['workbench-history-tile']}
                onClick={() => onOpenExecution(item.id)}
              >
                <div className={styles['workbench-history-tile-header']}>
                  <div className={styles['workbench-history-tile-badge']}>
                    <CheckCircleFilled className={styles['workbench-history-success-icon']} />
                    <span className={styles['workbench-history-id-tag']}>#{shortId}</span>
                  </div>
                  <Tooltip title="查看执行详情" placement="top">
                    <Button
                      type="text"
                      shape="circle"
                      size="small"
                      className={styles['workbench-history-icon-btn']}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenExecution(item.id);
                      }}
                      icon={<ArrowRightOutlined />}
                    />
                  </Tooltip>
                </div>

                <Tooltip
                  title={<div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 240, overflowY: 'auto', padding: '2px 4px' }}>{fullResultText}</div>}
                  placement="top"
                  mouseEnterDelay={0.15}
                >
                  <div className={styles['workbench-history-preview']}>
                    {displayText}
                  </div>
                </Tooltip>

                <div className={styles['workbench-history-meta']}>
                  <div className={styles['workbench-history-time-pill']}>
                    <ClockCircleOutlined style={{ fontSize: 11 }} />
                    <span>{displayTime}</span>
                    {duration ? <span className={styles['workbench-history-duration']}>{duration}</span> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
