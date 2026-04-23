import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TemporalWorkflow } from '@prisma/client';
import axios from 'axios';

export interface WorkflowSignalHandler {
  name: string;
  description?: string;
}

export interface WorkflowQueryHandler {
  name: string;
  description?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'activity' | 'signal' | 'query' | 'childWorkflow' | 'parallel';
  activityName?: string;
  input?: Record<string, any>;
  retryPolicy?: { maxRetries: number; backoffMs: number };
  parallelSteps?: string[];
}

export interface WorkflowDsl {
  name: string;
  taskQueue: string;
  steps: WorkflowStep[];
  conditionals?: Array<{
    step: string;
    condition: string;
    skip?: boolean;
  }>;
  signalHandlers?: WorkflowSignalHandler[];
  queryHandlers?: WorkflowQueryHandler[];
  errorHandling?: {
    type: 'saga' | 'simple';
    compensations?: Array<{
      step: string;
      activityName: string;
    }>;
  };
}

export interface ActivityDsl {
  activities: Array<{
    name: string;
    fn: string;
    timeout: string;
    retryPolicy?: { maxRetries: number };
    handler: 'api' | 'carbone' | 'browser' | 'script';
    config: Record<string, any>;
  }>;
}

export interface CreateTemporalWorkflowDTO {
  name: string;
  description?: string;
  taskQueue?: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  generatedCode?: string;
}

export interface UpdateTemporalWorkflowDTO {
  name?: string;
  description?: string;
  taskQueue?: string;
  workflowDsl?: WorkflowDsl;
  activityDsl?: ActivityDsl;
  isActive?: boolean;
  generatedCode?: string;
}

export interface TemporalValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class TemporalWorkflowService {
  private readonly logger = new Logger(TemporalWorkflowService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<TemporalWorkflow[]> {
    return this.prisma.temporalWorkflow.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<TemporalWorkflow | null> {
    return this.prisma.temporalWorkflow.findUnique({ where: { id } });
  }

  async create(data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflow> {
    return this.prisma.temporalWorkflow.create({
      data: {
        name: data.name,
        description: data.description,
        taskQueue: data.taskQueue || 'SKILL_TASK_QUEUE',
        workflowDsl: data.workflowDsl as any,
        activityDsl: data.activityDsl as any,
        generatedCode: data.generatedCode || null,
        isActive: true,
      },
    });
  }

  async update(id: string, data: UpdateTemporalWorkflowDTO): Promise<TemporalWorkflow> {
    return this.prisma.temporalWorkflow.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.taskQueue && { taskQueue: data.taskQueue }),
        ...(data.workflowDsl && { workflowDsl: data.workflowDsl as any }),
        ...(data.activityDsl && { activityDsl: data.activityDsl as any }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.generatedCode !== undefined && { generatedCode: data.generatedCode }),
      },
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await this.prisma.temporalWorkflow.delete({ where: { id } });
    return { success: true };
  }

  async deploy(id: string): Promise<TemporalWorkflow> {
    return this.prisma.temporalWorkflow.update({
      where: { id },
      data: { deployedAt: new Date() },
    });
  }

  async validate(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): Promise<TemporalValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!workflowDsl.name) {
      errors.push('Workflow name is required');
    }

    if (!workflowDsl.steps || workflowDsl.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    const activityNames = new Set(activityDsl.activities.map(a => a.name));

    for (let i = 0; i < workflowDsl.steps.length; i++) {
      const step = workflowDsl.steps[i];

      if (!step.name) {
        errors.push(`Step ${i + 1} must have a name`);
      }

      if (step.type === 'activity' && !step.activityName) {
        errors.push(`Step "${step.name}" must specify an activity name`);
      } else if (step.type === 'activity' && step.activityName && !activityNames.has(step.activityName)) {
        errors.push(`Step "${step.name}" references activity "${step.activityName}" which is not defined in Activity DSL`);
      }
    }

    if (!activityDsl.activities || activityDsl.activities.length === 0) {
      warnings.push('No activities defined');
    }

    for (const activity of activityDsl.activities) {
      if (!activity.name) {
        errors.push('All activities must have a name');
      }
      if (!activity.fn) {
        errors.push(`Activity "${activity.name}" must have a function name`);
      }
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);

    return {
      isValid: errors.length === 0,
      score,
      errors,
      warnings,
    };
  }

  async generateWorkflowCode(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): Promise<{ success: boolean; code?: string; error?: string }> {
    const prompt = this.buildWorkflowCodePrompt(workflowDsl, activityDsl);

    try {
      const aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ops-ai-orchestrator:3007';
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'MiniMax-M2.7',
        prompt,
      }, { timeout: 180000 });

      const content = response.data?.result || '';
      const code = this.extractCodeFromMarkdown(content);

      if (!code) {
        return { success: false, error: 'AI 未能生成有效代码' };
      }

