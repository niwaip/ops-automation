import React from 'react';
import { Steps } from 'antd';
import type { ExecutionStepDto } from '@/api/execution';
import ExecutionDetailSectionCard from '@/features/executions/components/ExecutionDetailSectionCard';

interface ExecutionLegacyStepsProgressCardLabels {
  title: string;
  step: string;
}

interface ExecutionLegacyStepsProgressCardProps {
  steps: ExecutionStepDto[];
  currentStepIndex: number;
  isEnglish: boolean;
  labels: ExecutionLegacyStepsProgressCardLabels;
  stepStatusLabels: Record<string, { zh: string; en: string } | undefined>;
}

const ExecutionLegacyStepsProgressCard: React.FC<ExecutionLegacyStepsProgressCardProps> = ({
  steps,
  currentStepIndex,
  isEnglish,
  labels,
  stepStatusLabels,
}) => {
  if (steps.length === 0) {
    return null;
  }

  return (
    <ExecutionDetailSectionCard title={labels.title} style={{ marginBottom: 16 }}>
      <Steps
        current={currentStepIndex}
        size="small"
        style={{ marginBottom: 24 }}
        items={steps.map((step, index) => ({
          title: step.name || `${labels.step} ${index + 1}`,
          status: step.status as 'wait' | 'process' | 'finish' | 'error',
          description: stepStatusLabels[step.status]?.[isEnglish ? 'en' : 'zh'] || step.action,
        }))}
      />
    </ExecutionDetailSectionCard>
  );
};

export default ExecutionLegacyStepsProgressCard;
