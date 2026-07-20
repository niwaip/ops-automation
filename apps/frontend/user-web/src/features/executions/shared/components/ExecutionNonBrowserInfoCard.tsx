import React from 'react';
import { Descriptions, Typography } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import type { ExecutionDto } from '@/api/execution';
import ExecutionExternalLink from '@/features/executions/shared/components/ExecutionExternalLink';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import ExecutionStatusTag from '@/features/executions/shared/components/ExecutionStatusTag';
import { formatLocalizedDateTime } from '@/shared/utils/dateText';

const { Text } = Typography;

interface ExecutionNonBrowserInfoCardLabels {
  status: string;
  createdAt: string;
  startedAt: string;
  endedAt: string;
  failureReason: string;
  failureCode: string;
  temporalLink: string;
}

interface ExecutionNonBrowserInfoCardProps {
  execution: ExecutionDto;
  statusLabel: string;
  statusColor: string;
  temporalLink?: string;
  labels: ExecutionNonBrowserInfoCardLabels;
}

const ExecutionNonBrowserInfoCard: React.FC<ExecutionNonBrowserInfoCardProps> = ({
  execution,
  statusLabel,
  statusColor,
  temporalLink,
  labels,
}) => {
  return (
    <ExecutionDetailSectionCard style={{ marginBottom: 16 }}>
      <Descriptions column={2}>
        <Descriptions.Item label={labels.status}>
          <ExecutionStatusTag color={statusColor}>{statusLabel}</ExecutionStatusTag>
        </Descriptions.Item>
        <Descriptions.Item label={labels.createdAt}>
          {formatLocalizedDateTime(execution.createdAt)}
        </Descriptions.Item>
        {execution.startedAt ? (
          <Descriptions.Item label={labels.startedAt}>
            {formatLocalizedDateTime(execution.startedAt)}
          </Descriptions.Item>
        ) : null}
        {execution.endedAt ? (
          <Descriptions.Item label={labels.endedAt}>
            {formatLocalizedDateTime(execution.endedAt)}
          </Descriptions.Item>
        ) : null}
        {execution.failureReason ? (
          <Descriptions.Item label={labels.failureReason} span={2}>
            <Text type="danger">{execution.failureReason}</Text>
          </Descriptions.Item>
        ) : null}
        {execution.failureCode ? (
          <Descriptions.Item label={labels.failureCode}>
            <Text type="danger">{execution.failureCode}</Text>
          </Descriptions.Item>
        ) : null}
        {temporalLink ? (
          <Descriptions.Item label={labels.temporalLink} span={2}>
            <ExecutionExternalLink href={temporalLink} icon={<ThunderboltOutlined />} />
          </Descriptions.Item>
        ) : null}
      </Descriptions>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionNonBrowserInfoCard;
