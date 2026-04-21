import apiClient from './client';
import { useAuthStore } from '../store/authStore';

export interface ActivityDTO {
  id: string;
  name: string;
  fn: string;
  timeout: string;
  retryPolicy: { maxRetries: number; backoffMs?: number } | null;
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActivityDto {
  name: string;
  fn: string;
  timeout?: string;
  retryPolicy?: { maxRetries: number; backoffMs?: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
}

export interface ActivityValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface GenerateCodeResult {
  success: boolean;
  code?: string;
  error?: string;
}

export interface ExecuteCodeResult {
  success: boolean;
  result?: any;
  logs?: string[];
  error?: string;
}

export interface ExecuteCodeDto {
  code: string;
  fn: string;
  taskQueue: string;
  input?: Record<string, any>;
}

export interface StreamEvent {
  type: 'log' | 'error' | 'done';
  message?: string;
  result?: any;
}

export const activityApi = {
  list: async (): Promise<ActivityDTO[]> => {
    return apiClient.get<ActivityDTO[]>('/activities');
  },

  getById: async (id: string): Promise<ActivityDTO> => {
    return apiClient.get<ActivityDTO>(`/activities/${id}`);
  },

  create: async (data: CreateActivityDto): Promise<ActivityDTO> => {
    return apiClient.post<ActivityDTO>('/activities', data);
  },

  update: async (id: string, data: Partial<CreateActivityDto>): Promise<ActivityDTO> => {
    return apiClient.put<ActivityDTO>(`/activities/${id}`, data);
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete(`/activities/${id}`);
  },

  validate: async (config: CreateActivityDto): Promise<ActivityValidationResult> => {
    return apiClient.post<ActivityValidationResult>('/activities/validate', config);
  },

  generateCode: async (config: CreateActivityDto): Promise<GenerateCodeResult> => {
    return apiClient.post<GenerateCodeResult>('/activities/generate-code', config);
  },

  executeCode: async (data: ExecuteCodeDto): Promise<ExecuteCodeResult> => {
    return apiClient.post<ExecuteCodeResult>('/activities/execute-code', data);
  },

  // SSE streaming execution
  executeCodeStream: (data: ExecuteCodeDto, onEvent: (event: StreamEvent) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/activities/execute-code/stream');
      xhr.setRequestHeader('Content-Type', 'application/json');
      // Get token from authStore directly
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
          resolve();
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(JSON.stringify(data));
    });
  },
};