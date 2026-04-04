import { apiClient } from './client';

// Session types matching session-broker DTOs
export type SessionState = 'IDLE' | 'RUNNING' | 'HUMAN_CONTROL' | 'CLOSED' | 'ERROR';
export type ControlMode = 'AGENT_RUNNING' | 'HUMAN_CONTROL';

export interface WorkerEndpoints {
  novnc: string;
  cdp: string;
  vnc?: string;
}

export interface Session {
  id: string;
  user_id: string;
  state: SessionState;
  control_mode: ControlMode;
  frozen: boolean;
  worker_ref?: string;
  endpoints?: WorkerEndpoints;
  template_id?: string;
  params?: Record<string, unknown>;
  current_step?: string;
  step_index?: number;
  created_at: number;
  last_activity: number;
}

export interface CreateSessionRequest {
  user_id: string;
  template_id?: string;
  params?: Record<string, unknown>;
}

export interface CreateSessionResponse {
  session: Session;
  endpoints: WorkerEndpoints;
}

export interface StartSessionRequest {
  template_id: string;
  params: Record<string, unknown>;
}

export interface TakeoverSessionRequest {
  reason: string;
}

export interface ContinueSessionRequest {
  step_id: string;
}

export interface WorkerPoolStatus {
  available_workers: number;
  status: 'available' | 'exhausted';
  message: string;
}

export interface WorkerPoolResetResponse {
  success: boolean;
  available_workers: number;
  message: string;
}

// Session API
export const sessionApi = {
  getById: async (id: string): Promise<Session> => {
    return apiClient.get<Session>(`/sessions/${id}`);
  },

  create: async (data: CreateSessionRequest): Promise<CreateSessionResponse> => {
    return apiClient.post<CreateSessionResponse>('/sessions', data);
  },

  start: async (id: string, data: StartSessionRequest): Promise<Session> => {
    return apiClient.post<Session>(`/sessions/${id}/start`, data);
  },

  takeover: async (id: string, data: TakeoverSessionRequest): Promise<Session> => {
    return apiClient.post<Session>(`/sessions/${id}/takeover`, data);
  },

  continue: async (id: string, data: ContinueSessionRequest): Promise<Session> => {
    return apiClient.post<Session>(`/sessions/${id}/continue`, data);
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/sessions/${id}`);
  },
};

// Worker Pool API
export const workerApi = {
  getStatus: async (): Promise<WorkerPoolStatus> => {
    return apiClient.get<WorkerPoolStatus>('/workers/status');
  },

  reset: async (): Promise<WorkerPoolResetResponse> => {
    return apiClient.post<WorkerPoolResetResponse>('/workers/reset');
  },
};