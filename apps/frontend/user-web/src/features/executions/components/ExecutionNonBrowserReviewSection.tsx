import React from 'react';
import type { ExecutionDto, ExecutionPhaseDto } from '@/api/execution';
import InlineRecoveryPanel from '@/features/executions/components/InlineRecoveryPanel';

interface ExecutionNonBrowserReviewSectionProps {
  execution: ExecutionDto;
  currentPhase?: ExecutionPhaseDto;
  reviewResultCard?: React.ReactNode;
  takeoverRecoveryCard?: React.ReactNode;
}

const ExecutionNonBrowserReviewSection: React.FC<ExecutionNonBrowserReviewSectionProps> = ({
  execution,
  currentPhase,
  reviewResultCard,
  takeoverRecoveryCard,
}) => {
  return (
    <>
      <InlineRecoveryPanel
        executionId={execution.id}
        executionStatus={execution.status}
        currentStepId={execution.currentStepId}
        phase={currentPhase}
      />
      {reviewResultCard}
      {takeoverRecoveryCard}
    </>
  );
};

export default ExecutionNonBrowserReviewSection;
