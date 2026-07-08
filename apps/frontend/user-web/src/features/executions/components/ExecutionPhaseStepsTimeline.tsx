import React from 'react';
import { Space, Timeline, Typography } from 'antd';
import type { ExecutionPhaseArtifactDto, ExecutionPhaseStepDto } from '@/api/execution';
import ExecutionErrorAlert from '@/features/executions/components/ExecutionErrorAlert';
import ExecutionImageGallery from '@/features/executions/components/ExecutionImageGallery';
import ExecutionDetailSectionCard from '@/features/executions/components/ExecutionDetailSectionCard';
import ExecutionStatusTag from '@/features/executions/components/ExecutionStatusTag';
import { extractPhaseStepImageSources, extractPhaseStepUrl } from '@/features/executions/lib/artifacts';
import { formatDateTime } from '@/features/executions/lib/listView';
import { getPhaseStatusColor } from '@/features/executions/lib/phase';

const { Text } = Typography;

interface ExecutionPhaseStepsTimelineProps {
  phaseName?: string;
  phaseKey?: string;
  phaseSteps: ExecutionPhaseStepDto[];
  phaseArtifacts: ExecutionPhaseArtifactDto[];
}

const imageStyle = {
  width: 320,
  maxWidth: '100%',
  maxHeight: 320,
  objectFit: 'contain' as const,
  background: 'var(--bg-secondary)',
  borderRadius: 8,
  border: '1px solid var(--bg-secondary)',
  padding: 6,
};

const ExecutionPhaseStepsTimeline: React.FC<ExecutionPhaseStepsTimelineProps> = ({
  phaseName,
  phaseKey,
  phaseSteps,
  phaseArtifacts,
}) => {
  if (phaseSteps.length === 0) {
    return null;
  }

  return (
    <Timeline
      items={phaseSteps.map((step) => {
        const stepUrl = extractPhaseStepUrl(step);
        const stepImageSources = extractPhaseStepImageSources(step, phaseArtifacts);
        const isWaitStep = step.action === 'wait';
        const isNavigateStep = step.action === 'navigate';
        const isScreenshotStep = step.action === 'screenshot';

        return {
          color: getPhaseStatusColor(step.status),
          children: isWaitStep ? (
            <Space
              wrap
              style={{
                width: '100%',
                justifyContent: 'space-between',
              }}
            >
              <Space wrap>
                <Text strong>等待</Text>
                <ExecutionStatusTag color={getPhaseStatusColor(step.status)}>
                  {step.status}
                </ExecutionStatusTag>
              </Space>
              <Text type="secondary">{formatDateTime(step.startedAt || step.createdAt)}</Text>
            </Space>
          ) : (
            <ExecutionDetailSectionCard className="execution-detail-timeline-card">
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Space
                  wrap
                  style={{
                    width: '100%',
                    justifyContent: 'space-between',
                  }}
                >
                  <Space wrap>
                    <Text strong>
                      {isNavigateStep
                        ? '打开页面'
                        : isScreenshotStep
                          ? '截图'
                          : step.action || `步骤 ${step.stepIndex + 1}`}
                    </Text>
                    <ExecutionStatusTag color={getPhaseStatusColor(step.status)}>
                      {step.status}
                    </ExecutionStatusTag>
                  </Space>
                  <Text type="secondary">{formatDateTime(step.startedAt || step.createdAt)}</Text>
                </Space>
                {isNavigateStep ? (
                  <Text copyable={stepUrl ? { text: stepUrl } : undefined}>{stepUrl || '-'}</Text>
                ) : null}
                {step.errorMessage ? (
                  <ExecutionErrorAlert message="步骤执行失败" description={step.errorMessage} />
                ) : null}
                {stepImageSources.length > 0 ? (
                  <ExecutionImageGallery
                    imageStyle={imageStyle}
                    items={stepImageSources.map((src, index) => ({
                      key: `${src}-${index}`,
                      src,
                      alt: `${phaseName || phaseKey}-step-${index + 1}`,
                    }))}
                  />
                ) : null}
              </Space>
            </ExecutionDetailSectionCard>
          ),
        };
      })}
    />
  );
};

export default ExecutionPhaseStepsTimeline;
