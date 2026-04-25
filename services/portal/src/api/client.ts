import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  message: string;
  statusCode: number;
}

type RequestConfig = {
  headers?: Record<string, string>;
  url?: string;
  _retry?: boolean;
};

interface RetryableAxiosRequestConfig extends RequestConfig {
  _retry?: boolean;
}

class ApiClient {
  private client;
  private refreshClient;
  private refreshPromise: any = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 120000,  // 120 seconds for AI operations
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

  private async refreshAccessToken(): Promise<string | null> {
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

  private setupInterceptors() {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config: any) => {
        const token = useAuthStore.getState().accessToken;
        if (token) {
          config.headers = config.headers ?? {};
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: any) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response: any) => response,
      async (error: any) => {
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
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.client(originalRequest as any);
          }
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
export default apiClient;
