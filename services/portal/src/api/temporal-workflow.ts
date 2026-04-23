import apiClient from './client';
import { useAuthStore } from '../store/authStore';

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
  retryPolicy?: { maxRetries: number; backoffMs: number };
  // For parallel execution
  parallelSteps?: string[];
}

export interface WorkflowDsl {
  name: string;
  taskQueue: string;
  steps: WorkflowStep[];
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

  generateWorkflowCode: async (workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): Promise<WorkflowCodeResult> => {
    return apiClient.post<WorkflowCodeResult>('/temporal-workflow/generate-code', { workflowDsl, activityDsl });
  },

  validateInSandbox: async (code: string, fn: string, input?: Record<string, any>): Promise<SandBoxValidationResult> => {
    return apiClient.post<SandBoxValidationResult>('/temporal-workflow/validate-code', { code, fn, input });
  },

  // SSE streaming sandbox validation for real-time logs
  validateInSandboxStream: (code: string, fn: string, input: Record<string, any>, onEvent: (event: { type: string; content?: string; result?: any; error?: string; success?: boolean; score?: number }) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/temporal-workflow/validate-code/stream');
      xhr.setRequestHeader('Content-Type', 'application/json');
      // Add auth token from store
      const token = useAuthStore.getState().accessToken;
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.onprogress = () => {
        const lines = xhr.responseText.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.substring(6));
              onEvent(event);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Send final event
          onEvent({ type: 'done' });
          resolve();
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(JSON.stringify({ code, fn, input }));
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