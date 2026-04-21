import apiClient from './client';

export interface WorkflowDsl {
  name: string;
  taskQueue: string;
  steps: Array<{
    id: string;
    name: string;
    type: 'activity' | 'signal' | 'query';
    activityName?: string;
    input?: Record<string, any>;
    retryPolicy?: { maxRetries: number; backoffMs: number };
  }>;
  conditionals?: Array<{
    step: string;
    condition: string;
    skip?: boolean;
  }>;
}

export interface ActivityDsl {
  activities: Array<{
    name: string;
    fn: string;
    timeout: string;
    retryPolicy?: { maxRetries: number };
    handler: 'api' | 'carbone' | 'browser' | 'script';
    config: Record<string, any>;
  }>;
}

export interface TemporalWorkflowDTO {
  id: string;
  name: string;
  description: string | null;
  taskQueue: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  isActive: boolean;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemporalWorkflowDTO {
  name: string;
  description?: string;
  taskQueue?: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
}

export interface UpdateTemporalWorkflowDTO {
  name?: string;
  description?: string;
  taskQueue?: string;
  workflowDsl?: WorkflowDsl;
  activityDsl?: ActivityDsl;
  isActive?: boolean;
}

export interface TemporalValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}

export const temporalWorkflowApi = {
  list: async (): Promise<TemporalWorkflowDTO[]> => {
    return apiClient.get<TemporalWorkflowDTO[]>('/temporal-workflow');
  },

  getById: async (id: string): Promise<TemporalWorkflowDTO> => {
    return apiClient.get<TemporalWorkflowDTO>(`/temporal-workflow/${id}`);
  },

  create: async (data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> => {
    return apiClient.post<TemporalWorkflowDTO>('/temporal-workflow', data);
  },

  update: async (id: string, data: UpdateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> => {
    return apiClient.put<TemporalWorkflowDTO>(`/temporal-workflow/${id}`, data);
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete(`/temporal-workflow/${id}`);
  },

  deploy: async (id: string): Promise<TemporalWorkflowDTO> => {
    return apiClient.post<TemporalWorkflowDTO>(`/temporal-workflow/${id}/deploy`);
  },

  validate: async (workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): Promise<TemporalValidationResult> => {
    return apiClient.post<TemporalValidationResult>('/temporal-workflow/validate', { workflowDsl, activityDsl });
  },
};

export const DEFAULT_WORKFLOW_DSL: WorkflowDsl = {
  name: '',
  taskQueue: 'SKILL_TASK_QUEUE',
  steps: [],
  conditionals: [],
};

export const DEFAULT_ACTIVITY_DSL: ActivityDsl = {
  activities: [],
};