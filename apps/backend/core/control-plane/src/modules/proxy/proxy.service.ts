import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import {
  getAiOrchestratorUrl,
  getAuthServiceUrl,
  getBrowserTemplateServiceUrl,
  getBrowserWorkerUrl,
  getSessionBrokerUrl,
} from '../../config/service-endpoints';

export interface ServiceConfig {
  name: string;
  baseUrl: string;
  timeout?: number;
}

@Injectable()
export class ProxyService {
  private readonly defaultTimeoutMs = this.readTimeoutMs('PROXY_TIMEOUT_DEFAULT_MS', 60000);
  private serviceConfigs: Record<string, ServiceConfig> = {
    platform: {
      name: 'platform',
      baseUrl: getAuthServiceUrl(),
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_PLATFORM_MS', this.defaultTimeoutMs),
    },
    auth: {
      name: 'platform',
      baseUrl: getAuthServiceUrl(),
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_AUTH_MS', this.defaultTimeoutMs),
    },
    'browser-template': {
      name: 'browser-template',
      baseUrl: getBrowserTemplateServiceUrl(),
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_BROWSER_TEMPLATE_MS', this.defaultTimeoutMs),
    },
    session: {
      name: 'session-broker',
      baseUrl: getSessionBrokerUrl(),
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_SESSION_MS', this.defaultTimeoutMs),
    },
    ai: {
      name: 'ai-orchestrator',
      baseUrl: `${getAiOrchestratorUrl()}/ai`,
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_AI_MS', 60000),
    },
    worker: {
      name: 'browser-worker',
      baseUrl: getBrowserWorkerUrl(),
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_WORKER_MS', 60000),
    },
  };

  private axiosInstances: Record<string, ReturnType<typeof axios.create>> = {};

  constructor() {
    // Create axios instances for each service
    for (const [key, config] of Object.entries(this.serviceConfigs)) {
      this.axiosInstances[key] = axios.create({
        baseURL: config.baseUrl,
        timeout: config.timeout || this.defaultTimeoutMs,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  }

  async proxyRequest(
    serviceName: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    data?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ data: unknown; status: number }> {
    const instance = this.axiosInstances[serviceName];

    if (!instance) {
      throw new HttpException(`Unknown service: ${serviceName}`, HttpStatus.BAD_GATEWAY);
    }

    const config: {
      method: string;
      url: string;
      headers: Record<string, string>;
      data?: unknown;
    } = {
      method: method.toLowerCase(),
      url: path,
      headers: {
        ...headers,
      },
    };

    if (data && method !== 'GET') {
      config.data = data;
    }

    try {
      const response = await instance.request(config);
      return {
        data: response.data,
        status: response.status,
      };
    } catch (error) {
      const axiosLikeError = error as {
        message?: string;
        code?: string;
        response?: {
          data?: unknown;
          status?: number;
        };
      };

      if (axiosLikeError.response?.status) {
        // Forward error from downstream service
        throw new HttpException(
          axiosLikeError.response.data || axiosLikeError.message || 'Downstream request failed',
          axiosLikeError.response.status,
        );
      } else if (axiosLikeError.code === 'ECONNABORTED') {
        throw new HttpException(
          `Timeout connecting to ${serviceName}`,
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }

      throw new HttpException(
        `Failed to connect to ${serviceName}: ${axiosLikeError.message || 'Unknown error'}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  getServiceUrl(serviceName: string): string {
    const config = this.serviceConfigs[serviceName];
    return config?.baseUrl || '';
  }

  getServiceNames(): string[] {
    return Object.keys(this.serviceConfigs);
  }

  private readTimeoutMs(envName: string, fallbackMs: number): number {
    const value = process.env[envName];
    if (!value) {
      return fallbackMs;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallbackMs;
    }

    return parsed;
  }

  async checkServiceHealth(serviceName: string): Promise<boolean> {
    const instance = this.axiosInstances[serviceName];

    if (!instance) {
      return false;
    }

    try {
      await instance.get('/health');
      return true;
    } catch (error) {
      const axiosLikeError = error as {
        code?: string;
        response?: {
          status?: number;
        };
      };

      // Treat any HTTP response as reachable; only network/timeouts mean unhealthy.
      if (axiosLikeError.response?.status) {
        return true;
      }

      return axiosLikeError.code !== 'ECONNABORTED';
    }
  }
}
