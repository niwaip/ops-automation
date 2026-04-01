import { apiClient } from './client';

// Session types (for session-broker service)
export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled' | 'paused';

export interface Session {
  id: string;
  name?: string;
  status: SessionStatus;
  type: 'replay' | 'live' | 'record';
  templateId?: string;
  template?: {
    id: string;
    name: string;
  };
  ownerId: string;
  owner?: {
    id: string;
    username: string;
  };
  browser: string;
  viewport: { width: number; height: number };
  startTime: Date;
  endTime?: Date;
  duration?: number;
  noVncUrl?: string;
  result?: Record<string, unknown>;
  error?: string;
  logs: string[];
  screenshots: string[];
  videoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionListResponse {
  sessions: Session[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateSessionRequest {
  name?: string;
  templateId?: string;
  type: 'replay' | 'live' | 'record';
  browser?: string;
  viewport?: { width: number; height: number };
}

export interface SessionQueryParams {
  page?: number;
  pageSize?: number;
  status?: SessionStatus;
  type?: 'replay' | 'live' | 'record';
  ownerId?: string;
  templateId?: string;
  search?: string;
}

// Session API
export const sessionApi = {
  list: async (params?: SessionQueryParams): Promise<SessionListResponse> => {
    return apiClient.get<SessionListResponse>('/sessions', { params });
  },

  getById: async (id: string): Promise<Session> => {
    return apiClient.get<Session>(`/sessions/${id}`);
  },

  create: async (data: CreateSessionRequest): Promise<Session> => {
    return apiClient.post<Session>('/sessions', data);
  },

  start: async (id: string): Promise<Session> => {
    return apiClient.patch<Session>(`/sessions/${id}/start`);
  },

  stop: async (id: string): Promise<Session> => {
    return apiClient.patch<Session>(`/sessions/${id}/stop`);
  },

  pause: async (id: string): Promise<Session> => {
    return apiClient.patch<Session>(`/sessions/${id}/pause`);
  },

  resume: async (id: string): Promise<Session> => {
    return apiClient.patch<Session>(`/sessions/${id}/resume`);
  },

  delete: async (id: string): Promise<void> => {
    return apiClient.delete(`/sessions/${id}`);
  },

  getLogs: async (id: string): Promise<string[]> => {
    return apiClient.get<string[]>(`/sessions/${id}/logs`);
  },

  getScreenshot: async (id: string): Promise<string> => {
    return apiClient.get<string>(`/sessions/${id}/screenshot`);
  },
};