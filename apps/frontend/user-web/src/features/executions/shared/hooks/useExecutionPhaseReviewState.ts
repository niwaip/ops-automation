import React from 'react';
import type { ExecutionDto, ExecutionPhaseDto } from '@/api/execution';
import {
  buildLatestExecutionReview,
  findCurrentExecutionPhase,
  findFailedExecutionPhaseStep,
  findLatestPhaseWithReview,
  resolveCurrentPhaseDetailUrl,
  resolveDefaultResumeStepId,
  resolveFailedExecutionPhaseStepId,
  resolveTakeoverFocusPhase,
} from '@/features/executions/shared/lib/executionPhaseState';
import { getPhaseLoopIteration } from '@/features/executions/shared/lib/phaseText';

interface UseExecutionPhaseReviewStateOptions {
  execution?: ExecutionDto;
  displayActivityPhases: ExecutionPhaseDto[];
  sortedExecutionPhases: ExecutionPhaseDto[];
}

export function useExecutionPhaseReviewState({
  execution,
  displayActivityPhases,
  sortedExecutionPhases,
}: UseExecutionPhaseReviewStateOptions) {
  const currentPhase = React.useMemo(
    () => findCurrentExecutionPhase(displayActivityPhases, execution?.currentPhaseKey),
    [displayActivityPhases, execution?.currentPhaseKey]
  );

  const latestPhaseWithReview = React.useMemo(
    () => findLatestPhaseWithReview(sortedExecutionPhases),
    [sortedExecutionPhases]
  );

  const takeoverFocusPhase = React.useMemo(
    () =>
      resolveTakeoverFocusPhase({
        currentPhase,
        latestPhaseWithReview,
      }),
    [currentPhase, latestPhaseWithReview]
  );

  const failedCurrentPhaseStep = React.useMemo(() => {
    return findFailedExecutionPhaseStep(currentPhase);
  }, [currentPhase]);

  const failedCurrentPhaseStepId = React.useMemo(
    () =>
      resolveFailedExecutionPhaseStepId({
        failedCurrentPhaseStep,
        currentStepId: execution?.currentStepId,
      }),
    [execution?.currentStepId, failedCurrentPhaseStep]
  );

  const currentPhaseDetailUrl = React.useMemo(() => {
    return resolveCurrentPhaseDetailUrl(currentPhase);
  }, [currentPhase]);

  const defaultResumeFromCurrentPhaseStepId = React.useMemo(() => {
    return resolveDefaultResumeStepId({
      currentPhase,
      failedCurrentPhaseStepId,
    });
  }, [currentPhase, failedCurrentPhaseStepId]);

  const currentPhaseLoopIteration = React.useMemo(
    () => getPhaseLoopIteration(currentPhase),
    [currentPhase]
  );

  const latestExecutionReview = React.useMemo(() => {
    return buildLatestExecutionReview(sortedExecutionPhases);
  }, [sortedExecutionPhases]);

  return {
    currentPhase,
    currentPhaseDetailUrl,
    currentPhaseLoopIteration,
    defaultResumeFromCurrentPhaseStepId,
    failedCurrentPhaseStep,
    failedCurrentPhaseStepId,
    latestExecutionReview,
    latestPhaseWithReview,
    takeoverFocusPhase,
  };
}
