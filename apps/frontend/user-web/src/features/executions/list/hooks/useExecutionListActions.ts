import { useMutation, useQueryClient } from 'react-query';
import { message, Modal } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import type { ExecutionDto, ExecutionPhaseDto, ExecutionStepDto } from '@/api/execution';
import { executionApi } from '@/api/execution';
import { useChatStore } from '@/features/chat';
import { RECOVERY_COPY } from '@/features/executions/shared/components/recoveryOptions';
import type { RequiredInputField } from '@/features/executions/create/lib/inputFields';
import { normalizeRequiredInputValues } from '@/features/executions/create/lib/inputFields';
import { buildAiResumeDraft } from '@/features/executions/list/lib/listHelpers';

type ResumeFormValue =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[]
  | null
  | undefined;

type ResumeFormValues = Record<string, ResumeFormValue>;

const toResumeFormValue = (value: unknown): ResumeFormValue => {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    Array.isArray(value)
  ) {
    return value;
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return undefined;
};

interface UseExecutionListActionsOptions {
  selectedExecutionId?: string;
  selectedExecution?: ExecutionDto;
  waitingInputStep?: ExecutionStepDto;
  requiredInputs: RequiredInputField[];
  clearSelection: () => void;
}

export function useExecutionListActions({
  selectedExecutionId,
  selectedExecution,
  waitingInputStep,
  requiredInputs,
  clearSelection,
}: UseExecutionListActionsOptions) {
  const queryClient = useQueryClient();
  const {
    createSession,
    setOpen,
    setChatMode,
    setDraftMessage,
    setDraftExecutionId,
  } = useChatStore();

  const openAiTaskMode = (draft: string, executionId: string) => {
    createSession();
    setChatMode('task');
    setDraftMessage(draft);
    setDraftExecutionId(executionId);
    setOpen(true);
    clearSelection();
  };

  const submitInputMutation = useMutation(
    async ({ payload }: { payload: Record<string, unknown> }) => {
      if (!selectedExecutionId || !waitingInputStep) {
        throw new Error('当前执行不处于待补参状态');
      }

      return executionApi.submitInput(selectedExecutionId, {
        stepId: waitingInputStep.id,
        input: payload,
      });
    },
    {
      onSuccess: async () => {
        void message.success('已补充输入，执行继续进行中');
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['execution', selectedExecutionId]),
          queryClient.invalidateQueries(['execution-steps', selectedExecutionId]),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
        ]);
      },
      onError: (error: Error) => {
        void message.error(`${RECOVERY_COPY.resumeErrorPrefix}：${error.message}`);
      },
    }
  );

  const cleanupExecutionsMutation = useMutation(
    async ({ beforeDate }: { beforeDate: string }) => {
      const response = await executionApi.cleanupBeforeDate({ beforeDate });
      return {
        beforeDate,
        deletedCount: response.deletedCount,
      };
    },
    {
      onSuccess: async ({ beforeDate, deletedCount }) => {
        const cutoff = new Date(`${beforeDate}T00:00:00`).getTime();
        const selectedExecutionCreatedAt = selectedExecution?.createdAt
          ? new Date(selectedExecution.createdAt).getTime()
          : Number.NaN;

        if (selectedExecutionId && Number.isFinite(selectedExecutionCreatedAt) && selectedExecutionCreatedAt < cutoff) {
          clearSelection();
        }

        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['execution']),
          queryClient.invalidateQueries(['execution-steps']),
        ]);

        void message.success(
          deletedCount > 0
            ? `已清理 ${beforeDate} 之前的 ${deletedCount} 条执行记录`
            : `没有找到 ${beforeDate} 之前可清理的执行记录`
        );
      },
      onError: (error: Error) => {
        void message.error(`清理执行记录失败：${error.message}`);
      },
    }
  );

  const phaseTakeoverMutation = useMutation(
    async (phase: ExecutionPhaseDto) => {
      if (!selectedExecutionId) {
        throw new Error('未选择执行记录');
      }
      return executionApi.takeoverPhase(selectedExecutionId, phase.phaseKey, {
        reason: phase.errorMessage || phase.errorCode || phase.phaseName || phase.phaseKey,
      });
    },
    {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['execution', selectedExecutionId]),
          queryClient.invalidateQueries(['execution-steps', selectedExecutionId]),
        ]);
        void message.success(RECOVERY_COPY.successTakeover);
      },
      onError: (error: Error) => {
        void message.error(`${RECOVERY_COPY.takeoverErrorPrefix}：${error.message}`);
      },
    }
  );

  const submitWaitingInput = (values: Record<string, unknown>) => {
    try {
      const payload = normalizeRequiredInputValues(values, requiredInputs, {
        treatArrayAsJson: true,
      });
      submitInputMutation.mutate({ payload });
    } catch (error) {
      void message.error(error instanceof Error ? error.message : RECOVERY_COPY.resumeErrorPrefix);
    }
  };

  const handleResumeExecution = async (
    openInAi: boolean,
    form?: FormInstance<ResumeFormValues>
  ) => {
    if (!selectedExecution || !waitingInputStep) {
      return;
    }

    try {
      const values =
        (await form?.validateFields()) ||
        requiredInputs.reduce<ResumeFormValues>((acc, field) => {
          acc[field.name] = toResumeFormValue(field.value);
          return acc;
        }, {} as ResumeFormValues);
      const payload = normalizeRequiredInputValues(values, requiredInputs, {
        treatArrayAsJson: true,
      });

      if (openInAi) {
        openAiTaskMode(buildAiResumeDraft(selectedExecution, payload), selectedExecution.id);
        void message.success('已切换到 AI 任务模式，待你发送后再继续处理');
        return;
      }

      submitInputMutation.mutate({ payload });
    } catch (error) {
      if (error instanceof Error) {
        void message.error(error.message);
      }
    }
  };

  const handleCleanupBeforeDate = (clearBeforeDate: Dayjs | null | undefined) => {
    if (!clearBeforeDate) {
      void message.info('请先选择清理日期');
      return;
    }

    const beforeDate = clearBeforeDate.format('YYYY-MM-DD');
    Modal.confirm({
      title: '清理指定日期之前的执行记录？',
      content: `将删除 ${beforeDate} 之前创建的执行记录，默认仅清理当前用户自己的记录，此操作不可恢复。`,
      okText: '确认清理',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
        loading: cleanupExecutionsMutation.isLoading,
      },
      onOk: async () => {
        await cleanupExecutionsMutation.mutateAsync({ beforeDate });
      },
    });
  };

  return {
    cleanupExecutionsMutation,
    submitInputMutation,
    phaseTakeoverMutation,
    submitWaitingInput,
    handleResumeExecution,
    handleCleanupBeforeDate,
  };
}
