import React from 'react';
import { Collapse, Space, Tag, Timeline, Typography } from 'antd';
import type { ExecutionPhaseArtifactDto, ExecutionPhaseDto, ExecutionStatus } from '@/api/execution';
import ExecutionErrorAlert from '@/features/executions/shared/components/ExecutionErrorAlert';
import ExecutionImageGallery from '@/features/executions/shared/components/ExecutionImageGallery';
import ExecutionSecondaryTextList from '@/features/executions/shared/components/ExecutionSecondaryTextList';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import ExecutionPayloadContent from '@/features/executions/shared/components/ExecutionPayloadContent';
import ExecutionStatusTag from '@/features/executions/shared/components/ExecutionStatusTag';
import {
  extractPhaseStepImageSources,
  extractPhaseStepUrl,
  extractWorkflowActivitySnapshotSources,
  sortExecutionPhaseArtifactsByTime,
  sortExecutionPhaseStepsByTime,
} from '@/features/executions/shared/lib/artifacts';
import { getPhaseStatusColor, getPhaseStatusLabel } from '@/features/executions/shared/lib/phase';
import { formatPhaseDisplayName } from '@/features/executions/shared/lib/phaseText';
import { formatLocalizedDateTime } from '@/shared/utils/dateText';

const { Text } = Typography;

const getPhaseSteps = (phase?: ExecutionPhaseDto) =>
  sortExecutionPhaseStepsByTime(
    (Array.isArray(phase?.steps) ? phase.steps : []) as NonNullable<ExecutionPhaseDto['steps']>
  );

const getPhaseArtifacts = (phase?: ExecutionPhaseDto) =>
  sortExecutionPhaseArtifactsByTime(
    (Array.isArray(phase?.artifacts) ? phase.artifacts : []) as ExecutionPhaseArtifactDto[]
  );

interface ExecutionPhaseTimelineCardLabels {
  phaseTimeline: string;
  expandPhaseTimeline: string;
  phaseAttempt: string;
  phaseSteps: string;
  phaseArtifactCount: string;
  phaseActionFailed: string;
  phaseArtifacts: string;
  phaseNoData: string;
  step: string;
}

interface ExecutionPhaseTimelineCardProps {
  phases: ExecutionPhaseDto[];
  currentPhase?: ExecutionPhaseDto;
  executionStatus: ExecutionStatus;
  isEnglish: boolean;
  labels: ExecutionPhaseTimelineCardLabels;
  sectionRef?: React.Ref<HTMLDivElement>;
}

const imageStyle: React.CSSProperties = {
  width: 320,
  maxWidth: '100%',
  maxHeight: 320,
  objectFit: 'contain',
  background: 'var(--bg-secondary)',
  borderRadius: 8,
  border: '1px solid var(--bg-secondary)',
  padding: 6,
};

