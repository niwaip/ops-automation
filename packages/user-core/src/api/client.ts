import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import type {
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionPhaseStepDto,
  ExecutionStepDto,
} from "../types/execution.types.js";
import type { UserDto } from "../types/user.types.js";
import type { AuthSessionPort } from "../ports/auth-session.port.js";
import type { RuntimeConfigPort } from "../ports/runtime.port.js";

type RetryableAxiosRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

export type RequestConfig = AxiosRequestConfig & {
  _retry?: boolean;
};

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface ListExecutionsRequest {
  page?: number;
  pageSize?: number;
  status?: ExecutionDto["status"];
  skillId?: string;
}

export interface SubmitInputRequest {
  stepId: string;
  input: Record<string, unknown>;
  submittedBy?: string;
}

export class ApiClient {
  private static readonly TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
  private readonly client: AxiosInstance;
  private readonly refreshClient: AxiosInstance;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(
    runtimeConfig: RuntimeConfigPort,
    private readonly auth?: AuthSessionPort,
  ) {
    this.client = axios.create({
      baseURL: runtimeConfig.apiBaseUrl,
      timeout: 120000,
      headers: {
        "Content-Type": "application/json",
      },
    });
    this.refreshClient = axios.create({
      baseURL: runtimeConfig.apiBaseUrl,
      timeout: 120000,
      headers: {
        "Content-Type": "application/json",
      },
    });
    this.setupInterceptors();
  }

