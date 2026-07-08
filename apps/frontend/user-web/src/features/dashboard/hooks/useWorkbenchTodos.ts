import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import {
  loadWorkbenchTodos,
  saveWorkbenchTodos,
  type WorkbenchTodo,
} from '../lib/workbenchTodoStorage';

const buildTodoId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `todo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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
  const [todos, setTodos] = useState<WorkbenchTodo[]>(() => loadWorkbenchTodos());
  const [todoDraft, setTodoDraft] = useState('');

  useEffect(() => {
    saveWorkbenchTodos(todos);
  }, [todos]);

  const todoSummary = useMemo(
    () => ({
      total: todos.length,
      pending: todos.filter((item) => !item.completed).length,
      completed: todos.filter((item) => item.completed).length,
    }),
    [todos]
  );

  const handleCreateTodo = useCallback(() => {
    const nextTodos = parseTodoDraftIntoTasks(todoDraft);
    if (nextTodos.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    setTodos((current) => [
      ...nextTodos.map((title) => ({
        id: buildTodoId(),
        title,
        completed: false,
        createdAt: now,
        updatedAt: now,
      })),
      ...current,
    ]);
    void message.success(
      nextTodos.length === 1 ? '已添加 1 条 Todo' : `已解析并添加 ${nextTodos.length} 条 Todo`
    );
    setTodoDraft('');
  }, [message, todoDraft]);

  const handleToggleTodo = useCallback((id: string, completed: boolean) => {
    setTodos((current) =>
      current.map((item) =>
        item.id === id ? { ...item, completed, updatedAt: new Date().toISOString() } : item
      )
    );
  }, []);

  return {
    handleCreateTodo,
    handleToggleTodo,
    setTodoDraft,
    todoDraft,
    todoSummary,
    todos,
  };
}
