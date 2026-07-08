import React from 'react';
import { Space, Timeline, Typography } from 'antd';
import type { ExecutionStepDto } from '@/api/execution';
import ExecutionErrorAlert from '@/features/executions/components/ExecutionErrorAlert';
import ExecutionSecondaryTextList from '@/features/executions/components/ExecutionSecondaryTextList';
import ExecutionDetailSectionCard from '@/features/executions/components/ExecutionDetailSectionCard';
import ExecutionStatusTag from '@/features/executions/components/ExecutionStatusTag';
import { formatDateTime, getStepStatusColor } from '@/features/executions/lib/listView';

const { Text } = Typography;

interface ExecutionLegacyStepsTimelineProps {
  steps: ExecutionStepDto[];
}

const ExecutionLegacyStepsTimeline: React.FC<ExecutionLegacyStepsTimelineProps> = ({ steps }) => {
  if (steps.length === 0) {
    return null;
  }

  return (
    <Timeline
      items={steps.map((step) => ({
        color: getStepStatusColor(step.status),
        children: (
          <ExecutionDetailSectionCard
            className="execution-detail-timeline-card"
            style={{
              borderRadius: 12,
              border: '1px solid var(--bg-secondary)',
              background: 'var(--bg-card)',
            }}
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                <Space wrap>
                  <Text strong>{`步骤 ${step.stepIndex + 1}`}</Text>
                  <Text>{step.name || step.action || step.type || '-'}</Text>
                </Space>
                <ExecutionStatusTag color={getStepStatusColor(step.status)}>
                  {step.status}
                </ExecutionStatusTag>
              </Space>
              <ExecutionSecondaryTextList
                size={[8, 4]}
                items={[`类型: ${step.type}`, step.action ? `动作: ${step.action}` : null]}
              />
              <ExecutionSecondaryTextList
                direction="vertical"
                size={2}
                items={[
                  `开始: ${formatDateTime(step.startedAt || step.createdAt)}`,
                  `结束: ${formatDateTime(step.endedAt || undefined)}`,
                ]}
              />
              {step.errorMessage ? (
                <ExecutionErrorAlert message="步骤执行失败" description={step.errorMessage} />
              ) : null}
              {step.outputJson && Object.keys(step.outputJson).length > 0 ? (
                <Text type="secondary">{`输出字段: ${Object.keys(step.outputJson).slice(0, 4).join('、')}`}</Text>
              ) : null}
            </Space>
          </ExecutionDetailSectionCard>
        ),
      }))}
    />
  );
};

export default ExecutionLegacyStepsTimeline;
