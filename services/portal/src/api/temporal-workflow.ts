import apiClient from './client';
import { useAuthStore } from '../store/authStore';
import { postSseStream } from './streaming';

export interface WorkflowSignalHandler {
  name: string;
  description?: string;
}

export interface WorkflowQueryHandler {
  name: string;
  description?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'activity' | 'signal' | 'query' | 'childWorkflow' | 'parallel';
  activityName?: string;
  input?: Record<string, any>;
  // Activity execution timeout (e.g., "30s", "1m")
  startToCloseTimeout?: string;
  // Retry policy for the activity
  retryPolicy?: {
    maxRetries?: number;
    initialIntervalMs?: number;  // First retry interval in ms
    backoffCoefficient?: number;  // Exponential backoff multiplier (default 2.0)
    maxIntervalMs?: number;      // Cap between retries
    nonRetryableErrorTypes?: string[]; // Errors that won't be retried
  };
  // For parallel execution
  parallelSteps?: string[];
}

export interface WorkflowDsl {
  name: string;
  taskQueue: string;
  steps: WorkflowStep[];
  // Entry parameters - first step's input params are the workflow's input interface
  inputParams?: Record<string, { description?: string; required?: boolean; defaultValue?: string }>;
  // Output parameters - defaults to last step's output, can be customized
  outputParams?: Record<string, { description?: string; sourceStep?: string }>;
  // Extra guidance for AI code generation
  extraPrompt?: string;
  // Workflow-level execution timeout
  workflowExecutionTimeout?: string;
  // Single workflow run timeout
  workflowRunTimeout?: string;
  // Timeout for workflow task processing
  workflowTaskTimeout?: string;
  // Default retry policy for all activities
  defaultActivityRetryPolicy?: {
    maxRetries?: number;
    initialIntervalMs?: number;
    backoffCoefficient?: number;
    maxIntervalMs?: number;
  };
  conditionals?: Array<{
    step: string;
    condition: string;
    skip?: boolean;
  }>;
  signalHandlers?: WorkflowSignalHandler[];
  queryHandlers?: WorkflowQueryHandler[];
  errorHandling?: {
    type: 'saga' | 'simple';
    compensations?: Array<{
      step: string;
      activityName: string;
    }>;
  };
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
  generatedCode?: string | null;
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
  generatedCode?: string;
}

export interface UpdateTemporalWorkflowDTO {
  name?: string;
  description?: string;
  taskQueue?: string;
  workflowDsl?: WorkflowDsl;
  activityDsl?: ActivityDsl;
  isActive?: boolean;
  generatedCode?: string;
}

export interface TemporalValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}

export interface WorkflowCodeResult {
  success: boolean;
  code?: string;
  error?: string;
}

export interface SandBoxValidationResult {
  success: boolean;
  logs: string[];
  result?: any;
  error?: string;
  score: number;
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

  generateWorkflowCode: async (workflowDsl: WorkflowDsl, activityDsl: ActivityDsl, errorContext?: string): Promise<WorkflowCodeResult> => {
    return apiClient.post<WorkflowCodeResult>('/temporal-workflow/generate-code', { workflowDsl, activityDsl, errorContext });
  },

  validateInSandbox: async (code: string, fn: string, input?: Record<string, any>): Promise<SandBoxValidationResult> => {
    return apiClient.post<SandBoxValidationResult>('/temporal-workflow/validate-code', { code, fn, input });
  },

  // SSE streaming sandbox validation for real-time logs
  validateInSandboxStream: (code: string, fn: string, input: Record<string, any>, onEvent: (event: { type: string; content?: string; result?: any; error?: string; success?: boolean; score?: number }) => void): Promise<void> => {
    const token = useAuthStore.getState().accessToken;
    return postSseStream({
      url: '/api/temporal-workflow/validate-code/stream',
      payload: { code, fn, input },
      token,
      requireDoneEvent: true,
      onEvent: onEvent as (event: { type: string; [key: string]: unknown }) => void,
    });
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
