import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { AuthSessionPort } from '../ports/auth-session.port.js';
import type { RuntimeConfigPort } from '../ports/runtime.port.js';

type RetryableAxiosRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

export type RequestConfig = AxiosRequestConfig & {
  _retry?: boolean;
};

export class ApiClient {
  private static readonly TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
  private readonly client: AxiosInstance;
  private readonly refreshClient: AxiosInstance;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(
    runtimeConfig: RuntimeConfigPort,
    private readonly auth?: AuthSessionPort
  ) {
    this.client = axios.create({
      baseURL: runtimeConfig.apiBaseUrl,
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.refreshClient = axios.create({
      baseURL: runtimeConfig.apiBaseUrl,
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
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
        .post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken })
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
      const payload = token.split('.')[1];
      if (!payload) {
        return null;
      }
      const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoder =
        typeof globalThis.atob === 'function' ? globalThis.atob.bind(globalThis) : undefined;
      if (!decoder) {
        return null;
      }
      const decoded: unknown = JSON.parse(decoder(normalizedPayload));
      if (
        typeof decoded === 'object' &&
        decoded !== null &&
        'exp' in decoded &&
        typeof decoded.exp === 'number'
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
          headers.set('Authorization', `Bearer ${token}`);
          config.headers = headers;
        }
        return config;
      },
      (error: AxiosError) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as RetryableAxiosRequestConfig | undefined;
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/auth/login') &&
          !originalRequest.url?.includes('/auth/refresh')
        ) {
          originalRequest._retry = true;
          const accessToken = await this.refreshAccessToken();
          if (accessToken) {
            const headers = new AxiosHeaders(originalRequest.headers);
            headers.set('Authorization', `Bearer ${accessToken}`);
            originalRequest.headers = headers;
            return this.client(originalRequest);
          }
        }

        return Promise.reject(normalizeAxiosError(error));
      }
    );
  }
}

const normalizeAxiosError = (error: AxiosError): Error => {
  const responseData = error.response?.data;
  if (!responseData || typeof responseData !== 'object') {
    return error;
  }

  const data = responseData as Record<string, unknown>;
  const message =
    typeof data.message === 'string' && data.message.trim()
      ? data.message.trim()
      : Array.isArray(data.message)
        ? data.message
            .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
            ?.trim() || error.message
        : typeof data.error === 'string' && data.error.trim()
          ? data.error.trim()
          : error.message;
  return new Error(message);
};

export const createApiClient = (
  runtimeConfig: RuntimeConfigPort,
  auth?: AuthSessionPort
): ApiClient => new ApiClient(runtimeConfig, auth);
