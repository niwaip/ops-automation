import { apiClient } from './index';
import { isNotFoundError, isIgnorableApiError } from '@/shared/utils/apiError';

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
      if (!isNotFoundError(error) && !isIgnorableApiError(error)) {
        throw error;
      }
      if (!executionId) {
        return undefined;
      }
      try {
        return await runtimeSessionApi.getLatestForExecution(executionId);
      } catch (fallbackError) {
        if (isIgnorableApiError(fallbackError)) {
          return undefined;
        }
        throw fallbackError;
      }
    }
  },
};
