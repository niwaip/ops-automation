import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Readable } from 'stream';
import { getControlPlaneApiUrl } from '../config/service-endpoints';

interface ControlPlaneUserContext {
  userId?: string;
  userRoles?: string[];
}

interface ControlPlaneRequestOptions {
  authToken?: string;
  user?: ControlPlaneUserContext;
  extraHeaders?: Record<string, string>;
  timeout?: number;
}

@Injectable()
export class ControlPlaneClient {
  private getBaseUrl(): string {
    return getControlPlaneApiUrl();
  }

  private getInternalServiceSecret(): string | undefined {
    return process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
  }

  private selectPrimaryRole(userRoles?: string[]): string | undefined {
    if (!Array.isArray(userRoles) || userRoles.length === 0) {
      return undefined;
    }
    if (userRoles.includes('admin')) {
      return 'admin';
    }
    return userRoles[0];
  }

  private buildHeaders(options: ControlPlaneRequestOptions = {}): Record<string, string> | undefined {
    const internalSecret = this.getInternalServiceSecret();

    if (internalSecret && options.user?.userId) {
      const headers: Record<string, string> = {
        'X-Internal-Auth': internalSecret,
        'X-User-Id': options.user.userId,
        ...(options.extraHeaders || {}),
      };
      const primaryRole = this.selectPrimaryRole(options.user.userRoles);
      if (primaryRole) {
        headers['X-User-Role'] = primaryRole;
      }
      return headers;
    }

    if (options.authToken || options.extraHeaders) {
      return {
        ...(options.authToken ? { Authorization: options.authToken } : {}),
        ...(options.extraHeaders || {}),
      };
    }

    return undefined;
  }

  private buildConfig(options: ControlPlaneRequestOptions = {}) {
    return {
      headers: this.buildHeaders(options),
      ...(options.timeout ? { timeout: options.timeout } : {}),
    };
  }

  async createExecution<T = { id: string }>(
    body: Record<string, unknown>,
    options?: ControlPlaneRequestOptions,
  ): Promise<T> {
    const response = await axios.post<T>(
      `${this.getBaseUrl()}/executions`,
      body,
      this.buildConfig(options),
    );
    return response.data;
  }

  async getExecution<T = unknown>(
    executionId: string,
    options?: ControlPlaneRequestOptions,
  ): Promise<T> {
    const response = await axios.get<T>(
      `${this.getBaseUrl()}/executions/${executionId}`,
      this.buildConfig(options),
    );
    return response.data;
  }

  async getExecutionSteps<T = unknown[]>(
    executionId: string,
    options?: ControlPlaneRequestOptions,
  ): Promise<T> {
    const response = await axios.get<T>(
      `${this.getBaseUrl()}/executions/${executionId}/steps`,
      this.buildConfig(options),
    );
    return response.data;
  }

  async submitExecutionInput<T = unknown>(
    executionId: string,
    body: Record<string, unknown>,
    options?: ControlPlaneRequestOptions,
  ): Promise<T> {
    const response = await axios.post<T>(
      `${this.getBaseUrl()}/executions/${executionId}/submit-input`,
      body,
      this.buildConfig(options),
    );
    return response.data;
  }

  async triggerTakeover<T = unknown>(
    executionId: string,
    reason: string,
    options?: ControlPlaneRequestOptions,
  ): Promise<T> {
    const response = await axios.post<T>(
      `${this.getBaseUrl()}/executions/${executionId}/takeover`,
      { reason },
      this.buildConfig(options),
    );
    return response.data;
  }

  async streamExecutionEvents(
    executionId: string,
    options?: ControlPlaneRequestOptions,
  ): Promise<Readable> {
    const response = await axios.get<Readable>(
      `${this.getBaseUrl()}/executions/${executionId}/events/stream`,
      {
        ...this.buildConfig(options),
        responseType: 'stream',
      },
    );
    return response.data;
  }
}
