import {
  createApiClient,
  createAuthApi,
  createChatApi,
  createExecutionApi,
  createNotificationApi,
  createReportApi,
  createSkillApi,
  type PublishedSkillCatalogItem,
  type SkillAccessRequest,
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

export interface WechatChannelStatus {
  channel: 'wechat';
  configured: boolean;
  enabled: boolean;
  interactionMode: 'auto' | 'chat' | 'task';
  status:
    | 'unconfigured'
    | 'provisioning'
    | 'disabled'
    | 'connecting'
    | 'online'
    | 'reauth_required'
    | 'error';
  providerAccountId?: string;
  lastConnectedAt?: string;
  lastMessageAt?: string;
  lastError?: string;
  provisioning?: { qrcodeUrl: string; expiresAt: string };
}

export const imChannelApi = {
  getWechat: (): Promise<WechatChannelStatus> => apiClient.get('/im-channels/wechat'),
  beginWechatProvisioning: (): Promise<WechatChannelStatus> =>
    apiClient.post('/im-channels/wechat/provisioning'),
  setWechatEnabled: (enabled: boolean): Promise<WechatChannelStatus> =>
    apiClient.put('/im-channels/wechat/enabled', { enabled }),
  setWechatInteractionMode: (
    interactionMode: 'auto' | 'chat' | 'task'
  ): Promise<WechatChannelStatus> =>
    apiClient.put('/im-channels/wechat/interaction-mode', { interactionMode }),
  removeWechat: (): Promise<{ success: boolean }> => apiClient.delete('/im-channels/wechat'),
};
const baseSkillApi = createSkillApi(apiClient);
export const skillApi = {
  ...baseSkillApi,
  listCatalog: async (): Promise<{ skills: PublishedSkillCatalogItem[] }> =>
    apiClient.get('/skills/catalog'),
  requestAccess: async (
    id: string,
    data?: { reason?: string }
  ): Promise<{ request: SkillAccessRequest }> =>
    apiClient.post(`/skills/${id}/access-requests`, data),
};

export interface CreateScheduleRequest {
  name: string;
  description?: string;
  skillId: string;
  skillVersion?: string;
  input: Record<string, unknown>;
  cronExpression: string;
  timezone?: string;
}

export interface UpdateScheduleRequest {
  name?: string;
  description?: string;
  input?: Record<string, unknown>;
  cronExpression?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface ScheduleDto {
  id: string;
  name: string;
  description?: string;
  skillId: string;
  skillVersion?: string;
  input: Record<string, unknown>;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const scheduleApi = {
  create: async (data: CreateScheduleRequest): Promise<ScheduleDto> =>
    apiClient.post('/schedules', data),
  list: async (): Promise<ScheduleDto[]> => {
    const response = await apiClient.get<ScheduleDto[] | { data?: ScheduleDto[] }>('/schedules');
    if (Array.isArray(response)) {
      return response;
    }
    if (Array.isArray(response?.data)) {
      return response.data;
    }
    return [];
  },
  getById: async (id: string): Promise<ScheduleDto> => apiClient.get(`/schedules/${id}`),
  update: async (id: string, data: UpdateScheduleRequest): Promise<ScheduleDto> =>
    apiClient.put(`/schedules/${id}`, data),
  delete: async (id: string): Promise<{ success: boolean }> => apiClient.delete(`/schedules/${id}`),
  trigger: async (id: string): Promise<{ success: boolean }> =>
    apiClient.post(`/schedules/${id}/trigger`),
};

export const resolveApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = runtimeConfig.apiBaseUrl.trim();
  if (/^https?:\/\//i.test(baseUrl)) {
    return `${baseUrl.replace(/\/+$/, '')}${normalizedPath}`;
  }

  return `${baseUrl.replace(/\/+$/, '')}${normalizedPath}`;
};
