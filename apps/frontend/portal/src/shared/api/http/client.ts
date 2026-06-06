import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '@/shared/store/authStore';

const API_BASE_URL = (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL || '/api';

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  message: string;
  statusCode: number;
}

type RequestConfig = AxiosRequestConfig & {
  _retry?: boolean;
};

interface RetryableAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const extractErrorMessage = (error: AxiosError): string => {
  const responseData = error.response?.data;
  if (!responseData || typeof responseData !== 'object') {
    return error.message;
  }

  const data = responseData as Record<string, unknown>;
  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }
  if (Array.isArray(data.message)) {
    const firstMessage = data.message.find((item): item is string => (
      typeof item === 'string' && item.trim().length > 0
    ));
    if (firstMessage) {
      return firstMessage.trim();
    }
  }
  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim();
  }

  return error.message;
};

class ApiClient {
  private client: AxiosInstance;
  private refreshClient: AxiosInstance;
  private refreshPromise: Promise<string | null> | null = null;
  private static readonly TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.refreshClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  async refreshAccessToken(): Promise<string | null> {
    const { refreshToken, logout, setTokens } = useAuthStore.getState();

    if (!refreshToken) {
      return null;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshClient
        .post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
          refreshToken,
        })
        .then((response: { data: { accessToken: string; refreshToken: string } }) => {
          const { accessToken, refreshToken: nextRefreshToken } = response.data;
          setTokens(accessToken, nextRefreshToken);
          return accessToken;
        }, () => {
          logout();
          window.location.href = '/login';
          return null;
        })
        .then((result: string | null) => {
          this.refreshPromise = null;
          return result;
        }, () => {
          this.refreshPromise = null;
          return null;
        });
    }

    return this.refreshPromise;
  }

  private decodeJwtExpiry(token: string): number | null {
    try {
      const [, payload] = token.split('.');
      if (!payload) {
        return null;
      }
      const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decodedPayload: unknown = JSON.parse(window.atob(normalizedPayload));
      if (
        typeof decodedPayload === 'object' &&
        decodedPayload !== null &&
        'exp' in decodedPayload &&
        typeof decodedPayload.exp === 'number'
      ) {
        return decodedPayload.exp * 1000;
      }
      return null;
    } catch {
      return null;
    }
  }

  async ensureFreshAccessToken(): Promise<string | null> {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) {
      return null;
    }

    const expiresAt = this.decodeJwtExpiry(accessToken);
    if (!expiresAt) {
      return accessToken;
    }

    const shouldRefresh = expiresAt - Date.now() <= ApiClient.TOKEN_REFRESH_BUFFER_MS;
    if (!shouldRefresh) {
      return accessToken;
    }

    return this.refreshAccessToken();
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
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

          useAuthStore.getState().logout();
          window.location.href = '/login';
        }

        const normalizedMessage = extractErrorMessage(error);
        if (normalizedMessage && normalizedMessage !== error.message) {
          const enrichedError = new Error(normalizedMessage) as Error & {
            cause?: unknown;
            status?: number;
            responseData?: unknown;
          };
          enrichedError.cause = error;
          enrichedError.status = error.response?.status;
          enrichedError.responseData = error.response?.data;
          return Promise.reject(enrichedError);
        }

        return Promise.reject(error);
      }
    );
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
}

export const apiClient = new ApiClient();
export const refreshAccessToken = () => apiClient.refreshAccessToken();
export const ensureFreshAccessToken = () => apiClient.ensureFreshAccessToken();
export default apiClient;
