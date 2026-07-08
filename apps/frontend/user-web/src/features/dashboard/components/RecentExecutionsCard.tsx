import { Button, Card, Empty, Typography } from 'antd';
import type { ExecutionDto } from '@ops/user-core';
import { formatMonthDayTime } from '@/shared/lib/dateText';

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
      className="workbench-panel"
      title={
        <div className="workbench-panel-header">
          <Typography.Text strong className="workbench-panel-title">
            最近完成
          </Typography.Text>
        </div>
      }
      extra={
        <Button type="link" className="workbench-action-button" onClick={onViewAll}>
          查看列表
        </Button>
      }
    >
      {items.length === 0 ? (
        <Empty description="最近还没有正常完成的执行" />
      ) : (
        <div className="workbench-history-grid">
          {items.map((item) => (
            <div key={item.id} className="workbench-history-tile">
              <div className="workbench-history-preview">
                {compactText(getExecutionDisplayDescription(item), 32)}
              </div>
              <div className="workbench-history-meta compact">
                <span>{formatMonthDayTime(getExecutionDisplayTime(item))}</span>
                <Button
                  type="link"
                  size="small"
                  className="workbench-history-detail-button"
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
