import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Activity, Prisma } from '@prisma/client';

export interface ActivityFormData {
  name: string;
  fn: string;
  timeout?: string;
  retryPolicy?: { maxRetries: number; backoffMs?: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
}

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

  async findAll(): Promise<Activity[]> {
    return this.prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Activity | null> {
    return this.prisma.activity.findUnique({ where: { id } });
  }

  async findByName(name: string): Promise<Activity | null> {
    return this.prisma.activity.findUnique({ where: { name } });
  }

  async create(data: ActivityFormData): Promise<Activity> {
    return this.prisma.activity.create({
      data: {
        name: data.name,
        fn: data.fn,
        timeout: data.timeout || '30s',
        retryPolicy: (data.retryPolicy || null) as any,
        handler: data.handler,
        config: data.config as any,
        isActive: true,
      },
    });
  }

  async update(id: string, data: Partial<ActivityFormData>): Promise<Activity> {
    return this.prisma.activity.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.fn && { fn: data.fn }),
        ...(data.timeout && { timeout: data.timeout }),
        ...(data.retryPolicy !== undefined && { retryPolicy: data.retryPolicy as any }),
        ...(data.handler && { handler: data.handler }),
        ...(data.config && { config: data.config as any }),
      },
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await this.prisma.activity.delete({ where: { id } });
    return { success: true };
  }

  async validate(config: ActivityFormData): Promise<ActivityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!config.name || config.name.trim() === '') {
      errors.push('Activity name is required');
    } else if (config.name.length > 255) {
      errors.push('Activity name must be less than 255 characters');
    }

    if (!config.fn || config.fn.trim() === '') {
      errors.push('Function name is required');
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.fn)) {
      errors.push('Function name must be a valid identifier');
    }

    const validHandlers = ['api', 'carbone', 'browser', 'script'];
    if (!config.handler || !validHandlers.includes(config.handler)) {
      errors.push(`Handler must be one of: ${validHandlers.join(', ')}`);
    }

    if (config.timeout) {
      const timeoutRegex = /^\d+[smh]$/;
      if (!timeoutRegex.test(config.timeout)) {
        errors.push('Timeout must be in format: 30s, 1m, 1h');
      }
    }

    switch (config.handler) {
      case 'api':
        if (!config.config?.endpoint) {
          errors.push('API handler requires endpoint in config');
        }
        break;
      case 'script':
        if (!config.config?.script) {
          errors.push('Script handler requires script in config');
        }
        break;
    }

    if (config.retryPolicy && config.retryPolicy.maxRetries < 0) {
      errors.push('maxRetries must be non-negative');
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);

    return { isValid: errors.length === 0, score, errors, warnings, suggestions };
  }
}