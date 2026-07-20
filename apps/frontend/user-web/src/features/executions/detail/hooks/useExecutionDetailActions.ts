import { useMutation, useQueryClient } from 'react-query';
import { executionApi } from '@/api/execution';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';

interface ExecutionDetailActionText {
  inputSubmitted: string;
  submitInputFailed: string;
  executionApproved: string;
  approveFailed: string;
  executionRejected: string;
  rejectFailed: string;
  takeoverApproveSuccess: string;
  takeoverApproveFailed: string;
}

interface UseExecutionDetailActionsOptions {
  id?: string;
  execution?: ExecutionDto;
  currentPhase?: ExecutionPhaseDto;
  waitingInputStep?: ExecutionStepDto;
  defaultResumeFromCurrentPhaseStepId?: string;
  failedCurrentPhaseStepId?: string;
  currentPhaseLoopIteration?: number;
  isEnglish: boolean;
  text: ExecutionDetailActionText;
  onSuccessMessage: (content: string) => void;
  onErrorMessage: (content: string) => void;
}

export function useExecutionDetailActions({
  id,
  execution,
  currentPhase,
  waitingInputStep,
  defaultResumeFromCurrentPhaseStepId,
  failedCurrentPhaseStepId,
  currentPhaseLoopIteration,
  isEnglish,
  text,
  onSuccessMessage,
  onErrorMessage,
}: UseExecutionDetailActionsOptions) {
  const queryClient = useQueryClient();

  const submitInputMutation = useMutation(
    async (values: Record<string, unknown>) => {
      if (!id || !waitingInputStep) {
        throw new Error(text.submitInputFailed);
      }
      return executionApi.submitInput(id, {
        stepId: waitingInputStep.id,
        input: values,
      });
    },
    {
      onSuccess: () => {
        onSuccessMessage(text.inputSubmitted);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        onErrorMessage(`${text.submitInputFailed}: ${error.message}`);
      },
    }
  );

  const approveMutation = useMutation(
    async () => {
      if (!id) {
        throw new Error(text.approveFailed);
      }
      return executionApi.approve(id);
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(['execution-phases', id]);
        onSuccessMessage(text.executionApproved);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        onErrorMessage(`${text.approveFailed}: ${error.message}`);
      },
    }
  );

  const rejectMutation = useMutation(
    async () => {
      if (!id) {
        throw new Error(text.rejectFailed);
      }
      return executionApi.reject(id);
    },
    {
      onSuccess: () => {
        onSuccessMessage(text.executionRejected);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        onErrorMessage(`${text.rejectFailed}: ${error.message}`);
      },
    }
  );

  const approveAndContinueMutation = useMutation(
    async () => {
      if (!id) {
        throw new Error(text.takeoverApproveFailed);
      }

      const phaseKey = execution?.currentPhaseKey || currentPhase?.phaseKey;
      const comment = isEnglish ? 'Approved by human review and continue' : '同意并继续';
      const resumeStepId = defaultResumeFromCurrentPhaseStepId;
      const payload = {
        stepId: resumeStepId || execution?.currentStepId || undefined,
        comment,
      };

      if (phaseKey) {
        if (currentPhase?.status === 'waiting_takeover' && failedCurrentPhaseStepId) {
          await executionApi.reconcilePhaseTakeover(id, phaseKey, {
            patch: {
              type: 'resolve_by_human',
              failedStepId: failedCurrentPhaseStepId,
              ...(currentPhaseLoopIteration ? { loopIteration: currentPhaseLoopIteration } : {}),
              ...(resumeStepId && resumeStepId !== failedCurrentPhaseStepId
                ? { resumeFromStepId: resumeStepId }
                : {}),
              note: comment,
            },
            comment,
          });
        }
        return executionApi.resumePhaseTakeover(id, phaseKey, payload);
      }

      return executionApi.releaseHumanControl(id, payload);
    },
    {
      onSuccess: () => {
        onSuccessMessage(text.takeoverApproveSuccess);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
        void queryClient.invalidateQueries(['execution-phases', id]);
      },
      onError: (error: Error) => {
        onErrorMessage(`${text.takeoverApproveFailed}: ${error.message}`);
      },
    }
  );

  return {
    approveAndContinueMutation,
    approveMutation,
    rejectMutation,
    submitInputMutation,
  };
}
