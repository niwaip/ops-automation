import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActivityConfig {
  name: string;
  fn: string;
  timeout: string;
  retryPolicy?: { maxRetries: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
}

export type CreateActivityDto = ActivityConfig;
export type UpdateActivityDto = Partial<ActivityConfig>;

export interface ActivityValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async list(handler?: string) {
    return this.prisma.activity.findMany({
      where: handler ? { handler } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    return this.prisma.activity.findUnique({ where: { id } });
  }

  async create(data: CreateActivityDto) {
    return this.prisma.activity.create({
      data: {
        name: data.name,
        fn: data.fn,
        timeout: data.timeout,
        retryPolicy: data.retryPolicy as any,
        handler: data.handler,
        config: data.config as any,
      },
    });
  }

  async update(id: string, data: UpdateActivityDto) {
    return this.prisma.activity.update({
      where: { id },
      data: {
        ...data,
        retryPolicy: data.retryPolicy as any,
        config: data.config as any,
      },
    });
  }

  async delete(id: string) {
    return this.prisma.activity.delete({ where: { id } });
  }

  async validate(config: ActivityConfig): Promise<ActivityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Required fields validation
    if (!config.name) {
      errors.push('Activity name is required');
    }
    if (!config.fn) {
      errors.push('Function name (fn) is required');
    }
    if (!config.handler) {
      errors.push('Handler type is required');
    }

    // Timeout validation
    if (config.timeout) {
      const timeoutRegex = /^\d+(s|m|h)$/;
      if (!timeoutRegex.test(config.timeout)) {
        errors.push('Timeout must be in format: 30s, 1m, 1h, etc.');
      }
    } else {
      warnings.push('No timeout specified, using default 30s');
    }

    // Handler-specific validation
    switch (config.handler) {
      case 'api':
        if (!config.config?.endpoint) {
          errors.push('API handler requires endpoint in config');
        }
        if (config.config?.method && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(config.config.method)) {
          errors.push('Invalid HTTP method');
        }
        break;

      case 'carbone':
        if (!config.config?.templateId) {
          warnings.push('Carbone handler should specify templateId in config');
        }
        break;

      case 'browser':
        if (!config.config?.action) {
          warnings.push('Browser handler should specify action in config');
        }
        break;

      case 'script':
        if (!config.config?.script) {
          errors.push('Script handler requires script in config');
        }
        break;
    }

    // Retry policy validation
    if (config.retryPolicy) {
      if (config.retryPolicy.maxRetries < 0) {
        errors.push('maxRetries must be non-negative');
      }
      if (config.retryPolicy.maxRetries > 10) {
        warnings.push('maxRetries > 10 may cause long-running retries');
      }
    }

    // Suggestions
    if (!config.retryPolicy) {
      suggestions.push('Consider adding retryPolicy for production use');
    }
    if (!config.timeout) {
      suggestions.push('Consider adding explicit timeout for better control');
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);

    return {
      isValid: errors.length === 0,
      score,
      errors,
      warnings,
      suggestions,
    };
  }
}