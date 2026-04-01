import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface ServiceConfig {
  name: string;
  baseUrl: string;
  timeout?: number;
}

@Injectable()
export class ProxyService {
  private serviceConfigs: Record<string, ServiceConfig> = {
    auth: {
      name: 'auth',
      baseUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
      timeout: 5000,
    },
    template: {
      name: 'template',
      baseUrl: process.env.TEMPLATE_SERVICE_URL || 'http://localhost:3002',
      timeout: 5000,
    },
    session: {
      name: 'session-broker',
      baseUrl: process.env.SESSION_SERVICE_URL || 'http://localhost:3003',
      timeout: 5000,
    },
    ai: {
      name: 'ai-orchestrator',
      baseUrl: process.env.AI_SERVICE_URL || 'http://localhost:3004',
      timeout: 30000, // AI operations may take longer
    },
    worker: {
      name: 'browser-worker',
      baseUrl: process.env.WORKER_SERVICE_URL || 'http://localhost:3005',
      timeout: 10000,
    },
    replay: {
      name: 'replay-engine',
      baseUrl: process.env.REPLAY_SERVICE_URL || 'http://localhost:3006',
      timeout: 10000,
    },
  };

  private axiosInstances: Record<string, AxiosInstance> = {};

  constructor() {
    // Create axios instances for each service
    for (const [key, config] of Object.entries(this.serviceConfigs)) {
      this.axiosInstances[key] = axios.create({
        baseURL: config.baseUrl,
        timeout: config.timeout || 5000,
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

    const config: AxiosRequestConfig = {
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
      if (axios.isAxiosError(error)) {
        if (error.response) {
          // Forward error from downstream service
          throw new HttpException(
            error.response.data || error.message,
            error.response.status,
          );
        } else if (error.code === 'ECONNABORTED') {
          throw new HttpException(
            `Timeout connecting to ${serviceName}`,
            HttpStatus.GATEWAY_TIMEOUT,
          );
        } else {
          throw new HttpException(
            `Failed to connect to ${serviceName}: ${error.message}`,
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
      }
      throw new HttpException('Unknown error occurred', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  getServiceUrl(serviceName: string): string {
    const config = this.serviceConfigs[serviceName];
    return config?.baseUrl || '';
  }

  getServiceNames(): string[] {
    return Object.keys(this.serviceConfigs);
  }
}