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

    // Build prompt using array join to avoid template literal nesting issues
    const promptParts: string[] = [
      '你是一个 Temporal Workflow 开发专家。请根据以下 Activity 配置生成符合 Temporal Python SDK 最佳实践的 Python Activity 代码。',
      '',
      '请严格遵循以下指导原则：',
      '1. 使用 temporalio.activity 模块。',
      '2. 为 Activity 函数使用 @activity.defn 装饰器。',
      '3. 函数签名应包含类型注解。',
      '4. 提供详细的中文 docstring 解释 Activity 的目的、参数和返回值。',
      '5. 如果 Activity 可能长时间运行，请使用 activity.heartbeat() 进行心跳报告。',
      '6. 使用 activity.logger 进行日志记录，而不是 print()。',
      '7. 实施健壮的错误处理，使用 temporalio.exceptions.ApplicationError 处理业务逻辑错误。',
      '8. 确保生成的代码是独立的，可以直接用于 Temporal Worker。',
      '9. 返回结果应为字典类型。',
      '',
      'Activity 配置：',
      `- 名称：${config.name}`,
      `- 函数名：${config.fn}`,
      `- 描述：${description || '无'}`,
      `- Task Queue：${config.config?.taskQueue || 'SKILL_TASK_QUEUE'}`,
      `- 超时：${config.timeout || '30s'}`,
      heartbeatTimeout ? `- 心跳超时：${heartbeatTimeout}` : '- 心跳超时：不启用',
      retryPolicy ? `- 重试策略：最多 ${retryPolicy.maxRetries} 次` : '- 重试策略：不启用',
      idempotencyKey ? `- 幂等键：${idempotencyKey}` : '- 幂等键：不启用',
      '',
      `步骤配置（${steps.length} 个步骤）：`,
    ];

    // Add step descriptions
    steps.forEach((step: any, idx: number) => {
      let stepDesc = `步骤 ${idx + 1}: ${step.name}`;
      stepDesc += `\n  - 类型：${step.type}`;
      stepDesc += `\n  - 超时：${step.timeout || '30s'}`;
      if (step.type === 'api') {
        stepDesc += `\n  - 端点：${step.config?.endpoint || '未指定'}, 方法：${step.config?.method || 'GET'}`;
      } else if (step.type === 'script') {
        stepDesc += `\n  - 脚本：${(step.config?.script || '').substring(0, 100)}...`;
      } else if (step.type === 'carbone') {
        stepDesc += `\n  - 模板ID：${step.config?.templateId || '未指定'}`;
      } else if (step.type === 'browser') {
        stepDesc += `\n  - 操作：${step.config?.action || 'click'}, 选择器：${step.config?.selector || '未指定'}`;
      }
      promptParts.push(stepDesc);
    });

    promptParts.push('');
    promptParts.push('请只返回 Python 代码，不要有其他解释。确保代码中包含必要的辅助函数（例如执行 API 请求、脚本等），或者明确指出这些是外部依赖。');

    const prompt = promptParts.join('\n');

    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      logger.log(`Calling AI orchestrator at ${aiOrchestratorUrl}/ai/model/call`);

      const response = await axios.post<{ result: string }>(
        `${aiOrchestratorUrl}/ai/model/call`,
        {
          modelId: 'MiniMax-M2.7',  // Use MiniMax model
          prompt,
        },
        { timeout: 120000 }
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

  /**
   * Execute generated code for real validation
   * 先拉取最新代码，然后执行
   */
  async executeCode(code: string, fn: string, taskQueue: string, input?: Record<string, any>): Promise<{
    success: boolean;
    result?: any;
    logs?: string[];
    error?: string;
  }> {
    const logger = new Logger('ActivityService.executeCode');
    const logs: string[] = [];

    try {
      logger.log(`Executing code for function: ${fn}`);

      // 1. 先拉取最新代码 (参数中已传入)
      logs.push(`[${new Date().toISOString()}] 拉取最新代码完成`);

      // 2. 将代码发送到 AI Orchestrator 执行
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      const response = await axios.post<{ result: any; logs?: string[]; error?: string }>(
        `${aiOrchestratorUrl}/ai/execute-activity`,
        {
          code,
          fn,
          taskQueue,
          input: input || {},
        },
        { timeout: 120000 } // 2分钟超时
      );

      logs.push(`[${new Date().toISOString()}] 代码执行完成`);

      return {
        success: true,
        result: response.data.result,
        logs: [...logs, ...(response.data.logs || [])],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Code execution failed: ${errorMsg}`);
      logs.push(`[${new Date().toISOString()}] 执行失败: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        logs,
      };
    }
  }

  /**
   * Execute code with streaming callback for real-time logs
   */
  async executeCodeStreaming(
    code: string,
    fn: string,
    taskQueue: string,
    input: Record<string, any> | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const logger = new Logger('ActivityService.executeCodeStreaming');

    try {
      onLog(`[${new Date().toISOString()}] 开始执行代码...`);

      const aiOrchestratorUrl = getAiOrchestratorUrl();
      onLog(`[${new Date().toISOString()}] 调用 AI Orchestrator 执行`);

      const response = await axios.post<{ result: any; logs?: string[]; error?: string }>(
        `${aiOrchestratorUrl}/ai/execute-activity`,
        {
          code,
          fn,
          taskQueue,
          input: input || {},
        },
        { timeout: 180000 }
      );

      if (response.data.logs) {
        response.data.logs.forEach(log => onLog(log));
      }

      if (response.data.error) {
        onLog(`[${new Date().toISOString()}] 执行失败: ${response.data.error}`);
        return { success: false, error: response.data.error };
      }

      onLog(`[${new Date().toISOString()}] 执行成功`);
      return { success: true, result: response.data.result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Streaming execution failed: ${errorMsg}`);
      onLog(`[${new Date().toISOString()}] 执行失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}