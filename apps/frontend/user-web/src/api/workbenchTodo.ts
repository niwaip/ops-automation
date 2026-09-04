import { apiClient } from './index';

export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TodoSourceType = 'manual' | 'chat' | 'email' | 'schedule' | 'im_channel';
export type DueFilter = 'all' | 'today' | 'upcoming' | 'overdue';

export interface Todo5W1HContext {
  who?: string[];
  when?: string;
  where?: string;
  what?: string;
  why?: string;
  how?: string;
  rawText?: string;
  suggestedWorkflowId?: string;
  suggestedWorkflowName?: string;
  confidence?: number;
}

export interface WorkbenchTodoItem {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  dueDate?: string | null;
  completedAt?: string | null;
  sourceType: TodoSourceType;
  sourceRefId?: string | null;
  sourceTitle?: string | null;
  contextData?: {
    w5h1?: Todo5W1HContext;
    [key: string]: any;
  } | null;
  boundWorkflowId?: string | null;
  executionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueryWorkbenchTodoParams {
  status?: TodoStatus;
  priority?: TodoPriority;
  sourceType?: TodoSourceType;
  keyword?: string;
  dueFilter?: DueFilter;
  page?: number;
  pageSize?: number;
}

export interface WorkbenchTodoListResponse {
  items: WorkbenchTodoItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateWorkbenchTodoPayload {
  title: string;
  description?: string;
  priority?: TodoPriority;
  dueDate?: string;
  sourceType?: TodoSourceType;
  sourceRefId?: string;
  sourceTitle?: string;
  contextData?: Record<string, any>;
  boundWorkflowId?: string;
}

export interface UpdateWorkbenchTodoPayload {
  title?: string;
  description?: string;
  priority?: TodoPriority;
  status?: TodoStatus;
  dueDate?: string | null;
  boundWorkflowId?: string | null;
  contextData?: Record<string, any>;
}

export interface ExtractTodoPreviewPayload {
  text: string;
  sourceType?: TodoSourceType;
  sourceRefId?: string;
  sourceTitle?: string;
}

export interface ExtractedTodoPreview {
  title: string;
  description: string;
  priority: TodoPriority;
  dueDate?: string;
  sourceType: TodoSourceType;
  sourceRefId?: string;
  sourceTitle?: string;
  contextData: {
    w5h1: Todo5W1HContext;
    [key: string]: any;
  };
  suggestedWorkflowId?: string;
  suggestedWorkflowName?: string;
}

export interface TaskRunnableCapability {
  id: string;
  name: string;
  description?: string;
  type: 'temporal_workflow' | 'flow_template' | 'skill';
  taskQueue?: string;
}

export interface TaskExecutionResponse {
  todoId: string;
  executionId: string;
  boundWorkflowId: string;
  status: TodoStatus;
  startedAt: string;
}

export const workbenchTodoApi = {
  list: async (params?: QueryWorkbenchTodoParams): Promise<WorkbenchTodoListResponse> => {
    const query = new URLSearchParams();
    if (params) {
      if (params.status) query.append('status', params.status);
      if (params.priority) query.append('priority', params.priority);
      if (params.sourceType) query.append('sourceType', params.sourceType);
      if (params.keyword) query.append('keyword', params.keyword);
      if (params.dueFilter) query.append('dueFilter', params.dueFilter);
      if (params.page) query.append('page', String(params.page));
      if (params.pageSize) query.append('pageSize', String(params.pageSize));
    }
    const qStr = query.toString();
    return await apiClient.get(`/workbench-todos${qStr ? `?${qStr}` : ''}`);
  },

  getById: async (id: string): Promise<WorkbenchTodoItem> => {
    return await apiClient.get(`/workbench-todos/${id}`);
  },

  create: async (payload: CreateWorkbenchTodoPayload): Promise<WorkbenchTodoItem> => {
    return await apiClient.post('/workbench-todos', payload);
  },

  update: async (id: string, payload: UpdateWorkbenchTodoPayload): Promise<WorkbenchTodoItem> => {
    return await apiClient.put(`/workbench-todos/${id}`, payload);
  },

  delete: async (id: string): Promise<{ success: boolean; id: string }> => {
    return await apiClient.delete(`/workbench-todos/${id}`);
  },

  extractPreview: async (payload: ExtractTodoPreviewPayload): Promise<ExtractedTodoPreview> => {
    return await apiClient.post('/workbench-todos/extract-preview', payload);
  },

  discoverCapabilities: async (): Promise<TaskRunnableCapability[]> => {
    return await apiClient.get('/workbench-todos/capabilities');
  },

  executeTask: async (
    id: string,
    overrideInput?: Record<string, any>
  ): Promise<TaskExecutionResponse> => {
    return await apiClient.post(`/workbench-todos/${id}/execute`, { overrideInput });
  },
};
