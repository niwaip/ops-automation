import axios from 'axios';
import { apiClient } from './index';

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

interface ListRuntimeSessionsParams {
  executionId?: string;
  page?: number;
  pageSize?: number;
  state?: RuntimeSessionState;
}

interface ListRuntimeSessionsResponse {
  data: RuntimeSessionDto[];
  total: number;
  page: number;
  pageSize: number;
}

const isRuntimeSessionNotFound = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 404;

const isIgnorableRuntimeSessionError = (error: unknown): boolean => {
  if (axios.isAxiosError(error)) {
    return [401, 403, 404].includes(error.response?.status ?? 0);
  }

  return (
    error instanceof Error &&
    (error.message.includes('Authorization header is required') ||
      error.message.includes('Unauthorized') ||
      error.message.includes('Cannot GET /runtime-sessions') ||
      error.message.includes('Not Found'))
  );
};

export const runtimeSessionApi = {
  getById: async (id: string): Promise<RuntimeSessionDto> => {
    return apiClient.get<RuntimeSessionDto>(`/runtime-sessions/${id}`);
  },

  list: async (params?: ListRuntimeSessionsParams): Promise<ListRuntimeSessionsResponse> => {
    return apiClient.get<ListRuntimeSessionsResponse>('/runtime-sessions', { params });
  },

  getLatestForExecution: async (executionId: string): Promise<RuntimeSessionDto | undefined> => {
    const response = await runtimeSessionApi.list({
      executionId,
      page: 1,
      pageSize: 1,
    });
    return response.data[0];
  },

  getByIdOrExecutionId: async (
    id: string,
    executionId?: string
  ): Promise<RuntimeSessionDto | undefined> => {
    try {
      return await runtimeSessionApi.getById(id);
    } catch (error) {
      if (!isRuntimeSessionNotFound(error) && !isIgnorableRuntimeSessionError(error)) {
        throw error;
      }
      if (!executionId) {
        return undefined;
      }
      try {
        return await runtimeSessionApi.getLatestForExecution(executionId);
      } catch (fallbackError) {
        if (isIgnorableRuntimeSessionError(fallbackError)) {
          return undefined;
        }
        throw fallbackError;
      }
    }
  },
};
