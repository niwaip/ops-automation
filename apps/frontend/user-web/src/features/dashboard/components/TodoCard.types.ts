import type { WorkbenchTodoItem } from '../../../api/workbenchTodo';
import type { WorkbenchTodoTab } from '../hooks/useWorkbenchTodos';

export interface TodoCardProps {
  todoDraft: string;
  todoSummary: {
    total: number;
    pending: number;
    completed?: number;
    today?: number;
    sent?: number;
    ended?: number;
    overdue?: number;
  };
  todos: WorkbenchTodoItem[];
  activeTab?: WorkbenchTodoTab;
  onTabChange?: (tab: WorkbenchTodoTab) => void;
  onCreateTodo: () => void;
  onDraftChange: (value: string) => void;
  onLaunchAiAssistant: (prompt: string) => void;
  onOpenNewExecution: () => void;
  onToggleTodo: (id: string, completed: boolean) => void;
  onExecuteTodo?: (id: string) => void;
  onDeleteTodo?: (id: string) => void;
  onArchiveTodo?: (id: string) => void;
  onRecallTodo?: (item: WorkbenchTodoItem) => void;
  onRemindTodo?: (item: WorkbenchTodoItem) => void;
}
