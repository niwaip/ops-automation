import { App, type FormInstance } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from 'react-query';
import { executionApi } from '@/api/execution';
import { scheduleApi } from '@/api/schedules';
import type { ExecutionCreateFormValues, SchemaField } from '@/features/executions/create/lib/executionCreate';
import {
  buildExecutionScheduleCreateRequest,
  buildExecutionScheduleToggleInput,
  buildScheduleCronExpression,
  WEEKDAY_LABEL_MAP,
  getDefaultScheduleName,
  normalizeInputValues,
} from '@/features/executions/create/lib/executionCreate';
import { formatLocalizedDateTime } from '@/shared/utils/dateText';
import { summarizeCronExpression } from '@/shared/utils/scheduleText';

interface UseExecutionCreateActionsOptions {
  form: FormInstance;
  schemaFields: SchemaField[];
  selectedSkillDisplayName: string;
}

export function useExecutionCreateActions({
  form,
  schemaFields,
  selectedSkillDisplayName,
}: UseExecutionCreateActionsOptions) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createMutation = useMutation(
    async (values: ExecutionCreateFormValues) => {
      return executionApi.create({
        skillId: values.skillId,
        input: normalizeInputValues(values.input || {}, schemaFields),
      });
    },
    {
      onSuccess: async (execution) => {
        void message.success('执行已创建');
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['dashboard-executions-total']),
          queryClient.invalidateQueries(['dashboard-executions-running']),
          queryClient.invalidateQueries(['dashboard-executions-pending-approval']),
        ]);
        navigate(`/executions/${execution.id}`);
      },
      onError: (error: Error) => {
        void message.error(`创建执行失败：${error.message}`);
      },
    }
  );

  const scheduleMutation = useMutation(
    async (values: ExecutionCreateFormValues) => {
      return scheduleApi.create(
        buildExecutionScheduleCreateRequest({
          values,
          schemaFields,
          selectedSkillDisplayName,
        })
      );
    },
    {
      onSuccess: async (schedule) => {
        void message.success(
          `定时任务已创建：${summarizeCronExpression(schedule.cronExpression, {
            workdaysLabel: '每个工作日',
            weekdayLabelMap: WEEKDAY_LABEL_MAP,
          })}，下次执行时间：${formatLocalizedDateTime(schedule.nextRunAt)}`
        );
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['dashboard-executions-total']),
          queryClient.invalidateQueries(['dashboard-executions-running']),
          queryClient.invalidateQueries(['dashboard-executions-pending-approval']),
          queryClient.invalidateQueries(['execution-create-schedules']),
        ]);
        form.setFieldsValue({
          scheduleName: getDefaultScheduleName(selectedSkillDisplayName),
          scheduleDescription: undefined,
          schedulePattern: 'workdays',
          scheduleHour: '09',
          scheduleMinute: '00',
          weeklyDays: ['1'],
          monthlyDay: 1,
        });
      },
      onError: (error: Error) => {
        void message.error(`创建定时任务失败：${error.message}`);
      },
    }
  );

  const toggleScheduleMutation = useMutation(
    async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return scheduleApi.update(id, buildExecutionScheduleToggleInput(isActive));
    },
    {
      onSuccess: async (schedule) => {
        void message.success(`${schedule.name} 已${schedule.isActive ? '启用' : '停用'}`);
        await queryClient.invalidateQueries(['execution-create-schedules']);
      },
      onError: (error: Error) => {
        void message.error(`更新定时任务状态失败：${error.message}`);
      },
    }
  );

  const triggerScheduleMutation = useMutation(
    async (id: string) => scheduleApi.trigger(id),
    {
      onSuccess: async () => {
        void message.success('已触发一次立即执行');
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['execution-create-schedules']),
        ]);
      },
      onError: (error: Error) => {
        void message.error(`触发定时任务失败：${error.message}`);
      },
    }
  );

  const deleteScheduleMutation = useMutation(
    async (id: string) => scheduleApi.delete(id),
    {
      onSuccess: async () => {
        void message.success('定时任务已删除');
        await queryClient.invalidateQueries(['execution-create-schedules']);
      },
      onError: (error: Error) => {
        void message.error(`删除定时任务失败：${error.message}`);
      },
    }
  );

  const handleSubmit = (values: ExecutionCreateFormValues) => {
    try {
      if (values.executionMode === 'schedule') {
        scheduleMutation.mutate(values);
        return;
      }
      createMutation.mutate(values);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '输入格式无效');
    }
  };

  return {
    createMutation,
    deleteScheduleMutation,
    handleSubmit,
    scheduleMutation,
    toggleScheduleMutation,
    triggerScheduleMutation,
  };
}
