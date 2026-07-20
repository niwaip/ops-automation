import React from 'react';
import { Alert, Button, Collapse, Empty, Space, Tag, Typography } from 'antd';
import type { ExecutionDto, ExecutionPhaseDto } from '@/api/execution';
import { buildExecutionDetailCollapseItem } from '@/features/executions/detail/components/executionDetailCollapse';
import ExecutionImageGallery from '@/features/executions/shared/components/ExecutionImageGallery';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import ExecutionPayloadContent from '@/features/executions/shared/components/ExecutionPayloadContent';
import ExecutionPhaseStepsTimeline from '@/features/executions/shared/components/ExecutionPhaseStepsTimeline';
import ExecutionStatusTag from '@/features/executions/shared/components/ExecutionStatusTag';
import {
  getPhaseArtifacts,
  getPhaseSteps,
  isBrowserWorkflowActivity,
} from '@/features/executions/detail/lib/executionDetailQueryUtils';
import { extractWorkflowActivitySnapshotSources } from '@/features/executions/shared/lib/artifacts';
import { formatPhaseDisplayName } from '@/features/executions/shared/lib/phaseText';
import { getPhaseStatusColor } from '@/features/executions/shared/lib/phase';
import { formatLocalizedDateTime } from '@/shared/lib/dateText';

const { Text } = Typography;

const snapshotImageStyle = {
  width: 320,
  maxWidth: '100%',
  maxHeight: 320,
  objectFit: 'contain' as const,
  background: 'var(--bg-secondary)',
  borderRadius: 8,
  border: '1px solid var(--bg-secondary)',
  padding: 6,
};

interface ExecutionPhasesCollapseProps {
  execution: ExecutionDto;
  phases: ExecutionPhaseDto[];
  onTakeoverPhase: (phase: ExecutionPhaseDto) => void;
  takeoverLoading: boolean;
}

const ExecutionPhasesCollapse: React.FC<ExecutionPhasesCollapseProps> = ({
  execution,
  phases,
  onTakeoverPhase,
  takeoverLoading,
}) => {
  if (phases.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无阶段记录" />;
  }

  return (
    <Collapse
      ghost
      expandIconPosition="end"
      items={phases.map((phase) => {
        const phaseSteps = getPhaseSteps(phase);
        const phaseArtifacts = getPhaseArtifacts(phase);
        const isBrowserActivityPhase = isBrowserWorkflowActivity(phase);
        const snapshotSources = extractWorkflowActivitySnapshotSources(phase);

        return {
          ...buildExecutionDetailCollapseItem({
            key: phase.id,
            title: formatPhaseDisplayName(phase),
            summary: `${phase.status} / ${formatLocalizedDateTime(phase.startedAt || phase.createdAt)}`,
            children: (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap size={[8, 4]}>
                <Tag>{phase.phaseType}</Tag>
                <ExecutionStatusTag color={getPhaseStatusColor(phase.status)}>
                  {phase.status}
                </ExecutionStatusTag>
                <Text type="secondary">{`Key: ${phase.phaseKey}`}</Text>
                <Text type="secondary">{`尝试: ${phase.attempt}`}</Text>
                {isBrowserActivityPhase && phase.runtimeSessionId ? (
                  <Text copyable={{ text: phase.runtimeSessionId }}>{`会话: ${phase.runtimeSessionId}`}</Text>
                ) : null}
              </Space>
              <Space wrap>
                {execution.status !== 'human_control' &&
                (phase.status === 'running' || phase.status === 'failed') ? (
                  <Button
                    size="small"
                    onClick={() => onTakeoverPhase(phase)}
                    loading={takeoverLoading}
                  >
                    接管当前阶段
                  </Button>
                ) : null}
              </Space>
              {phase.errorMessage ? (
                <Alert
                  type="error"
                  showIcon
                  message={phase.errorCode || '阶段失败'}
                  description={phase.errorMessage}
                />
              ) : null}
              {phase.phaseType === 'workflow_activity' ? (
                isBrowserActivityPhase ? (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <ExecutionDetailSectionCard
                      title="Activity 结果"
                    >
                      <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <Space wrap size={[12, 4]}>
                          <Text type="secondary">{`步骤数: ${phaseSteps.length}`}</Text>
                          <Text type="secondary">{`截图: ${snapshotSources.length}`}</Text>
                        </Space>
                        <ExecutionImageGallery
                          imageStyle={snapshotImageStyle}
                          items={snapshotSources.map((src, index) => ({
                            key: `${phase.id}-snapshot-${index + 1}`,
                            src,
                            alt: `${phase.phaseName || phase.phaseKey}-snapshot-${index + 1}`,
                          }))}
                          emptyText="该 Activity 暂无可展示截图。"
                        />
                      </Space>
                    </ExecutionDetailSectionCard>
                    {phaseSteps.length > 0 ? (
                      <ExecutionPhaseStepsTimeline
                        phaseName={phase.phaseName}
                        phaseKey={phase.phaseKey}
                        phaseSteps={phaseSteps}
                        phaseArtifacts={phaseArtifacts}
                      />
                    ) : null}
                  </Space>
                ) : (
                  <ExecutionDetailSectionCard
                    title="Activity 输出"
                  >
                    <ExecutionPayloadContent
                      value={phase.output}
                      emptyText="该 Activity 暂无输出内容。"
                      treatSingleResultFieldAsMarkdown
                    />
                  </ExecutionDetailSectionCard>
                )
              ) : phaseSteps.length > 0 ? (
                <ExecutionPhaseStepsTimeline
                  phaseName={phase.phaseName}
                  phaseKey={phase.phaseKey}
                  phaseSteps={phaseSteps}
                  phaseArtifacts={phaseArtifacts}
                />
              ) : null}
            </Space>
            ),
          }),
        };
      })}
    />
  );
};

export default ExecutionPhasesCollapse;
