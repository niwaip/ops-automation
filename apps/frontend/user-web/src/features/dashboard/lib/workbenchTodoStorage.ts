import { browserStorage } from '@/adapters/storage/browserStorage';

const WORKBENCH_TODO_STORAGE_KEY = 'user-web-workbench-todos';

export interface WorkbenchTodo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

const normalizeTodos = (raw: unknown): WorkbenchTodo[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const candidate = item as Partial<WorkbenchTodo>;
      if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string') {
        return null;
      }
      return {
        id: candidate.id,
        title: candidate.title.trim(),
        completed: candidate.completed === true,
        createdAt:
          typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
        updatedAt:
          typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
      };
    })
    .filter((item): item is WorkbenchTodo => Boolean(item && item.title));
};

export const loadWorkbenchTodos = (): WorkbenchTodo[] => {
  const saved = browserStorage.getItem(WORKBENCH_TODO_STORAGE_KEY);
  if (!saved) {
    return [];
  }
  try {
    return normalizeTodos(JSON.parse(saved));
  } catch {
    return [];
  }
};

export const saveWorkbenchTodos = (todos: WorkbenchTodo[]): void => {
  browserStorage.setItem(WORKBENCH_TODO_STORAGE_KEY, JSON.stringify(todos));
};
