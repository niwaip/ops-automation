import { useState } from 'react';
import { Alert, Button, Card, Empty, Segmented, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
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
  const [activePeriod, setActivePeriod] = useState<'daily' | 'weekly'>('daily');

  const currentSummary = activePeriod === 'daily' ? summaryState.daily : summaryState.weekly;
  const currentPrompt = activePeriod === 'daily' ? dailySummaryPrompt : weeklySummaryPrompt;
  const periodLabel = activePeriod === 'daily' ? '今日总结' : '本周总结';

  return (
    <Card
      className={styles['workbench-panel']}
      title={
        <div className={styles['workbench-summary-head-title']}>
          <Typography.Text strong className={styles['workbench-panel-title']}>
            AI 工作复盘
          </Typography.Text>
          <Segmented
            value={activePeriod}
            onChange={(val) => setActivePeriod(val as 'daily' | 'weekly')}
            size="small"
            className={styles['workbench-segmented-filter']}
            options={[
              { label: '今日总结', value: 'daily' },
              { label: '本周总结', value: 'weekly' },
            ]}
          />
        </div>
      }
      extra={
        <Space size={12} align="center">
          {currentSummary.generatedAt ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              更新于 {formatSummaryTime(currentSummary.generatedAt)}
            </Typography.Text>
          ) : null}
          <Button
            type="primary"
            size="small"
            icon={<ReloadOutlined spin={currentSummary.status === 'running'} />}
            loading={currentSummary.status === 'running'}
            onClick={() => void generateWorkbenchSummary(activePeriod, currentPrompt)}
            className={styles['workbench-compact-btn-primary']}
            style={{ position: 'static', transform: 'none' }}
          >
            {currentSummary.status === 'running' ? '生成中...' : currentSummary.content ? '重新生成' : '立即生成'}
          </Button>
        </Space>
      }
    >
      <div className={styles['workbench-summary-full-wrapper']}>
        {currentSummary.error ? (
          <Alert type="error" showIcon message={currentSummary.error} style={{ marginBottom: 12 }} />
        ) : null}

        <div className={styles['workbench-summary-result-content-full']}>
          {currentSummary.content ? (
            <SharedMessageContentRenderer
              content={currentSummary.content}
              mode="markdown"
            />
          ) : (
            <div className={styles['workbench-summary-empty']}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    暂无{periodLabel}内容，点击右上方「立即生成」进行整理
                  </span>
                }
              >
                <Button
                  type="primary"
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={currentSummary.status === 'running'}
                  onClick={() => void generateWorkbenchSummary(activePeriod, currentPrompt)}
                >
                  生成{periodLabel}
                </Button>
              </Empty>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
