import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

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
      baseUrl: process.env.PLATFORM_SERVICE_URL || 'http://platform:3001',
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_PLATFORM_MS', this.defaultTimeoutMs),
    },
    auth: {
      name: 'platform',
      baseUrl: process.env.PLATFORM_SERVICE_URL || 'http://platform:3001',
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_AUTH_MS', this.defaultTimeoutMs),
    },
    template: {
      name: 'template',
      baseUrl: process.env.TEMPLATE_SERVICE_URL || 'http://template:3005',
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_TEMPLATE_MS', this.defaultTimeoutMs),
    },
    session: {
      name: 'session-broker',
      baseUrl: process.env.SESSION_BROKER_URL || process.env.SESSION_SERVICE_URL || 'http://session-broker:3002',
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_SESSION_MS', this.defaultTimeoutMs),
    },
    ai: {
      name: 'ai-orchestrator',
      baseUrl: process.env.AI_ORCHESTRATOR_URL || process.env.AI_SERVICE_URL || 'http://ai-orchestrator:3007',
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_AI_MS', 60000),
    },
    worker: {
      name: 'browser-worker',
      baseUrl: process.env.WORKER_SERVICE_URL || 'http://browser-worker:3004',
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_WORKER_MS', 60000),
    },
    replay: {
      name: 'replay-engine',
      baseUrl: process.env.REPLAY_SERVICE_URL || 'http://replay-engine:3006',
      timeout: this.readTimeoutMs('PROXY_TIMEOUT_REPLAY_MS', 60000),
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
