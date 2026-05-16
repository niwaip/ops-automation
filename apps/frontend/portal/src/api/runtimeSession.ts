import { apiClient } from './client';

export type RuntimeSessionState = 'allocating' | 'ready' | 'busy' | 'frozen' | 'closed' | 'error';

export interface RuntimeSessionConnectionInfo {
  novnc?: string;
  cdp?: string;
  vnc?: string;
  [key: string]: unknown;
}

export interface RuntimeSessionDto {
  id: string;
  executionId?: string;
  runtimeType: string;
  workerId?: string;
  profileId?: string;
  state: RuntimeSessionState;
  controlMode: string;
  connectionInfo?: RuntimeSessionConnectionInfo;
  healthStatus?: string;
  freezeReason?: string;
  lastActivityAt?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export const runtimeSessionApi = {
  getById: async (id: string): Promise<RuntimeSessionDto> => {
    return apiClient.get<RuntimeSessionDto>(`/runtime-sessions/${id}`);
  },
};
