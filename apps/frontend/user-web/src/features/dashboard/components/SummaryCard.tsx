import { Alert, Button, Card, Space, Tag, Typography } from 'antd';
import SharedMessageContentRenderer from '@chat-web/components/MessageContentRenderer';
import type { WorkbenchSummaryState } from '../lib/workbenchSummaryState';
import styles from '../pages/DashboardPage.module.css';

interface SummaryCardProps {
  dailySummaryPrompt: string;
  formatSummaryTime: (value?: string) => string;
  generateWorkbenchSummary: (
    period: 'daily' | 'weekly',
    prompt: string
  ) => Promise<void>;
  summaryState: WorkbenchSummaryState;
  weeklySummaryPrompt: string;
}

export function SummaryCard({
  dailySummaryPrompt,
  formatSummaryTime,
  generateWorkbenchSummary,
  summaryState,
  weeklySummaryPrompt,
}: SummaryCardProps) {
  return (
    <Card className={styles['workbench-ai-summary-card']}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Tag color="purple" className={styles['workbench-summary-tag']}>
          AI 协同
        </Tag>
        <Typography.Title level={4} className={styles['workbench-summary-heading']}>
          让 AI 帮你整理今天和本周
        </Typography.Title>
        <Typography.Paragraph className={styles['workbench-summary-description']}>
          自动缓存当日与当周总结，适合用于复盘、同步进展或对外汇报。
        </Typography.Paragraph>
        {summaryState.daily.error ? (
          <Alert type="error" showIcon message={summaryState.daily.error} />
        ) : null}
        {summaryState.weekly.error ? (
          <Alert type="error" showIcon message={summaryState.weekly.error} />
        ) : null}
        <div className={styles['workbench-summary-result-grid']}>
          <div className={styles['workbench-summary-result-card']}>
            <div className={styles['workbench-summary-result-head']}>
              <div className={styles['workbench-summary-result-title']}>
                <Typography.Text strong>今日总结</Typography.Text>
                {summaryState.daily.generatedAt ? (
                  <Typography.Text type="secondary">
                    {formatSummaryTime(summaryState.daily.generatedAt)}
                  </Typography.Text>
                ) : null}
              </div>
              <Button
                type="primary"
                className={styles['workbench-summary-button']}
                loading={summaryState.daily.status === 'running'}
                onClick={() => void generateWorkbenchSummary('daily', dailySummaryPrompt)}
              >
                {summaryState.daily.status === 'running' ? '生成中' : '生成'}
              </Button>
            </div>
            <div className={styles['workbench-summary-result-content']}>
              {summaryState.daily.content ? (
                <SharedMessageContentRenderer
                  content={summaryState.daily.content}
                  mode="markdown"
                />
              ) : (
                <Typography.Text type="secondary">
                  若未自动生成，可点击右侧按钮重新生成今日总结。
                </Typography.Text>
              )}
            </div>
          </div>
          <div className={styles['workbench-summary-result-card']}>
            <div className={styles['workbench-summary-result-head']}>
              <div className={styles['workbench-summary-result-title']}>
                <Typography.Text strong>本周总结</Typography.Text>
                {summaryState.weekly.generatedAt ? (
                  <Typography.Text type="secondary">
                    {formatSummaryTime(summaryState.weekly.generatedAt)}
                  </Typography.Text>
                ) : null}
              </div>
              <Button
                className={styles['workbench-summary-button']}
                loading={summaryState.weekly.status === 'running'}
                onClick={() => void generateWorkbenchSummary('weekly', weeklySummaryPrompt)}
              >
                {summaryState.weekly.status === 'running' ? '生成中' : '生成'}
              </Button>
            </div>
            <div className={styles['workbench-summary-result-content']}>
              {summaryState.weekly.content ? (
                <SharedMessageContentRenderer
                  content={summaryState.weekly.content}
                  mode="markdown"
                />
              ) : (
                <Typography.Text type="secondary">
                  若未自动生成，可点击右侧按钮重新生成本周总结。
                </Typography.Text>
              )}
            </div>
          </div>
        </div>
      </Space>
    </Card>
  );
}
