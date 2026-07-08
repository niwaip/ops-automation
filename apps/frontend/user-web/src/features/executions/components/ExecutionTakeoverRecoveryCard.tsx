import React from 'react';
import { Descriptions, Space, Timeline, Typography } from 'antd';
import type { ExecutionPhaseDto, ExecutionTakeoverRecordDto } from '@/api/execution';
import ExecutionDetailSectionCard from '@/features/executions/components/ExecutionDetailSectionCard';
import { JsonPreview } from '@/features/executions/components/JsonPreview';
import ExecutionStatusTag from '@/features/executions/components/ExecutionStatusTag';
import { asRecord, tryParseJsonValue } from '@/features/executions/lib/common';
import { getPhaseStatusColor, getPhaseStatusLabel } from '@/features/executions/lib/phase';
import { formatLocalizedDateTime } from '@/shared/lib/dateText';

const { Text } = Typography;

const getRecoveryPatchSummary = (patch: unknown, isEnglish: boolean): string | undefined => {
  const record = asRecord(tryParseJsonValue(patch));
  if (!record) {
    return undefined;
  }

  const type = typeof record.type === 'string' ? record.type : undefined;
  const selector = typeof record.selector === 'string' ? record.selector : undefined;
  const durationMs = typeof record.duration_ms === 'number' ? record.duration_ms : undefined;
  const note = typeof record.note === 'string' ? record.note : undefined;

  if (type === 'append_wait') {
    return isEnglish ? `Append wait ${durationMs ?? 0}ms` : `追加等待 ${durationMs ?? 0}ms`;
  }
  if (type === 'replace_selector') {
    return isEnglish ? `Replace selector: ${selector || '-'}` : `替换选择器: ${selector || '-'}`;
  }
  if (type === 'resolve_by_human') {
    return isEnglish
      ? `Resolved by human${note ? `: ${note}` : ''}`
      : `人工处理${note ? `: ${note}` : ''}`;
  }

  return type || undefined;
};

interface ExecutionTakeoverRecoveryCardLabels {
  title: string;
  reviewPhase: string;
  status: string;
  latestTakeover: string;
  recoveryPatch: string;
  failureReason: string;
  resolutionNote: string;
  resolvedAt: string;
  requestedBy: string;
  resolvedBy: string;
  recoveryDecisionPayload: string;
}

interface ExecutionTakeoverRecoveryCardProps {
  phase: ExecutionPhaseDto;
  isEnglish: boolean;
  labels: ExecutionTakeoverRecoveryCardLabels;
}

const ExecutionTakeoverRecoveryCard: React.FC<ExecutionTakeoverRecoveryCardProps> = ({
  phase,
  isEnglish,
  labels,
}) => {
  const recoveryDecision = asRecord(tryParseJsonValue(phase.recoveryDecision));
  const takeovers = (Array.isArray(phase.takeovers) ? phase.takeovers : []) as ExecutionTakeoverRecordDto[];
  const latestTakeover = takeovers.length > 0 ? takeovers[takeovers.length - 1] : undefined;

  if (!latestTakeover && !recoveryDecision) {
    return null;
  }

  return (
    <ExecutionDetailSectionCard title={labels.title} style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label={labels.reviewPhase}>
            {phase.phaseName || phase.phaseKey}
          </Descriptions.Item>
          <Descriptions.Item label={labels.status}>
            <ExecutionStatusTag color={getPhaseStatusColor(phase.status)}>
              {getPhaseStatusLabel(phase.status, isEnglish)}
            </ExecutionStatusTag>
          </Descriptions.Item>
          <Descriptions.Item label={labels.latestTakeover}>
            {latestTakeover ? (
              <Space wrap size={[8, 4]}>
                <ExecutionStatusTag
                  color={
                    latestTakeover.status === 'resolved'
                      ? 'green'
                      : latestTakeover.status === 'requested'
                        ? 'orange'
                        : 'default'
                  }
                >
                  {latestTakeover.status}
                </ExecutionStatusTag>
                <Text type="secondary">{formatLocalizedDateTime(latestTakeover.createdAt)}</Text>
              </Space>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label={labels.recoveryPatch}>
            {getRecoveryPatchSummary(recoveryDecision?.patch, isEnglish) || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={labels.failureReason} span={2}>
            {latestTakeover?.reason || phase.errorMessage || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={labels.resolutionNote} span={2}>
            {latestTakeover?.resolutionNote ||
              (typeof recoveryDecision?.comment === 'string' ? recoveryDecision.comment : '-')}
          </Descriptions.Item>
        </Descriptions>

        {takeovers.length > 0 ? (
          <Timeline
            items={takeovers.map((takeover) => ({
              color:
                takeover.status === 'resolved'
                  ? 'green'
                  : takeover.status === 'requested'
                    ? 'orange'
                    : 'gray',
              children: (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space wrap size={[8, 4]}>
                    <ExecutionStatusTag
                      color={
                        takeover.status === 'resolved'
                          ? 'green'
                          : takeover.status === 'requested'
                            ? 'orange'
                            : 'default'
                      }
                    >
                      {takeover.status}
                    </ExecutionStatusTag>
                    <Text>{formatLocalizedDateTime(takeover.createdAt)}</Text>
                    {takeover.resolvedAt ? (
                      <Text type="secondary">
                        {`${labels.resolvedAt} ${formatLocalizedDateTime(takeover.resolvedAt)}`}
                      </Text>
                    ) : null}
                  </Space>
                  {takeover.reason ? <Text>{takeover.reason}</Text> : null}
                  {takeover.requestedBy || takeover.resolvedBy ? (
                    <Space wrap size={[12, 4]}>
                      {takeover.requestedBy ? (
                        <Text type="secondary">{`${labels.requestedBy}: ${takeover.requestedBy}`}</Text>
                      ) : null}
                      {takeover.resolvedBy ? (
                        <Text type="secondary">{`${labels.resolvedBy}: ${takeover.resolvedBy}`}</Text>
                      ) : null}
                    </Space>
                  ) : null}
                  {takeover.resolutionNote ? <Text type="secondary">{takeover.resolutionNote}</Text> : null}
                </Space>
              ),
            }))}
          />
        ) : null}

        {recoveryDecision ? (
          <div>
            <Text strong>{labels.recoveryDecisionPayload}</Text>
            <JsonPreview value={recoveryDecision} marginTop={8} />
          </div>
        ) : null}
      </Space>
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionTakeoverRecoveryCard;
