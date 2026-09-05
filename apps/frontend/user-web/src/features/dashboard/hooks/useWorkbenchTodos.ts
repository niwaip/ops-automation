import { useCallback, useMemo, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  workbenchTodoApi,
  type TodoPriority,
  type DueFilter,
} from '../../../api/workbenchTodo';

const parseTodoDraftIntoTasks = (value: string): string[] => {
  const normalized = value
    .replace(/\r/g, '\n')
    .replace(/[；;]/g, '\n')
    .replace(/(?:^|\n)\s*\d+[.)、]\s*/g, '\n')
    .replace(/(?:^|\n)\s*[-*•]\s*/g, '\n');

  return Array.from(
    new Set(
      normalized
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
};

interface UseWorkbenchTodosOptions {
  message: MessageInstance;
}

export function useWorkbenchTodos({ message }: UseWorkbenchTodosOptions) {
  const queryClient = useQueryClient();
  const [todoDraft, setTodoDraft] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'today' | 'pending' | 'completed' | 'overdue'>('all');

  // 查询参数构建
  const queryParams = useMemo(() => {
    if (activeTab === 'today') {
      return { dueFilter: 'today' as DueFilter };
    }
    if (activeTab === 'overdue') {
      return { dueFilter: 'overdue' as DueFilter };
    }
    if (activeTab === 'pending') {
      return { status: 'pending' as const };
    }
    if (activeTab === 'completed') {
      return { status: 'completed' as const };
    }
    return {};
  }, [activeTab]);

  // 从服务端获取待办列表
  const { data: todoData, isLoading } = useQuery(
    ['workbench-todos', queryParams],
    () => workbenchTodoApi.list(queryParams),
    {
      staleTime: 10000,
      refetchInterval: 30000,
    }
  );

  const todos = useMemo(() => todoData?.items ?? [], [todoData]);

  // 获取全部待办统计（用于头部状态徽标）
  const { data: allTodoData } = useQuery(
    ['workbench-todos-summary'],
    () => workbenchTodoApi.list({ pageSize: 100 }),
    {
      staleTime: 15000,
    }
  );

  const todoSummary = useMemo(() => {
    const allItems = allTodoData?.items ?? todos;
    const now = new Date().getTime();
    return {
      total: allItems.length,
      pending: allItems.filter((i) => i.status === 'pending' || i.status === 'in_progress').length,
      completed: allItems.filter((i) => i.status === 'completed').length,
      overdue: allItems.filter(
        (i) => i.dueDate && new Date(i.dueDate).getTime() < now && i.status !== 'completed' && i.status !== 'cancelled'
      ).length,
    };
  }, [allTodoData, todos]);

  // 批量/单条创建待办
  const createMutation = useMutation(
    async (titles: string[]) => {
      for (const title of titles) {
        let priority: TodoPriority = 'medium';
        if (/紧急|立刻|马上|尽快|高优|asap|严重|p0/i.test(title)) {
          priority = 'high';
        }
        await workbenchTodoApi.create({
          title,
          priority,
          sourceType: 'manual',
        });
      }
    },
    {
      onSuccess: (_, titles) => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void message.success(
          titles.length === 1 ? '已添加 1 条待办' : `已解析并添加 ${titles.length} 条待办`
        );
        setTodoDraft('');
      },
      onError: (err: any) => {
        void message.error(`创建失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleCreateTodo = useCallback(() => {
    const nextTodos = parseTodoDraftIntoTasks(todoDraft);
    if (nextTodos.length === 0) {
      return;
    }
    createMutation.mutate(nextTodos);
  }, [createMutation, todoDraft]);

  // 切换完成状态
  const toggleMutation = useMutation(
    async ({ id, completed }: { id: string; completed: boolean }) => {
      return await workbenchTodoApi.update(id, {
        status: completed ? 'completed' : 'pending',
      });
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
      },
      onError: (err: any) => {
        void message.error(`更新状态失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleToggleTodo = useCallback(
    (id: string, completed: boolean) => {
      toggleMutation.mutate({ id, completed });
    },
    [toggleMutation]
  );

  // 删除待办
  const deleteMutation = useMutation(
    async (id: string) => {
      return await workbenchTodoApi.delete(id);
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void message.success('已删除待办');
      },
      onError: (err: any) => {
        void message.error(`删除失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleDeleteTodo = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  // 执行工作流任务
  const executeMutation = useMutation(
    async (id: string) => {
      return await workbenchTodoApi.executeTask(id);
    },
    {
      onSuccess: (res) => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void message.success(`自动化工作流已触发执行！执行单号: ${res.executionId.slice(0, 8)}`);
      },
      onError: (err: any) => {
        void message.error(`执行失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleExecuteTodo = useCallback(
    (id: string) => {
      executeMutation.mutate(id);
    },
    [executeMutation]
  );

  return {
    activeTab,
    handleCreateTodo,
    handleDeleteTodo,
    handleExecuteTodo,
    handleToggleTodo,
    isLoading: isLoading || createMutation.isLoading,
    isExecuting: executeMutation.isLoading,
    setActiveTab,
    setTodoDraft,
    todoDraft,
    todoSummary,
    todos,
  };
}
