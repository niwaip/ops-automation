import { useMemo, type ComponentProps, type ReactElement } from 'react';
import type { FormInstance } from 'antd';
import ExecutionCreateAiModal from '@/features/executions/components/ExecutionCreateAiModal';
import ExecutionCreateScheduleListCard from '@/features/executions/components/ExecutionCreateScheduleListCard';
import ExecutionCreateSkillInfoCard from '@/features/executions/components/ExecutionCreateSkillInfoCard';
import type { ScheduleDto } from '@/api/schedules';
import type { SkillConfigDTO } from '@/api/skill';
import type { ExecutionCreateFormValues, SchedulePattern, SchemaField } from '@/features/executions/lib/executionCreate';
import {
  buildExecutionCreateScheduleRuleSummary,
  buildExecutionCreateStatusNotices,
  buildExecutionCreateSubmitAction,
} from '@/features/executions/lib/executionCreatePageView';

type SkillInfoCardProps = ComponentProps<typeof ExecutionCreateSkillInfoCard>;
type ScheduleListCardProps = ComponentProps<typeof ExecutionCreateScheduleListCard>;
type AiModalProps = ComponentProps<typeof ExecutionCreateAiModal>;

interface UseExecutionCreatePageViewOptions {
  form: FormInstance<ExecutionCreateFormValues>;
  selectedSkill?: SkillConfigDTO;
  selectedSkillDisplayName: string;
  selectedSkillId?: string;
  selectedSkillLoading: boolean;
  schemaFields: SchemaField[];
  executionMode: ExecutionCreateFormValues['executionMode'];
  schedulePattern: SchedulePattern;
  createLoading: boolean;
  scheduleLoading: boolean;
  schedulesLoading: boolean;
  skillSchedules: ScheduleDto[];
  activeScheduleCount: number;
  togglingScheduleId?: string;
  deletingScheduleId?: string;
  triggeringScheduleId?: string;
  loadingIndicator: ReactElement;
  aiGenerating: boolean;
  aiModalOpen: boolean;
  aiTextInput: string;
  uploadedFileName?: string;
  onAiTextInputChange: (value: string) => void;
  onUploadedFileRead: (payload: { content: string; fileName: string }) => void;
  onCloseAiModal: () => void;
  onGenerateAiParams: () => void;
  onSwitchToScheduleMode: () => void;
  onToggleSchedule: ScheduleListCardProps['onToggleSchedule'];
  onDeleteSchedule: ScheduleListCardProps['onDeleteSchedule'];
  onTriggerSchedule: ScheduleListCardProps['onTriggerSchedule'];
}

export function useExecutionCreatePageView({
  form,
  selectedSkill,
  selectedSkillDisplayName,
  selectedSkillId,
  selectedSkillLoading,
  executionMode,
  schedulePattern,
  createLoading,
  scheduleLoading,
  schedulesLoading,
  skillSchedules,
  activeScheduleCount,
  togglingScheduleId,
  deletingScheduleId,
  triggeringScheduleId,
  loadingIndicator,
  aiGenerating,
  aiModalOpen,
  aiTextInput,
  uploadedFileName,
  onAiTextInputChange,
  onUploadedFileRead,
  onCloseAiModal,
  onGenerateAiParams,
  onSwitchToScheduleMode,
  onToggleSchedule,
  onDeleteSchedule,
  onTriggerSchedule,
}: UseExecutionCreatePageViewOptions) {
  const statusNotices = useMemo(
    () =>
      buildExecutionCreateStatusNotices({
        createLoading,
        scheduleLoading,
      }),
    [createLoading, scheduleLoading]
  );

  const submitAction = useMemo(
    () =>
      buildExecutionCreateSubmitAction({
        executionMode,
        createLoading,
        scheduleLoading,
        selectedSkillId,
      }),
    [createLoading, executionMode, scheduleLoading, selectedSkillId]
  );

  const scheduleRuleSummary = useMemo(
    () =>
      buildExecutionCreateScheduleRuleSummary({
        schedulePattern,
        scheduleHour: form.getFieldValue('scheduleHour'),
        scheduleMinute: form.getFieldValue('scheduleMinute'),
        weeklyDays: form.getFieldValue('weeklyDays'),
        monthlyDay: form.getFieldValue('monthlyDay'),
      }),
    [form, schedulePattern]
  );

  const skillInfoCardProps = useMemo<SkillInfoCardProps>(
    () => ({
      selectedSkillId,
      selectedSkillDisplayName,
      selectedSkill,
      skillLoading: selectedSkillLoading,
      loadingIndicator,
    }),
    [
      loadingIndicator,
      selectedSkill,
      selectedSkillDisplayName,
      selectedSkillId,
      selectedSkillLoading,
    ]
  );

  const scheduleListCardProps = useMemo<ScheduleListCardProps>(
    () => ({
      selectedSkillId,
      schedulesLoading,
      schedules: skillSchedules,
      activeScheduleCount,
      togglingScheduleId,
      deletingScheduleId,
      triggeringScheduleId,
      onCreateSchedule: onSwitchToScheduleMode,
      onToggleSchedule,
      onDeleteSchedule,
      onTriggerSchedule,
    }),
    [
      activeScheduleCount,
      deletingScheduleId,
      onDeleteSchedule,
      onSwitchToScheduleMode,
      onToggleSchedule,
      onTriggerSchedule,
      schedulesLoading,
      selectedSkillId,
      skillSchedules,
      togglingScheduleId,
      triggeringScheduleId,
    ]
  );

  const aiModalProps = useMemo<AiModalProps>(
    () => ({
      open: aiModalOpen,
      aiGenerating,
      aiTextInput,
      uploadedFileName,
      onAiTextInputChange,
      onUploadedFileRead,
      onCancel: onCloseAiModal,
      onGenerate: onGenerateAiParams,
    }),
    [
      aiGenerating,
      aiModalOpen,
      aiTextInput,
      onAiTextInputChange,
      onCloseAiModal,
      onGenerateAiParams,
      onUploadedFileRead,
      uploadedFileName,
    ]
  );

  return {
    aiModalProps,
    scheduleListCardProps,
    scheduleRuleSummary,
    skillInfoCardProps,
    statusNotices,
    submitAction,
  };
}
