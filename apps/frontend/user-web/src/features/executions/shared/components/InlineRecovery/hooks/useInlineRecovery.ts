import React from 'react';
import { message } from 'antd';
import { useMutation, useQueryClient } from 'react-query';
import { executionApi, ExecutionDto, ExecutionPhaseDto } from '@/api/execution';
import {
  RECOVERY_COPY,
  RECOVERY_ACTION_BUTTON_LABELS,
  RECOVERY_CONFIRM_DETAILS,
  RecoveryResumeAction,
} from '../../recoveryOptions';

interface PhaseStep {
  input?: Record<string, unknown>;
  stepId?: string;
  id?: string;
  stepIndex?: number;
  action?: string;
  status: string;
}

const getPhaseSteps = (phase?: ExecutionPhaseDto): PhaseStep[] =>
  (Array.isArray(phase?.steps) ? phase.steps : []) as unknown as PhaseStep[];

const isRecoveryResumeAction = (value: unknown): value is RecoveryResumeAction =>
  value === 'resolve_by_human' ||
  value === 'retry_step' ||
  value === 'retry_phase' ||
  value === 'retry' ||
  value === 'resume_from_step';

export interface UseInlineRecoveryOptions {
  executionId: string;
  executionStatus?: string;
  currentStepId?: string;
  phase?: ExecutionPhaseDto;
  onAfterSuccess?: () => void | Promise<void>;
}

export interface UseInlineRecoveryResult {
  resumeAction: RecoveryResumeAction;
  setResumeAction: React.Dispatch<React.SetStateAction<RecoveryResumeAction>>;
  resumeFromStepId: string | undefined;
  setResumeFromStepId: React.Dispatch<React.SetStateAction<string | undefined>>;
  showAdvancedStepSelect: boolean;
  setShowAdvancedStepSelect: React.Dispatch<React.SetStateAction<boolean>>;
  showResumeConfirm: boolean;
  setShowResumeConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  showCancelConfirm: boolean;
  setShowCancelConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  reviewComment: string;
  setReviewComment: React.Dispatch<React.SetStateAction<string>>;
  phaseSteps: PhaseStep[];
  failedPhaseStep: PhaseStep | undefined;
  failedPhaseStepId: string | undefined;
  nextStepAfterFailedId: string | undefined;
  defaultResumeFromStepId: string | undefined;
  activeStepId: string | undefined;
  actionButtonLabel: string;
  confirmModalDetails: {
    title: string;
    desc: string;
    hint: string;
    okText: string;
  };
  phaseLoopIteration: number | undefined;
  applyRecoveryMutation: ReturnType<typeof useMutation<ExecutionDto, Error, void>>;
  cancelMutation: ReturnType<typeof useMutation<ExecutionDto, Error, void>>;
  canResume: boolean;
  isTakeoverPhase: boolean;
  isRecoveryResumeAction: typeof isRecoveryResumeAction;
}

