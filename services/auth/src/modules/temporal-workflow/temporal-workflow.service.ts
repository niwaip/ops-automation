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
  startToCloseTimeout?: string;
  scheduleToCloseTimeout?: string;
  heartbeatTimeout?: string;
  retryPolicy?: { maxRetries?: number; backoffMs?: number };
  parallelSteps?: string[];
}

export interface WorkflowDsl {
  name: string;
  workflowClassName?: string;
  workflowDefnName?: string;
  taskQueue: string;
  steps: WorkflowStep[];
  inputParams?: Record<string, { description?: string; required?: boolean; defaultValue?: string }>;
  outputParams?: Record<string, { description?: string; sourceStep?: string }>;
  extraPrompt?: string;
  workflowExecutionTimeout?: string;
  workflowRunTimeout?: string;
  workflowTaskTimeout?: string;
  defaultActivityRetryPolicy?: {
    maxRetries?: number;
    initialIntervalMs?: number;
    backoffCoefficient?: number;
    maxIntervalMs?: number;
  };
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

  async validateWorkflowReal(code: string, fn: string, input?: Record<string, any>, taskQueue?: string): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    const logs: string[] = [];

    try {
      const validationAgentUrl = this.getWorkflowValidationAgentUrl();
      const workflowId = `workflow-validate-${Date.now()}`;

      const response = await axios.post<any>(`${validationAgentUrl}/validate-workflow`, {
        code,
        fn_name: fn,
        workflow_id: workflowId,
        input_data: input || { test: 'workflow-validation' },
        task_queue: taskQueue,
      }, {
        timeout: Number(process.env.WORKFLOW_VALIDATION_TIMEOUT_MS || 300000),
      });

      logs.push(`Workflow validation response: ${JSON.stringify(response.data)}`);

      const executionResult = response.data?.result;
      const resultSuccess =
        response.data?.success === true &&
        executionResult?.success === true &&
        !executionResult?.error;

      if (executionResult?.error) {
        logs.push(`执行错误: ${executionResult.error}`);
      }

      return {
        success: resultSuccess,
        logs,
        result: executionResult,
        error: executionResult?.error,
        score: resultSuccess ? 100 : 50,
      };
    } catch (error: any) {
      this.logger.error(`Workflow real validation failed: ${error.message}`);
      logs.push(`Error: ${error.message}`);
      return {
        success: false,
        logs,
        error: error.message,
        score: 0,
      };
    }
  }

  async validateWorkflowRealStreaming(
    code: string,
    fn: string,
    input: Record<string, any> | undefined,
    taskQueue: string | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; logs?: string[]; traceback?: string; error?: string; score: number }> {
    const validationAgentUrl = this.getWorkflowValidationAgentUrl();
    const workflowId = `workflow-validate-${Date.now()}`;
    const streamedLogs: string[] = [];
    const pushLog = (log: string) => {
      streamedLogs.push(log);
      onLog(log);
    };

    pushLog(`[${new Date().toISOString()}] 连接到 Workflow 测试 Worker: ${validationAgentUrl}`);
    pushLog(`[${new Date().toISOString()}] Workflow ID: ${workflowId}`);

    try {
      pushLog(`[${new Date().toISOString()}] 开始真实验证工作流代码...`);
      const response = await axios.post<any>(`${validationAgentUrl}/validate-workflow`, {
        code,
        fn_name: fn,
        workflow_id: workflowId,
        input_data: input || { test: 'workflow-validation' },
        task_queue: taskQueue,
      }, {
        timeout: Number(process.env.WORKFLOW_VALIDATION_TIMEOUT_MS || 300000),
      });

      const data = response.data as any;
      const workerLogs = Array.isArray(data.result?.logs) ? data.result.logs : [];

      if (workerLogs.length > 0) {
        workerLogs.forEach((log: string) => {
          pushLog(log);
        });
      }

      const resultSuccess = data.result?.success === true && !data.result?.error;
      pushLog(`[${new Date().toISOString()}] 响应状态: ${resultSuccess ? '成功' : '失败'}`);

      if (data.result?.error) {
        pushLog(`[${new Date().toISOString()}] 执行错误: ${data.result.error}`);
        if (data.result.traceback) {
          pushLog(`[${new Date().toISOString()}] 详细堆栈:\n${data.result.traceback}`);
        }
      }

      const finalResult = data.result?.result || data.result;
      if (resultSuccess) {
        pushLog(`[${new Date().toISOString()}] 执行成功，返回结果: ${JSON.stringify(finalResult, null, 2)}`);
      }

      return {
        success: resultSuccess,
        result: data.result,
        logs: streamedLogs,
        error: data.result?.error,
        traceback: data.result?.traceback,
        score: resultSuccess ? 100 : 0,
      };
    } catch (error: any) {
      this.logger.error(`Workflow real validation failed: ${error.message}`);
      pushLog(`[${new Date().toISOString()}] 错误: ${error.message}`);
      return {
        success: false,
        logs: streamedLogs,
        error: error.message,
        score: 0,
      };
    }
  }

  private getWorkflowValidationAgentUrl(): string {
    if (process.env.WORKFLOW_VALIDATION_AGENT_URL) {
      return process.env.WORKFLOW_VALIDATION_AGENT_URL;
    }
    if (process.env.ACTIVITY_VALIDATION_AGENT_URL) {
      return process.env.ACTIVITY_VALIDATION_AGENT_URL;
    }
    if (process.env.TEMPORAL_SANDBOX_AGENT_URL) {
      return process.env.TEMPORAL_SANDBOX_AGENT_URL;
    }
    return 'http://host.docker.internal:8090';
  }

  private buildWorkflowCodePrompt(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl, errorContext?: string): string {
    const lines: string[] = [];
    const workflowClassName = workflowDsl.workflowClassName?.trim()
      || `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
    const workflowDisplayName = workflowDsl.workflowDefnName?.trim()
      || workflowDsl.name
      || workflowClassName;
    const workflowInputParams = workflowDsl.inputParams || {};
    const inputParamEntries = Object.entries(workflowInputParams);

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

    if (inputParamEntries.length > 0) {
      lines.push('【Workflow 入口参数定义（必须使用）】');
      inputParamEntries.forEach(([key, config]) => {
        lines.push(`- 参数名: ${key}; required=${config?.required ? 'true' : 'false'}; default=${config?.defaultValue ?? '<none>'}; description=${config?.description ?? '<none>'}`);
      });
      lines.push('');
    }

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
    lines.push('1. 【组合输出】：你的输出必须包含所有 Activity 的实现代码（已有的或新生成的）以及 Workflow 类的定义。严禁使用任何形式的内部导入（如 `from activities import ...` 或 `from your_module import ...`），严禁使用 `workflow.unsafe`。');
    lines.push(`2. 【类名强制】：Workflow 类名必须完全等于 \`${workflowClassName}\`。`);
    lines.push(`3. 【显示名强制】：必须使用 \`@workflow.defn(name="${workflowDisplayName}")\`。`);
    lines.push('4. 【结构】：入口必须为 `async def run(self, params: dict)`，严禁为 Workflow 类定义 `__init__` 方法。');
    lines.push('5. 【参数使用强制】：如果 Workflow DSL 提供了 `inputParams`，必须在 `run()` 中从 `params` 逐项读取这些参数并用于业务流程/Activity 入参；不得忽略这些参数定义。');
    lines.push('6. 【参数校验强制】：对 `required=true` 的参数必须显式校验缺失并抛出 `ApplicationError(..., non_retryable=True)`；若配置了 `defaultValue`，读取参数时必须应用默认值。');
    lines.push('7. 【执行配置落地强制】：如果 Workflow DSL 提供了 `workflowExecutionTimeout`、`workflowRunTimeout`、`workflowTaskTimeout`，必须在生成代码中定义同名或语义等价的 `timedelta` 常量（例如 `WORKFLOW_EXECUTION_TIMEOUT`），并在 Workflow 日志中输出这些配置值，禁止忽略这些配置。');
    lines.push('8. 【确定性强制】：Workflow 代码中禁止直接做非确定性副作用（HTTP/DB/文件 I/O、系统时间、随机数、线程、进程、全局可变状态）；这些操作必须在 Activity 中完成。');
    lines.push('9. 【历史回放安全】：代码必须稳定可回放，避免根据运行时环境分支改变命令顺序；需要等待条件请用 `workflow.wait_condition`，不要 busy loop。');
    lines.push('10. 【沙箱稳定性】：如果代码涉及外部 HTTP 请求，请保持实现通用，不要在代码中写死任何业务实例、接口域名或返回值；需要兼容沙箱时，请依赖运行环境提供的 mock 请求能力。');
    lines.push('11. 【调用】：使用 `await workflow.execute_activity(activity_fn, input, start_to_close_timeout=timedelta(...))`。如果步骤 DSL 中还提供了 `scheduleToCloseTimeout` 或 `heartbeatTimeout`，也必须分别映射为 `schedule_to_close_timeout=timedelta(...)`、`heartbeat_timeout=timedelta(...)`。所有超时都必须与步骤 DSL 一致，未配置的项不要硬编码。');
    lines.push('12. 【重试策略】：优先使用 DSL 指定的 retryPolicy；未指定时再使用合理默认值，禁止无限重试。');
    lines.push('13. 【日志】：必须使用 `workflow.logger.info()` 输出关键执行阶段与参数摘要。');
    lines.push('14. 【版本演进提示】：在关键逻辑处添加简短注释，提示后续变更需考虑历史运行中的工作流回放兼容性。');
    lines.push('15. 【禁止客户端代码】：不要在生成的 Workflow 文件中引入 `temporalio.client.Client`、`temporalio.worker.Worker`，也不要在代码里主动连接 Temporal 或启动 Worker。只生成 Workflow 与 Activity 定义本身。');

    if (workflowDsl.errorHandling?.type === 'saga') {
      lines.push('16. 【Saga 模式】：必须维护 compensations 列表，在失败时逆序执行补偿任务。');
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