      return { success: true, code };
    } catch (error: any) {
      this.logger.error(`Failed to generate workflow code: ${error.message}`);
      return { success: false, error: `生成失败: ${error.message}` };
    }
  }

  async validateInSandbox(code: string, fn: string, input?: Record<string, any>): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    const logs: string[] = [];

    try {
      const sandboxUrl = process.env.TEMPORAL_SANDBOX_AGENT_URL || 'http://ops-temporal-sandbox-agent:8090';

      const response = await axios.post<any>(`${sandboxUrl}/execute`, {
        code,
        fn_name: fn,
        activity_id: `workflow-validate-${Date.now()}`,
        input_data: input || { test: 'workflow-validation' },
      }, {
        timeout: 120000,
      });

      logs.push(`Sandbox response: ${JSON.stringify(response.data)}`);

      return {
        success: response.data?.success !== false,
        logs,
        result: response.data,
        error: response.data?.error,
        score: response.data?.success ? 100 : 50,
      };
    } catch (error: any) {
      this.logger.error(`Sandbox validation failed: ${error.message}`);
      logs.push(`Error: ${error.message}`);
      return {
        success: false,
        logs,
        error: error.message,
        score: 0,
      };
    }
  }

  async validateInSandboxStreaming(
    code: string,
    fn: string,
    input: Record<string, any> | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; error?: string; score: number }> {
    const sandboxUrl = process.env.TEMPORAL_SANDBOX_AGENT_URL || 'http://ops-temporal-sandbox-agent:8090';
    const activityId = `workflow-validate-${Date.now()}`;

    onLog(`[${new Date().toISOString()}] 连接到 Sandbox Agent: ${sandboxUrl}`);
    onLog(`[${new Date().toISOString()}] Activity ID: ${activityId}`);

    try {
      onLog(`[${new Date().toISOString()}] 执行工作流代码验证...`);
      const response = await axios.post<any>(`${sandboxUrl}/execute`, {
        code,
        fn_name: fn,
        activity_id: activityId,
        input_data: input || { test: 'workflow-validation' },
      }, {
        timeout: 120000,
      });

      onLog(`[${new Date().toISOString()}] 响应状态: ${response.data?.success !== false ? '成功' : '失败'}`);

      return {
        success: response.data?.success !== false,
        result: response.data,
        error: response.data?.error,
        score: response.data?.success ? 100 : 50,
      };
    } catch (error: any) {
      this.logger.error(`Sandbox validation failed: ${error.message}`);
      onLog(`[${new Date().toISOString()}] 错误: ${error.message}`);
      return {
        success: false,
        error: error.message,
        score: 0,
      };
    }
  }

  private buildWorkflowCodePrompt(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): string {
    const lines: string[] = [];

    lines.push('请根据以下 Workflow DSL 生成标准的 Temporal Python 工作流代码。');
    lines.push('');
    lines.push('【Workflow DSL】');
    lines.push(JSON.stringify(workflowDsl, null, 2));
    lines.push('');
    lines.push('【Activity DSL】');
    lines.push(JSON.stringify(activityDsl, null, 2));
    lines.push('');
    lines.push('【Temporal Python SDK 黄金准则】');
    lines.push('1. 【结构】必须包含 `from temporalio import workflow` 和 `from datetime import timedelta`。');
    lines.push('2. 【入口】使用 `@workflow.defn` 装饰类，`@workflow.run` 装饰异步入口方法。');
    lines.push('3. 【签名】`async def run(self, params: dict) -> dict:`');
    lines.push('4. 【日志】使用 `workflow.logger.info()` 记录步骤，禁止使用 print()。');
    lines.push('5. 【Activity 执行】使用 `await workflow.execute_activity(activity_fn, input, start_to_close_timeout=timedelta(...))`。');
    lines.push('6. 【并行执行】使用 `asyncio.gather()` 实现并行 Activity。');
    lines.push('7. 【Signal】使用 `@workflow.signal` 装饰异步方法修改工作流状态。');
    lines.push('8. 【Query】使用 `@workflow.query` 装饰方法读取工作流状态（不得修改状态）。');
    lines.push('9. 【错误处理】使用 `try/except`，通过 `raise ApplicationError()` 抛出业务异常。');
    lines.push('10. 【取消处理】捕获 `asyncio.CancelledError` 进行清理。');
    lines.push('');
    lines.push('【代码要求】');
    lines.push('- 生成完整的、可直接运行的工作流类');
    lines.push('- 函数名使用 PascalCase（如 `ContractGenerationWorkflow`）');
    lines.push('- 为每个 step 生成 activity 执行逻辑');
    lines.push('- 支持条件执行（conditionals）');
    lines.push('- 包含适当的超时配置');

    return lines.join('\n');
  }

  private extractCodeFromMarkdown(content: string): string | null {
    // Try to extract code from markdown code blocks
    const codeBlockMatch = content.match(/```python\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    const genericCodeBlockMatch = content.match(/```\n([\s\S]*?)```/);
    if (genericCodeBlockMatch) {
      return genericCodeBlockMatch[1].trim();
    }

    // If no code block, return the whole content if it looks like Python
    const lines = content.split('\n');
    if (lines.some(line => line.includes('@workflow.defn') || line.includes('async def run'))) {
      return content.trim();
    }

    return null;
  }
}