import {
  createApiClient,
  createAuthApi,
  createChatApi,
  createExecutionApi,
  createNotificationApi,
  createReportApi,
  createSkillApi,
} from '@ops/user-core';
import { authSessionPort } from '../adapters/auth/authStore';
import { browserRuntimeConfig } from '../adapters/runtime/browserRuntime';

export const runtimeConfig = browserRuntimeConfig;
export const apiClient = createApiClient(runtimeConfig, authSessionPort);
export const authApi = createAuthApi(apiClient);
export const chatApi = createChatApi(apiClient, runtimeConfig);
export const executionApi = createExecutionApi(apiClient, runtimeConfig);
export const notificationApi = createNotificationApi(apiClient);
export const reportApi = createReportApi(apiClient);
export const skillApi = createSkillApi(apiClient);

export const scheduleApi = {
  create: async (data: {
    name: string;
    description?: string;
    skillId: string;
    skillVersion?: string;
    input: Record<string, unknown>;
    cronExpression: string;
    timezone?: string;
  }): Promise<any> => apiClient.post('/schedules', data),
  list: async (): Promise<any[]> => apiClient.get('/schedules'),
  getById: async (id: string): Promise<any> => apiClient.get(`/schedules/${id}`),
  update: async (id: string, data: any): Promise<any> => apiClient.put(`/schedules/${id}`, data),
  delete: async (id: string): Promise<{ success: boolean }> => apiClient.delete(`/schedules/${id}`),
  trigger: async (id: string): Promise<{ success: boolean }> => apiClient.post(`/schedules/${id}/trigger`),
};

export const resolveApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = runtimeConfig.apiBaseUrl.trim();
  if (/^https?:\/\//i.test(baseUrl)) {
    return `${baseUrl.replace(/\/+$/, '')}${normalizedPath}`;
  }

  return `${baseUrl.replace(/\/+$/, '')}${normalizedPath}`;
};
