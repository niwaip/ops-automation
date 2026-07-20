import { CheckOutlined, EyeOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Space, Tag, Typography } from 'antd';
import {
  EXECUTION_STATUS_LABELS_ZH,
  type ExecutionDto,
  type ExecutionStatus,
} from '@ops/user-core';
import { formatMonthDayTime } from '@/shared/utils/dateText';

const WORKBENCH_EXECUTION_TAG_COLORS: Partial<Record<ExecutionStatus, string>> = {
  human_control: 'gold',
  pending_approval: 'warning',
  waiting_input: 'orange',
  failed: 'error',
  running: 'processing',
};

interface PriorityQueueCardProps {
  items: ExecutionDto[];
  getExecutionDisplayDescription: (execution: ExecutionDto) => string;
  getExecutionDisplayTime: (execution: ExecutionDto) => string;
  getSkillDisplayName: (skillId?: string) => string;
  onIgnoreItem: (executionId: string) => void;
  onOpenExecution: (executionId: string) => void;
  onViewAll: () => void;
}

export function PriorityQueueCard({
  items,
  getExecutionDisplayDescription,
  getExecutionDisplayTime,
  getSkillDisplayName,
  onIgnoreItem,
  onOpenExecution,
  onViewAll,
}: PriorityQueueCardProps) {
  return (
    <Card
      className="workbench-panel"
      title={
        <div className="workbench-panel-header">
          <Typography.Text strong className="workbench-panel-title">
            优先处理
          </Typography.Text>
        </div>
      }
      extra={
        <Button type="link" className="workbench-action-button" onClick={onViewAll}>
          查看全部
        </Button>
      }
    >
      {items.length === 0 ? (
        <Empty description="当前没有待人工处理、失败或执行中的记录" />
      ) : (
        <div className="workbench-queue-list">
          {items.map((item) => (
            <div
              key={item.id}
              className={`workbench-queue-item${item.status === 'human_control' || item.status === 'failed' ? ' is-priority' : ''}`}
            >
              <div className="workbench-queue-row">
                <div className="workbench-queue-main">
                  <Typography.Paragraph
                    className="workbench-queue-desc strong"
                    style={{ margin: 0 }}
                    ellipsis={{
                      rows: 2,
                      tooltip: getExecutionDisplayDescription(item),
                    }}
                  >
                    {getExecutionDisplayDescription(item)}
                  </Typography.Paragraph>
                  <Space size={[6, 6]} wrap className="workbench-queue-meta">
                    <Tag color={WORKBENCH_EXECUTION_TAG_COLORS[item.status]}>
                      {EXECUTION_STATUS_LABELS_ZH[item.status] || item.status}
                    </Tag>
                    <Typography.Text type="secondary">
                      {getSkillDisplayName(item.skillId)}
                    </Typography.Text>
                  </Space>
                </div>
                <div className="workbench-queue-actions">
                  <Button
                    type="primary"
                    size="small"
                    className="workbench-action-button workbench-queue-action"
                    icon={<EyeOutlined />}
                    title="详细"
                    aria-label="详细"
                    onClick={() => onOpenExecution(item.id)}
                  />
                  <Button
                    size="small"
                    className="workbench-action-button workbench-queue-action"
                    icon={<CheckOutlined />}
                    title="忽略"
                    aria-label="忽略"
                    onClick={() => onIgnoreItem(item.id)}
                  />
                  <Typography.Text type="secondary" className="workbench-queue-time">
                    {formatMonthDayTime(getExecutionDisplayTime(item))}
                  </Typography.Text>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
