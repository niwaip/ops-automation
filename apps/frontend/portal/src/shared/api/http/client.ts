import type { RequestConfig } from '@ops/user-core';
import { createApiClient } from '@ops/user-core';
import { runtimeConfig } from '@/shared/config/runtime';
import { authSessionPort } from './authSessionPort';

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  message: string;
  statusCode: number;
}

export { type RequestConfig };

export const apiClient = createApiClient(runtimeConfig, authSessionPort);
export const refreshAccessToken = () => apiClient.refreshAccessToken();
export const ensureFreshAccessToken = () => apiClient.ensureFreshAccessToken();
export default apiClient;
