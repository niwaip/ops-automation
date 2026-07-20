import React from 'react';
import { Typography } from 'antd';
import type { ExecutionDto } from '@/api/execution';
import ExecutionInfoTile from '@/features/executions/shared/components/ExecutionInfoTile';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import ExecutionStatusTag from '@/features/executions/shared/components/ExecutionStatusTag';

const { Text } = Typography;

interface ExecutionBrowserSummaryCardLabels {
  summaryInfo: string;
  status: string;
  skillLabel: string;
  runtimeInfo: string;
  idLabel: string;
}

interface ExecutionBrowserSummaryCardProps {
  execution: ExecutionDto;
  skillDisplayName: string;
  displayRuntimeType: string;
  statusLabel: string;
  statusColor: string;
  labels: ExecutionBrowserSummaryCardLabels;
}

const ExecutionBrowserSummaryCard: React.FC<ExecutionBrowserSummaryCardProps> = ({
  execution,
  skillDisplayName,
  displayRuntimeType,
  statusLabel,
  statusColor,
  labels,
}) => {
  return (
    <ExecutionDetailSectionCard
      title={labels.summaryInfo}
      style={{ marginBottom: 12 }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 6,
        }}
      >
        <ExecutionInfoTile label={labels.status}>
          <ExecutionStatusTag color={statusColor} style={{ marginInlineEnd: 0 }}>
            {statusLabel}
          </ExecutionStatusTag>
        </ExecutionInfoTile>
        <ExecutionInfoTile label={labels.skillLabel}>
            <Text strong ellipsis={{ tooltip: skillDisplayName }}>
              {skillDisplayName}
            </Text>
        </ExecutionInfoTile>
        <ExecutionInfoTile label={labels.runtimeInfo}>
            <Text strong>{displayRuntimeType}</Text>
        </ExecutionInfoTile>
        <ExecutionInfoTile label={labels.idLabel}>
            <Text copyable={{ text: execution.id }} strong>
              {execution.id.length > 18
                ? `${execution.id.slice(0, 8)}...${execution.id.slice(-4)}`
                : execution.id}
            </Text>
        </ExecutionInfoTile>
      </div>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionBrowserSummaryCard;
