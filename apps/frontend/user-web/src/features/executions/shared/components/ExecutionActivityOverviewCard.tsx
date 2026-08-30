import React from 'react';
import { Button, Descriptions, Space, Steps, Tag, Typography } from 'antd';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto, ExecutionStatus } from '@/api/execution';
import ExecutionDetailInfoBlock from '@/features/executions/detail/components/ExecutionDetailInfoBlock';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import ExecutionStatusSummaryTags from '@/features/executions/shared/components/ExecutionStatusSummaryTags';
import type { ExecutionLoopSummary } from '@/features/executions/shared/lib/executionSummary';
import { getPhaseStatusColor, getPhaseStatusLabel, getPhaseStepStatus } from '@/features/executions/shared/lib/phase';
import { formatPhaseDisplayName } from '@/features/executions/shared/lib/phaseText';
import { formatLocalizedDateTime } from '@/shared/utils/dateText';
import { ExpandableMarkdownContent } from '@/features/executions/shared/components/ExecutionPayloadContent';

const { Text } = Typography;

interface ExecutionActivityOverviewCardLabels {
  stepsProgress: string;
  executionSummaryTitle: string;
  skillLabel: string;
  detailButton: string;
  processingSummary: string;
  noSummary: string;
  executionSummaryHint: string;
  endedAt: string;
  totalActivities: string;
  completedActivities: string;
  pendingActivities: string;
  loopCount: string;
  progressOverview: string;
  latestUpdate: string;
  processedItems: string;
  manualHandledFlag: string;
  autoApprovedItems: string;
  manualHandledItems: string;
  currentPhase: string;
  currentStepLabel: string;
  step: string;
  currentActivity: string;
  currentStepHint: string;
  yes: string;
  no: string;
}

interface ExecutionActivityOverviewCardProps {
  execution: ExecutionDto;
  isEnglish: boolean;
  displayActivityPhases: ExecutionPhaseDto[];
  shouldShowExecutionSummary: boolean;
  shouldShowLiveProgressInfo: boolean;
  currentPhase?: ExecutionPhaseDto;
  currentExecutionStep?: ExecutionStepDto;
  activityProgressCurrent: number;
  completedActivityCount: number;
  pendingActivityCount: number;
  totalLoopCount: number;
  currentPhaseLoopIteration?: number;
  latestActivityUpdateAt?: string;
  summaryHeadline?: string;
  loopSummary?: ExecutionLoopSummary | null;
  skillDisplayName: string;
  labels: ExecutionActivityOverviewCardLabels;
  onOpenPhaseTimeline: () => void;
  getExecutionStatusColor: (status?: ExecutionStatus | string) => string;
  getExecutionStatusLabel: (status?: ExecutionStatus | string) => string;
}

