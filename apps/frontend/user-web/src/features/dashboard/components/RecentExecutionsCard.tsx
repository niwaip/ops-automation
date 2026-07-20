import { Button, Card, Empty, Typography } from 'antd';
import type { ExecutionDto } from '@ops/user-core';
import { formatMonthDayTime } from '@/shared/utils/dateText';
import styles from '../pages/DashboardPage.module.css';

const compactText = (value: string, max = 42): string =>
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
          {items.map((item) => (
            <div key={item.id} className={styles['workbench-history-tile']}>
              <div className={styles['workbench-history-preview']}>
                {compactText(getExecutionDisplayDescription(item), 32)}
              </div>
              <div className={`${styles['workbench-history-meta']} ${styles.compact}`}>
                <span>{formatMonthDayTime(getExecutionDisplayTime(item))}</span>
                <Button
                  type="link"
                  size="small"
                  className={styles['workbench-history-detail-button']}
                  onClick={() => onOpenExecution(item.id)}
                >
                  查看详细
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
