import { useMemo } from 'react';
import { useQuery } from 'react-query';
import { scheduleApi } from '@/api/schedules';
import type { ScheduleDto } from '@/api/schedules';

interface UseExecutionCreateSchedulesOptions {
  selectedSkillId?: string;
}

export function useExecutionCreateSchedules({
  selectedSkillId,
}: UseExecutionCreateSchedulesOptions) {
  const schedulesQuery = useQuery<ScheduleDto[]>(
    ['execution-create-schedules'],
    () => scheduleApi.list(),
    {
      staleTime: 15000,
    }
  );

  const scheduleItems = schedulesQuery.data || [];

  const skillSchedules = useMemo(
    () =>
      scheduleItems
        .filter((schedule) => schedule.skillId === selectedSkillId)
        .sort((left, right) => {
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        }),
    [scheduleItems, selectedSkillId]
  );

  return {
    activeScheduleCount: skillSchedules.filter((schedule) => schedule.isActive).length,
    schedulesLoading: schedulesQuery.isLoading,
    skillSchedules,
  };
}
