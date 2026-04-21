import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Activity, Prisma } from '@prisma/client';
import axios from 'axios';

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

export interface GenerateCodeResult {
  success: boolean;
  code?: string;
  error?: string;
}

// AI Orchestrator URL helper
const getAiOrchestratorUrl = () => {
  if (process.env.AI_ORCHESTRATOR_URL) {
    return process.env.AI_ORCHESTRATOR_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-ai-orchestrator:3007';
  }
  const externalHost = process.env.EXTERNAL_HOST || 'localhost';
  return `http://${externalHost}:3007`;
};

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

    // Handle validation based on whether steps are defined
    const steps: any[] = config.config?.steps || [];
    if (steps.length > 0) {
      // Validate each step
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step.name) {
          errors.push(`Step ${i + 1} is missing a name`);
        }
        if (!step.type || !validHandlers.includes(step.type)) {
          errors.push(`Step ${i + 1} has invalid handler type`);
        }
        if (step.type === 'api' && !step.config?.endpoint) {
          errors.push(`Step ${i + 1} (API) requires endpoint in config`);
        }
        if (step.type === 'script' && !step.config?.script) {
          errors.push(`Step ${i + 1} (Script) requires script in config`);
        }
      }
      suggestions.push('Steps are defined - AI code will be generated based on step configurations');
    } else {
      // No steps - validate at top level (legacy behavior)
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
    }

    if (config.retryPolicy && config.retryPolicy.maxRetries < 0) {
      errors.push('maxRetries must be non-negative');
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);

    return { isValid: errors.length === 0, score, errors, warnings, suggestions };
  }

  /**
   * Generate Python code using AI
   */
  async generateCode(config: ActivityFormData): Promise<GenerateCodeResult> {
    const logger = new Logger('ActivityService');

    // Build a detailed prompt for code generation
    const description = config.config?.description || '';
    const steps = config.config?.steps || [];
    const heartbeatTimeout = config.config?.heartbeatTimeout;
    const retryPolicy = config.retryPolicy;
    const idempotencyKey = config.config?.idempotencyKey;

    const prompt = `你是一个 Temporal Workflow 开发专家。请根据以下 Activity 配置生成 Python 代码。

Activity 配置：
- 名称：${config.name}
- 函数名：${config.fn}
- 描述：${description || '无'}
- Task Queue：${config.config?.taskQueue || 'SKILL_TASK_QUEUE'}
- 超时：${config.timeout || '30s'}
${heartbeatTimeout ? `- 心跳超时：${heartbeatTimeout}` : '- 心跳超时：不启用'}
${retryPolicy ? `- 重试策略：最多 ${retryPolicy.maxRetries} 次` : '- 重试策略：不启用'}
${idempotencyKey ? `- 幂等键：${idempotencyKey}` : '- 幂等键：不启用'}

步骤配置（${steps.length} 个步骤）：
${steps.map((step: any, idx: number) => `
步骤 ${idx + 1}: ${step.name}
  - 类型：${step.type}
  - 超时：${step.timeout || '30s'}
  ${step.type === 'api' ? `- 端点：${step.config?.endpoint || '未指定'}` : ''}
  ${step.type === 'script' ? `- 脚本：${step.config?.script?.substring(0, 100)}...` : ''}
  ${step.type === 'carbone' ? `- 模板ID：${step.config?.templateId || '未指定'}` : ''}
  ${step.type === 'browser' ? `- 操作：${step.config?.action || 'click'}, 选择器：${step.config?.selector || '未指定'}` : ''}
`).join('')}

请生成完整的 Python Temporal Activity 代码，包括：
1. 正确的 @activity.defn 装饰器
2. 函数签名和类型注解
3. 详细的中文 docstring 说明
4. 心跳处理（如果配置了）
5. 错误处理和重试逻辑
6. 每个步骤的执行逻辑
7. 适当的日志记录

请只返回代码，不要有其他解释。代码应该可以直接用于 Temporal Worker。`;

    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      logger.log(`Calling AI orchestrator at ${aiOrchestratorUrl}/ai/model/call`);

      const response = await axios.post<{ result: string }>(
        `${aiOrchestratorUrl}/ai/model/call`,
        {
          modelId: 'minimax',  // Use minimax model as requested
          prompt,
        },
        { timeout: 60000 }
      );

      const code = response.data?.result;
      if (code) {
        logger.log('Successfully generated code');
        return { success: true, code };
      } else {
        return { success: false, error: 'AI returned empty response' };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`AI code generation failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}