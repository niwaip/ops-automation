import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TemporalWorkflow } from '@prisma/client';
import axios from 'axios';
import {
  FIXED_DOCUMENT_RENDER_ACTIVITY_CODE,
  FIXED_DOCUMENT_RENDER_ACTIVITY_FN,
} from './fixed-activity-templates';

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

export interface TemporalWorkflowSourceTemplate {
  templateId?: string;
  skillId?: string;
  fileName?: string;
  format?: string;
  variableCount?: number;
}

export interface TemporalWorkflowDTO extends TemporalWorkflow {
  sourceTemplate?: TemporalWorkflowSourceTemplate | null;
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

export interface TemplateWorkflowDraft {
  name: string;
  description: string;
  taskQueue: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  sourceTemplate: {
    templateId: string;
    skillId?: string;
    fileName?: string;
    format?: string;
    variableCount: number;
  };
}

interface CarboneTemplateMeta {
  id: string;
  fileName: string;
  format?: string;
  variables?: string[];
  skillId?: string;
  loops?: Array<{ arrayPath: string }>;
}

interface CarboneSkillMeta {
  id: string;
  templateId?: string;
  parameters?: Array<Record<string, any>>;
  parsingGuide?: string;
  dataParsing?: Record<string, any>;
  validation?: Record<string, any>;
  aiInstructions?: string;
  skillGuideMarkdown?: string;
  dataExampleJson?: unknown;
}

interface TemplateWorkflowAiAnalysis {
  documentType?: string;
  workflowName?: string;
  workflowDescription?: string;
  activityDescription?: string;
  outputName?: string;
  outputDescription?: string;
  inputParamDescriptions?: Record<string, string>;
  extraPrompt?: string;
}

@Injectable()
export class TemporalWorkflowService {
  private readonly logger = new Logger(TemporalWorkflowService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<TemporalWorkflowDTO[]> {
    const workflows = await this.prisma.temporalWorkflow.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return workflows.map((workflow) => this.toWorkflowDto(workflow));
  }

  async findOne(id: string): Promise<TemporalWorkflowDTO | null> {
    const workflow = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    return workflow ? this.toWorkflowDto(workflow) : null;
  }

  async create(data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> {
    try {
      const created = await this.prisma.temporalWorkflow.create({
        data: {
          name: this.normalizeName(data.name),
          description: this.normalizeDescription(data.description),
          taskQueue: this.normalizeTaskQueue(data.taskQueue || data.workflowDsl?.taskQueue),
          workflowDsl: this.normalizeWorkflowDsl(data.workflowDsl, data.name, data.taskQueue) as any,
          activityDsl: this.normalizeActivityDsl(data.activityDsl) as any,
          generatedCode: data.generatedCode || null,
          isActive: true,
        },
      });
      return this.toWorkflowDto(created);
    } catch (error: any) {
      this.logger.error(`Create temporal workflow failed: ${error.message}`);
      throw new BadRequestException(`创建 Temporal Workflow 失败: ${error.message}`);
    }
  }

  async update(id: string, data: UpdateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> {
    const existing = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    }

    try {
      const nextName = data.name !== undefined ? data.name : existing.name;
      const nextTaskQueue = data.taskQueue !== undefined
        ? data.taskQueue
        : this.parseJson<WorkflowDsl>(existing.workflowDsl)?.taskQueue || existing.taskQueue;
      const updated = await this.prisma.temporalWorkflow.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: this.normalizeName(data.name) }),
          ...(data.description !== undefined && { description: this.normalizeDescription(data.description) }),
          ...(data.taskQueue !== undefined && { taskQueue: this.normalizeTaskQueue(nextTaskQueue) }),
          ...(data.workflowDsl && { workflowDsl: this.normalizeWorkflowDsl(data.workflowDsl, nextName, nextTaskQueue) as any }),
          ...(data.activityDsl && { activityDsl: this.normalizeActivityDsl(data.activityDsl) as any }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.generatedCode !== undefined && { generatedCode: data.generatedCode || null }),
        },
      });
      return this.toWorkflowDto(updated);
    } catch (error: any) {
      this.logger.error(`Update temporal workflow ${id} failed: ${error.message}`);
      throw new BadRequestException(`更新 Temporal Workflow 失败: ${error.message}`);
    }
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await this.prisma.temporalWorkflow.delete({ where: { id } });
    return { success: true };
  }

  async deploy(id: string): Promise<TemporalWorkflowDTO> {
    const deployed = await this.prisma.temporalWorkflow.update({
      where: { id },
      data: { deployedAt: new Date() },
    });
    return this.toWorkflowDto(deployed);
  }

  async generateTemplateWorkflowDraft(templateId: string): Promise<TemplateWorkflowDraft> {
    const template = await this.fetchCarboneTemplate(templateId);
    const skill = template.skillId ? await this.fetchCarboneSkill(template.skillId).catch(() => null) : null;
    const analysis = await this.analyzeTemplateWorkflow(template, skill);
    const short = this.slugFromTemplate(template.id);
    const fileBaseName = this.stripTemplateExtension(template.fileName || template.id);
    const documentType = analysis.documentType?.trim() || fileBaseName || `模板${short}`;
    const workflowName = analysis.workflowName?.trim() || `${documentType}模板-${short}-工作流`;
    const activityDescription = analysis.activityDescription?.trim()
      || `共享文档渲染 Activity，绑定模板 ${template.id} 生成 ${documentType} 文档`;
    const workflowDescription = analysis.workflowDescription?.trim()
      || `基于模板 ${template.id} 自动生成的 ${documentType} 工作流`;
    const outputName = analysis.outputName?.trim() || `${documentType}-输出`;
    const variables = this.uniqueVariables(template.variables || []);
    const inputParamsArray = variables.map((variable) => {
      const key = this.variableToKey(variable);
      return {
        key,
        value: '',
        required: true,
      };
    });
    const inputParams = inputParamsArray.reduce<Record<string, { description?: string; required?: boolean; defaultValue?: string }>>((acc, item) => {
      acc[item.key] = {
        required: item.required,
        defaultValue: '',
        description: analysis.inputParamDescriptions?.[item.key]?.trim() || `模板变量 ${item.key}`,
      };
      return acc;
    }, {});

    const sharedActivity = await this.prisma.activity.findFirst({
      where: { fn: FIXED_DOCUMENT_RENDER_ACTIVITY_FN, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    const sharedActivityName = sharedActivity?.name || '文档渲染';
    const sharedActivityTimeout = sharedActivity?.timeout || '60s';
    const sharedActivityRetryPolicy = (sharedActivity?.retryPolicy as { maxRetries?: number; backoffMs?: number } | null) || {
      maxRetries: 2,
      backoffMs: 1000,
    };
    const sharedActivityHandler = (sharedActivity?.handler as 'api' | 'carbone' | 'browser' | 'script' | undefined) || 'carbone';

    return {
      name: workflowName,
      description: workflowDescription,
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        ...DEFAULT_TEMPLATE_WORKFLOW_DSL,
        name: workflowName,
        workflowClassName: `Template${short}Workflow`,
        workflowDefnName: workflowName,
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams,
        outputParams: {
          result: {
            sourceStep: 'step_1',
            description: analysis.outputDescription?.trim() || `${documentType} 文档渲染结果`,
          },
        },
        extraPrompt: analysis.extraPrompt?.trim() || [
          `该工作流用于生成 ${documentType} 文档。`,
          `模板ID: ${template.id}`,
          template.skillId ? `模板内置 Skill ID: ${template.skillId}` : '',
          '工作流只负责编排与参数校验，真正的渲染由共享 documentRender Activity 执行。',
        ].filter(Boolean).join('\n'),
        steps: [
          {
            id: 'step_1',
            name: `渲染${documentType}`,
            type: 'activity',
            activityName: sharedActivityName,
            startToCloseTimeout: sharedActivityTimeout,
          },
        ],
      },
      activityDsl: {
        activities: [
          {
            name: sharedActivityName,
            fn: FIXED_DOCUMENT_RENDER_ACTIVITY_FN,
            timeout: sharedActivityTimeout,
            retryPolicy: { maxRetries: sharedActivityRetryPolicy.maxRetries || 2 },
            handler: sharedActivityHandler,
            config: {
              ...(sharedActivity?.config && typeof sharedActivity.config === 'object' ? sharedActivity.config : {}),
              description: activityDescription,
              templateId: template.id,
              skillId: template.skillId || null,
              fileName: template.fileName || null,
              format: template.format || 'docx',
              variableCount: variables.length,
              steps: [
                {
                  name: `渲染${documentType}`,
                  type: 'carbone',
                  timeout: sharedActivityTimeout,
                  config: {
                    templateId: template.id,
                    format: template.format || 'docx',
                    outputName,
                  },
                  inputParams: inputParamsArray,
                },
              ],
            },
          },
        ],
      },
      sourceTemplate: {
        templateId: template.id,
        skillId: template.skillId,
        fileName: template.fileName,
        format: template.format,
        variableCount: variables.length,
      },
    };
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
        generatedCode: this.getFixedActivityCode(activity)
          || activity.generatedCode
          || activityGeneratedCodeMap.get(activity.name)
          || this.buildDeterministicActivityCode(activity)
          || undefined,
      })),
    };

    const deterministicCode = this.buildDeterministicWorkflowCode(workflowDsl, enrichedActivityDsl);
    if (deterministicCode) {
      return { success: true, code: deterministicCode };
    }

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
        lines.push(`- Activity "${activity.name}" (函数名: ${activity.fn}): 已有验证过的代码，请【原样包含】在你的 Python 输出中，不要修改其逻辑；并确保 Activity 装饰器名与函数名一致，例如 @activity.defn(name="${activity.fn}") + async def ${activity.fn}(...)。`);
        lines.push('--- 已有代码开始 ---');
        lines.push(activity.generatedCode);
        lines.push('--- 已有代码结束 ---');
      } else {
        lines.push(`- Activity "${activity.name}" (函数名: ${activity.fn}): 尚未实现，请根据 DSL 生成一个标准的 @activity.defn 实现，并强制使用 @activity.defn(name="${activity.fn}") 且函数名必须是 ${activity.fn}。`);
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
    lines.push('16. 【文档下载地址】：如果 Activity 返回了 `downloadUrl`，请确保 Workflow 的最终返回结果中包含此下载地址，以便用户直接点击下载。');

    if (workflowDsl.errorHandling?.type === 'saga') {
      lines.push('17. 【Saga 模式】：必须维护 compensations 列表，在失败时逆序执行补偿任务。');
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

  private buildDeterministicActivityCode(activityDef: ActivityDsl['activities'][number]): string | null {
    if (activityDef.handler !== 'carbone') {
      return null;
    }

    const steps = Array.isArray(activityDef.config?.steps) ? activityDef.config.steps : [];
    const carboneStep = steps.find((step: Record<string, any>) => step?.type === 'carbone');
    if (!carboneStep) {
      return null;
    }

    const inputParams = this.normalizeInputParams(carboneStep.inputParams);
    const renderAssignments = inputParams.map((param) => {
      const defaultValue = param.value || '';
      return `        ${JSON.stringify(param.key)}: _value(${JSON.stringify(param.key)}, ${JSON.stringify(defaultValue)}),`;
    });

    const requiredParams = inputParams.filter((param) => param.required).map((param) => param.key);
    const internalBaseExpr = activityDef.config?.internalBaseUrl
      ? JSON.stringify(String(activityDef.config.internalBaseUrl))
      : `(os.getenv("CARBONE_SERVICE_URL") or ("http://carbone-engine:3009" if os.getenv("DOCKER_ENV") == "true" or os.getenv("NODE_ENV") == "production" else "http://localhost:3009"))`;
    const outputName = carboneStep.config?.outputName || '';
    const format = carboneStep.config?.format || 'docx';
    const templateId = carboneStep.config?.templateId || activityDef.config?.templateId || '';

    return [
      'import os',
      'import requests',
      '',
      `@activity.defn(name=${JSON.stringify(activityDef.fn)})`,
      `async def ${activityDef.fn}(input_data: Dict[str, Any]) -> Dict[str, Any]:`,
      '    if not isinstance(input_data, dict):',
      '        raise ApplicationError("input_data 必须是 dict", non_retryable=True)',
      '',
      '    def _value(key: str, default: str = "") -> str:',
      '        value = input_data.get(key, default)',
      '        if value is None:',
      '            return default',
      '        return str(value)',
      '',
      `    template_id = ${JSON.stringify(String(templateId))}`,
      `    output_format = ${JSON.stringify(String(format))}`,
      `    output_name = ${JSON.stringify(String(outputName))}`,
      '    render_data = {',
      ...renderAssignments,
      '    }',
      '',
      `    required_params = ${JSON.stringify(requiredParams)}`,
      '    missing_params = [key for key in required_params if not render_data.get(key, "").strip()]',
      '    if missing_params:',
      '        raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
      '',
      '    external_base_url = (os.getenv("CARBONE_EXTERNAL_URL") or f"http://{os.getenv(\'HOST_IP\') or os.getenv(\'EXTERNAL_HOST\') or \'localhost\'}:3009").rstrip("/")',
      '    payload = {',
      '        "templateId": template_id,',
      '        "data": render_data,',
      '        "outputFormat": output_format,',
      '    }',
      '    if output_name:',
      '        payload["outputName"] = output_name',
      '',
      '    candidate_base_urls = []',
      `    configured_base_url = ${internalBaseExpr}`,
      '    if configured_base_url:',
      '        candidate_base_urls.append(str(configured_base_url).rstrip("/"))',
      '    candidate_base_urls.extend([',
      '        "http://carbone-engine:3009",',
      '        "http://host.docker.internal:3009",',
      '        "http://localhost:3009",',
      '    ])',
      '    deduped_base_urls = []',
      '    for candidate in candidate_base_urls:',
      '        if candidate and candidate not in deduped_base_urls:',
      '            deduped_base_urls.append(candidate)',
      '',
      '    last_error = None',
      '    render_result = None',
      '    for base_url in deduped_base_urls:',
      '        render_url = base_url + "/studio/render"',
      '        activity.logger.info("开始调用 Carbone 渲染", extra={"templateId": template_id, "renderUrl": render_url})',
      '        try:',
      '            response = requests.post(render_url, json=payload, timeout=60)',
      '            response.raise_for_status()',
      '            activity.heartbeat("carbone_render_completed")',
      '            render_result = response.json()',
      '            break',
      '        except requests.RequestException as exc:',
      '            last_error = exc',
      '            activity.logger.error("Carbone 渲染失败，尝试下一个地址", extra={"error": str(exc), "renderUrl": render_url})',
      '',
      '    if render_result is None:',
      '        raise ApplicationError(f"Carbone 渲染失败: {str(last_error) if last_error else \'unknown error\'}", non_retryable=False)',
      '',
      '    download_url = render_result.get("downloadUrl")',
      '    if isinstance(download_url, str) and download_url.startswith("/"):',
      '        download_url = external_base_url + download_url',
      '    elif not isinstance(download_url, str) or not download_url.strip():',
      '        document_id = render_result.get("documentId")',
      '        if isinstance(document_id, str) and document_id.strip():',
      '            download_url = f"{external_base_url}/studio/download/{document_id}"',
      '        else:',
      '            raise ApplicationError("Carbone 返回结果缺少 downloadUrl/documentId", non_retryable=True)',
      '',
      '    return {',
      '        "status": "rendered",',
      '        "templateId": template_id,',
      '        "params_used": render_data,',
      '        "downloadUrl": download_url,',
      '        "fileName": render_result.get("fileName"),',
      '        "format": render_result.get("format", output_format),',
      '        "documentId": render_result.get("documentId"),',
      '        "raw": render_result,',
      '    }',
      '',
    ].join('\n');
  }

  private getFixedActivityCode(activityDef: ActivityDsl['activities'][number]): string | null {
    if (activityDef.fn === FIXED_DOCUMENT_RENDER_ACTIVITY_FN) {
      return FIXED_DOCUMENT_RENDER_ACTIVITY_CODE;
    }

    return null;
  }

  private buildDeterministicWorkflowCode(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): string | null {
    const activitySteps = workflowDsl.steps.filter((step) => step.type === 'activity');
    const isSimpleSingleActivityWorkflow =
      activitySteps.length === 1
      && workflowDsl.steps.length === 1
      && (!workflowDsl.conditionals || workflowDsl.conditionals.length === 0)
      && (!workflowDsl.signalHandlers || workflowDsl.signalHandlers.length === 0)
      && (!workflowDsl.queryHandlers || workflowDsl.queryHandlers.length === 0)
      && !workflowDsl.errorHandling;

    if (!isSimpleSingleActivityWorkflow) {
      return null;
    }

    const step = activitySteps[0];
    if (!step?.activityName) {
      return null;
    }

    const activityDef = activityDsl.activities.find((activity) => activity.name === step.activityName);
    if (!activityDef?.generatedCode) {
      return null;
    }

    if (activityDef.fn === FIXED_DOCUMENT_RENDER_ACTIVITY_FN) {
      return this.buildFixedDocumentRenderWorkflowCode(workflowDsl, activityDef, step);
    }

    const workflowClassName = workflowDsl.workflowClassName?.trim()
      || `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
    const workflowDisplayName = workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
    const inputParams = Object.entries(workflowDsl.inputParams || {});
    const workflowTimeoutCode = this.durationToTimedeltaCode(step.startToCloseTimeout || activityDef.timeout || '60s');

    const normalizeLines = inputParams.map(([key, config]) => {
      const defaultValue = config?.defaultValue ?? '';
      return `        ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)}, ${JSON.stringify(String(defaultValue))})),`;
    });
    const requiredParamNames = inputParams
      .filter(([, config]) => Boolean(config?.required))
      .map(([key]) => key);

    return [
      'from datetime import timedelta',
      'from temporalio import workflow',
      '',
      (activityDef.generatedCode || '').trim(),
      '',
      `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
      `class ${workflowClassName}:`,
      `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
      '',
      '    @staticmethod',
      '    def _normalize(value: Any) -> str:',
      '        if value is None:',
      '            return ""',
      '        return str(value)',
      '',
      '    @classmethod',
      '    def _build_activity_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
      '        return {',
      ...normalizeLines,
      '        }',
      '',
      '    @staticmethod',
      '    def _validate_required_params(activity_input: Dict[str, Any]) -> None:',
      `        required_params = ${JSON.stringify(requiredParamNames)}`,
      '        missing_params = [key for key in required_params if not activity_input.get(key, "").strip()]',
      '        if missing_params:',
      '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
      '',
      '    async def run(self, params: dict) -> Dict[str, Any]:',
      `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
      '        activity_input = self._build_activity_input(params or {})',
      '        self._validate_required_params(activity_input)',
      `        workflow.logger.info(${JSON.stringify(`执行 Activity: ${activityDef.name}`)})`,
      '        result = await workflow.execute_activity(',
      `            ${activityDef.fn},`,
      '            activity_input,',
      '            start_to_close_timeout=self.ACTIVITY_START_TO_CLOSE_TIMEOUT,',
      '        )',
      '        return result',
      '',
    ].join('\n');
  }

  private buildFixedDocumentRenderWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDef: ActivityDsl['activities'][number],
    step: WorkflowStep,
  ): string | null {
    const workflowClassName = workflowDsl.workflowClassName?.trim()
      || `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
    const workflowDisplayName = workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
    const inputParams = Object.entries(workflowDsl.inputParams || {});
    const workflowTimeoutCode = this.durationToTimedeltaCode(step.startToCloseTimeout || activityDef.timeout || '60s');
    const carboneStep = Array.isArray(activityDef.config?.steps)
      ? activityDef.config.steps.find((item: Record<string, any>) => item?.type === 'carbone')
      : null;

    if (!carboneStep) {
      return null;
    }

    const templateId = String(carboneStep.config?.templateId || activityDef.config?.templateId || '');
    const outputFormat = String(carboneStep.config?.format || 'docx');
    const outputName = String(carboneStep.config?.outputName || '');
    const normalizeLines = inputParams.map(([key, config]) => {
      const defaultValue = config?.defaultValue ?? '';
      return `            ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)}, ${JSON.stringify(String(defaultValue))})),`;
    });
    const requiredParamNames = inputParams
      .filter(([, config]) => Boolean(config?.required))
      .map(([key]) => key);

    return [
      'from datetime import timedelta',
      'from typing import Any, Dict',
      '',
      'from temporalio import activity, workflow',
      'from temporalio.exceptions import ApplicationError',
      '',
      (activityDef.generatedCode || '').trim(),
      '',
      `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
      `class ${workflowClassName}:`,
      `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
      '',
      '    @staticmethod',
      '    def _normalize(value: Any) -> str:',
      '        if value is None:',
      '            return ""',
      '        return str(value)',
      '',
      '    @classmethod',
      '    def _build_render_data(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
      '        return {',
      ...normalizeLines,
      '        }',
      '',
      '    @staticmethod',
      '    def _validate_required_params(render_data: Dict[str, Any]) -> None:',
      `        required_params = ${JSON.stringify(requiredParamNames)}`,
      '        missing_params = [key for key in required_params if not render_data.get(key, "").strip()]',
      '        if missing_params:',
      '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
      '',
      '    async def run(self, params: dict) -> Dict[str, Any]:',
      `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
      '        render_data = self._build_render_data(params or {})',
      '        self._validate_required_params(render_data)',
      '        activity_input = {',
      `            "templateId": ${JSON.stringify(templateId)},`,
      '            "data": render_data,',
      `            "outputFormat": ${JSON.stringify(outputFormat)},`,
      ...(outputName ? [`            "outputName": ${JSON.stringify(outputName)},`] : []),
      '        }',
      `        workflow.logger.info(${JSON.stringify(`执行共享文档渲染 Activity: ${activityDef.name}`)})`,
      '        result = await workflow.execute_activity(',
      `            ${activityDef.fn},`,
      '            activity_input,',
      '            start_to_close_timeout=self.ACTIVITY_START_TO_CLOSE_TIMEOUT,',
      '        )',
      '        return result',
      '',
    ].join('\n');
  }

  private normalizeInputParams(
    inputParams: Array<{ key?: string; value?: string; required?: boolean }> | Record<string, string> | undefined,
  ): Array<{ key: string; value: string; required: boolean }> {
    if (!inputParams) {
      return [];
    }
    if (Array.isArray(inputParams)) {
      return inputParams
        .filter((item) => item && typeof item.key === 'string' && item.key.trim())
        .map((item) => ({
          key: String(item.key),
          value: typeof item.value === 'string' ? item.value : '',
          required: Boolean(item.required),
        }));
    }
    return Object.entries(inputParams).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : '',
      required: !value,
    }));
  }

  private durationToTimedeltaCode(duration: string): string {
    const normalized = String(duration || '60s').trim();
    const match = normalized.match(/^(\d+)\s*([smhd])$/i);
    if (!match) {
      return 'timedelta(seconds=60)';
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 'm':
        return `timedelta(minutes=${value})`;
      case 'h':
        return `timedelta(hours=${value})`;
      case 'd':
        return `timedelta(days=${value})`;
      case 's':
      default:
        return `timedelta(seconds=${value})`;
    }
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

  private async analyzeTemplateWorkflow(
    template: CarboneTemplateMeta,
    skill: CarboneSkillMeta | null,
  ): Promise<TemplateWorkflowAiAnalysis> {
    const fallback: TemplateWorkflowAiAnalysis = {};
    try {
      const aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ops-ai-orchestrator:3007';
      const previewHtml = await this.fetchTemplatePreviewHtml(template.id).catch(() => '');
      const prompt = [
        '你是一个企业文档自动化专家，需要根据 Carbone 文档模板信息生成一个“模板工作流草稿”。',
        '目标是生成一个共享 documentRender Activity 可复用的 Temporal Workflow 草稿。',
        '请根据模板名称、变量、HTML 预览和模板 Skill 信息，推断该文档的业务类型、输入参数说明、输出说明和工作流描述。',
        '',
        '输出要求：',
        '1. 只返回一个 JSON 对象，不要输出 Markdown 或解释。',
        '2. JSON 字段只允许包含：documentType, workflowName, workflowDescription, activityDescription, outputName, outputDescription, inputParamDescriptions, extraPrompt。',
        '3. inputParamDescriptions 必须是对象，key 为模板变量路径，value 为中文描述。',
        '4. workflowName 若无法确定，可以输出空字符串。',
        '5. 不要虚构不存在的模板变量。',
        '',
        `模板ID: ${template.id}`,
        `模板文件名: ${template.fileName}`,
        `模板格式: ${template.format || 'docx'}`,
        `模板变量: ${JSON.stringify(this.uniqueVariables(template.variables || []).map((item) => this.variableToKey(item)), null, 2)}`,
        `模板 loops: ${JSON.stringify(template.loops || [], null, 2)}`,
        `模板内置 skillId: ${template.skillId || ''}`,
        `模板 Skill 元数据: ${JSON.stringify(skill || {}, null, 2)}`,
        `模板 HTML 预览（可能被截断）: ${previewHtml.slice(0, 12000)}`,
      ].join('\n');

      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'default',
        prompt,
      }, { timeout: 180000 });

      return this.parseJsonFromAiContent(response.data?.result || '') as TemplateWorkflowAiAnalysis;
    } catch (error: any) {
      this.logger.warn(`Template workflow analysis fallback for ${template.id}: ${error.message}`);
      return fallback;
    }
  }

  private async fetchCarboneTemplate(templateId: string): Promise<CarboneTemplateMeta> {
    const carboneBaseUrl = this.getCarboneBaseUrl();
    const response = await axios.get<CarboneTemplateMeta>(`${carboneBaseUrl}/studio/templates/${templateId}`, {
      timeout: 30000,
    });
    return response.data;
  }

  private async fetchCarboneSkill(skillId: string): Promise<CarboneSkillMeta> {
    const carboneBaseUrl = this.getCarboneBaseUrl();
    const response = await axios.get<CarboneSkillMeta>(`${carboneBaseUrl}/studio/skill/${skillId}`, {
      timeout: 30000,
    });
    return response.data;
  }

  private async fetchTemplatePreviewHtml(templateId: string): Promise<string> {
    const carboneBaseUrl = this.getCarboneBaseUrl();
    const response = await axios.get<{ html: string }>(`${carboneBaseUrl}/studio/templates/${templateId}/preview-html`, {
      timeout: 60000,
    });
    return response.data?.html || '';
  }

  private getCarboneBaseUrl(): string {
    if (process.env.CARBONE_SERVICE_URL) {
      return String(process.env.CARBONE_SERVICE_URL).replace(/\/$/, '');
    }
    if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
      return 'http://carbone-engine:3009';
    }
    return 'http://localhost:3009';
  }

  private parseJsonFromAiContent(content: string): Record<string, any> {
    const sanitized = (content || '').replace(/```json|```/g, '').trim();

    try {
      return JSON.parse(sanitized);
    } catch {
      const start = sanitized.indexOf('{');
      const end = sanitized.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(sanitized.slice(start, end + 1));
      }
      throw new Error('AI 返回内容不是有效 JSON');
    }
  }

  private parseJson<T = unknown>(value: unknown): T {
    if (value === null || value === undefined) {
      return value as T;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    }
    return value as T;
  }

  private uniqueVariables(variables: string[]): string[] {
    return [...new Set((variables || []).filter((item) => typeof item === 'string' && item.trim()))];
  }

  private toWorkflowDto(workflow: TemporalWorkflow): TemporalWorkflowDTO {
    const workflowDsl = this.parseJson<WorkflowDsl>(workflow.workflowDsl) || DEFAULT_TEMPLATE_WORKFLOW_DSL;
    const activityDsl = this.parseJson<ActivityDsl>(workflow.activityDsl) || { activities: [] };
    return {
      ...workflow,
      workflowDsl: workflowDsl as any,
      activityDsl: activityDsl as any,
      sourceTemplate: this.extractSourceTemplate(workflowDsl, activityDsl),
    };
  }

  private extractSourceTemplate(
    workflowDsl: WorkflowDsl | Record<string, unknown> | null | undefined,
    activityDsl: ActivityDsl | Record<string, unknown> | null | undefined,
  ): TemporalWorkflowSourceTemplate | null {
    const workflowRecord = workflowDsl && typeof workflowDsl === 'object'
      ? workflowDsl as Record<string, unknown>
      : {};
    const workflowLevelSource = this.parseJson<Record<string, unknown>>(workflowRecord.sourceTemplate);

    const activities = Array.isArray((activityDsl as ActivityDsl | undefined)?.activities)
      ? (activityDsl as ActivityDsl).activities
      : [];
    const carboneActivity = activities.find((activity) => {
      if (activity?.handler === 'carbone') {
        return true;
      }
      const steps = Array.isArray(activity?.config?.steps) ? activity.config.steps : [];
      return steps.some((step: Record<string, any>) => step?.type === 'carbone');
    });
    const carboneStep = Array.isArray(carboneActivity?.config?.steps)
      ? carboneActivity?.config?.steps.find((step: Record<string, any>) => step?.type === 'carbone')
      : null;

    const sourceTemplate: TemporalWorkflowSourceTemplate = {
      templateId: this.pickFirstNonEmptyString(
        workflowLevelSource?.templateId,
        carboneStep?.config?.templateId,
        carboneActivity?.config?.templateId,
      ),
      skillId: this.pickFirstNonEmptyString(
        workflowLevelSource?.skillId,
        carboneActivity?.config?.skillId,
      ),
      fileName: this.pickFirstNonEmptyString(
        workflowLevelSource?.fileName,
        carboneActivity?.config?.fileName,
      ),
      format: this.pickFirstNonEmptyString(
        workflowLevelSource?.format,
        carboneStep?.config?.format,
        carboneActivity?.config?.format,
      ),
      variableCount: this.pickFirstPositiveNumber(
        workflowLevelSource?.variableCount,
        carboneActivity?.config?.variableCount,
        Object.keys(this.parseJson<Record<string, unknown>>(workflowRecord.inputParams) || {}).length,
      ),
    };

    if (!sourceTemplate.templateId && !sourceTemplate.skillId && !sourceTemplate.fileName) {
      return null;
    }

    return sourceTemplate;
  }

  private normalizeWorkflowDsl(
    workflowDsl: WorkflowDsl,
    workflowName?: string,
    taskQueue?: string,
  ): WorkflowDsl {
    const normalized = this.sanitizeJsonValue(workflowDsl) as WorkflowDsl;
    return {
      ...normalized,
      name: this.normalizeName(workflowName || normalized.name || '未命名工作流'),
      taskQueue: this.normalizeTaskQueue(taskQueue || normalized.taskQueue),
    };
  }

  private normalizeActivityDsl(activityDsl: ActivityDsl): ActivityDsl {
    return this.sanitizeJsonValue(activityDsl) as ActivityDsl;
  }

  private sanitizeJsonValue<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.sanitizeJsonValue(item))
        .filter((item) => item !== undefined) as T;
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
        if (item === undefined) {
          return acc;
        }
        acc[key] = this.sanitizeJsonValue(item);
        return acc;
      }, {}) as T;
    }
    return value;
  }

  private normalizeName(value?: string): string {
    const normalized = String(value || '').trim();
    return normalized.slice(0, 255) || '未命名工作流';
  }

  private normalizeDescription(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = String(value).trim();
    if (!normalized) {
      return null;
    }
    return normalized.slice(0, 500);
  }

  private normalizeTaskQueue(value?: string): string {
    const normalized = String(value || '').trim();
    return normalized.slice(0, 255) || 'SKILL_TASK_QUEUE';
  }

  private pickFirstNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickFirstPositiveNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return undefined;
  }

  private variableToKey(variable: string): string {
    return String(variable || '').replace(/^\{d\./, '').replace(/\}$/, '');
  }

  private slugFromTemplate(templateId: string): string {
    return String(templateId || '').replace(/-/g, '').slice(0, 8);
  }

  private stripTemplateExtension(fileName: string): string {
    return String(fileName || '').replace(/\.[^.]+$/, '');
  }
}

const DEFAULT_TEMPLATE_WORKFLOW_DSL: Partial<WorkflowDsl> = {
  taskQueue: 'SKILL_TASK_QUEUE',
  conditionals: [],
};
