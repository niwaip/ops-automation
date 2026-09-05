import { TodoPriority, TodoStatus } from "../dto/workbench-todo.dto";

export interface TodoExportResult {
  providerId: string;
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  skipped?: boolean;
  reason?: string;
  syncedAt: string;
}

export interface TodoSyncPlugin {
  readonly providerId: string;
  readonly displayName: string;
  readonly description?: string;

  /**
   * 判断指定用户是否已配置且启用了此插件
   */
  isEnabled(userId: string): Promise<boolean>;

  /**
   * 将系统内部待办任务同步/导出至第三方外部服务
   */
  exportTodo(
    userId: string,
    todo: {
      id: string;
      title: string;
      description?: string | null;
      priority: TodoPriority;
      status: TodoStatus;
      dueDate?: Date | null;
    }
  ): Promise<TodoExportResult>;

  /**
   * 状态变更回调同步（如在系统内标记完成时通知外部服务）
   */
  syncStatus?(
    userId: string,
    externalId: string,
    status: TodoStatus
  ): Promise<void>;
}