const ExecutionPhaseTimelineCard: React.FC<ExecutionPhaseTimelineCardProps> = ({
  phases,
  currentPhase,
  executionStatus,
  isEnglish,
  labels,
  sectionRef,
}) => {
  if (phases.length === 0) {
    return null;
  }

  return (
    <div ref={sectionRef}>
      <ExecutionDetailSectionCard title={labels.phaseTimeline} style={{ marginBottom: 16 }}>
        <Collapse
          size="small"
          items={[
            {
              key: 'phase-timeline',
              label: `${labels.expandPhaseTimeline} (${phases.length})`,
              children: (
                <Timeline
                  items={phases.map((phase) => {
                    const phaseSteps = getPhaseSteps(phase);
                    const phaseSnapshotSources = extractWorkflowActivitySnapshotSources(phase);
                    const phaseArtifacts = getPhaseArtifacts(phase);
                    return {
                      color: getPhaseStatusColor(phase.status),
                      children: (
                        <ExecutionDetailSectionCard>
                          <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                              <Space wrap>
                                <Text strong>{formatPhaseDisplayName(phase, { isEnglish })}</Text>
                                <ExecutionStatusTag color={getPhaseStatusColor(phase.status)}>
                                  {getPhaseStatusLabel(phase.status, isEnglish)}
                                </ExecutionStatusTag>
                                <Tag>{phase.phaseType}</Tag>
                              </Space>
                              <Text type="secondary">
                                {formatLocalizedDateTime(phase.startedAt || phase.createdAt)}
                              </Text>
                            </Space>

                            <ExecutionSecondaryTextList
                              items={[
                                `${labels.phaseAttempt}: ${phase.attempt}`,
                                `${labels.phaseSteps}: ${phaseSteps.length}`,
                                `${labels.phaseArtifactCount}: ${phaseArtifacts.length}`,
                              ]}
                            />

                            {phase.errorMessage &&
                            !(executionStatus === 'human_control' && currentPhase?.id === phase.id) ? (
                              <ExecutionErrorAlert
                                message={phase.errorCode || labels.phaseActionFailed}
                                description={phase.errorMessage}
                              />
                            ) : null}

                            {phaseSnapshotSources.length > 0 ? (
                              <ExecutionImageGallery
                                title={labels.phaseArtifacts}
                                imageStyle={imageStyle}
                                items={phaseSnapshotSources.map((src, index) => ({
                                  key: `${phase.id}-snapshot-${index + 1}`,
                                  src,
                                  alt: `${phase.phaseName || phase.phaseKey}-snapshot-${index + 1}`,
                                }))}
                              />
                            ) : null}

                            {phaseSteps.length > 0 ? (
                              <Timeline
                                items={phaseSteps.map((step) => {
                                  const stepImageSources = extractPhaseStepImageSources(step, phaseArtifacts);
                                  const stepUrl = extractPhaseStepUrl(step);
                                  return {
                                    color: getPhaseStatusColor(step.status),
                                    children: (
                                      <ExecutionDetailSectionCard>
                                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                                            <Space wrap>
                                              <Text strong>{`${labels.step} ${step.stepIndex}`}</Text>
                                              <Text>{step.action || '-'}</Text>
                                              <ExecutionStatusTag color={getPhaseStatusColor(step.status)}>
                                                {step.status}
                                              </ExecutionStatusTag>
                                            </Space>
                                            <Text type="secondary">
                                              {formatLocalizedDateTime(step.startedAt || step.createdAt)}
                                            </Text>
                                          </Space>
                                          {stepUrl ? <Text copyable={{ text: stepUrl }}>{stepUrl}</Text> : null}
                                          {step.errorMessage ? (
                                            <ExecutionErrorAlert
                                              message={labels.phaseActionFailed}
                                              description={step.errorMessage}
                                            />
                                          ) : null}
                                          {stepImageSources.length > 0 ? (
                                            <ExecutionImageGallery
                                              imageStyle={imageStyle}
                                              items={stepImageSources.map((src, index) => ({
                                                key: `${src}-${index}`,
                                                src,
                                                alt: `${phase.phaseName || phase.phaseKey}-step-${index + 1}`,
                                              }))}
                                            />
                                          ) : null}
                                        </Space>
                                      </ExecutionDetailSectionCard>
                                    ),
                                  };
                                })}
                              />
                            ) : null}

                            {phase.output ? (
                              <ExecutionDetailSectionCard title={isEnglish ? 'Phase Output' : '阶段输出 / 提取正文'}>
                                <ExecutionPayloadContent
                                  value={
                                    phase.output &&
                                    typeof phase.output === 'object' &&
                                    'output' in phase.output &&
                                    (phase.output as any).output !== null
                                      ? (phase.output as any).output
                                      : phase.output
                                  }
                                  emptyText={labels.phaseNoData}
                                  treatSingleResultFieldAsMarkdown
                                />
                              </ExecutionDetailSectionCard>
                            ) : null}
                          </Space>
                        </ExecutionDetailSectionCard>
                      ),
                    };
                  })}
                />
              ),
            },
          ]}
        />
      </ExecutionDetailSectionCard>
    </div>
  );
};

export default ExecutionPhaseTimelineCard;
