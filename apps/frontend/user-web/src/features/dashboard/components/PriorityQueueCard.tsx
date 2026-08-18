import { CheckOutlined, EyeOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Space, Tag, Typography } from 'antd';
import {
  EXECUTION_STATUS_LABELS_ZH,
  type ExecutionDto,
  type ExecutionStatus,
} from '@ops/user-core';
import { formatMonthDayTime } from '@/shared/utils/dateText';
import styles from '../pages/DashboardPage.module.css';

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
  onIgnoreAll?: () => void;
  onOpenExecution: (executionId: string) => void;
  onViewAll: () => void;
}

export function PriorityQueueCard({
  items,
  getExecutionDisplayDescription,
  getExecutionDisplayTime,
  getSkillDisplayName,
  onIgnoreItem,
  onIgnoreAll,
  onOpenExecution,
  onViewAll,
}: PriorityQueueCardProps) {
  return (
    <Card
      className={styles['workbench-panel']}
      title={
        <div className={styles['workbench-panel-header']}>
          <Typography.Text strong className={styles['workbench-panel-title']}>
            优先处理
          </Typography.Text>
        </div>
      }
      extra={
        <Space size={4}>
          {items.length > 0 && onIgnoreAll ? (
            <Button type="link" className={styles['workbench-action-button']} onClick={onIgnoreAll}>
              全部无视
            </Button>
          ) : null}
          <Button type="link" className={styles['workbench-action-button']} onClick={onViewAll}>
            查看全部
          </Button>
        </Space>
      }
    >
      {items.length === 0 ? (
        <Empty description="当前没有待人工处理、失败或执行中的记录" />
      ) : (
        <div className={styles['workbench-queue-list']}>
          {items.map((item) => (
            <div
              key={item.id}
              className={`${styles['workbench-queue-item']}${item.status === 'human_control' || item.status === 'failed' ? ` ${styles['is-priority']}` : ''}`}
            >
              <div className={styles['workbench-queue-row']}>
                <div className={styles['workbench-queue-main']}>
                  <Typography.Paragraph
                    className={`${styles['workbench-queue-desc']} ${styles.strong}`}
                    style={{ margin: 0 }}
                    ellipsis={{
                      rows: 2,
                      tooltip: getExecutionDisplayDescription(item),
                    }}
                  >
                    {getExecutionDisplayDescription(item)}
                  </Typography.Paragraph>
                  <Space size={[6, 6]} wrap className={styles['workbench-queue-meta']}>
                    <Tag color={WORKBENCH_EXECUTION_TAG_COLORS[item.status]}>
                      {EXECUTION_STATUS_LABELS_ZH[item.status] || item.status}
                    </Tag>
                    <Typography.Text type="secondary">
                      {getSkillDisplayName(item.skillId)}
                    </Typography.Text>
                  </Space>
                </div>
                <div className={styles['workbench-queue-actions']}>
                  <Button
                    type="primary"
                    size="small"
                    className={`${styles['workbench-action-button']} ${styles['workbench-queue-action']}`}
                    icon={<EyeOutlined />}
                    title="详细"
                    aria-label="详细"
                    onClick={() => onOpenExecution(item.id)}
                  />
                  <Button
                    size="small"
                    className={`${styles['workbench-action-button']} ${styles['workbench-queue-action']}`}
                    icon={<CheckOutlined />}
                    title="忽略"
                    aria-label="忽略"
                    onClick={() => onIgnoreItem(item.id)}
                  />
                  <Typography.Text type="secondary" className={styles['workbench-queue-time']}>
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