export function useInlineRecovery({
  executionId,
  executionStatus,
  currentStepId,
  phase,
  onAfterSuccess,
}: UseInlineRecoveryOptions): UseInlineRecoveryResult {
  const queryClient = useQueryClient();
  const [resumeAction, setResumeAction] = React.useState<RecoveryResumeAction>('resolve_by_human');
  const [resumeFromStepId, setResumeFromStepId] = React.useState<string | undefined>(undefined);
  const [showAdvancedStepSelect, setShowAdvancedStepSelect] = React.useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = React.useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);
  const [reviewComment, setReviewComment] = React.useState('');
  const phaseSteps = React.useMemo(() => getPhaseSteps(phase), [phase]);

  const failedPhaseStep = React.useMemo(() => {
    if (currentStepId) {
      const match = [...phaseSteps].reverse().find(
        (step) => (step.stepId || step.id) === currentStepId
      );
      if (match) {
        return match;
      }
    }
    const reversed = [...phaseSteps].reverse();
    return (
      reversed.find((step) =>
        ['takeover_required', 'waiting_takeover', 'failed', 'blocked'].includes(step.status)
      ) ||
      reversed.find((step) => step.status !== 'completed') ||
      phaseSteps[phaseSteps.length - 1]
    );
  }, [currentStepId, phaseSteps]);

  const failedPhaseStepId = React.useMemo(() => {
    if (failedPhaseStep?.stepId || failedPhaseStep?.id) {
      return failedPhaseStep.stepId || failedPhaseStep.id;
    }
    return currentStepId;
  }, [currentStepId, failedPhaseStep]);

  const nextStepAfterFailedId = React.useMemo(() => {
    if (!failedPhaseStep) {
      return undefined;
    }
    const failedId = failedPhaseStep.stepId || failedPhaseStep.id;
    const failedIndex = phaseSteps.lastIndexOf(failedPhaseStep);
    if (failedIndex >= 0 && phaseSteps[failedIndex + 1]) {
      return phaseSteps[failedIndex + 1].stepId || phaseSteps[failedIndex + 1].id;
    }
    // When execution pauses/fails at runtime, failedPhaseStep is the last step recorded in phaseSteps.
    // In a loop execution, look backwards for an earlier iteration of the same stepId that had a successor.
    if (failedId) {
      for (let i = failedIndex - 1; i >= 0; i--) {
        const prevStep = phaseSteps[i];
        if ((prevStep.stepId || prevStep.id) === failedId && phaseSteps[i + 1]) {
          const candidateNext = phaseSteps[i + 1].stepId || phaseSteps[i + 1].id;
          if (candidateNext && candidateNext !== failedId) {
            return candidateNext;
          }
        }
      }
    }
    // Fallback for sequential steps like step_9 -> step_10
    if (failedId && /^step_\d+$/.test(failedId)) {
      const num = parseInt(failedId.replace('step_', ''), 10);
      if (!Number.isNaN(num)) {
        return `step_${num + 1}`;
      }
    }
    return undefined;
  }, [failedPhaseStep, phaseSteps]);

  const defaultResumeFromStepId = nextStepAfterFailedId || failedPhaseStepId;

  const activeStepId = React.useMemo(() => {
    if (resumeFromStepId) {
      return resumeFromStepId;
    }
    if (resumeAction === 'retry_step') {
      return failedPhaseStepId;
    }
    if (resumeAction === 'resolve_by_human' || resumeAction === 'resume_from_step') {
      return nextStepAfterFailedId || failedPhaseStepId;
    }
    return undefined;
  }, [resumeFromStepId, resumeAction, failedPhaseStepId, nextStepAfterFailedId]);

  const phaseLoopIteration = React.useMemo(() => {
    const value = (failedPhaseStep?.input as { loopIteration?: number | string } | undefined)?.loopIteration
      ?? (phase?.input as { loopIteration?: number | string } | undefined)?.loopIteration;
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return undefined;
  }, [failedPhaseStep?.input, phase?.input]);

  const invalidateExecutionQueries = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries(['executions']),
      queryClient.invalidateQueries(['execution', executionId]),
      queryClient.invalidateQueries(['execution-steps', executionId]),
      queryClient.invalidateQueries(['execution-phases', executionId]),
    ]);
    await onAfterSuccess?.();
  }, [executionId, onAfterSuccess, queryClient]);

  const buildPatch = React.useCallback(() => {
    if (resumeAction === 'resolve_by_human' || resumeAction === 'resume_from_step') {
      const effectiveResumeStepId =
        activeStepId ||
        nextStepAfterFailedId ||
        (failedPhaseStepId && /^step_\d+$/.test(failedPhaseStepId)
          ? `step_${parseInt(failedPhaseStepId.replace('step_', ''), 10) + 1}`
          : undefined);
      return {
        type: 'resolve_by_human',
        failedStepId: failedPhaseStepId || '',
        ...(phaseLoopIteration ? { loopIteration: phaseLoopIteration } : {}),
        ...(effectiveResumeStepId ? { resumeFromStepId: effectiveResumeStepId } : {}),
        note: reviewComment.trim() || RECOVERY_COPY.resolveByHumanNote,
      };
    }
    if (resumeAction === 'retry_step') {
      return {
        type: 'retry_step',
        failedStepId: failedPhaseStepId || '',
        ...(phaseLoopIteration ? { loopIteration: phaseLoopIteration } : {}),
        resumeFromStepId: failedPhaseStepId,
        note: reviewComment.trim() || RECOVERY_COPY.retryNote,
      };
    }
    return null;
  }, [activeStepId, failedPhaseStepId, nextStepAfterFailedId, phaseLoopIteration, resumeAction, reviewComment]);

  const applyRecoveryMutation = useMutation(
    async () => {
      let targetStepId: string | undefined;
      if (resumeAction === 'resolve_by_human' || resumeAction === 'resume_from_step') {
        targetStepId = activeStepId;
      } else if (resumeAction === 'retry_step') {
        targetStepId = failedPhaseStepId;
      } else {
        targetStepId = undefined;
      }

      const resumePayload = {
        ...(targetStepId ? { stepId: targetStepId } : {}),
        comment: reviewComment.trim() || undefined,
      };

      if (phase) {
        if (phase.status === 'waiting_takeover') {
          await executionApi.reconcilePhaseTakeover(executionId, phase.phaseKey, {
            patch: buildPatch(),
            comment: reviewComment.trim() || undefined,
          });
        }
        return executionApi.resumePhaseTakeover(executionId, phase.phaseKey, resumePayload);
      }
      if (executionStatus === 'human_control') {
        return executionApi.releaseHumanControl(executionId, resumePayload);
      }
      throw new Error(RECOVERY_COPY.noRecoverablePhase);
    },
    {
      onSuccess: async () => {
        void message.success(RECOVERY_COPY.successResume);
        await invalidateExecutionQueries();
      },
      onError: (error: Error) => {
        void message.error(error.message);
      },
    }
  );

  const cancelMutation = useMutation(() => executionApi.cancel(executionId), {
    onSuccess: async () => {
      void message.success(RECOVERY_COPY.successCancel);
      await invalidateExecutionQueries();
    },
    onError: (error: Error) => {
      void message.error(`${RECOVERY_COPY.cancelErrorPrefix}：${error.message}`);
    },
  });

  const canResume = Boolean(
    phase
      ? phase.status === 'waiting_takeover' || phase.status === 'resumable'
      : executionStatus === 'human_control'
  );
  const isTakeoverPhase = phase?.status === 'waiting_takeover';

  const actionButtonLabel =
    RECOVERY_ACTION_BUTTON_LABELS[resumeAction] || RECOVERY_COPY.applyAndResume;
  const confirmModalDetails =
    RECOVERY_CONFIRM_DETAILS[resumeAction] || {
      title: RECOVERY_COPY.resumeConfirmTitle,
      desc: RECOVERY_COPY.resumeConfirmDesc,
      hint: RECOVERY_COPY.resumeConfirmHint,
      okText: RECOVERY_COPY.resumeConfirmOk,
    };

  return {
    resumeAction,
    setResumeAction,
    resumeFromStepId,
    setResumeFromStepId,
    showAdvancedStepSelect,
    setShowAdvancedStepSelect,
    showResumeConfirm,
    setShowResumeConfirm,
    showCancelConfirm,
    setShowCancelConfirm,
    reviewComment,
    setReviewComment,
    phaseSteps,
    failedPhaseStep,
    failedPhaseStepId,
    nextStepAfterFailedId,
    defaultResumeFromStepId,
    activeStepId,
    actionButtonLabel,
    confirmModalDetails,
    phaseLoopIteration,
    applyRecoveryMutation,
    cancelMutation,
    canResume,
    isTakeoverPhase,
    isRecoveryResumeAction,
  };
}