  async get<T>(url: string, config?: RequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: RequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  async refreshAccessToken(): Promise<string | null> {
    const refreshToken = this.auth?.getSnapshot().refreshToken;
    if (!this.auth || !refreshToken) {
      return null;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshClient
        .post<{ accessToken: string; refreshToken: string }>("/auth/refresh", { refreshToken })
        .then((response) => {
          this.auth?.setTokens(response.data.accessToken, response.data.refreshToken);
          return response.data.accessToken;
        })
        .catch(() => {
          this.auth?.clearSession();
          this.auth?.onUnauthorized?.();
          return null;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  async ensureFreshAccessToken(): Promise<string | null> {
    const accessToken = this.auth?.getSnapshot().accessToken;
    if (!accessToken) {
      return null;
    }

    const expiresAt = this.decodeJwtExpiry(accessToken);
    if (!expiresAt || expiresAt - Date.now() > ApiClient.TOKEN_REFRESH_BUFFER_MS) {
      return accessToken;
    }

    return this.refreshAccessToken();
  }

  private decodeJwtExpiry(token: string): number | null {
    try {
      const payload = token.split(".")[1];
      if (!payload) {
        return null;
      }
      const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
      const decoder = typeof globalThis.atob === "function"
        ? globalThis.atob.bind(globalThis)
        : undefined;
      if (!decoder) {
        return null;
      }
      const decoded: unknown = JSON.parse(decoder(normalizedPayload));
      if (
        typeof decoded === "object"
        && decoded !== null
        && "exp" in decoded
        && typeof decoded.exp === "number"
      ) {
        return decoded.exp * 1000;
      }
    } catch {
      return null;
    }

    return null;
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      async (config) => {
        const token = await this.ensureFreshAccessToken();
        if (token) {
          const headers = new AxiosHeaders(config.headers);
          headers.set("Authorization", `Bearer ${token}`);
          config.headers = headers;
        }
        return config;
      },
      (error: AxiosError) => Promise.reject(error),
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as RetryableAxiosRequestConfig | undefined;
        if (
          error.response?.status === 401
          && originalRequest
          && !originalRequest._retry
          && !originalRequest.url?.includes("/auth/login")
          && !originalRequest.url?.includes("/auth/refresh")
        ) {
          originalRequest._retry = true;
          const accessToken = await this.refreshAccessToken();
          if (accessToken) {
            const headers = new AxiosHeaders(originalRequest.headers);
            headers.set("Authorization", `Bearer ${accessToken}`);
            originalRequest.headers = headers;
            return this.client(originalRequest);
          }
        }

        return Promise.reject(normalizeAxiosError(error));
      },
    );
  }
}

const normalizeAxiosError = (error: AxiosError): Error => {
  const responseData = error.response?.data;
  if (!responseData || typeof responseData !== "object") {
    return error;
  }

  const data = responseData as Record<string, unknown>;
  const message = typeof data.message === "string" && data.message.trim()
    ? data.message.trim()
    : Array.isArray(data.message)
      ? data.message.find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim() || error.message
      : typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : error.message;
  return new Error(message);
};

const normalizeExecutionStep = (raw: ExecutionStepDto): ExecutionStepDto => ({
  ...raw,
  action: raw.action || undefined,
  inputJson: raw.inputJson || undefined,
  outputJson: raw.outputJson || undefined,
  errorCode: raw.errorCode || undefined,
  errorMessage: raw.errorMessage || undefined,
  snapshotId: raw.snapshotId || undefined,
  startedAt: raw.startedAt || undefined,
  endedAt: raw.endedAt || undefined,
});

const normalizeExecutionPhaseStep = (raw: ExecutionPhaseStepDto): ExecutionPhaseStepDto => ({
  ...raw,
  stepId: raw.stepId || undefined,
  input: raw.input || undefined,
  output: raw.output || undefined,
  errorCode: raw.errorCode || undefined,
  errorMessage: raw.errorMessage || undefined,
  snapshotId: raw.snapshotId || undefined,
  startedAt: raw.startedAt || undefined,
  endedAt: raw.endedAt || undefined,
});

const normalizeExecutionPhase = (raw: ExecutionPhaseDto): ExecutionPhaseDto => ({
  ...raw,
  runtimeSessionId: raw.runtimeSessionId || undefined,
  input: raw.input || undefined,
  output: raw.output || undefined,
  errorCode: raw.errorCode || undefined,
  errorMessage: raw.errorMessage || undefined,
  startedAt: raw.startedAt || undefined,
  completedAt: raw.completedAt || undefined,
  steps: raw.steps?.map(normalizeExecutionPhaseStep) || [],
});

const normalizeExecution = (raw: ExecutionDto): ExecutionDto => ({
  ...raw,
  runtimeType: raw.runtimeType || undefined,
  riskLevel: raw.riskLevel || undefined,
  currentStepId: raw.currentStepId || undefined,
  currentPhaseKey: raw.currentPhaseKey || undefined,
  currentPhaseStatus: raw.currentPhaseStatus || undefined,
  approvalStatus: raw.approvalStatus || undefined,
  takeoverReason: raw.takeoverReason || undefined,
  resultJson: raw.resultJson || undefined,
  failureCode: raw.failureCode || undefined,
  failureReason: raw.failureReason || undefined,
  startedAt: raw.startedAt || undefined,
  endedAt: raw.endedAt || undefined,
  semantic: raw.semantic || undefined,
  result: raw.resultJson || undefined,
  phases: raw.phases?.map(normalizeExecutionPhase) || [],
});

const resolveExecutionPath = (runtimeConfig: RuntimeConfigPort, path: string): string => {
  const baseUrl = runtimeConfig.controlPlaneApiBaseUrl?.trim();
  return baseUrl ? `${baseUrl.replace(/\/+$/, "")}${path}` : path;
};

export const createApiClient = (
  runtimeConfig: RuntimeConfigPort,
  auth?: AuthSessionPort,
): ApiClient => new ApiClient(runtimeConfig, auth);

export const createAuthApi = (client: ApiClient) => ({
  login: async (data: LoginRequest): Promise<LoginResponse> => client.post<LoginResponse>("/auth/login", data),
  me: async (): Promise<{ user: UserDto }> => client.get<{ user: UserDto }>("/auth/me"),
});

export const createExecutionApi = (client: ApiClient, runtimeConfig: RuntimeConfigPort) => ({
  list: async (params?: ListExecutionsRequest): Promise<{
    data: ExecutionDto[];
    total: number;
    page: number;
    pageSize: number;
  }> => {
    const response = await client.get<{
      data: ExecutionDto[];
      total: number;
      page: number;
      pageSize: number;
    }>(resolveExecutionPath(runtimeConfig, "/executions"), { params });
    return {
      ...response,
      data: response.data.map(normalizeExecution),
    };
  },
  getById: async (id: string): Promise<ExecutionDto> => {
    const response = await client.get<ExecutionDto>(resolveExecutionPath(runtimeConfig, `/executions/${id}`));
    return normalizeExecution(response);
  },
  getSteps: async (id: string): Promise<ExecutionStepDto[]> => {
    const response = await client.get<ExecutionStepDto[]>(resolveExecutionPath(runtimeConfig, `/executions/${id}/steps`));
    return response.map(normalizeExecutionStep);
  },
  getPhases: async (id: string): Promise<ExecutionPhaseDto[]> => {
    const response = await client.get<ExecutionPhaseDto[]>(resolveExecutionPath(runtimeConfig, `/executions/${id}/phases`));
    return response.map(normalizeExecutionPhase);
  },
  submitInput: async (id: string, data: SubmitInputRequest): Promise<ExecutionDto> => {
    const response = await client.post<ExecutionDto>(
      resolveExecutionPath(runtimeConfig, `/executions/${id}/submit-input`),
      data,
    );
    return normalizeExecution(response);
  },
});
