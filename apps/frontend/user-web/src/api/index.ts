import {
  createApiClient,
  createAuthApi,
  createExecutionApi,
  createReportApi,
  normalizeRuntimeConfig,
} from "@ops/user-core";
import { authSessionPort } from "../adapters/auth/authStore";

export const runtimeConfig = normalizeRuntimeConfig(import.meta.env as Record<string, string | undefined>);
export const apiClient = createApiClient(runtimeConfig, authSessionPort);
export const authApi = createAuthApi(apiClient);
export const executionApi = createExecutionApi(apiClient, runtimeConfig);
export const reportApi = createReportApi(apiClient);
