import type { ExecutionCreateFormValues, SchedulePattern } from '@/features/executions/create/lib/executionCreate';
import { buildScheduleRuleText } from '@/features/executions/create/lib/executionCreate';

interface BuildExecutionCreateStatusNoticesOptions {
  createLoading: boolean;
  scheduleLoading: boolean;
}

export interface ExecutionCreateStatusNotice {
  key: string;
  message: string;
  description: string;
}

export function buildExecutionCreateStatusNotices({
  createLoading,
  scheduleLoading,
}: BuildExecutionCreateStatusNoticesOptions): ExecutionCreateStatusNotice[] {
  return [
    createLoading
      ? {
          key: 'create',
          message: '正在创建执行单',
          description: '请求已经提交，系统正在创建执行单并准备跳转详情页，请稍候。',
        }
      : null,
    scheduleLoading
      ? {
          key: 'schedule',
          message: '正在创建定时任务',
          description: '请求已经提交，系统正在保存 Cron 配置并计算下一次执行时间，请稍候。',
        }
      : null,
  ].filter(Boolean) as ExecutionCreateStatusNotice[];
}

interface BuildExecutionCreateSubmitActionOptions {
  executionMode: ExecutionCreateFormValues['executionMode'];
  createLoading: boolean;
  scheduleLoading: boolean;
  selectedSkillId?: string;
}

export function buildExecutionCreateSubmitAction({
  executionMode,
  createLoading,
  scheduleLoading,
  selectedSkillId,
}: BuildExecutionCreateSubmitActionOptions) {
  return {
    label: executionMode === 'schedule' ? '创建定时任务' : '创建执行',
    loading: createLoading || scheduleLoading,
    disabled: !selectedSkillId,
  };
}

interface BuildExecutionCreateScheduleRuleSummaryOptions {
  schedulePattern: SchedulePattern;
  scheduleHour?: string;
  scheduleMinute?: string;
  weeklyDays?: string[];
  monthlyDay?: number;
}

export function buildExecutionCreateScheduleRuleSummary({
  schedulePattern,
  scheduleHour,
  scheduleMinute,
  weeklyDays,
  monthlyDay,
}: BuildExecutionCreateScheduleRuleSummaryOptions) {
  return buildScheduleRuleText({
    schedulePattern,
    scheduleHour,
    scheduleMinute,
    weeklyDays,
    monthlyDay,
  });
}
