import React from 'react';
import { Descriptions, Typography } from 'antd';
import type { ExecutionDto, ExecutionStatus } from '@/api/execution';
import ExecutionDetailSectionCard from '@/features/executions/components/ExecutionDetailSectionCard';
import ExecutionStatusTag from '@/features/executions/components/ExecutionStatusTag';
import { formatLocalizedDateTime } from '@/shared/lib/dateText';

const { Text } = Typography;

interface ExecutionReviewResult {
  phaseKey?: string;
  phaseName?: string;
  note?: string;
  reason?: string;
  createdAt?: string;
  resolvedAt?: string;
  status?: string;
}

interface ExecutionReviewResultCardLabels {
  executionResult: string;
  status: string;
  humanReview: string;
  reviewed: string;
  reviewDecision: string;
  reviewPhase: string;
  reviewedAt: string;
  reviewContext: string;
}

interface ExecutionReviewResultCardProps {
  execution: ExecutionDto;
  latestExecutionReview: ExecutionReviewResult;
  labels: ExecutionReviewResultCardLabels;
  getExecutionStatusColor: (status?: ExecutionStatus | string) => string;
  getExecutionStatusLabel: (status?: ExecutionStatus | string) => string;
}

const ExecutionReviewResultCard: React.FC<ExecutionReviewResultCardProps> = ({
  execution,
  latestExecutionReview,
  labels,
  getExecutionStatusColor,
  getExecutionStatusLabel,
}) => {
  return (
    <ExecutionDetailSectionCard title={labels.executionResult} style={{ marginBottom: 16 }}>
      <Descriptions column={2} size="small">
        <Descriptions.Item label={labels.status}>
          <ExecutionStatusTag color={getExecutionStatusColor(execution.status)}>
            {getExecutionStatusLabel(execution.status)}
          </ExecutionStatusTag>
        </Descriptions.Item>
        <Descriptions.Item label={labels.humanReview}>
          <ExecutionStatusTag color="blue">{labels.reviewed}</ExecutionStatusTag>
        </Descriptions.Item>
        <Descriptions.Item label={labels.reviewDecision} span={2}>
          <Text strong>{latestExecutionReview.note || '-'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={labels.reviewPhase}>
          {latestExecutionReview.phaseName || latestExecutionReview.phaseKey || '-'}
        </Descriptions.Item>
        <Descriptions.Item label={labels.reviewedAt}>
          {formatLocalizedDateTime(
            latestExecutionReview.resolvedAt || latestExecutionReview.createdAt
          )}
        </Descriptions.Item>
        {latestExecutionReview.reason ? (
          <Descriptions.Item label={labels.reviewContext} span={2}>
            {latestExecutionReview.reason}
          </Descriptions.Item>
        ) : null}
      </Descriptions>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionReviewResultCard;
