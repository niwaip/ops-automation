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
    generatedCode?: string; // 新增：已生成的 Activity 代码
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

  async generateWorkflowCode(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl, errorContext?: string): Promise<{ success: boolean; code?: string; error?: string }> {
    // Enrich activityDsl with generatedCode from database
    const activityNamesInWorkflow = workflowDsl.steps
      .filter(step => step.type === 'activity' && step.activityName)
      .map(step => step.activityName as string);

    const dbActivities = await this.prisma.activity.findMany({
      where: { name: { in: activityNamesInWorkflow } },
    });

    const activityGeneratedCodeMap = new Map<string, string>();
    dbActivities.forEach(activity => {
      if (activity.generatedCode) {
        activityGeneratedCodeMap.set(activity.name, activity.generatedCode);
      }
    });

    // Merge generatedCode into activityDsl
    const enrichedActivityDsl: ActivityDsl = {
      activities: activityDsl.activities.map(activity => ({
        ...activity,
        generatedCode: activityGeneratedCodeMap.get(activity.name) || activity.generatedCode,
      })),
    };

    const prompt = this.buildWorkflowCodePrompt(workflowDsl, enrichedActivityDsl, errorContext);

    try {
      const aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ops-ai-orchestrator:3007';
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'default',
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

      const resultSuccess = response.data?.result?.success === true && !response.data?.result?.error;
      if (response.data?.result?.error) {
        logs.push(`执行错误: ${response.data.result.error}`);
      }

      return {
        success: resultSuccess,
        logs,
        result: response.data?.result,
        error: response.data?.result?.error,
        score: resultSuccess ? 100 : 50,
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
  ): Promise<{ success: boolean; result?: any; logs?: string[]; traceback?: string; error?: string; score: number }> {
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

      const data = response.data as any;

      // Push logs from sandbox execution to the frontend
      if (data.result?.logs && Array.isArray(data.result.logs)) {
        data.result.logs.forEach((log: string) => {
          onLog(log);
        });
      }

      const resultSuccess = data.result?.success === true && !data.result?.error;
      onLog(`[${new Date().toISOString()}] 响应状态: ${resultSuccess ? '成功' : '失败'}`);

      if (data.result?.error) {
        onLog(`[${new Date().toISOString()}] 执行错误: ${data.result.error}`);
        if (data.result.traceback) {
          onLog(`[${new Date().toISOString()}] 详细堆栈:\n${data.result.traceback}`);
        }
      }

      const finalResult = data.result?.result || data.result;
      if (resultSuccess) {
        onLog(`[${new Date().toISOString()}] 执行成功，返回结果: ${JSON.stringify(finalResult, null, 2)}`);
      }

      return {
        success: resultSuccess,
        result: finalResult,
        logs: data.result?.logs || [],
        error: data.result?.error,
        traceback: data.result?.traceback,
        score: resultSuccess ? 100 : 0,
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

  private buildWorkflowCodePrompt(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl, errorContext?: string): string {
    const lines: string[] = [];

    lines.push('你是一个 Temporal Python 开发专家。请根据以下 Workflow DSL 和 Activity 定义生成一个符合生产标准的 Temporal 工作流。');

    if (errorContext) {
      lines.push('');
      lines.push('【上次生成的问题（请修复）】：');
      lines.push(errorContext);
    }

    lines.push('');
    lines.push('【Workflow DSL】');
    lines.push(JSON.stringify(workflowDsl, null, 2));
    lines.push('');

    lines.push('【Activity 实现指导】');
    activityDsl.activities.forEach(activity => {
      if (activity.generatedCode) {
        lines.push(`- Activity "${activity.name}" (函数名: ${activity.fn}): 已有验证过的代码，请【原样包含】在你的 Python 输出中，不要修改其逻辑。`);
        lines.push('--- 已有代码开始 ---');
        lines.push(activity.generatedCode);
        lines.push('--- 已有代码结束 ---');
      } else {
        lines.push(`- Activity "${activity.name}" (函数名: ${activity.fn}): 尚未实现，请根据 DSL 生成一个标准的 @activity.defn 实现。`);
      }
    });

    lines.push('');
    lines.push('【必须遵守的准则】：');
    lines.push('1. 【组合输出】：你的输出必须包含所有 Activity 的实现代码（已有的或新生成的）以及 Workflow 类的定义。');
    lines.push('2. 【类名强制】：Workflow 类名必须完全等于 `' + (workflowDsl.name.replace(/\s+/g, '') || 'Custom') + 'Workflow' + '`。');
    lines.push('3. 【结构】：Workflow 使用 `@workflow.defn`，入口为 `async def run(self, params: dict)`。');
    lines.push('4. 【确定性】：严禁使用原生 `datetime.now()`, `random`, `uuid`。使用 `workflow.now()`, `workflow.random()`, `workflow.uuid4()`。');
    lines.push('5. 【调用】：使用 `await workflow.execute_activity(activity_fn, input, start_to_close_timeout=timedelta(...))`，确保超时时间与 DSL 一致。');
    lines.push('6. 【日志】：必须使用 `workflow.logger.info()`。');

    if (workflowDsl.errorHandling?.type === 'saga') {
      lines.push('7. 【Saga 模式】：必须维护 compensations 列表，在失败时逆序执行补偿任务。');
    }

    if (workflowDsl.extraPrompt) {
      lines.push('');
      lines.push('【补足情报（额外指导）】：');
      lines.push(workflowDsl.extraPrompt);
    }

    lines.push('');
    lines.push('【输出】：只返回完整的 Python 代码，包含所有 import 语句。不要包含 Markdown 代码块标记。');

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