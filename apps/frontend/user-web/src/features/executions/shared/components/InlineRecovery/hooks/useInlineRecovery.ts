import React from 'react';
import { message } from 'antd';
import { useMutation, useQueryClient } from 'react-query';
import { executionApi, ExecutionDto, ExecutionPhaseDto } from '@/api/execution';
import {
  RECOVERY_COPY,
  RecoveryResumeAction,
} from '../../recoveryOptions';

interface PhaseStep {
  stepId?: string;
  id?: string;
  stepIndex?: number;
  action?: string;
  status: string;
}

const getPhaseSteps = (phase?: ExecutionPhaseDto): PhaseStep[] =>
  (Array.isArray(phase?.steps) ? phase.steps : []) as unknown as PhaseStep[];

const isRecoveryResumeAction = (value: unknown): value is RecoveryResumeAction =>
  value === 'retry' || value === 'resolve_by_human' || value === 'resume_from_step';

export const RECOVERY_ACTION_DESCRIPTIONS: Record<RecoveryResumeAction, string> = {
  resume_from_step: '从当前异常点继续，优先用于人工确认后继续后续流程。',
  resolve_by_human: '标记该步骤已由人工处理，跳过当前阶段并继续执行。',
  retry: '重新运行当前阶段，适用于页面或条件判断需要再次验证的场景。',
};

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
  defaultResumeFromStepId: string | undefined;
  activeStepId: string | undefined;
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
  const [resumeAction, setResumeAction] = React.useState<RecoveryResumeAction>('resume_from_step');
  const [resumeFromStepId, setResumeFromStepId] = React.useState<string | undefined>(undefined);
  const [showAdvancedStepSelect, setShowAdvancedStepSelect] = React.useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = React.useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);
  const [reviewComment, setReviewComment] = React.useState('');
  const phaseSteps = React.useMemo(() => getPhaseSteps(phase), [phase]);

  const failedPhaseStep = React.useMemo(
    () =>
      phaseSteps.find((step) => ['failed', 'takeover_required', 'blocked'].includes(step.status)) ||
      phaseSteps.find((step) => step.status !== 'completed') ||
      phaseSteps[phaseSteps.length - 1],
    [currentStepId, phaseSteps]
  );

  const failedPhaseStepId = React.useMemo(() => {
    if (failedPhaseStep?.stepId || failedPhaseStep?.id) {
      return failedPhaseStep.stepId || failedPhaseStep.id;
    }
    return currentStepId;
  }, [currentStepId, failedPhaseStep]);

  const defaultResumeFromStepId = React.useMemo(() => {
    if (!failedPhaseStepId) {
      return undefined;
    }
    const failedIndex = phaseSteps.findIndex(
      (step) => (step.stepId || step.id) === failedPhaseStepId
    );
    if (failedIndex >= 0 && phaseSteps[failedIndex + 1]) {
      return phaseSteps[failedIndex + 1].stepId || phaseSteps[failedIndex + 1].id;
    }
    return failedPhaseStepId;
  }, [failedPhaseStepId, phaseSteps]);

  const phaseLoopIteration = React.useMemo(() => {
    const value = (phase?.input as { loopIteration?: number | string } | undefined)?.loopIteration;
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
  }, [phase?.input]);

  const activeStepId = resumeFromStepId || defaultResumeFromStepId || failedPhaseStepId;

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
    if (resumeAction === 'resume_from_step' && activeStepId) {
      return {
        type: 'resolve_by_human',
        failedStepId: failedPhaseStepId || '',
        ...(phaseLoopIteration ? { loopIteration: phaseLoopIteration } : {}),
        resumeFromStepId: activeStepId,
        note: reviewComment.trim() || RECOVERY_COPY.retryNote,
      };
    }
    if (resumeAction === 'resolve_by_human') {
      return {
        type: 'resolve_by_human',
        failedStepId: failedPhaseStepId || '',
        ...(phaseLoopIteration ? { loopIteration: phaseLoopIteration } : {}),
        note: reviewComment.trim() || RECOVERY_COPY.resolveByHumanNote,
      };
    }
    return null;
  }, [failedPhaseStepId, phaseLoopIteration, resumeAction, activeStepId, reviewComment]);

  const applyRecoveryMutation = useMutation(
    async () => {
      const resumePayload = {
        ...(resumeAction === 'resume_from_step' && activeStepId ? { stepId: activeStepId } : {}),
      };
      if (phase) {
        if (phase.status === 'waiting_takeover') {
          await executionApi.reconcilePhaseTakeover(executionId, phase.phaseKey, {
            patch: buildPatch(),
            comment: reviewComment.trim() || undefined,
          });
        }
        return executionApi.resumePhaseTakeover(executionId, phase.phaseKey, {
          ...resumePayload,
          comment: reviewComment.trim() || undefined,
        });
      }
      if (executionStatus === 'human_control') {
        return executionApi.releaseHumanControl(executionId, {
          ...resumePayload,
          comment: reviewComment.trim() || undefined,
        });
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
    defaultResumeFromStepId,
    activeStepId,
    phaseLoopIteration,
    applyRecoveryMutation,
    cancelMutation,
    canResume,
    isTakeoverPhase,
    isRecoveryResumeAction,
  };
}
