import { useCallback, useMemo } from 'react';
import { useQuery } from 'react-query';
import {
  type ExecutionDto,
  type ExecutionStatus,
} from '@ops/user-core';
import { executionApi, scheduleApi, skillApi } from '../../../api';
import type { WorkbenchHandledExecutionMap } from '../lib/workbenchHandledExecutionStorage';

const ACTIONABLE_STATUSES: ExecutionStatus[] = [
  'human_control',
  'pending_approval',
  'waiting_input',
  'failed',
];

const PRIORITY_PANEL_STATUSES: ExecutionStatus[] = [...ACTIONABLE_STATUSES, 'running'];

const getExecutionDisplayTime = (execution: ExecutionDto): string =>
  execution.endedAt || execution.updatedAt || execution.startedAt || execution.createdAt;

const isWithinRecentDays = (value: string | undefined, days: number): boolean => {
  if (!value) {
    return false;
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
};

const sanitizeDisplayName = (value?: string): string => {
  if (!value) {
    return '';
  }
  return value.replace(/-[a-f0-9]{8}(?=(\s|$))/gi, '').trim();
};

const prettifyFailureReason = (value?: string): string => {
  const reason = value?.trim();
  if (!reason) {
    return '';
  }

  if (/status code 404/i.test(reason)) {
    return '相关资源不存在，请打开详情查看具体失败步骤。';
  }
  if (/status code 40[13]/i.test(reason)) {
    return '请求未通过权限校验，请打开详情确认权限与登录态。';
  }
  if (/status code 5\d\d/i.test(reason)) {
    return '下游服务处理失败，请稍后重试或打开详情排查。';
  }
  if (/ECONNREFUSED|ERR_CONNECTION|Network Error|getaddrinfo|ENOTFOUND/i.test(reason)) {
    return '网络或依赖服务暂时不可用，请打开详情查看调用链路。';
  }

  return reason;
};

const sortByExecutionTimeDesc = (items: ExecutionDto[]): ExecutionDto[] =>
  [...items].sort(
    (left, right) =>
      new Date(getExecutionDisplayTime(right)).getTime() -
      new Date(getExecutionDisplayTime(left)).getTime()
  );

interface UseWorkbenchExecutionsOptions {
  handledExecutions: WorkbenchHandledExecutionMap;
}

export function useWorkbenchExecutions({
  handledExecutions,
}: UseWorkbenchExecutionsOptions) {
  const executionsQuery = useQuery(['dashboard-executions'], () =>
    executionApi.list({ page: 1, pageSize: 100 }),
    {
      staleTime: 30000,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
    }
  );
  const schedulesQuery = useQuery(
    ['dashboard-schedules'],
    async () => scheduleApi.list(),
    {
      staleTime: 60000,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
    }
  );
  const skillsQuery = useQuery(['dashboard-skills-name-map'], () => skillApi.list(), {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const executions = useMemo(
    () => sortByExecutionTimeDesc(executionsQuery.data?.data || []),
    [executionsQuery.data]
  );
  const schedules = useMemo(
    () =>
      [...(schedulesQuery.data || [])].sort(
        (left, right) =>
          new Date(right.nextRunAt || right.id).getTime() -
          new Date(left.nextRunAt || left.id).getTime()
      ),
    [schedulesQuery.data]
  );
  const activeSchedules = useMemo(
    () =>
      [...schedules]
        .filter((item) => item.isActive)
        .sort(
          (left, right) =>
            new Date(left.nextRunAt || left.id).getTime() -
            new Date(right.nextRunAt || right.id).getTime()
        ),
    [schedules]
  );
  const upcomingSchedules = activeSchedules.slice(0, 3);
  const skillNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (skillsQuery.data?.skills || []).forEach((skill) => {
      map.set(skill.id, skill.name);
    });
    return map;
  }, [skillsQuery.data?.skills]);
  const manualQueue = useMemo(
    () =>
      sortByExecutionTimeDesc(
        executions.filter((item) => ACTIONABLE_STATUSES.includes(item.status))
      ),
    [executions]
  );
  const priorityQueue = useMemo(
    () =>
      sortByExecutionTimeDesc(
        executions.filter((item) => PRIORITY_PANEL_STATUSES.includes(item.status))
      ),
    [executions]
  );
  const priorityQueueDisplay = useMemo(
    () => priorityQueue.filter((item) => !handledExecutions[item.id]),
    [handledExecutions, priorityQueue]
  );
  const recentSuccessfulExecutions = useMemo(
    () => executions.filter((item) => item.status === 'succeeded').slice(0, 5),
    [executions]
  );
  const todayCompletedExecutions = useMemo(
    () =>
      executions.filter(
        (item) => item.status === 'succeeded' && isWithinRecentDays(getExecutionDisplayTime(item), 1)
      ),
    [executions]
  );
  const weekCompletedExecutions = useMemo(
    () =>
      executions.filter(
        (item) => item.status === 'succeeded' && isWithinRecentDays(getExecutionDisplayTime(item), 7)
      ),
    [executions]
  );
  const todayFailedExecutions = useMemo(
    () =>
      executions.filter(
        (item) => item.status === 'failed' && isWithinRecentDays(getExecutionDisplayTime(item), 1)
      ),
    [executions]
  );

  const getSkillDisplayName = useCallback(
    (skillId?: string): string => {
      if (!skillId) {
        return '未关联技能';
      }
      return sanitizeDisplayName(skillNameMap.get(skillId)) || '未命名技能';
    },
    [skillNameMap]
  );

  const getExecutionDisplayDescription = useCallback(
    (execution: ExecutionDto): string => {
      if (execution.failureReason?.trim()) {
        return prettifyFailureReason(execution.failureReason);
      }
      if (execution.takeoverReason?.trim()) {
        return execution.takeoverReason;
      }
      if (execution.normalizedResult?.summary?.trim()) {
        return execution.normalizedResult.summary;
      }
      return `技能：${getSkillDisplayName(execution.skillId)}`;
    },
    [getSkillDisplayName]
  );

  return {
    activeSchedules,
    executionsReady: executionsQuery.isSuccess,
    getExecutionDisplayDescription,
    getExecutionDisplayTime,
    getSkillDisplayName,
    manualQueue,
    recentSuccessfulExecutions,
    todayCompletedExecutions,
    todayFailedExecutions,
    upcomingSchedules,
    weekCompletedExecutions,
    priorityQueueDisplay,
  };
}
