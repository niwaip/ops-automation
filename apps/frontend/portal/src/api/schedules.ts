import { apiClient } from './client';

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

  getById: async (id: string): Promise<ScheduleDto> => {
    return apiClient.get<ScheduleDto>(`/schedules/${id}`);
  },

  create: async (data: CreateScheduleRequest): Promise<ScheduleDto> => {
    return apiClient.post<ScheduleDto>('/schedules', data);
  },

  update: async (id: string, data: UpdateScheduleRequest): Promise<ScheduleDto> => {
    return apiClient.put<ScheduleDto>(`/schedules/${id}`, data);
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/schedules/${id}`);
  },

  trigger: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.post<{ success: boolean }>(`/schedules/${id}/trigger`);
  },
};

export default scheduleApi;
