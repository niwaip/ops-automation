import { useQuery, useMutation, useQueryClient } from 'react-query';
import { message } from 'antd';
import { activityApi, CreateActivityDto, UpdateActivityDto } from '@/api/activity';

export function useActivityMutations() {
  const queryClient = useQueryClient();

  const customActivitiesQuery = useQuery(['activities', 'custom'], () => activityApi.list(), {
    staleTime: 30_000,
  });

  const builtinActivitiesQuery = useQuery(
    ['activities', 'builtin'],
    () => activityApi.listBuiltin(),
    {
      staleTime: 60_000,
    }
  );

  const createActivityMutation = useMutation(
    (dto: CreateActivityDto) => activityApi.create(dto),
    {
      onSuccess: () => {
        message.success('Activity 创建成功');
        void queryClient.invalidateQueries(['activities']);
      },
      onError: (error: any) => {
        message.error(error?.message || '创建 Activity 失败');
      },
    }
  );

  const updateActivityMutation = useMutation(
    ({ id, dto }: { id: string; dto: UpdateActivityDto }) => activityApi.update(id, dto),
    {
      onSuccess: () => {
        message.success('Activity 更新成功');
        void queryClient.invalidateQueries(['activities']);
      },
      onError: (error: any) => {
        message.error(error?.message || '更新 Activity 失败');
      },
    }
  );

  const deleteActivityMutation = useMutation(
    (id: string) => activityApi.delete(id),
    {
      onSuccess: () => {
        message.success('Activity 删除成功');
        void queryClient.invalidateQueries(['activities']);
      },
      onError: (error: any) => {
        message.error(error?.message || '删除 Activity 失败');
      },
    }
  );

  const generateCodeMutation = useMutation(
    (dto: CreateActivityDto) => activityApi.generateCode(dto),
    {
      onSuccess: () => {
        message.success('代码生成任务已触发');
        void queryClient.invalidateQueries(['activities']);
      },
      onError: (error: any) => {
        message.error(error?.message || '触发代码生成失败');
      },
    }
  );

  return {
    customActivitiesQuery,
    builtinActivitiesQuery,
    createActivityMutation,
    updateActivityMutation,
    deleteActivityMutation,
    generateCodeMutation,
  };
}