const ExecutionActivityOverviewCard: React.FC<ExecutionActivityOverviewCardProps> = ({
  execution,
  isEnglish,
  displayActivityPhases,
  shouldShowExecutionSummary,
  shouldShowLiveProgressInfo,
  currentPhase,
  currentExecutionStep,
  activityProgressCurrent,
  completedActivityCount,
  pendingActivityCount,
  totalLoopCount,
  currentPhaseLoopIteration,
  latestActivityUpdateAt,
  summaryHeadline,
  loopSummary,
  skillDisplayName,
  labels,
  onOpenPhaseTimeline,
  getExecutionStatusColor,
  getExecutionStatusLabel,
}) => {
  return shouldShowExecutionSummary ? (
    <ExecutionDetailSectionCard title={labels.executionSummaryTitle} style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <ExecutionDetailInfoBlock style={{ display: 'grid', gap: 10 }}>
          <Space wrap size={[12, 8]} style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space wrap size={[8, 8]}>
              <Text type="secondary">{labels.skillLabel}</Text>
              <Text strong>{skillDisplayName}</Text>
            </Space>
            <Button size="small" onClick={onOpenPhaseTimeline}>
              {labels.detailButton}
            </Button>
          </Space>
          <div style={{ display: 'grid', gap: 6, width: '100%', maxWidth: '100%' }}>
            <Text type="secondary">{labels.processingSummary}</Text>
            {summaryHeadline ? (
              <ExpandableMarkdownContent
                text={summaryHeadline}
                maxCollapsedLines={15}
                maxCollapsedHeight={360}
              />
            ) : (
              <Text strong>{labels.noSummary}</Text>
            )}
          </div>
          <Space wrap size={[12, 8]}>
            <Text type="secondary">{labels.executionSummaryHint}</Text>
            {execution.endedAt ? (
              <Text type="secondary">
                {`${labels.endedAt}: ${formatLocalizedDateTime(execution.endedAt)}`}
              </Text>
            ) : null}
            {execution.failureReason ? <Text type="danger">{execution.failureReason}</Text> : null}
          </Space>
        </ExecutionDetailInfoBlock>
        <ExecutionStatusSummaryTags
          items={[
            {
              text: getExecutionStatusLabel(execution.status),
              color: getExecutionStatusColor(execution.status),
            },
            { text: `${labels.totalActivities}: ${displayActivityPhases.length}` },
            { text: `${labels.completedActivities}: ${completedActivityCount}`, color: 'green' },
            totalLoopCount > 0 ? { text: `${labels.loopCount}: ${totalLoopCount}` } : null,
          ]}
        />
        <Descriptions column={2} size="small">
          <Descriptions.Item label={labels.progressOverview}>
            {`${completedActivityCount} / ${displayActivityPhases.length}`}
          </Descriptions.Item>
          <Descriptions.Item label={labels.latestUpdate}>
            {formatLocalizedDateTime(latestActivityUpdateAt)}
          </Descriptions.Item>
          {loopSummary ? (
            <Descriptions.Item label={labels.processedItems}>{loopSummary.totalItems}</Descriptions.Item>
          ) : null}
          {loopSummary ? (
            <Descriptions.Item label={labels.manualHandledFlag}>
              {loopSummary.hasManualHandling ? labels.yes : labels.no}
            </Descriptions.Item>
          ) : null}
          {loopSummary ? (
            <Descriptions.Item label={labels.autoApprovedItems}>
              {`${loopSummary.autoApprovedCount} ${isEnglish ? 'items' : '条'}`}
            </Descriptions.Item>
          ) : null}
          {loopSummary ? (
            <Descriptions.Item label={labels.manualHandledItems}>
              {`${loopSummary.manualHandledCount} ${isEnglish ? 'items' : '条'}`}
            </Descriptions.Item>
          ) : null}
          {shouldShowLiveProgressInfo && currentPhase ? (
            <Descriptions.Item label={labels.currentPhase}>
              {formatPhaseDisplayName(currentPhase, {
                isEnglish,
                fallbackIndex: activityProgressCurrent + 1,
              })}
            </Descriptions.Item>
          ) : null}
          {shouldShowLiveProgressInfo && currentExecutionStep ? (
            <Descriptions.Item label={labels.currentStepLabel}>
              {currentExecutionStep.name || `${labels.step} ${currentExecutionStep.stepIndex + 1}`}
            </Descriptions.Item>
          ) : null}
        </Descriptions>
      </Space>
    </ExecutionDetailSectionCard>
  ) : (
    <ExecutionDetailSectionCard title={labels.stepsProgress} style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <ExecutionStatusSummaryTags
          items={[
            {
              text: getExecutionStatusLabel(execution.status),
              color: getExecutionStatusColor(execution.status),
            },
            currentPhaseLoopIteration ? { text: `${labels.loopCount}: ${currentPhaseLoopIteration}` } : null,
          ]}
        />
        <Text type="secondary">{labels.currentStepHint}</Text>
        <Space wrap size={[12, 8]}>
          <Text type="secondary">{`${labels.progressOverview}: ${activityProgressCurrent + 1} / ${displayActivityPhases.length}`}</Text>
          <Text type="secondary">{`${labels.completedActivities}: ${completedActivityCount}`}</Text>
          <Text type="secondary">{`${labels.pendingActivities}: ${pendingActivityCount}`}</Text>
          {latestActivityUpdateAt ? (
            <Text type="secondary">
              {`${labels.latestUpdate}: ${formatLocalizedDateTime(latestActivityUpdateAt)}`}
            </Text>
          ) : null}
        </Space>
        <Steps
          current={activityProgressCurrent}
          size="small"
          responsive
          style={{ marginBottom: 0 }}
          items={displayActivityPhases.map((phase, index) => {
            const isCurrentActivity = currentPhase?.id === phase.id;
            return {
              title: formatPhaseDisplayName(phase, {
                isEnglish,
                fallbackIndex: index + 1,
              }),
              status: getPhaseStepStatus(phase.status),
              description: (
                <Space wrap size={[8, 4]}>
                  <Tag color={getPhaseStatusColor(phase.status)}>
                    {getPhaseStatusLabel(phase.status, isEnglish)}
                  </Tag>
                  {isCurrentActivity ? <Tag color="processing">{labels.currentActivity}</Tag> : null}
                </Space>
              ),
            };
          })}
        />
      </Space>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionActivityOverviewCard;
