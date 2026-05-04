import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatMessage, ChatSession, TemporalWorkflow } from '@prisma/client';
import axios from 'axios';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY,
  BuiltinActivityDefinition,
  BuiltinActivityRegistry,
  DOCUMENT_RENDER_ACTIVITY_KEY,
  HTTP_REQUEST_ACTIVITY_KEY,
  HTTP_REQUEST_STEP_CONFIG_KEY,
  STRUCTURED_TRANSFORM_ACTIVITY_KEY,
  STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
} from './builtin-activity.registry';
import {
  TemporalWorkflowAiDraftService,
} from './temporal-workflow-ai-draft.service';
import type {
  AiDraftActivityResource,
  AiWorkflowDraftPlan,
  TemporalWorkflowAiDraftSupport,
} from './temporal-workflow-ai-draft.service';

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
  activityRef?: string;
  activityName?: string;
  input?: Record<string, any>;
  startToCloseTimeout?: string;
  scheduleToCloseTimeout?: string;
  heartbeatTimeout?: string;
  retryPolicy?: { maxRetries?: number; backoffMs?: number };
  parallelSteps?: string[];
}

export type WorkflowInputParamSource =
  | 'declared'
  | 'inferred_from_template'
  | 'inferred_from_reference_url'
  | 'merged';

export type WorkflowInputParamType = 'string' | 'number' | 'boolean' | 'date';

export interface WorkflowInputParamDefinition {
  description?: string;
  required?: boolean;
  defaultValue?: string;
  source?: WorkflowInputParamSource;
  type?: WorkflowInputParamType;
  exampleValue?: string | number | boolean;
}

export interface WorkflowDsl {
  name: string;
  workflowClassName?: string;
  workflowDefnName?: string;
  taskQueue: string;
  steps: WorkflowStep[];
  sourceContext?: TemporalWorkflowSourceContext;
  inputParams?: Record<string, WorkflowInputParamDefinition>;
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
    retryPolicy?: { maxRetries?: number; backoffMs?: number };
    handler: 'api' | 'carbone' | 'browser' | 'script';
    config: Record<string, any>;
    generatedCode?: string; // 新增：已生成的 Activity 代码
  }>;
}

type ActivityDefinition = ActivityDsl['activities'][number];

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

export interface TemporalWorkflowSourceContext {
  sourceType?: 'template' | 'ai' | 'text' | 'url';
  referenceUrl?: string;
  userDescription?: string;
  generatedAt?: string;
  warnings?: string[];
  sourceTemplate?: TemporalWorkflowSourceTemplate | null;
}

export interface TemporalWorkflowDTO extends TemporalWorkflow {
  sourceTemplate?: TemporalWorkflowSourceTemplate | null;
  sourceContext?: TemporalWorkflowSourceContext | null;
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

export interface GenerateAiWorkflowDraftDTO {
  description?: string;
  referenceUrl?: string;
}

export interface GenerateAiWorkflowDraftSessionDTO extends GenerateAiWorkflowDraftDTO {
  title?: string;
}

export interface RefineAiWorkflowDraftDTO {
  currentWorkflowDsl: WorkflowDsl;
  currentActivityDsl: ActivityDsl;
  userPrompt: string;
}

export interface RefineAiWorkflowDraftSessionDTO {
  sessionId: string;
  userPrompt: string;
}

export interface AiWorkflowDraft {
  name: string;
  description: string;
  taskQueue: string;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  warnings: string[];
  sourceContext?: TemporalWorkflowSourceContext;
}

export interface AiWorkflowDraftSessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  draft?: AiWorkflowDraft;
}

export interface AiWorkflowDraftSession {
  sessionId: string;
  title?: string;
  status: string;
  messages: AiWorkflowDraftSessionMessage[];
  currentDraft?: AiWorkflowDraft | null;
}

export interface AiWorkflowDraftSessionListItem {
  sessionId: string;
  title?: string;
  status: string;
  updatedAt: string;
  messageCount: number;
  currentDraftName?: string;
  currentDraftDescription?: string;
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

  constructor(
    private prisma: PrismaService,
    private readonly builtinActivityRegistry: BuiltinActivityRegistry,
    private readonly aiDraftService: TemporalWorkflowAiDraftService,
  ) {}

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
      const normalizedActivityDsl = this.normalizeActivityDsl(data.activityDsl);
      const normalizedWorkflowDsl = await this.normalizeWorkflowDsl(
        data.workflowDsl,
        data.name,
        data.taskQueue,
        normalizedActivityDsl,
      );
      const created = await this.prisma.temporalWorkflow.create({
        data: {
          name: this.normalizeName(data.name),
          description: this.normalizeDescription(data.description),
          taskQueue: this.normalizeTaskQueue(data.taskQueue || data.workflowDsl?.taskQueue),
          workflowDsl: normalizedWorkflowDsl as any,
          activityDsl: normalizedActivityDsl as any,
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
      const normalizedActivityDsl = data.activityDsl
        ? this.normalizeActivityDsl(data.activityDsl)
        : this.parseJson<ActivityDsl>(existing.activityDsl) || { activities: [] };
      const normalizedWorkflowDsl = data.workflowDsl
        ? await this.normalizeWorkflowDsl(data.workflowDsl, nextName, nextTaskQueue, normalizedActivityDsl)
        : undefined;
      const updated = await this.prisma.temporalWorkflow.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: this.normalizeName(data.name) }),
          ...(data.description !== undefined && { description: this.normalizeDescription(data.description) }),
          ...(data.taskQueue !== undefined && { taskQueue: this.normalizeTaskQueue(nextTaskQueue) }),
          ...(normalizedWorkflowDsl && { workflowDsl: normalizedWorkflowDsl as any }),
          ...(data.activityDsl && { activityDsl: normalizedActivityDsl as any }),
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

    const builtinDocumentRender = this.getBuiltinDocumentRenderActivity();
    const sharedActivityName = builtinDocumentRender.name;
    const sharedActivityTimeout = builtinDocumentRender.timeout;
    const sharedActivityRetryPolicy = builtinDocumentRender.retryPolicy || {
      maxRetries: 2,
      backoffMs: 1000,
    };
    const sharedActivityHandler = builtinDocumentRender.handler;

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
        sourceContext: {
          sourceType: 'template',
          generatedAt: new Date().toISOString(),
          sourceTemplate: {
            templateId: template.id,
            skillId: template.skillId,
            fileName: template.fileName,
            format: template.format,
            variableCount: variables.length,
          },
        },
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
            activityRef: builtinDocumentRender.ref,
            activityName: sharedActivityName,
            startToCloseTimeout: sharedActivityTimeout,
          },
        ],
      },
      activityDsl: {
        activities: [
          {
            name: sharedActivityName,
            fn: builtinDocumentRender.fn,
            timeout: sharedActivityTimeout,
            retryPolicy: { maxRetries: sharedActivityRetryPolicy.maxRetries || 2 },
            handler: sharedActivityHandler,
            config: {
              ...(builtinDocumentRender.config || {}),
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
            generatedCode: builtinDocumentRender.generatedCode,
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

  async generateAiWorkflowDraft(data: GenerateAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.aiDraftService.generateWorkflowDraft(data, this.createAiDraftSupport());
  }

  async refineAiWorkflowDraft(data: RefineAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.aiDraftService.refineWorkflowDraft(data, this.createAiDraftSupport());
  }

  async createAiDraftSession(
    data: GenerateAiWorkflowDraftSessionDTO,
    userId?: string,
  ): Promise<AiWorkflowDraftSession> {
    const effectiveUserId = userId || await this.resolveFallbackUserId();
    const draft = await this.generateAiWorkflowDraft(data);
    const userPrompt = [
      String(data?.description || '').trim(),
      data?.referenceUrl ? `参考 URL: ${String(data.referenceUrl).trim()}` : '',
    ].filter(Boolean).join('\n');

    const session = await this.prisma.chatSession.create({
      data: {
        userId: effectiveUserId,
        title: String(data?.title || draft.name || 'Workflow Draft Session').trim().slice(0, 255) || 'Workflow Draft Session',
        modelId: 'temporal-workflow-draft',
        status: 'active',
        messages: {
          create: [
            {
              role: 'user',
              content: userPrompt || '创建工作流草稿',
              metadata: this.sanitizeJsonValue({
                kind: 'temporal_workflow_draft_prompt',
                description: String(data?.description || '').trim() || undefined,
                referenceUrl: String(data?.referenceUrl || '').trim() || undefined,
              }) as any,
            },
            {
              role: 'assistant',
              content: '已生成初始工作流草稿',
              metadata: this.sanitizeJsonValue({
                kind: 'temporal_workflow_draft_result',
                draft,
              }) as any,
            },
          ],
        },
      },
    });

    return this.getAiDraftSession(session.id, effectiveUserId);
  }

  async refineAiDraftSession(
    data: RefineAiWorkflowDraftSessionDTO,
    userId?: string,
  ): Promise<AiWorkflowDraftSession> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: data.sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw new NotFoundException(`草稿会话不存在: ${data.sessionId}`);
    }
    if (userId && session.userId !== userId) {
      throw new NotFoundException(`草稿会话不存在: ${data.sessionId}`);
    }

    const lastDraft = this.extractLatestDraftFromMessages(session.messages);
    if (!lastDraft) {
      throw new BadRequestException('当前会话没有可继续改进的草稿');
    }

    const refinedDraft = await this.refineAiWorkflowDraft({
      currentWorkflowDsl: lastDraft.workflowDsl,
      currentActivityDsl: lastDraft.activityDsl,
      userPrompt: data.userPrompt,
    });

    const updated = await this.prisma.chatSession.update({
      where: { id: session.id },
      data: {
        updatedAt: new Date(),
        messages: {
          create: [
            {
              role: 'user',
              content: String(data.userPrompt || '').trim(),
              metadata: this.sanitizeJsonValue({
                kind: 'temporal_workflow_draft_refine_prompt',
              }) as any,
            },
            {
              role: 'assistant',
              content: '已更新工作流草稿',
              metadata: this.sanitizeJsonValue({
                kind: 'temporal_workflow_draft_result',
                draft: refinedDraft,
              }) as any,
            },
          ],
        },
      },
    });

    return this.getAiDraftSession(updated.id, userId || session.userId);
  }

  async getAiDraftSession(sessionId: string, userId?: string): Promise<AiWorkflowDraftSession> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw new NotFoundException(`草稿会话不存在: ${sessionId}`);
    }
    if (userId && session.userId !== userId) {
      throw new NotFoundException(`草稿会话不存在: ${sessionId}`);
    }
    return this.mapChatSessionToAiDraftSession(session);
  }

  async listAiDraftSessions(userId?: string): Promise<AiWorkflowDraftSessionListItem[]> {
    const effectiveUserId = userId || await this.resolveFallbackUserId();
    const sessions = await this.prisma.chatSession.findMany({
      where: {
        userId: effectiveUserId,
        modelId: 'temporal-workflow-draft',
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return sessions.map((session) => {
      const currentDraft = this.extractLatestDraftFromMessages(session.messages);
      return {
        sessionId: session.id,
        title: session.title || undefined,
        status: session.status,
        updatedAt: session.updatedAt.toISOString(),
        messageCount: session.messages.length,
        currentDraftName: currentDraft?.workflowDsl?.name || currentDraft?.name || undefined,
        currentDraftDescription: currentDraft?.description || undefined,
      };
    });
  }

  async deleteAiDraftSession(sessionId: string, userId?: string): Promise<{ success: boolean }> {
    const effectiveUserId = userId || await this.resolveFallbackUserId();
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        modelId: true,
      },
    });
    if (!session || session.modelId !== 'temporal-workflow-draft' || session.userId !== effectiveUserId) {
      throw new NotFoundException(`草稿会话不存在: ${sessionId}`);
    }

    await this.prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return { success: true };
  }

  private createAiDraftSupport(): TemporalWorkflowAiDraftSupport {
    return {
      fetchReferenceUrlExcerpt: (referenceUrl) => this.fetchReferenceUrlExcerpt(referenceUrl),
      sanitizeJsonValue: <T>(value: T) => this.sanitizeJsonValue(value),
      parseJsonFromAiContent: (content) => this.parseJsonFromAiContent(content),
      pickFirstNonEmptyString: (...values) => this.pickFirstNonEmptyString(...values),
      normalizeHttpRequestConfig: (config, declaredInputKeys) => this.normalizeHttpRequestConfig(config, declaredInputKeys),
      optimizeHttpRequestConfig: (stepConfig, inputParams, userRequest) => (
        this.optimizeHttpRequestConfig(stepConfig, inputParams, userRequest)
      ),
      previewHttpRequestConfig: (stepConfig, inputParams) => this.previewHttpRequestConfig(stepConfig, inputParams),
      generateStructuredTransformConfig: (sourceSample, userRequest, existingConfig) => (
        this.generateStructuredTransformConfig(sourceSample, userRequest, existingConfig)
      ),
      generateAiStructuredTransformDraftConfig: (sourceSample, userRequest, existingConfig) => (
        this.generateAiStructuredTransformDraftConfig(sourceSample, userRequest, existingConfig)
      ),
      normalizeStructuredTransformConfig: (config, placeholderKeys) => (
        this.normalizeStructuredTransformConfig(config, placeholderKeys)
      ),
      collectTemplateVariables: (value, target) => this.collectTemplateVariables(value, target),
      extractValueByPath: (value, path) => this.extractValueByPath(value, path),
      renderHttpTemplateValue: (value, params) => this.renderHttpTemplateValue(value, params),
      buildPlaceholderValueFromSchemaHint: (schemaHint, fieldName) => (
        this.buildPlaceholderValueFromSchemaHint(schemaHint, fieldName)
      ),
      normalizeName: (value) => this.normalizeName(value),
      normalizeDescription: (value) => this.normalizeDescription(value),
      normalizeTaskQueue: (value) => this.normalizeTaskQueue(value),
      normalizeWorkflowClassName: (candidate, workflowName) => this.normalizeWorkflowClassName(candidate, workflowName),
      normalizeWorkflowDsl: (workflowDsl, workflowName, taskQueue, activityDsl) => (
        this.normalizeWorkflowDsl(workflowDsl, workflowName, taskQueue, activityDsl)
      ),
      normalizeDraftInputParams: (inputParams, steps, referenceUrl) => (
        this.normalizeDraftInputParams(inputParams, steps, referenceUrl)
      ),
      normalizeDraftOutputParams: (outputParams) => this.normalizeDraftOutputParams(outputParams),
      normalizeAiDraftStepInput: (rawInput, activityRef, stepName, workflowIntentText, previousActivityRef) => (
        this.normalizeAiDraftStepInput(rawInput, activityRef, stepName, workflowIntentText, previousActivityRef)
      ),
    };
  }

  private validateAiDraftPlan(
    plan: AiWorkflowDraftPlan,
    activityResources: AiDraftActivityResource[],
  ): string[] {
    return this.aiDraftService.validatePlan(plan, activityResources);
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

    for (let i = 0; i < workflowDsl.steps.length; i++) {
      const step = workflowDsl.steps[i];

      if (!step.name) {
        errors.push(`Step ${i + 1} must have a name`);
      }

      if (step.type === 'activity' && !step.activityRef && !step.activityName) {
        errors.push(`Step "${step.name}" must specify an activity reference`);
      } else if (step.type === 'activity') {
        const resolvedActivity = await this.resolveActivityDefinition(step, activityDsl);
        if (!resolvedActivity) {
          const activityIdentifier = step.activityRef || step.activityName || '<unknown>';
          errors.push(`Step "${step.name}" references activity "${activityIdentifier}" which cannot be resolved`);
        }
      }
    }

    const builtinActivityResources = this.builtinActivityRegistry.list().map((item) => ({
      ref: item.ref,
      name: item.name,
      fn: item.fn,
      timeout: item.timeout,
      retryPolicy: item.retryPolicy,
      handler: item.handler,
      config: item.config || {},
      generatedCode: item.generatedCode,
      description: item.description,
    }));
    errors.push(...this.validateAiDraftPlan({ steps: workflowDsl.steps as any }, builtinActivityResources));

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

  async generateWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext?: string,
    forceAiGeneration = false,
    onProgress?: (log: string) => void,
  ): Promise<{ success: boolean; code?: string; error?: string; attempts?: number; autoRetried?: boolean; generationMode?: 'deterministic' | 'ai' }> {
    const pushLog = (message: string) => {
      if (typeof onProgress === 'function') {
        onProgress(`[${new Date().toISOString()}] ${message}`);
      }
    };
    pushLog(`开始生成 Workflow 代码: ${workflowDsl.name || workflowDsl.workflowClassName || '未命名工作流'}`);
    const enrichedActivities: ActivityDefinition[] = [];
    const seenActivityKeys = new Set<string>();

    const pushActivity = (activity: ActivityDefinition | null) => {
      if (!activity) {
        return;
      }
      const activityKey = `${activity.fn}::${activity.name}`;
      if (seenActivityKeys.has(activityKey)) {
        return;
      }
      seenActivityKeys.add(activityKey);
      enrichedActivities.push(activity);
    };

    for (const activity of activityDsl.activities) {
      pushActivity(await this.enrichActivityDefinition(activity));
    }

    for (const step of workflowDsl.steps.filter((item) => item.type === 'activity')) {
      pushActivity(await this.resolveActivityDefinition(step, activityDsl));
    }

    pushLog(`已解析 ${workflowDsl.steps.length} 个步骤，收集到 ${enrichedActivities.length} 个 Activity 定义`);
    const enrichedActivityDsl: ActivityDsl = {
      activities: enrichedActivities,
    };

    const shouldPreferAiFix = forceAiGeneration || Boolean(errorContext?.trim());
    if (forceAiGeneration) {
      pushLog('已启用“强制 AI 生成”，跳过固定模板编译路径');
    }
    const deterministicCode = shouldPreferAiFix
      ? null
      : this.buildDeterministicWorkflowCode(workflowDsl, enrichedActivityDsl);
    if (deterministicCode) {
      pushLog('命中固定模板编译路径，跳过 AI 生成');
      return {
        success: true,
        code: deterministicCode,
        attempts: 0,
        autoRetried: false,
        generationMode: 'deterministic',
      };
    }

    try {
      pushLog('未命中固定模板编译路径，进入 AI 生成');
      const aiGeneration = await this.generateWorkflowCodeViaAi(workflowDsl, enrichedActivityDsl, errorContext, pushLog);
      if (!aiGeneration.success) {
        pushLog(`AI 生成失败: ${aiGeneration.error || 'unknown error'}`);
        return {
          success: false,
          error: aiGeneration.error,
          attempts: aiGeneration.attempts,
          autoRetried: aiGeneration.autoRetried,
          generationMode: 'ai',
        };
      }
      pushLog(`AI 生成完成，共尝试 ${aiGeneration.attempts} 次`);
      return {
        success: true,
        code: aiGeneration.code,
        attempts: aiGeneration.attempts,
        autoRetried: aiGeneration.autoRetried,
        generationMode: 'ai',
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate workflow code: ${error.message}`);
      pushLog(`生成异常: ${error.message}`);
      return { success: false, error: `生成失败: ${error.message}`, generationMode: 'ai' };
    }
  }

  async generateWorkflowCodeStreaming(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext: string | undefined,
    forceAiGeneration: boolean | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; code?: string; error?: string; attempts?: number; autoRetried?: boolean; generationMode?: 'deterministic' | 'ai' }> {
    onLog(`[${new Date().toISOString()}] 准备生成 Workflow 代码流`);
    return this.generateWorkflowCode(workflowDsl, activityDsl, errorContext, Boolean(forceAiGeneration), onLog);
  }

  async optimizeHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams: Record<string, any> = {},
    userRequest?: string,
  ): Promise<{
    success: boolean;
    optimizedConfig?: Record<string, any>;
    previewResponse?: Record<string, any>;
    explanation?: string;
    error?: string;
  }> {
    const userGoal = String(userRequest || '').trim();
    if (!userGoal) {
      return { success: false, error: '请先输入希望 AI 优化的目标描述' };
    }

    try {
      const previewResult = await this.previewHttpRequestConfig(stepConfig, inputParams);
      if (!previewResult.success || !previewResult.previewResponse || !previewResult.resolvedRequest || !previewResult.baseConfig) {
        return {
          success: false,
          error: previewResult.error || '预览当前 HTTP 配置失败',
        };
      }
      const baseConfig = previewResult.baseConfig;
      const resolvedRequest = previewResult.resolvedRequest;
      const previewResponse = previewResult.previewResponse;
      const aiResult = await this.requestAiOptimizedHttpConfig(baseConfig, resolvedRequest, previewResponse, userGoal);
      const optimizedConfig = this.mergeHttpConfigWithAiResult(baseConfig, aiResult);

      return {
        success: true,
        optimizedConfig,
        previewResponse,
        explanation: typeof aiResult?.reason === 'string' ? aiResult.reason : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Optimize httpRequest config failed: ${error.message}`);
      return {
        success: false,
        error: error.message || 'AI 优化失败',
      };
    }
  }

  async previewHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams: Record<string, any> = {},
  ): Promise<{
    success: boolean;
    baseConfig?: Record<string, any>;
    resolvedRequest?: Record<string, any>;
    previewResponse?: Record<string, any>;
    error?: string;
  }> {
    try {
      const baseConfig = this.normalizeHttpRequestConfig(stepConfig);
      this.assertHttpRequestPreviewInputs(baseConfig, inputParams);
      const resolvedRequest = this.buildHttpRequestPreviewInput(baseConfig, inputParams);
      const previewResponse = await this.executeHttpPreviewRequest(resolvedRequest);
      return {
        success: true,
        baseConfig,
        resolvedRequest,
        previewResponse,
      };
    } catch (error: any) {
      this.logger.error(`Preview httpRequest config failed: ${error.message}`);
      return {
        success: false,
        error: error.message || '预览当前 HTTP 配置失败',
      };
    }
  }

  private getBuiltinDocumentRenderActivity(): BuiltinActivityDefinition {
    const builtin = this.builtinActivityRegistry.getByKey(DOCUMENT_RENDER_ACTIVITY_KEY);
    if (!builtin) {
      throw new Error(`Missing builtin activity: ${DOCUMENT_RENDER_ACTIVITY_KEY}`);
    }
    return builtin;
  }

  private extractActivityNameFromRef(activityRef?: string): string | undefined {
    const builtin = activityRef ? this.builtinActivityRegistry.getByRef(activityRef) : null;
    return builtin?.name;
  }

  private mapBuiltinToActivityDefinition(
    builtin: BuiltinActivityDefinition,
    overrides?: Partial<ActivityDefinition>,
  ): ActivityDefinition {
    return {
      name: overrides?.name || builtin.name,
      fn: builtin.fn,
      timeout: overrides?.timeout || builtin.timeout,
      retryPolicy: overrides?.retryPolicy || (builtin.retryPolicy ? { ...builtin.retryPolicy } : undefined),
      handler: builtin.handler,
      config: {
        ...(builtin.config || {}),
        ...(overrides?.config || {}),
      },
      generatedCode: builtin.generatedCode,
    };
  }

  private mapDbActivityToDefinition(activity: {
    name: string;
    fn: string;
    timeout: string;
    retryPolicy?: unknown;
    handler: 'api' | 'carbone' | 'browser' | 'script' | string;
    config: unknown;
    generatedCode?: string | null;
  }): ActivityDefinition {
    return {
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout || '60s',
      retryPolicy: activity.retryPolicy as { maxRetries: number; backoffMs?: number } | undefined,
      handler: activity.handler as 'api' | 'carbone' | 'browser' | 'script',
      config: activity.config && typeof activity.config === 'object' ? activity.config as Record<string, any> : {},
      generatedCode: activity.generatedCode || undefined,
    };
  }

  private findMatchingActivityInDsl(step: WorkflowStep, activityDsl: ActivityDsl): ActivityDefinition | null {
    const builtinFromRef = step.activityRef ? this.builtinActivityRegistry.getByRef(step.activityRef) : null;
    const candidates = activityDsl.activities || [];
    if (step.activityName) {
      const byName = candidates.find((activity) => activity.name === step.activityName);
      if (byName) {
        return byName;
      }
    }
    if (builtinFromRef) {
      const byBuiltin = candidates.find((activity) =>
        activity.fn === builtinFromRef.fn
        || activity.name === builtinFromRef.name
        || activity.name === step.activityName,
      );
      if (byBuiltin) {
        return byBuiltin;
      }
    }
    return null;
  }

  private async enrichActivityDefinition(activity: ActivityDefinition): Promise<ActivityDefinition> {
    const builtin = this.builtinActivityRegistry.getByFn(activity.fn)
      || this.builtinActivityRegistry.findByLegacyIdentifier(activity.name);
    if (builtin) {
      return this.mapBuiltinToActivityDefinition(builtin, activity);
    }

    const dbActivity = await this.prisma.activity.findFirst({
      where: {
        OR: [
          { name: activity.name },
          { fn: activity.fn },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const merged: ActivityDefinition = {
      ...activity,
      generatedCode: activity.generatedCode
        || dbActivity?.generatedCode
        || this.buildDeterministicActivityCode(activity)
        || undefined,
    };

    if (dbActivity) {
      return {
        ...this.mapDbActivityToDefinition(dbActivity),
        ...merged,
        generatedCode: merged.generatedCode,
      };
    }

    return merged;
  }

  private async resolveActivityDefinition(step: WorkflowStep, activityDsl: ActivityDsl): Promise<ActivityDefinition | null> {
    const activityFromDsl = this.findMatchingActivityInDsl(step, activityDsl);
    const builtinFromRef = step.activityRef ? this.builtinActivityRegistry.getByRef(step.activityRef) : null;
    if (builtinFromRef) {
      return this.mapBuiltinToActivityDefinition(builtinFromRef, activityFromDsl || {
        name: step.activityName || builtinFromRef.name,
        timeout: step.startToCloseTimeout || builtinFromRef.timeout,
      });
    }

    if (step.activityRef?.startsWith('custom:')) {
      const activityId = step.activityRef.slice('custom:'.length).trim();
      if (!activityId) {
        return null;
      }
      const dbActivity = await this.prisma.activity.findUnique({ where: { id: activityId } });
      return dbActivity ? this.mapDbActivityToDefinition(dbActivity) : null;
    }

    if (activityFromDsl) {
      return this.enrichActivityDefinition(activityFromDsl);
    }

    const builtinFromLegacyName = step.activityName
      ? this.builtinActivityRegistry.findByLegacyIdentifier(step.activityName)
      : null;
    if (builtinFromLegacyName) {
      return this.mapBuiltinToActivityDefinition(builtinFromLegacyName, {
        name: step.activityName || builtinFromLegacyName.name,
        timeout: step.startToCloseTimeout || builtinFromLegacyName.timeout,
      });
    }

    if (!step.activityName) {
      return null;
    }

    const dbActivity = await this.prisma.activity.findUnique({ where: { name: step.activityName } });
    return dbActivity ? this.mapDbActivityToDefinition(dbActivity) : null;
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
      const response = await axios.post(`${validationAgentUrl}/validate-workflow/stream`, {
        code,
        fn_name: fn,
        workflow_id: workflowId,
        input_data: input || { test: 'workflow-validation' },
        task_queue: taskQueue,
      }, {
        responseType: 'stream',
        timeout: Number(process.env.WORKFLOW_VALIDATION_TIMEOUT_MS || 300000),
      });
      const stream = response.data as NodeJS.ReadableStream;

      const finalEvent = await new Promise<any>((resolve, reject) => {
        let buffer = '';
        let resolved = false;

        const processChunk = (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              continue;
            }
            try {
              const event = JSON.parse(line.slice(6)) as {
                type?: string;
                content?: string;
                success?: boolean;
                result?: any;
                error?: string;
                traceback?: string;
              };
              if (event.type === 'log' && event.content) {
                pushLog(event.content);
                continue;
              }
              if (event.type === 'done') {
                resolved = true;
                resolve(event);
                return;
              }
              if (event.type === 'error') {
                resolved = true;
                reject(new Error(event.content || 'Workflow validation stream failed'));
                return;
              }
            } catch (parseError: any) {
              this.logger.warn(`Failed to parse validation stream event: ${parseError?.message || parseError}`);
            }
          }
        };

        stream.on('data', (chunk: Buffer | string) => {
          processChunk(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
        });
        stream.on('end', () => {
          if (!resolved) {
            reject(new Error('Workflow validation stream ended without done event'));
          }
        });
        stream.on('error', (streamError: Error) => {
          reject(streamError);
        });
      });

      const resultSuccess = finalEvent.success === true && !finalEvent.error;
      pushLog(`[${new Date().toISOString()}] 响应状态: ${resultSuccess ? '成功' : '失败'}`);

      if (finalEvent.error) {
        pushLog(`[${new Date().toISOString()}] 执行错误: ${finalEvent.error}`);
        if (finalEvent.traceback) {
          pushLog(`[${new Date().toISOString()}] 详细堆栈:\n${finalEvent.traceback}`);
        }
      }

      const finalResult = finalEvent.result;
      if (resultSuccess) {
        pushLog(`[${new Date().toISOString()}] 执行成功，返回结果: ${JSON.stringify(finalResult, null, 2)}`);
      }

      return {
        success: resultSuccess,
        result: finalResult,
        logs: streamedLogs,
        error: finalEvent.error,
        traceback: finalEvent.traceback,
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

  private buildRepeatedStepGuidance(workflowDsl: WorkflowDsl): string[] {
    const lines: string[] = [];
    const steps = Array.isArray(workflowDsl.steps) ? workflowDsl.steps : [];

    steps.forEach((step, index) => {
      if (step?.type !== 'activity') {
        return;
      }
      const stepName = this.pickFirstNonEmptyString(step.name) || `步骤 ${index + 1}`;
      const rawInput = step.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? step.input as Record<string, any>
        : {};

      if (step.activityRef === 'builtin:httpRequest') {
        const httpConfig = rawInput[HTTP_REQUEST_STEP_CONFIG_KEY] && typeof rawInput[HTTP_REQUEST_STEP_CONFIG_KEY] === 'object'
          ? rawInput[HTTP_REQUEST_STEP_CONFIG_KEY] as Record<string, any>
          : {};
        lines.push(`- ${stepName}: 这是 builtin:httpRequest 步骤，必须把 __httpRequest 编译成 Workflow 内部常量，只能用业务参数渲染 urlTemplate/queryTemplate。`);
        if (httpConfig.responseMode) {
          lines.push(`- ${stepName}: responseMode 已确认 = ${String(httpConfig.responseMode)}，代码生成时必须保持一致。`);
        }
      }

      if (step.activityRef === 'builtin:structuredTransform' || step.activityRef === 'builtin:aiStructuredTransform') {
        const transformConfig = rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] && typeof rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] === 'object'
          ? rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] as Record<string, any>
          : {};
        const outputMode = String(transformConfig.outputMode || '').trim() || 'json';
        const contentType = String(transformConfig.contentType || '').trim() || 'text';
        const isAiTransform = step.activityRef === 'builtin:aiStructuredTransform';
        lines.push(`- ${stepName}: 这是 ${isAiTransform ? 'builtin:aiStructuredTransform' : 'builtin:structuredTransform'} 步骤，必须把 __structuredTransform 编译成 Workflow 内部常量，且内容输入默认来自上一步结果。`);
        lines.push(`- ${stepName}: contentType 已确认 = ${contentType}，outputMode 已确认 = ${outputMode}。`);
        if (isAiTransform) {
          lines.push(`- ${stepName}: 这是 AI 转换步骤，必须保留 instructionTemplate，并显式通过共享 AI Activity 执行转换。`);
        } else {
          lines.push(`- ${stepName}: 这是固定规则转换步骤，优先使用 fieldMappings/textTemplate 等固定配置完成转换，不要在 Workflow 中自行写 AI 调用逻辑。`);
        }
        if (outputMode === 'text') {
          lines.push(`- ${stepName}: 这是文本格式化步骤，最终返回必须是纯文本，不要输出 JSON，不要使用 workflow.unsafe。`);
        } else {
          lines.push(`- ${stepName}: 这是结构化提取步骤，最终返回必须遵守 outputSchema，不要跳过字段映射。`);
        }
      }
    });

    return lines;
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

    const hasCompilationError = /Compilation Error|SyntaxError|invalid syntax|IndentationError|NameError/i.test(errorContext || '');
    const hasWorkflowUnsafeError = /workflow\.unsafe|is_replaying\(\)|module temporalio\.workflow has no attribute unsafe/i.test(errorContext || '');
    if (hasCompilationError) {
      lines.push('');
      lines.push('【编译错误专项修复要求】');
      lines.push('1. 本次输出的第一优先级是生成一个可以直接通过 Python 编译的完整模块，先修复语法、缩进、括号、引号、装饰器和函数定义问题，再考虑业务细节。');
      lines.push('2. 输出内容必须从合法 Python 代码开始，开头只能是 import、from、@activity.defn、@workflow.defn、class、def、async def 之一，禁止输出任何解释、前言、Markdown 标记、残缺字符串或 JSON 片段。');
      lines.push('3. 如果上次报错发生在 activity.py 第 1 行，重点检查输出开头是否混入了代码块围栏、反引号、说明文字或截断片段。');
      lines.push('4. 严禁输出 ```、```python、`python`、`json`、`text` 等 fenced code block 标记，也不要输出类似 `json", "").replace("` 这种残缺内容。');
      lines.push('5. 生成结束前请自检：所有字符串引号、括号、方括号、花括号、三引号、f-string 与缩进块必须成对闭合。');
    }
    if (hasWorkflowUnsafeError) {
      lines.push('');
      lines.push('【workflow.unsafe 专项修复要求】');
      lines.push('1. 本次严禁输出 `workflow.unsafe`、`workflow.unsafe.is_replaying()` 或任何 replay 检测分支。');
      lines.push('2. “历史回放安全”并不意味着要手动判断 replay 状态；正确做法是让 Workflow 逻辑天然保持确定性，而不是在代码中写 replay guard。');
      lines.push('3. 不要为了避免重复日志、重复执行或版本兼容而写 `if workflow.unsafe.is_replaying(): ...`。日志可直接写，外部副作用必须放到 Activity。');
      lines.push('4. 如果你想表达“等待条件成立”，请使用 `workflow.wait_condition`；如果你想表达“执行步骤”，请直接使用 `await workflow.execute_activity(...)`。');
      lines.push('5. 如果你想表达“版本演进”，当前也不要使用 `workflow.patch()` 或 `workflow.deprecate_patch()`；先输出最简单、稳定、可回放的实现。');
    }

    lines.push('');
    lines.push('【Workflow DSL】');
    lines.push(JSON.stringify(workflowDsl, null, 2));
    lines.push('');

    const repeatedStepGuidance = this.buildRepeatedStepGuidance(workflowDsl);
    if (repeatedStepGuidance.length > 0) {
      lines.push('【已确认的内置步骤约束（请重复遵守）】');
      repeatedStepGuidance.forEach((line) => lines.push(line));
      lines.push('');
    }

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
    lines.push('12. 【重试策略】：优先使用 DSL 指定的 retryPolicy；未指定时再使用合理默认值，禁止无限重试。若需要显式构造 RetryPolicy，只允许使用 `from temporalio.common import RetryPolicy` 或 `import temporalio.common as temporal_common` 后调用 `temporal_common.RetryPolicy(...)`。严禁使用 `activity.RetryPolicy(...)`、`workflow.RetryPolicy(...)`、`temporalio.activity.RetryPolicy(...)` 等不存在的命名空间。');
    lines.push('13. 【重试策略最小化】：如果 DSL 没有明确要求在 `workflow.execute_activity()` 上显式传 `retry_policy=`，请优先省略，不要为了“看起来完整”额外构造 RetryPolicy。');
    lines.push('14. 【日志】：必须使用 `workflow.logger.info()` 输出关键执行阶段与参数摘要。');
    lines.push('15. 【版本演进提示】：在关键逻辑处添加简短注释，提示后续变更需考虑历史运行中的工作流回放兼容性。');
    lines.push('16. 【内置步骤配置边界】：`step.input.__httpRequest` 和 `step.input.__structuredTransform` 属于步骤内部编排配置，不属于 Workflow 对外输入参数。不要在 `run()` 中读取 `params["httpRequestStepConfig"]`、`params["structuredTransformStepConfig"]` 或任何等价的内部配置参数。');
    lines.push('17. 【内置 HTTP/结构化转换落地】：如果 DSL 中使用了 builtin:httpRequest、builtin:structuredTransform 或 builtin:aiStructuredTransform，必须把对应 step config 编译为 Workflow 内部常量或固定配置，并仅用业务输入参数去渲染模板，不要把内部 step config 透传给工作流调用者。');
    lines.push('18. 【禁止手动构造请求】：对于 builtin:httpRequest，禁止在 Workflow 中手动拼接 URL 或使用 `requests` 库。必须将 DSL 中的 `__httpRequest` 配置完整映射到 Activity 的 `activity_input` 中。Workflow 的职责仅限于渲染模板变量并调用 Activity。');
    lines.push('19. 【禁止客户端代码】：不要在生成的 Workflow 文件中引入 `temporalio.client.Client`、`temporalio.worker.Worker`，也不要在代码里主动连接 Temporal 或启动 Worker。只生成 Workflow 与 Activity 定义本身。');
    lines.push('20. 【文档下载地址】：如果 Activity 返回了 `downloadUrl`，请确保 Workflow 的最终返回结果中包含此下载地址，以便用户直接点击下载。');
    lines.push('21. 【严格禁用的 Temporal API】：严禁生成 `workflow.unsafe`、`workflow.unsafe.is_replaying()`、`workflow.patch()`、`workflow.deprecate_patch()`、`activity.RetryPolicy(...)`、`workflow.RetryPolicy(...)`、`temporalio.activity.RetryPolicy(...)`。遇到回放、版本或重试问题时，只能使用标准 `workflow` API、`workflow.execute_activity(...)` 与 `temporalio.common.RetryPolicy`。');
    lines.push('22. 【默认优先固定规则转换】：如果目标可通过字段映射、路径提取、模板拼接、文本模板实现，优先沿用 builtin:structuredTransform（固定规则版）；只有当 DSL 已明确使用 builtin:aiStructuredTransform 时，才生成 AI 转换调用路径。');
    lines.push('23. 【不要发明 replay guard】：不要写 `if workflow.unsafe.is_replaying()`、不要写任何 `is_replaying` 判断、不要为了日志或分支控制去探测 replay 状态。');

    if (workflowDsl.errorHandling?.type === 'saga') {
      lines.push('24. 【Saga 模式】：必须维护 compensations 列表，在失败时逆序执行补偿任务。');
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

  private buildDeterministicWorkflowCode(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): string | null {
    const activitySteps = workflowDsl.steps.filter((step) => step.type === 'activity');
    const isSimpleStaticWorkflow =
      workflowDsl.steps.length === activitySteps.length
      && (!workflowDsl.conditionals || workflowDsl.conditionals.length === 0)
      && (!workflowDsl.signalHandlers || workflowDsl.signalHandlers.length === 0)
      && (!workflowDsl.queryHandlers || workflowDsl.queryHandlers.length === 0)
      && !workflowDsl.errorHandling;

    if (!isSimpleStaticWorkflow) {
      return null;
    }

    const resolveStepActivityDef = (step: WorkflowStep): ActivityDefinition | null => {
      const stepActivityIdentifier = step?.activityName || this.extractActivityNameFromRef(step?.activityRef);
      if (!stepActivityIdentifier) {
        return null;
      }
      const activityDef = activityDsl.activities.find((activity) =>
        activity.name === stepActivityIdentifier || activity.fn === stepActivityIdentifier,
      );
      if (!activityDef?.generatedCode) {
        return null;
      }
      return activityDef;
    };

    if (activitySteps.length === 2 && workflowDsl.steps.length === 2) {
      const [firstStep, secondStep] = activitySteps;
      const firstActivityDef = resolveStepActivityDef(firstStep);
      const secondActivityDef = resolveStepActivityDef(secondStep);
      const firstBuiltinKey = firstActivityDef ? this.builtinActivityRegistry.getByFn(firstActivityDef.fn)?.key : null;
      const secondBuiltinKey = secondActivityDef ? this.builtinActivityRegistry.getByFn(secondActivityDef.fn)?.key : null;
      if (
        firstActivityDef
        && secondActivityDef
        && firstBuiltinKey === HTTP_REQUEST_ACTIVITY_KEY
        && (secondBuiltinKey === STRUCTURED_TRANSFORM_ACTIVITY_KEY || secondBuiltinKey === AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY)
      ) {
        return this.buildFixedHttpRequestStructuredTransformWorkflowCode(
          workflowDsl,
          firstActivityDef,
          firstStep,
          secondActivityDef,
          secondStep,
        );
      }
      return null;
    }

    if (activitySteps.length !== 1 || workflowDsl.steps.length !== 1) {
      return null;
    }

    const step = activitySteps[0];
    const activityDef = resolveStepActivityDef(step);
    if (!activityDef) {
      return null;
    }

    const builtinKey = this.builtinActivityRegistry.getByFn(activityDef.fn)?.key;
    if (builtinKey === DOCUMENT_RENDER_ACTIVITY_KEY) {
      return this.buildFixedDocumentRenderWorkflowCode(workflowDsl, activityDef, step);
    }
    if (builtinKey === HTTP_REQUEST_ACTIVITY_KEY) {
      return this.buildFixedHttpRequestWorkflowCode(workflowDsl, activityDef, step);
    }
    if (builtinKey === STRUCTURED_TRANSFORM_ACTIVITY_KEY || builtinKey === AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY) {
      return this.buildFixedStructuredTransformWorkflowCode(workflowDsl, activityDef, step);
    }

    const workflowClassName = workflowDsl.workflowClassName?.trim()
      || `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
    const workflowDisplayName = workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
    const inputParams = Object.entries(workflowDsl.inputParams || {});
    const workflowTimeoutCode = this.durationToTimedeltaCode(step.startToCloseTimeout || activityDef.timeout || '60s');
    const executeActivityTimeoutLines = this.buildExecuteActivityTimeoutLines(step, activityDef.timeout || '60s');

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
      ...executeActivityTimeoutLines,
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
    const executeActivityTimeoutLines = this.buildExecuteActivityTimeoutLines(step, activityDef.timeout || '60s');
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
      ...executeActivityTimeoutLines,
      '        )',
      '        return result',
      '',
    ].join('\n');
  }

  private buildFixedHttpRequestWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDef: ActivityDsl['activities'][number],
    step: WorkflowStep,
  ): string | null {
    const workflowClassName = workflowDsl.workflowClassName?.trim()
      || `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
    const workflowDisplayName = workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
    const workflowTimeoutCode = this.durationToTimedeltaCode(step.startToCloseTimeout || activityDef.timeout || '30s');
    const executeActivityTimeoutLines = this.buildExecuteActivityTimeoutLines(step, activityDef.timeout || '30s');
    const declaredInputKeys = new Set(Object.keys(workflowDsl.inputParams || {}));
    const httpConfig = this.getStepHttpRequestConfig(step);
    const normalizedHttpConfig = this.normalizeHttpRequestConfig(httpConfig, declaredInputKeys);
    const urlTemplate = String(normalizedHttpConfig.urlTemplate || '').trim();
    if (!urlTemplate) {
      return null;
    }

    const inputParams = Object.entries(workflowDsl.inputParams || {});
    const requiredParamNames = Array.from(new Set(
      inputParams
        .filter(([, config]) => Boolean(config?.required))
        .map(([key]) => key),
    ));
    const httpConfigExpression = this.toPythonLiteral(normalizedHttpConfig, 4);

    return [
      'import re',
      'from datetime import timedelta',
      'from typing import Any, Dict',
      '',
      'from temporalio import workflow',
      'from temporalio.exceptions import ApplicationError',
      '',
      (activityDef.generatedCode || '').trim(),
      '',
      `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
      `class ${workflowClassName}:`,
      `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
      `    HTTP_REQUEST_CONFIG = ${httpConfigExpression}`,
      '',
      '    @staticmethod',
      '    def _normalize(value: Any) -> str:',
      '        if value is None:',
      '            return ""',
      '        return str(value)',
      '',
      '    @classmethod',
      '    def _render_template(cls, value: Any, params: Dict[str, Any]) -> Any:',
      '        if isinstance(value, str):',
      '            def replace(match: re.Match[str]) -> str:',
      '                key = match.group(1).strip()',
      '                raw = params.get(key)',
      '                return "" if raw is None else str(raw)',
      '            return re.sub(r"\\{([^{}]+)\\}", replace, value)',
      '        if isinstance(value, dict):',
      '            return {str(k): cls._render_template(v, params) for k, v in value.items()}',
      '        if isinstance(value, list):',
      '            return [cls._render_template(item, params) for item in value]',
      '        return value',
      '',
      '    @classmethod',
      '    def _prune_empty(cls, value: Any) -> Any:',
      '        if isinstance(value, dict):',
      '            cleaned = {}',
      '            for key, item in value.items():',
      '                normalized = cls._prune_empty(item)',
      '                if normalized not in (None, "", {}, []):',
      '                    cleaned[key] = normalized',
      '            return cleaned',
      '        if isinstance(value, list):',
      '            return [cls._prune_empty(item) for item in value if cls._prune_empty(item) not in (None, "", {}, [])]',
      '        return value',
      '',
      '    @staticmethod',
      '    def _extract_path(value: Any, path: str) -> Any:',
      '        current = value',
      '        for segment in [item for item in str(path or "").split(".") if item]:',
      '            if isinstance(current, list) and segment.isdigit():',
      '                index = int(segment)',
      '                current = current[index] if 0 <= index < len(current) else None',
      '            elif isinstance(current, dict):',
      '                current = current.get(segment)',
      '            else:',
      '                return None',
      '        return current',
      '',
      '    @staticmethod',
      '    def _validate_required_params(params: Dict[str, Any]) -> None:',
      `        required_params = ${JSON.stringify(requiredParamNames)}`,
      '        missing_params = [key for key in required_params if str(params.get(key, "")).strip() == ""]',
      '        if missing_params:',
      '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
      '',
      '    @classmethod',
      '    def _build_activity_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
      '        config = cls.HTTP_REQUEST_CONFIG or {}',
      '        activity_input = {',
      '            "url": cls._render_template(config.get("urlTemplate", ""), params),',
      '            "method": str(config.get("method") or "GET").upper(),',
      '            "headers": cls._prune_empty(cls._render_template(config.get("headersTemplate") or {}, params)),',
      '            "params": cls._prune_empty(cls._render_template(config.get("queryTemplate") or {}, params)),',
      '            "timeout": config.get("timeout") or 30,',
      '        }',
      '        json_payload = cls._prune_empty(cls._render_template(config.get("jsonTemplate") or {}, params))',
      '        if json_payload not in (None, "", {}, []):',
      '            activity_input["json"] = json_payload',
      '        data_payload = cls._prune_empty(cls._render_template(config.get("dataTemplate"), params))',
      '        if data_payload not in (None, "", {}, []):',
      '            activity_input["data"] = data_payload',
      '        return activity_input',
      '',
      '    @classmethod',
      '    def _normalize_result(cls, result: Dict[str, Any], params: Dict[str, Any]) -> Any:',
      '        if bool(params.get("__httpResponsePreview")):',
      '            return result',
      '        config = cls.HTTP_REQUEST_CONFIG or {}',
      '        response_mode = str(config.get("responseMode") or "body").strip() or "body"',
      '        if response_mode == "full":',
      '            return result',
      '        body = result.get("body") if isinstance(result, dict) else result',
      '        if response_mode == "bodyPath":',
      '            return cls._extract_path(body, str(config.get("responseBodyPath") or ""))',
      '        if response_mode == "bodyMap":',
      '            mappings = config.get("responseFieldMappings") or {}',
      '            if not isinstance(mappings, dict) or not mappings:',
      '                return body',
      '            return {str(key): cls._extract_path(body, str(path)) for key, path in mappings.items()}',
      '        return body',
      '',
      '    async def run(self, params: dict) -> Any:',
      `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
      '        normalized_params = params or {}',
      '        self._validate_required_params(normalized_params)',
      '        activity_input = self._build_activity_input(normalized_params)',
      `        workflow.logger.info(${JSON.stringify(`执行共享 HTTP 请求 Activity: ${activityDef.name}`)})`,
      '        result = await workflow.execute_activity(',
      `            ${activityDef.fn},`,
      '            activity_input,',
      ...executeActivityTimeoutLines,
      '        )',
      '        return self._normalize_result(result, normalized_params)',
      '',
    ].join('\n');
  }

  private buildFixedStructuredTransformWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDef: ActivityDsl['activities'][number],
    step: WorkflowStep,
  ): string | null {
    const workflowClassName = workflowDsl.workflowClassName?.trim()
      || `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
    const workflowDisplayName = workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
    const workflowTimeoutCode = this.durationToTimedeltaCode(step.startToCloseTimeout || activityDef.timeout || '90s');
    const executeActivityTimeoutLines = this.buildExecuteActivityTimeoutLines(step, activityDef.timeout || '90s');
    const declaredInputKeys = new Set(Object.keys(workflowDsl.inputParams || {}));
    const transformConfig = this.getStepStructuredTransformConfig(step, declaredInputKeys);
    const contentTemplate = String(transformConfig.contentTemplate || '').trim();
    const instructionTemplate = String(transformConfig.instructionTemplate || '').trim();
    if (!contentTemplate || !instructionTemplate) {
      return null;
    }

    const requiredParamNames = Array.from(new Set(
      Object.entries(workflowDsl.inputParams || {})
        .filter(([, config]) => Boolean(config?.required))
        .map(([key]) => key),
    ));
    const transformConfigExpression = this.toPythonLiteral(transformConfig, 4);

    return [
      'import re',
      'from datetime import timedelta',
      'from typing import Any, Dict',
      '',
      'from temporalio import workflow',
      'from temporalio.exceptions import ApplicationError',
      '',
      (activityDef.generatedCode || '').trim(),
      '',
      `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
      `class ${workflowClassName}:`,
      `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
      `    STRUCTURED_TRANSFORM_CONFIG = ${transformConfigExpression}`,
      '',
      '    @classmethod',
      '    def _render_template(cls, value: Any, params: Dict[str, Any]) -> Any:',
      '        if isinstance(value, str):',
      '            raw_match = re.fullmatch(r"\\{([^{}]+)\\}", value.strip())',
      '            if raw_match:',
      '                return params.get(raw_match.group(1).strip())',
      '            def replace(match: re.Match[str]) -> str:',
      '                key = match.group(1).strip()',
      '                raw = params.get(key)',
      '                return "" if raw is None else str(raw)',
      '            return re.sub(r"\\{([^{}]+)\\}", replace, value)',
      '        if isinstance(value, dict):',
      '            return {str(k): cls._render_template(v, params) for k, v in value.items()}',
      '        if isinstance(value, list):',
      '            return [cls._render_template(item, params) for item in value]',
      '        return value',
      '',
      '    @staticmethod',
      '    def _normalize_context(value: Any) -> Any:',
      '        if isinstance(value, str):',
      '            stripped = value.strip()',
      '            if stripped.startswith("{") or stripped.startswith("["):',
      '                try:',
      '                    return json.loads(stripped)',
      '                except Exception:',
      '                    return value',
      '        return value',
      '',
      '    @staticmethod',
      '    def _validate_required_params(params: Dict[str, Any]) -> None:',
      `        required_params = ${JSON.stringify(requiredParamNames)}`,
      '        missing_params = [key for key in required_params if str(params.get(key, "")).strip() == ""]',
      '        if missing_params:',
      '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
      '',
      '    @classmethod',
      '    def _build_activity_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
      '        config = cls.STRUCTURED_TRANSFORM_CONFIG or {}',
      '        return {',
      '            "content": cls._render_template(config.get("contentTemplate", ""), params),',
      '            "contentType": str(config.get("contentType") or "text"),',
      '            "instruction": cls._render_template(config.get("instructionTemplate", ""), params),',
      '            "outputMode": str(config.get("outputMode") or "json"),',
      '            "outputSchema": config.get("outputSchema") or {},',
      '            "context": cls._normalize_context(cls._render_template(config.get("contextTemplate", ""), params)),',
      '            "fieldMappings": config.get("fieldMappings") or {},',
      '            "textTemplate": str(config.get("textTemplate", "") or ""),',
      '        }',
      '',
      '    async def run(self, params: dict) -> Any:',
      `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
      '        normalized_params = params or {}',
      '        self._validate_required_params(normalized_params)',
      '        activity_input = self._build_activity_input(normalized_params)',
      `        workflow.logger.info(${JSON.stringify(`执行共享结构化转换 Activity: ${activityDef.name}`)})`,
      '        result = await workflow.execute_activity(',
      `            ${activityDef.fn},`,
      '            activity_input,',
      ...executeActivityTimeoutLines,
      '        )',
      '        return result.get("result") if isinstance(result, dict) and "result" in result else result',
      '',
    ].join('\n');
  }

  private buildFixedHttpRequestStructuredTransformWorkflowCode(
    workflowDsl: WorkflowDsl,
    httpActivityDef: ActivityDsl['activities'][number],
    httpStep: WorkflowStep,
    transformActivityDef: ActivityDsl['activities'][number],
    transformStep: WorkflowStep,
  ): string | null {
    const workflowClassName = workflowDsl.workflowClassName?.trim()
      || `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
    const workflowDisplayName = workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
    const declaredInputKeys = new Set(Object.keys(workflowDsl.inputParams || {}));
    const httpConfig = this.getStepHttpRequestConfig(httpStep);
    const normalizedHttpConfig = this.normalizeHttpRequestConfig(httpConfig, declaredInputKeys);
    const urlTemplate = String(normalizedHttpConfig.urlTemplate || '').trim();
    if (!urlTemplate) {
      return null;
    }

    const transformConfig = this.getStepStructuredTransformConfig(transformStep, declaredInputKeys);
    const transformInstructionTemplate = String(transformConfig.instructionTemplate || '').trim();
    if (!transformInstructionTemplate) {
      return null;
    }
    const normalizedTransformConfig = {
      ...transformConfig,
      contentTemplate: String(transformConfig.contentTemplate || '').trim() || '{content}',
    };

    const inputParams = Object.entries(workflowDsl.inputParams || {});
    const normalizeLines = inputParams.map(([key, config]) => {
      const defaultValue = config?.defaultValue ?? '';
      return `        ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)}, ${JSON.stringify(String(defaultValue))})),`;
    });
    const requiredParamNames = Array.from(new Set(
      Object.entries(workflowDsl.inputParams || {})
        .filter(([, config]) => Boolean(config?.required))
        .map(([key]) => key),
    ));

    const httpConfigExpression = this.toPythonLiteral(normalizedHttpConfig, 4);
    const transformConfigExpression = this.toPythonLiteral(normalizedTransformConfig, 4);
    const httpExecuteActivityTimeoutLines = this.buildExecuteActivityTimeoutLines(httpStep, httpActivityDef.timeout || '30s');
    const transformExecuteActivityTimeoutLines = this.buildExecuteActivityTimeoutLines(transformStep, transformActivityDef.timeout || '90s');

    return [
      'import re',
      'from datetime import timedelta',
      'from typing import Any, Dict',
      '',
      'from temporalio import workflow',
      'from temporalio.exceptions import ApplicationError',
      '',
      (httpActivityDef.generatedCode || '').trim(),
      '',
      (transformActivityDef.generatedCode || '').trim(),
      '',
      `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
      `class ${workflowClassName}:`,
      `    HTTP_REQUEST_CONFIG = ${httpConfigExpression}`,
      `    STRUCTURED_TRANSFORM_CONFIG = ${transformConfigExpression}`,
      '',
      '    @staticmethod',
      '    def _normalize(value: Any) -> str:',
      '        if value is None:',
      '            return ""',
      '        return str(value)',
      '',
      '    @classmethod',
      '    def _render_http_template(cls, value: Any, params: Dict[str, Any]) -> Any:',
      '        if isinstance(value, str):',
      '            def replace(match: re.Match[str]) -> str:',
      '                key = match.group(1).strip()',
      '                raw = params.get(key)',
      '                return "" if raw is None else str(raw)',
      '            return re.sub(r"\\{([^{}]+)\\}", replace, value)',
      '        if isinstance(value, dict):',
      '            return {str(k): cls._render_http_template(v, params) for k, v in value.items()}',
      '        if isinstance(value, list):',
      '            return [cls._render_http_template(item, params) for item in value]',
      '        return value',
      '',
      '    @classmethod',
      '    def _render_transform_template(cls, value: Any, params: Dict[str, Any]) -> Any:',
      '        if isinstance(value, str):',
      '            raw_match = re.fullmatch(r"\\{([^{}]+)\\}", value.strip())',
      '            if raw_match:',
      '                return params.get(raw_match.group(1).strip())',
      '            def replace(match: re.Match[str]) -> str:',
      '                key = match.group(1).strip()',
      '                raw = params.get(key)',
      '                return "" if raw is None else str(raw)',
      '            return re.sub(r"\\{([^{}]+)\\}", replace, value)',
      '        if isinstance(value, dict):',
      '            return {str(k): cls._render_transform_template(v, params) for k, v in value.items()}',
      '        if isinstance(value, list):',
      '            return [cls._render_transform_template(item, params) for item in value]',
      '        return value',
      '',
      '    @staticmethod',
      '    def _normalize_context(value: Any) -> Any:',
      '        if isinstance(value, str):',
      '            stripped = value.strip()',
      '            if stripped.startswith("{") or stripped.startswith("["):',
      '                try:',
      '                    return json.loads(stripped)',
      '                except Exception:',
      '                    return value',
      '        return value',
      '',
      '    @classmethod',
      '    def _prune_empty(cls, value: Any) -> Any:',
      '        if isinstance(value, dict):',
      '            cleaned = {}',
      '            for key, item in value.items():',
      '                normalized = cls._prune_empty(item)',
      '                if normalized not in (None, "", {}, []):',
      '                    cleaned[key] = normalized',
      '            return cleaned',
      '        if isinstance(value, list):',
      '            cleaned_items = []',
      '            for item in value:',
      '                normalized = cls._prune_empty(item)',
      '                if normalized not in (None, "", {}, []):',
      '                    cleaned_items.append(normalized)',
      '            return cleaned_items',
      '        return value',
      '',
      '    @classmethod',
      '    def _normalize_runtime_params(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
      '        raw_params = params or {}',
      '        return {',
      ...normalizeLines,
      '        }',
      '',
      '    @staticmethod',
      '    def _extract_path(value: Any, path: str) -> Any:',
      '        current = value',
      '        for segment in [item for item in str(path or "").split(".") if item]:',
      '            if isinstance(current, list) and segment.isdigit():',
      '                index = int(segment)',
      '                current = current[index] if 0 <= index < len(current) else None',
      '            elif isinstance(current, dict):',
      '                current = current.get(segment)',
      '            else:',
      '                return None',
      '        return current',
      '',
      '    @staticmethod',
      '    def _validate_required_params(params: Dict[str, Any]) -> None:',
      `        required_params = ${JSON.stringify(requiredParamNames)}`,
      '        missing_params = [key for key in required_params if str(params.get(key, "")).strip() == ""]',
      '        if missing_params:',
      '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
      '',
      '    @classmethod',
      '    def _build_http_activity_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
      '        config = cls.HTTP_REQUEST_CONFIG or {}',
      '        activity_input = {',
      '            "url": cls._render_http_template(config.get("urlTemplate", ""), params),',
      '            "method": str(config.get("method") or "GET").upper(),',
      '            "headers": cls._prune_empty(cls._render_http_template(config.get("headersTemplate") or {}, params)),',
      '            "params": cls._prune_empty(cls._render_http_template(config.get("queryTemplate") or {}, params)),',
      '            "timeout": config.get("timeout") or 30,',
      '        }',
      '        json_payload = cls._prune_empty(cls._render_http_template(config.get("jsonTemplate") or {}, params))',
      '        if json_payload not in (None, "", {}, []):',
      '            activity_input["json"] = json_payload',
      '        data_payload = cls._prune_empty(cls._render_http_template(config.get("dataTemplate"), params))',
      '        if data_payload not in (None, "", {}, []):',
      '            activity_input["data"] = data_payload',
      '        return activity_input',
      '',
      '    @classmethod',
      '    def _normalize_http_result(cls, result: Dict[str, Any], params: Dict[str, Any]) -> Any:',
      '        if bool(params.get("__httpResponsePreview")):',
      '            return result',
      '        config = cls.HTTP_REQUEST_CONFIG or {}',
      '        response_mode = str(config.get("responseMode") or "body").strip() or "body"',
      '        if response_mode == "full":',
      '            return result',
      '        body = result.get("body") if isinstance(result, dict) else result',
      '        if response_mode == "bodyPath":',
      '            return cls._extract_path(body, str(config.get("responseBodyPath") or ""))',
      '        if response_mode == "bodyMap":',
      '            mappings = config.get("responseFieldMappings") or {}',
      '            if not isinstance(mappings, dict) or not mappings:',
      '                return body',
      '            return {str(key): cls._extract_path(body, str(path)) for key, path in mappings.items()}',
      '        return body',
      '',
      '    @classmethod',
      '    def _build_transform_activity_input(cls, params: Dict[str, Any], http_result: Any) -> Dict[str, Any]:',
      '        config = cls.STRUCTURED_TRANSFORM_CONFIG or {}',
      '        runtime_params = {',
      '            **params,',
      '            "content": http_result,',
      '            "httpResult": http_result,',
      '            "httpBody": http_result,',
      '        }',
      '        return {',
      '            "content": cls._render_transform_template(config.get("contentTemplate", "{content}"), runtime_params),',
      '            "contentType": str(config.get("contentType") or "text"),',
      '            "instruction": cls._render_transform_template(config.get("instructionTemplate", ""), runtime_params),',
      '            "outputMode": str(config.get("outputMode") or "json"),',
      '            "outputSchema": config.get("outputSchema") or {},',
      '            "context": cls._normalize_context(cls._render_transform_template(config.get("contextTemplate", ""), runtime_params)),',
      '            "fieldMappings": config.get("fieldMappings") or {},',
      '            "textTemplate": str(config.get("textTemplate", "") or ""),',
      '        }',
      '',
      '    async def run(self, params: dict) -> Any:',
      `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
      '        normalized_params = self._normalize_runtime_params(params or {})',
      '        self._validate_required_params(normalized_params)',
      '        http_activity_input = self._build_http_activity_input(normalized_params)',
      `        workflow.logger.info(${JSON.stringify(`执行共享 HTTP 请求 Activity: ${httpActivityDef.name}`)})`,
      '        http_result_raw = await workflow.execute_activity(',
      `            ${httpActivityDef.fn},`,
      '            http_activity_input,',
      ...httpExecuteActivityTimeoutLines,
      '        )',
      '        http_result = self._normalize_http_result(http_result_raw, normalized_params)',
      '        transform_activity_input = self._build_transform_activity_input(normalized_params, http_result)',
      `        workflow.logger.info(${JSON.stringify(`执行共享结构化转换 Activity: ${transformActivityDef.name}`)})`,
      '        transform_result = await workflow.execute_activity(',
      `            ${transformActivityDef.fn},`,
      '            transform_activity_input,',
      ...transformExecuteActivityTimeoutLines,
      '        )',
      '        return transform_result.get("result") if isinstance(transform_result, dict) and "result" in transform_result else transform_result',
      '',
    ].join('\n');
  }

  private getStepHttpRequestConfig(step: WorkflowStep): Record<string, any> {
    const rawInput = step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
      ? step.input as Record<string, any>
      : {};
    const rawConfig = rawInput[HTTP_REQUEST_STEP_CONFIG_KEY];
    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      return {};
    }
    return this.sanitizeJsonValue(rawConfig) as Record<string, any>;
  }

  private getStepStructuredTransformConfig(
    step: WorkflowStep,
    declaredInputKeys: Set<string>,
  ): Record<string, any> {
    const rawInput = step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
      ? step.input as Record<string, any>
      : {};
    const rawConfig = rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY];
    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      return this.normalizeStructuredTransformConfig({}, declaredInputKeys);
    }
    return this.normalizeStructuredTransformConfig(rawConfig as Record<string, any>, declaredInputKeys);
  }

  private collectTemplateVariables(value: unknown, target: Set<string> = new Set<string>()): Set<string> {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\{([^{}]+)\}/g)) {
        const variable = String(match[1] || '').trim();
        if (variable) {
          target.add(variable);
        }
      }
      return target;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.collectTemplateVariables(item, target));
      return target;
    }
    if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((item) => this.collectTemplateVariables(item, target));
    }
    return target;
  }

  private buildGenericAiDraftSampleValue(
    key: string,
    description: string | undefined,
    referenceUrl: string,
  ): string | number | boolean {
    const hint = `${key} ${description || ''}`.toLowerCase();
    const normalizedKey = String(key || '')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'value';
    if (/(url|uri|link|网址|链接)/i.test(hint)) {
      return referenceUrl || `https://example.com/${normalizedKey}`;
    }
    if (/(bool|boolean|启用|是否)/i.test(hint)) {
      return true;
    }
    if (/(number|int|float|double|decimal|count|size|limit|page|offset|age|数量|页码|大小|编号)/i.test(hint)) {
      return 1;
    }
    if (/(date|day|time|datetime|时间|日期)/i.test(hint)) {
      return new Date().toISOString().slice(0, 10);
    }
    return `sample_${normalizedKey}`;
  }

  private extractAiDraftSampleValuesFromReferenceUrl(
    referenceUrl: string,
    steps: WorkflowStep[],
  ): Record<string, string> {
    const resolved: Record<string, string> = {};
    const targetUrl = String(referenceUrl || '').trim();
    if (!targetUrl) {
      return resolved;
    }

    let actualUrl: URL;
    try {
      actualUrl = new URL(targetUrl);
    } catch {
      return resolved;
    }

    for (const step of steps || []) {
      const activityRef = this.pickFirstNonEmptyString(step?.activityRef);
      if (activityRef !== 'builtin:httpRequest') {
        continue;
      }
      const stepInput = step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? step.input as Record<string, any>
        : {};
      const httpConfig = stepInput[HTTP_REQUEST_STEP_CONFIG_KEY];
      if (!httpConfig || typeof httpConfig !== 'object' || Array.isArray(httpConfig)) {
        continue;
      }

      const urlTemplate = String(httpConfig.urlTemplate || '').trim();
      try {
        const templateUrl = new URL(urlTemplate.replace(/\{[^{}]+\}/g, '__placeholder__'));
        if (templateUrl.origin === actualUrl.origin) {
          const templatePath = urlTemplate
            .replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/[^/]+/, '')
            .split('?')[0] || '/';
          const templateSegments = templatePath.split('/').filter(Boolean).map((item) => {
            try {
              return decodeURIComponent(item);
            } catch {
              return item;
            }
          });
          const actualSegments = actualUrl.pathname.split('/').filter(Boolean);
          if (templateSegments.length === actualSegments.length) {
            templateSegments.forEach((segment, index) => {
              const tokenMatch = segment.match(/^\{([^{}]+)\}$/);
              if (!tokenMatch) {
                return;
              }
              const token = String(tokenMatch[1] || '').trim();
              const actualValue = actualSegments[index];
              if (token && actualValue) {
                resolved[token] = decodeURIComponent(actualValue);
              }
            });
          }
        }
      } catch {
        // ignore malformed template URL and continue with query inference only
      }

      const queryTemplate = httpConfig.queryTemplate && typeof httpConfig.queryTemplate === 'object' && !Array.isArray(httpConfig.queryTemplate)
        ? httpConfig.queryTemplate as Record<string, any>
        : {};
      Object.entries(queryTemplate).forEach(([queryKey, queryValue]) => {
        const tokenMatch = String(queryValue || '').trim().match(/^\{([^{}]+)\}$/);
        if (!tokenMatch) {
          return;
        }
        const token = String(tokenMatch[1] || '').trim();
        const actualValue = actualUrl.searchParams.get(String(queryKey || '').trim());
        if (token && actualValue) {
          resolved[token] = actualValue;
        }
      });
    }

    return resolved;
  }

  private extractValueByPath(value: unknown, path: string): unknown {
    const normalizedPath = String(path || '').trim().replace(/^body\./, '');
    if (!normalizedPath) {
      return value;
    }

    return normalizedPath.split('.').reduce<unknown>((current, segment) => {
      if (current === null || current === undefined) {
        return undefined;
      }
      const key = String(segment || '').trim();
      if (!key) {
        return current;
      }
      if (Array.isArray(current)) {
        const index = Number(key);
        return Number.isInteger(index) ? current[index] : undefined;
      }
      if (typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, value);
  }

  private buildPlaceholderValueFromSchemaHint(schemaHint: unknown, fieldName: string): unknown {
    const hint = String(schemaHint || '').toLowerCase();
    if (/(number|int|float|double|decimal)/.test(hint)) {
      return 0;
    }
    if (/(bool|boolean)/.test(hint)) {
      return false;
    }
    if (/(array|\[\])/.test(hint)) {
      return [];
    }
    if (/(object|map|dict)/.test(hint)) {
      return {};
    }
    return `${fieldName}_sample`;
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

  private buildExecuteActivityTimeoutLines(
    step: WorkflowStep,
    fallbackStartToCloseTimeout: string,
  ): string[] {
    const lines = [
      `            start_to_close_timeout=${this.durationToTimedeltaCode(step.startToCloseTimeout || fallbackStartToCloseTimeout)},`,
    ];
    if (step.scheduleToCloseTimeout) {
      lines.push(
        `            schedule_to_close_timeout=${this.durationToTimedeltaCode(step.scheduleToCloseTimeout)},`,
      );
    }
    if (step.heartbeatTimeout) {
      lines.push(
        `            heartbeat_timeout=${this.durationToTimedeltaCode(step.heartbeatTimeout)},`,
      );
    }
    return lines;
  }

  private extractCodeFromMarkdown(content: string): string | null {
    const normalized = String(content || '').replace(/^\uFEFF/, '').trim();
    if (!normalized) {
      return null;
    }

    const codeBlockMatches = Array.from(normalized.matchAll(/```(?:python|py|json|text)?\s*([\s\S]*?)```/gi));
    for (const match of codeBlockMatches) {
      const candidate = this.sanitizeExtractedPythonCode(match[1] || '');
      if (candidate) {
        return candidate;
      }
    }

    return this.sanitizeExtractedPythonCode(normalized);
  }

  private sanitizeExtractedPythonCode(content: string): string | null {
    const normalized = String(content || '')
      .replace(/^\uFEFF/, '')
      .replace(/^```[a-z]*\s*/gi, '')
      .replace(/```$/g, '')
      .trim();

    if (!normalized) {
      return null;
    }

    const lines = normalized.split('\n');
    // 寻找第一个合法的 Python 顶层定义或导入
    const firstCodeLineIndex = lines.findIndex((line) => {
      const trimmed = line.trim();
      return /^(import\s+|from\s+|@activity\.defn|@workflow\.defn|class\s+|def\s+|async\s+def\s+)/.test(trimmed) 
             && !trimmed.startsWith('`') 
             && !trimmed.startsWith('#'); // 排除只有注释的情况，除非后面有代码
    });
    
    // 如果找不到明确的入口，但包含一些 Python 特征（如缩进、赋值），也保留
    const startLine = firstCodeLineIndex >= 0 ? firstCodeLineIndex : 0;
    const candidateLines = lines.slice(startLine);
    
    // 再次过滤掉末尾可能存在的 Markdown 解释文本
    // 如果某一行开始不再像 Python 代码（例如不是缩进块，也不是顶层定义，且不是空行/注释）
    let lastCodeLine = candidateLines.length - 1;
    for (let i = 0; i < candidateLines.length; i++) {
      const line = candidateLines[i].trim();
      if (line && !line.startsWith('#') && !/^[a-zA-Z0-9_]/.test(line) && !line.startsWith('@') && !candidateLines[i].startsWith(' ')) {
        // 发现了一个既不是顶层定义，也不是缩进块，也不是注释的非空行，可能是 Markdown 文本开始了
        // 但我们要小心，这可能是多行字符串的一部分。简单起见，如果它看起来像一段话，就截断
        if (line.split(' ').length > 5 && !line.includes('(') && !line.includes('=') && !line.includes(':')) {
           lastCodeLine = i - 1;
           break;
        }
      }
    }

    const finalLines = candidateLines.slice(0, lastCodeLine + 1);
    const candidate = finalLines.join('\n').trim();

    if (!candidate) {
      return null;
    }

    const looksLikePythonModule = finalLines.some((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('import ')
        || trimmed.startsWith('from ')
        || trimmed.startsWith('@activity.defn')
        || trimmed.startsWith('@workflow.defn')
        || trimmed.startsWith('class ')
        || trimmed.startsWith('def ')
        || trimmed.startsWith('async def ');
    });

    if (!looksLikePythonModule) {
      return null;
    }

    return candidate;
  }

  private validateGeneratedPythonCodeShape(code: string): { success: boolean; error?: string } {
    const bannedPatterns: Array<{ pattern: RegExp; message: string }> = [
      {
        pattern: /\bactivity\.RetryPolicy\s*\(/,
        message: '检测到 `activity.RetryPolicy(...)`。Temporal Python SDK 中不存在该 API，只允许使用 `temporalio.common.RetryPolicy(...)`。',
      },
      {
        pattern: /\bworkflow\.RetryPolicy\s*\(/,
        message: '检测到 `workflow.RetryPolicy(...)`。请改为 `from temporalio.common import RetryPolicy` 后使用 `RetryPolicy(...)`。',
      },
      {
        pattern: /\btemporalio\.activity\.RetryPolicy\s*\(/,
        message: '检测到 `temporalio.activity.RetryPolicy(...)`。正确命名空间应为 `temporalio.common.RetryPolicy(...)`。',
      },
      {
        pattern: /\bfrom\s+temporalio\.activity\s+import\s+RetryPolicy\b/,
        message: '检测到 `from temporalio.activity import RetryPolicy`。正确导入应为 `from temporalio.common import RetryPolicy`。',
      },
      {
        pattern: /\bworkflow\.unsafe\b/,
        message: '检测到 `workflow.unsafe`。生成的 Workflow 禁止依赖 `workflow.unsafe`，请仅使用标准的 `workflow` API 与 `workflow.execute_activity(...)`。',
      },
    ];

    for (const rule of bannedPatterns) {
      if (rule.pattern.test(code)) {
        return { success: false, error: rule.message };
      }
    }

    return { success: true };
  }

  private buildSdkViolationRepairContext(errorMessage: string): string {
    const normalized = String(errorMessage || '').trim();
    if (!normalized) {
      return 'AI 生成的代码违反 Temporal Python SDK 约束，请重新生成。';
    }
    if (/workflow\.unsafe|is_replaying\(\)/i.test(normalized)) {
      return [
        'AI 生成的代码违反 Temporal Python SDK 约束，请根据以下问题重新生成完整代码：',
        normalized,
        '',
        '强制修复要求：',
        '1. 删除所有 `workflow.unsafe`、`workflow.unsafe.is_replaying()`、`is_replaying` 相关分支。',
        '2. 不要为了“历史回放安全”手动判断 replay；直接保持 Workflow 逻辑确定性即可。',
        '3. 不要使用 `workflow.patch()`、`workflow.deprecate_patch()` 作为替代方案。',
        '4. 日志可直接保留；外部副作用必须放在 Activity 中，而不是依赖 replay guard。',
        '5. 最终代码只能使用标准 `workflow` API、`await workflow.execute_activity(...)`、`workflow.wait_condition(...)` 等安全接口。',
      ].join('\n');
    }
    return `AI 生成的代码违反 Temporal Python SDK 约束，请根据以下问题重新生成完整代码：\n${normalized}`;
  }

  private async generateWorkflowCodeViaAi(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    initialErrorContext?: string,
    onProgress?: (log: string) => void,
  ): Promise<{ success: boolean; code?: string; error?: string; attempts: number; autoRetried: boolean }> {
    const aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ai-orchestrator:3007';
    let errorContext = initialErrorContext;
    let attempts = 0;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      attempts += 1;
      onProgress?.(`[${new Date().toISOString()}] 开始第 ${attempts} 次 AI 代码生成`);
      const prompt = this.buildWorkflowCodePrompt(workflowDsl, activityDsl, errorContext);
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'default',
        prompt,
      }, { timeout: 180000 });
      onProgress?.(`[${new Date().toISOString()}] AI 已返回候选代码，开始提取与静态检查`);

      const content = response.data?.result || '';
      const code = this.extractCodeFromMarkdown(content);

      if (!code) {
        onProgress?.(`[${new Date().toISOString()}] AI 输出中未提取到有效 Python 代码`);
        if (attempt === 0) {
          errorContext = this.mergeErrorContext(
            initialErrorContext,
            'AI 返回内容中未提取到有效 Python 代码。请只输出完整 Python 模块，不要包含 Markdown、解释、JSON 或残缺片段。',
          );
          continue;
        }
        return { success: false, error: 'AI 未能生成有效代码', attempts, autoRetried: attempts > 1 };
      }

      const codeShapeCheck = this.validateGeneratedPythonCodeShape(code);
      if (!codeShapeCheck.success) {
        onProgress?.(`[${new Date().toISOString()}] 静态约束检查失败: ${codeShapeCheck.error}`);
        if (attempt === 0) {
          errorContext = this.mergeErrorContext(
            initialErrorContext,
            this.buildSdkViolationRepairContext(codeShapeCheck.error || ''),
          );
          continue;
        }
        return {
          success: false,
          error: `AI 生成的代码违反 Temporal Python SDK 约束: ${codeShapeCheck.error}`,
          attempts,
          autoRetried: attempts > 1,
        };
      }

      const compilationCheck = this.precompileGeneratedPython(code);
      if (compilationCheck.success) {
        onProgress?.(`[${new Date().toISOString()}] Python 编译预检查通过`);
        return { success: true, code, attempts, autoRetried: attempts > 1 };
      }

      onProgress?.(`[${new Date().toISOString()}] Python 编译预检查失败: ${compilationCheck.error}`);
      if (attempt === 0) {
        errorContext = this.mergeErrorContext(
          initialErrorContext,
          `AI 生成的代码未通过 Python 编译预检查，请根据以下错误重新生成完整代码：\n${compilationCheck.error}`,
        );
        continue;
      }

      return {
        success: false,
        error: `AI 生成的代码未通过 Python 编译预检查: ${compilationCheck.error}`,
        attempts,
        autoRetried: attempts > 1,
      };
    }

    return { success: false, error: 'AI 未能生成有效代码', attempts, autoRetried: attempts > 1 };
  }

  private mergeErrorContext(baseContext: string | undefined, appendedContext: string): string {
    const base = String(baseContext || '').trim();
    const extra = String(appendedContext || '').trim();
    if (!base) {
      return extra;
    }
    if (!extra) {
      return base;
    }
    return `${base}\n\n${extra}`;
  }

  private precompileGeneratedPython(code: string): { success: boolean; error?: string } {
    const tempDir = mkdtempSync(join(tmpdir(), 'ops-workflow-compile-'));
    const tempFile = join(tempDir, 'generated_workflow.py');

    try {
      writeFileSync(tempFile, code, 'utf-8');
      const result = spawnSync(
        'python3',
        [
          '-c',
          [
            'import pathlib',
            'import sys',
            'source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")',
            'compile(source, sys.argv[1], "exec")',
          ].join('\n'),
          tempFile,
        ],
        {
          encoding: 'utf-8',
          timeout: 15000,
        },
      );

      if (result.error) {
        return { success: false, error: `python3 不可用或执行失败: ${result.error.message}` };
      }

      if (result.status === 0) {
        return { success: true };
      }

      const error = String(result.stderr || result.stdout || 'unknown compile error').trim();
      return { success: false, error };
    } catch (error: any) {
      return { success: false, error: error.message || 'unknown compile error' };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private async analyzeTemplateWorkflow(
    template: CarboneTemplateMeta,
    skill: CarboneSkillMeta | null,
  ): Promise<TemplateWorkflowAiAnalysis> {
    const fallback: TemplateWorkflowAiAnalysis = {};
    try {
      const aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ai-orchestrator:3007';
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

  private normalizeAiDraftStepInput(
    rawInput: Record<string, any>,
    activityRef: string,
    stepName: string,
    workflowIntentText: string,
    previousActivityRef?: string,
  ): Record<string, any> {
    const input = this.sanitizeJsonValue(rawInput || {}) as Record<string, any>;
    if (activityRef !== 'builtin:structuredTransform' && activityRef !== 'builtin:aiStructuredTransform') {
      return input;
    }

    const isAiTransform = activityRef === 'builtin:aiStructuredTransform';
    const previousIsHttpRequest = previousActivityRef === 'builtin:httpRequest';
    const rawStructuredConfig = input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] && typeof input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] === 'object'
      ? input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] as Record<string, any>
      : {};
    const structuredPlaceholderKeys = new Set<string>([
      'content',
      ...Object.keys(
        rawStructuredConfig.fieldMappings && typeof rawStructuredConfig.fieldMappings === 'object' && !Array.isArray(rawStructuredConfig.fieldMappings)
          ? rawStructuredConfig.fieldMappings
          : {},
      ),
      ...Object.keys(
        rawStructuredConfig.outputSchema && typeof rawStructuredConfig.outputSchema === 'object' && !Array.isArray(rawStructuredConfig.outputSchema)
          ? rawStructuredConfig.outputSchema
          : {},
      ),
    ]);
    const normalizedConfig = this.normalizeStructuredTransformConfig(
      rawStructuredConfig,
      structuredPlaceholderKeys,
    );

    const declaredOutputMode = String(rawStructuredConfig.outputMode || '').trim().toLowerCase();
    let outputMode = declaredOutputMode;
    if (!outputMode) {
      outputMode = this.inferStructuredTransformOutputMode(
        stepName,
        workflowIntentText,
        normalizedConfig,
      );
    }

    let contentType = String(rawStructuredConfig.contentType || '').trim().toLowerCase();
    if (!contentType) {
      contentType = previousIsHttpRequest ? 'json' : 'text';
    }

    const outputSchema = normalizedConfig.outputSchema && typeof normalizedConfig.outputSchema === 'object' && !Array.isArray(normalizedConfig.outputSchema)
      ? { ...normalizedConfig.outputSchema }
      : {};
    if (outputMode === 'json' && Object.keys(outputSchema).length === 0) {
      Object.assign(
        outputSchema,
        this.buildDefaultStructuredTransformOutputSchema(stepName, workflowIntentText, normalizedConfig),
      );
    }

    let instructionTemplate = String(normalizedConfig.instructionTemplate || '').trim();
    if (!instructionTemplate && isAiTransform) {
      instructionTemplate = this.buildDefaultAiStructuredTransformInstruction(
        stepName,
        outputMode,
        outputSchema,
      );
    }

    const fieldMappings = normalizedConfig.fieldMappings && typeof normalizedConfig.fieldMappings === 'object' && !Array.isArray(normalizedConfig.fieldMappings)
      ? { ...normalizedConfig.fieldMappings }
      : {};
    let textTemplate = String(normalizedConfig.textTemplate || '').trim();

    if (!isAiTransform) {
      if (outputMode === 'text' && !textTemplate) {
        const inferredTextFieldKeys = Object.keys(fieldMappings).length > 0
          ? Object.keys(fieldMappings)
          : Object.keys(outputSchema);
        textTemplate = this.buildDefaultStructuredTransformTextTemplate(
          stepName,
          inferredTextFieldKeys,
        );
        inferredTextFieldKeys.forEach((key) => {
          if (!fieldMappings[key]) {
            fieldMappings[key] = key;
          }
        });
      }

      if (outputMode === 'json' && Object.keys(fieldMappings).length === 0 && Object.keys(outputSchema).length > 0) {
        Object.keys(outputSchema).forEach((key) => {
          fieldMappings[key] = key;
        });
      }
    }

    return {
      ...input,
      [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: {
        contentType,
        contentTemplate: '{content}',
        instructionTemplate,
        outputMode,
        outputSchema,
        contextTemplate: String(normalizedConfig.contextTemplate || '').trim(),
        fieldMappings,
        textTemplate,
      },
    };
  }

  private inferStructuredTransformOutputMode(
    stepName: string,
    workflowIntentText: string,
    normalizedConfig: Record<string, any>,
  ): 'json' | 'text' {
    const signalText = [
      stepName,
      workflowIntentText,
      String(normalizedConfig.instructionTemplate || ''),
      String(normalizedConfig.textTemplate || ''),
    ].filter(Boolean).join('\n');

    if (
      String(normalizedConfig.textTemplate || '').trim()
      || /(格式化|format|render|文本|text|纯文本|markdown|邮件|消息|总结|summary|报告|report)/i.test(signalText)
    ) {
      return 'text';
    }
    return 'json';
  }

  private buildDefaultAiStructuredTransformInstruction(
    stepName: string,
    outputMode: string,
    outputSchema: unknown,
  ): string {
    const normalizedSchema = outputSchema && typeof outputSchema === 'object' && !Array.isArray(outputSchema)
      ? outputSchema as Record<string, any>
      : {};
    if (String(outputMode || '').toLowerCase() === 'text') {
      return `请根据输入内容完成${stepName}，输出整理后的纯文本结果，只返回纯文本，不要 JSON。`;
    }
    const fields = Object.keys(normalizedSchema);
    const fieldSummary = fields.length > 0 ? `重点保证字段：${fields.join('、')}。` : '';
    return `请根据输入内容完成${stepName}，按 outputSchema 返回结构化 JSON。${fieldSummary}`.trim();
  }

  private buildDefaultStructuredTransformOutputSchema(
    stepName: string,
    workflowIntentText: string,
    normalizedConfig?: Record<string, any>,
  ): Record<string, string> {
    const candidateFieldKeys = this.extractStructuredTransformCandidateFieldKeys(
      normalizedConfig?.fieldMappings,
      normalizedConfig?.outputSchema,
      normalizedConfig?.textTemplate,
      normalizedConfig?.instructionTemplate,
      normalizedConfig?.contextTemplate,
      stepName,
      workflowIntentText,
    );
    if (candidateFieldKeys.length > 0) {
      return Object.fromEntries(candidateFieldKeys.slice(0, 8).map((key) => [key, 'string']));
    }

    const signalText = `${stepName}\n${workflowIntentText}`;
    if (/(总结|summary|摘要|概览|overview)/i.test(signalText)) {
      return { summary: 'string' };
    }
    if (/(建议|advice|recommend|推荐)/i.test(signalText)) {
      return { advice: 'string' };
    }
    if (/(标题|title)/i.test(signalText)) {
      return { title: 'string' };
    }
    return { result: 'string' };
  }

  private extractStructuredTransformCandidateFieldKeys(...sources: unknown[]): string[] {
    const keys = new Set<string>();
    const blockedWords = new Set([
      'json',
      'text',
      'html',
      'content',
      'context',
      'output',
      'outputs',
      'input',
      'inputs',
      'field',
      'fields',
      'schema',
      'format',
      'formatted',
      'transform',
      'structured',
      'workflow',
      'step',
      'data',
      'message',
      'messages',
      'report',
      'render',
      'result',
      'results',
    ]);

    const addKey = (value: unknown) => {
      const normalized = String(value || '').trim();
      if (!normalized) {
        return;
      }
      const sanitized = normalized
        .replace(/^[`"'[{(]+/, '')
        .replace(/[`"'\]})]+$/, '')
        .trim();
      if (!sanitized) {
        return;
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(sanitized)) {
        return;
      }
      if (blockedWords.has(sanitized.toLowerCase())) {
        return;
      }
      keys.add(sanitized);
    };

    const visit = (source: unknown) => {
      if (!source) {
        return;
      }
      if (typeof source === 'string') {
        for (const match of source.matchAll(/\{([^{}]+)\}/g)) {
          addKey(match[1]);
        }
        for (const match of source.matchAll(/[`"'"]([a-zA-Z][a-zA-Z0-9_]*)[`"'"]/g)) {
          addKey(match[1]);
        }
        for (const match of source.matchAll(/\b([a-z][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*|[a-z][a-zA-Z0-9_]*_[a-zA-Z0-9_]+)\b/g)) {
          addKey(match[1]);
        }
        const fieldHintMatches = source.match(/(?:字段|fields?|返回|输出|包含|保留|重点保证字段)\s*[:：]?\s*([^\n。；;]+)/i);
        if (fieldHintMatches?.[1]) {
          fieldHintMatches[1]
            .split(/[,\s、，|/]+/)
            .forEach((item) => addKey(item));
        }
        return;
      }
      if (Array.isArray(source)) {
        source.forEach((item) => visit(item));
        return;
      }
      if (typeof source === 'object') {
        Object.keys(source as Record<string, unknown>).forEach((key) => addKey(key));
      }
    };

    sources.forEach((source) => visit(source));
    return Array.from(keys);
  }

  private buildDefaultStructuredTransformTextTemplate(
    stepName: string,
    fieldKeys: string[],
  ): string {
    const normalizedFields = fieldKeys
      .map((key) => String(key || '').trim())
      .filter(Boolean);
    if (normalizedFields.length === 0) {
      return '{content}';
    }
    return normalizedFields
      .slice(0, 8)
      .map((key) => `${this.humanizeStructuredTransformFieldLabel(stepName, key)}: {${key}}`)
      .join('\n');
  }

  private humanizeStructuredTransformFieldLabel(stepName: string, fieldKey: string): string {
    const normalized = String(fieldKey || '').trim();
    if (!normalized) {
      return this.pickFirstNonEmptyString(stepName) || 'Field';
    }
    if (/^[a-z0-9]+(?:[A-Z][a-z0-9]+)+$/.test(normalized)) {
      return normalized
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, (item) => item.toUpperCase());
    }
    const segments = normalized
      .replace(/[_-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (segments.length === 0) {
      return normalized;
    }
    return segments
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
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
      const parsed = JSON.parse(sanitized);
      return this.recursiveSanitizeTemplates(parsed);
    } catch {
      const start = sanitized.indexOf('{');
      const end = sanitized.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(sanitized.slice(start, end + 1));
        return this.recursiveSanitizeTemplates(parsed);
      }
      throw new Error('AI 返回内容不是有效 JSON');
    }
  }

  private recursiveSanitizeTemplates(value: any): any {
    if (typeof value === 'string') {
      // 移除反引号和首尾空格，这是 AI 最容易犯的错误
      return value.replace(/`/g, '').trim();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.recursiveSanitizeTemplates(item));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.recursiveSanitizeTemplates(val);
      }
      return result;
    }
    return value;
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

  private async fetchReferenceUrlExcerpt(referenceUrl: string): Promise<string> {
    const normalizedUrl = this.normalizeReferenceUrl(referenceUrl);
    const response = await axios.get<string>(normalizedUrl, {
      timeout: 30000,
      responseType: 'text',
      headers: {
        'User-Agent': 'ops-automation-ai-draft/1.0',
        Accept: 'text/html, text/plain, application/json;q=0.9, */*;q=0.8',
      },
    });

    const contentType = String(response.headers?.['content-type'] || '');
    const rawText = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data);
    const normalizedText = contentType.includes('html')
      ? this.stripHtmlToText(rawText)
      : rawText;

    return normalizedText.replace(/\s+/g, ' ').trim().slice(0, 12000);
  }

  private normalizeReferenceUrl(value: string): string {
    let url: URL;
    try {
      url = new URL(String(value || '').trim());
    } catch {
      throw new BadRequestException('参考 URL 格式无效');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException('参考 URL 只支持 http 或 https');
    }

    const hostname = url.hostname.toLowerCase();
    const isPrivateIpv4 = /^10\.|^127\.|^192\.168\.|^169\.254\./.test(hostname)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
    if (
      hostname === 'localhost'
      || hostname === '0.0.0.0'
      || hostname === '::1'
      || hostname.endsWith('.local')
      || isPrivateIpv4
    ) {
      throw new BadRequestException('参考 URL 不允许访问本地或内网地址');
    }

    return url.toString();
  }

  private stripHtmlToText(value: string): string {
    return String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }

  private normalizeDraftInputParams(
    inputParams?: Record<string, WorkflowInputParamDefinition>,
    steps?: WorkflowStep[],
    referenceUrl = '',
  ): WorkflowDsl['inputParams'] {
    const mergedInputParams = this.mergeDraftInputParamsWithStepPlaceholders(inputParams, steps, referenceUrl);
    const entries = Object.entries(mergedInputParams || {}).filter(([key]) => String(key || '').trim());
    if (!entries.length) {
      return undefined;
    }
    return entries.reduce<Record<string, WorkflowInputParamDefinition>>((acc, [key, value]) => {
      const normalizedKey = String(key).trim();
      const defaultValue = value?.defaultValue ?? '';
      const description = this.pickFirstNonEmptyString(value?.description) || this.buildDefaultDraftInputDescription(normalizedKey);
      const exampleValue = value?.exampleValue !== undefined
        ? value.exampleValue
        : this.buildGenericAiDraftSampleValue(normalizedKey, description, referenceUrl);
      acc[String(key).trim()] = {
        description,
        required: value?.required === undefined ? !String(defaultValue).trim() : value.required !== false,
        defaultValue,
        source: value?.source,
        type: value?.type || this.inferWorkflowInputParamType(normalizedKey, description, defaultValue, exampleValue),
        exampleValue,
      };
      return acc;
    }, {});
  }

  private mergeDraftInputParamsWithStepPlaceholders(
    inputParams?: Record<string, WorkflowInputParamDefinition>,
    steps?: WorkflowStep[],
    referenceUrl = '',
  ): Record<string, WorkflowInputParamDefinition> {
    const merged: Record<string, WorkflowInputParamDefinition> = {};
    const referenceSamples = steps
      ? this.extractAiDraftSampleValuesFromReferenceUrl(referenceUrl, steps)
      : {};

    Object.entries(inputParams || {}).forEach(([rawKey, value]) => {
      const key = String(rawKey || '').trim();
      if (!key) {
        return;
      }
      merged[key] = {
        description: this.pickFirstNonEmptyString(value?.description),
        required: value?.required,
        defaultValue: value?.defaultValue ?? '',
        source: value?.source || 'declared',
        type: value?.type,
        exampleValue: value?.exampleValue,
      };
    });

    this.collectWorkflowInputPlaceholdersFromSteps(steps).forEach((key) => {
      const inferredDescription = this.buildDefaultDraftInputDescription(key);
      const referenceExample = referenceSamples[key];
      if (!merged[key]) {
        merged[key] = {
          description: inferredDescription,
          required: true,
          defaultValue: '',
          source: referenceExample !== undefined ? 'inferred_from_reference_url' : 'inferred_from_template',
          type: this.inferWorkflowInputParamType(key, inferredDescription, '', referenceExample),
          exampleValue: referenceExample !== undefined
            ? referenceExample
            : this.buildGenericAiDraftSampleValue(key, inferredDescription, referenceUrl),
        };
        return;
      }
      merged[key] = {
        ...merged[key],
        source: merged[key].source && merged[key].source !== 'declared' ? merged[key].source : 'merged',
        exampleValue: merged[key].exampleValue !== undefined
          ? merged[key].exampleValue
          : (referenceExample !== undefined ? referenceExample : this.buildGenericAiDraftSampleValue(key, inferredDescription, referenceUrl)),
      };
    });

    return merged;
  }

  private collectWorkflowInputPlaceholdersFromSteps(steps?: WorkflowStep[]): Set<string> {
    const placeholders = new Set<string>();
    for (const step of steps || []) {
      if (!step || step.type !== 'activity') {
        continue;
      }
      const activityRef = this.pickFirstNonEmptyString(step.activityRef);
      const stepInput = step.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? step.input as Record<string, any>
        : {};

      if (activityRef === 'builtin:httpRequest') {
        this.collectTemplateVariables(stepInput[HTTP_REQUEST_STEP_CONFIG_KEY], placeholders);
        continue;
      }

      if (activityRef === 'builtin:structuredTransform' || activityRef === 'builtin:aiStructuredTransform') {
        const structuredConfig = stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] && typeof stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] === 'object' && !Array.isArray(stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY])
          ? stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] as Record<string, any>
          : {};
        this.collectTemplateVariables(structuredConfig, placeholders);
        const internalStructuredKeys = new Set<string>([
          'content',
          'context',
          'httpResult',
          'httpBody',
          ...Object.keys(
            structuredConfig.fieldMappings && typeof structuredConfig.fieldMappings === 'object' && !Array.isArray(structuredConfig.fieldMappings)
              ? structuredConfig.fieldMappings
              : {},
          ),
          ...Object.keys(
            structuredConfig.outputSchema && typeof structuredConfig.outputSchema === 'object' && !Array.isArray(structuredConfig.outputSchema)
              ? structuredConfig.outputSchema
              : {},
          ),
        ]);
        internalStructuredKeys.forEach((key) => placeholders.delete(key));
        continue;
      }

      Object.entries(stepInput).forEach(([key, value]) => {
        if (key === STRUCTURED_TRANSFORM_STEP_CONFIG_KEY || key === HTTP_REQUEST_STEP_CONFIG_KEY) {
          return;
        }
        this.collectTemplateVariables(value, placeholders);
      });
    }

    return new Set(
      Array.from(placeholders).filter((key) => this.isValidTemplateToken(key)),
    );
  }

  private buildDefaultDraftInputDescription(key: string): string {
    const normalized = String(key || '').trim();
    if (!normalized) {
      return '工作流输入参数';
    }
    return `${normalized} 参数`;
  }

  private isValidTemplateToken(key: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(key || '').trim());
  }

  private inferWorkflowInputParamType(
    key: string,
    description?: string,
    defaultValue?: unknown,
    exampleValue?: unknown,
  ): WorkflowInputParamType {
    const candidates = [defaultValue, exampleValue];
    if (candidates.some((value) => typeof value === 'boolean')) {
      return 'boolean';
    }
    if (candidates.some((value) => typeof value === 'number')) {
      return 'number';
    }
    const text = [key, description, defaultValue, exampleValue]
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value))
      .join(' ')
      .toLowerCase();
    if (/(bool|boolean|启用|是否|enable|disabled?)/i.test(text)) {
      return 'boolean';
    }
    if (/(date|day|time|datetime|日期|时间)/i.test(text)) {
      return 'date';
    }
    if (/(number|int|float|double|decimal|count|size|limit|page|offset|age|数量|页码|大小|编号|temperature|temp|speed|pressure)/i.test(text)) {
      return 'number';
    }
    return 'string';
  }

  private normalizeDraftOutputParams(
    outputParams?: Record<string, { description?: string; sourceStep?: string }>,
  ): WorkflowDsl['outputParams'] {
    const entries = Object.entries(outputParams || {}).filter(([key]) => String(key || '').trim());
    if (!entries.length) {
      return {
        result: {
          description: '工作流输出结果',
          sourceStep: 'step_1',
        },
      };
    }
    return entries.reduce<Record<string, { description?: string; sourceStep?: string }>>((acc, [key, value]) => {
      acc[String(key).trim()] = {
        description: this.pickFirstNonEmptyString(value?.description) || '',
        sourceStep: this.pickFirstNonEmptyString(value?.sourceStep) || 'step_1',
      };
      return acc;
    }, {});
  }

  private async resolveFallbackUserId(): Promise<string> {
    const firstUser = await this.prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!firstUser?.id) {
      throw new BadRequestException('当前没有可用用户，无法创建草稿会话');
    }
    return firstUser.id;
  }

  private extractLatestDraftFromMessages(messages: ChatMessage[]): AiWorkflowDraft | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const metadata = this.parseJson<Record<string, unknown>>(messages[index]?.metadata) || {};
      const draft = this.parseJson<AiWorkflowDraft>(metadata.draft);
      if (draft?.workflowDsl && draft?.activityDsl) {
        return draft;
      }
    }
    return null;
  }

  private mapChatSessionToAiDraftSession(
    session: ChatSession & { messages: ChatMessage[] },
  ): AiWorkflowDraftSession {
    return {
      sessionId: session.id,
      title: session.title || undefined,
      status: session.status,
      messages: (session.messages || []).map((message) => {
        const metadata = this.parseJson<Record<string, unknown>>(message.metadata) || {};
        const draft = this.parseJson<AiWorkflowDraft>(metadata.draft);
        return {
          id: message.id,
          role: (message.role as 'user' | 'assistant' | 'system') || 'assistant',
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          draft: draft?.workflowDsl && draft?.activityDsl ? draft : undefined,
        };
      }),
      currentDraft: this.extractLatestDraftFromMessages(session.messages),
    };
  }

  private normalizeWorkflowClassName(candidate: string | undefined, workflowName: string): string {
    const normalized = String(candidate || '').trim();
    if (normalized && /^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
      return normalized.endsWith('Workflow') ? normalized : `${normalized}Workflow`;
    }
    const fallback = String(workflowName || 'GeneratedWorkflow')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return (fallback || 'Generated') + 'Workflow';
  }

  private toWorkflowDto(workflow: TemporalWorkflow): TemporalWorkflowDTO {
    const workflowDsl = this.parseJson<WorkflowDsl>(workflow.workflowDsl) || DEFAULT_TEMPLATE_WORKFLOW_DSL;
    const activityDsl = this.parseJson<ActivityDsl>(workflow.activityDsl) || { activities: [] };
    return {
      ...workflow,
      workflowDsl: workflowDsl as any,
      activityDsl: activityDsl as any,
      sourceTemplate: this.extractSourceTemplate(workflowDsl, activityDsl),
      sourceContext: this.extractSourceContext(workflowDsl, activityDsl),
    };
  }

  private extractSourceContext(
    workflowDsl: WorkflowDsl | Record<string, unknown> | null | undefined,
    activityDsl: ActivityDsl | Record<string, unknown> | null | undefined,
  ): TemporalWorkflowSourceContext | null {
    const workflowRecord = workflowDsl && typeof workflowDsl === 'object'
      ? workflowDsl as Record<string, unknown>
      : {};
    const declaredSourceContext = this.parseJson<Record<string, unknown>>(workflowRecord.sourceContext) || {};
    const sourceTemplate = this.extractSourceTemplate(workflowDsl, activityDsl);
    const sourceType = this.pickFirstNonEmptyString(
      declaredSourceContext.sourceType,
      sourceTemplate ? 'template' : undefined,
    ) as TemporalWorkflowSourceContext['sourceType'];
    const warnings = Array.isArray(declaredSourceContext.warnings)
      ? declaredSourceContext.warnings.filter((item): item is string => typeof item === 'string' && !!item.trim())
      : [];

    if (!sourceType && !sourceTemplate && !declaredSourceContext.referenceUrl && !declaredSourceContext.userDescription && warnings.length === 0) {
      return null;
    }

    return {
      sourceType: sourceType || (sourceTemplate ? 'template' : undefined),
      referenceUrl: this.pickFirstNonEmptyString(declaredSourceContext.referenceUrl),
      userDescription: this.pickFirstNonEmptyString(declaredSourceContext.userDescription),
      generatedAt: this.pickFirstNonEmptyString(declaredSourceContext.generatedAt),
      warnings,
      sourceTemplate,
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
    const workflowLevelSourceContext = this.parseJson<Record<string, unknown>>(workflowRecord.sourceContext) || {};
    const workflowLevelSourceTemplate = this.parseJson<Record<string, unknown>>(workflowLevelSourceContext.sourceTemplate) || {};

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
        workflowLevelSourceTemplate?.templateId,
        carboneStep?.config?.templateId,
        carboneActivity?.config?.templateId,
      ),
      skillId: this.pickFirstNonEmptyString(
        workflowLevelSource?.skillId,
        workflowLevelSourceTemplate?.skillId,
        carboneActivity?.config?.skillId,
      ),
      fileName: this.pickFirstNonEmptyString(
        workflowLevelSource?.fileName,
        workflowLevelSourceTemplate?.fileName,
        carboneActivity?.config?.fileName,
      ),
      format: this.pickFirstNonEmptyString(
        workflowLevelSource?.format,
        workflowLevelSourceTemplate?.format,
        carboneStep?.config?.format,
        carboneActivity?.config?.format,
      ),
      variableCount: this.pickFirstPositiveNumber(
        workflowLevelSource?.variableCount,
        workflowLevelSourceTemplate?.variableCount,
        carboneActivity?.config?.variableCount,
        Object.keys(this.parseJson<Record<string, unknown>>(workflowRecord.inputParams) || {}).length,
      ),
    };

    if (!sourceTemplate.templateId && !sourceTemplate.skillId && !sourceTemplate.fileName) {
      return null;
    }

    return sourceTemplate;
  }

  private async normalizeWorkflowDsl(
    workflowDsl: WorkflowDsl,
    workflowName?: string,
    taskQueue?: string,
    activityDsl?: ActivityDsl,
  ): Promise<WorkflowDsl> {
    const normalized = this.sanitizeJsonValue(workflowDsl) as WorkflowDsl;
    const normalizedSteps = await Promise.all(
      (normalized.steps || []).map((step) => this.normalizeWorkflowStep(step, activityDsl)),
    );
    return {
      ...normalized,
      name: this.normalizeName(workflowName || normalized.name || '未命名工作流'),
      taskQueue: this.normalizeTaskQueue(taskQueue || normalized.taskQueue),
      steps: normalizedSteps,
    };
  }

  private normalizeActivityDsl(activityDsl: ActivityDsl): ActivityDsl {
    return this.sanitizeJsonValue(activityDsl) as ActivityDsl;
  }

  private async normalizeWorkflowStep(
    step: WorkflowStep,
    activityDsl?: ActivityDsl,
  ): Promise<WorkflowStep> {
    if (!step || step.type !== 'activity') {
      return step;
    }

    const normalizedStep = this.sanitizeJsonValue(step) as WorkflowStep;
    const builtinFromRef = normalizedStep.activityRef
      ? this.builtinActivityRegistry.getByRef(normalizedStep.activityRef)
      : null;
    if (builtinFromRef) {
      return {
        ...normalizedStep,
        activityRef: builtinFromRef.ref,
        activityName: normalizedStep.activityName || builtinFromRef.name,
      };
    }

    if (normalizedStep.activityRef?.startsWith('custom:')) {
      const activityId = normalizedStep.activityRef.slice('custom:'.length).trim();
      const dbActivity = activityId
        ? await this.prisma.activity.findUnique({ where: { id: activityId } })
        : null;
      return {
        ...normalizedStep,
        activityRef: activityId ? `custom:${activityId}` : undefined,
        activityName: normalizedStep.activityName || dbActivity?.name || normalizedStep.activityName,
      };
    }

    const legacyIdentifier = String(normalizedStep.activityName || '').trim();
    const builtinFromLegacy = this.builtinActivityRegistry.findByLegacyIdentifier(legacyIdentifier);
    if (builtinFromLegacy) {
      return {
        ...normalizedStep,
        activityRef: builtinFromLegacy.ref,
        activityName: normalizedStep.activityName || builtinFromLegacy.name,
      };
    }

    const activityFromDsl = (activityDsl?.activities || []).find((activity) =>
      activity.name === legacyIdentifier || activity.fn === legacyIdentifier,
    );
    if (activityFromDsl) {
      const builtinFromDsl = this.builtinActivityRegistry.getByFn(activityFromDsl.fn)
        || this.builtinActivityRegistry.findByLegacyIdentifier(activityFromDsl.name);
      if (builtinFromDsl) {
        return {
          ...normalizedStep,
          activityRef: builtinFromDsl.ref,
          activityName: normalizedStep.activityName || activityFromDsl.name || builtinFromDsl.name,
        };
      }
      const dbActivity = await this.prisma.activity.findUnique({
        where: { name: activityFromDsl.name },
      }).catch(() => null);
      if (dbActivity) {
        return {
          ...normalizedStep,
          activityRef: `custom:${dbActivity.id}`,
          activityName: normalizedStep.activityName || dbActivity.name,
        };
      }
    }

    if (!legacyIdentifier) {
      return normalizedStep;
    }

    const dbActivity = await this.prisma.activity.findUnique({
      where: { name: legacyIdentifier },
    }).catch(() => null);
    if (dbActivity) {
      return {
        ...normalizedStep,
        activityRef: `custom:${dbActivity.id}`,
        activityName: normalizedStep.activityName || dbActivity.name,
      };
    }

    return normalizedStep;
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

  private renderHttpTemplateValue(value: unknown, params: Record<string, any>): unknown {
    if (typeof value === 'string') {
      return value.replace(/\{([^{}]+)\}/g, (_match, key) => {
        const resolved = params?.[String(key).trim()];
        return resolved === undefined || resolved === null ? '' : String(resolved);
      });
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.renderHttpTemplateValue(item, params));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          this.renderHttpTemplateValue(item, params),
        ]),
      );
    }
    return value;
  }

  private pruneHttpTemplateValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.pruneHttpTemplateValue(item))
        .filter((item) => ![undefined, null, '', '{}', '[]'].includes(
          typeof item === 'string' ? item : JSON.stringify(item),
        ));
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
        const nextValue = this.pruneHttpTemplateValue(item);
        if (nextValue === undefined || nextValue === null) {
          return acc;
        }
        if (typeof nextValue === 'string' && !nextValue.trim()) {
          return acc;
        }
        if (typeof nextValue === 'object' && JSON.stringify(nextValue) === '{}') {
          return acc;
        }
        if (Array.isArray(nextValue) && nextValue.length === 0) {
          return acc;
        }
        acc[key] = nextValue;
        return acc;
      }, {});
    }
    return value;
  }

  private collectResponseLeafPaths(
    value: unknown,
    prefix = '',
    depth = 0,
    acc: Array<{ path: string; value: unknown }> = [],
  ): Array<{ path: string; value: unknown }> {
    if (depth > 6) {
      return acc;
    }
    if (Array.isArray(value)) {
      value.slice(0, 8).forEach((item, index) => {
        const nextPath = prefix ? `${prefix}.${index}` : String(index);
        this.collectResponseLeafPaths(item, nextPath, depth + 1, acc);
      });
      return acc;
    }
    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).slice(0, 24).forEach(([key, item]) => {
        const nextPath = prefix ? `${prefix}.${key}` : key;
        this.collectResponseLeafPaths(item, nextPath, depth + 1, acc);
      });
      return acc;
    }
    if (prefix) {
      acc.push({ path: prefix, value });
    }
    return acc;
  }

  private buildHttpRequestPreviewInput(
    config: Record<string, any>,
    inputParams: Record<string, any>,
  ): Record<string, any> {
    const renderedHeaders = this.pruneHttpTemplateValue(
      this.renderHttpTemplateValue(config.headersTemplate || {}, inputParams),
    );
    const normalizedHeaders = renderedHeaders && typeof renderedHeaders === 'object'
      ? { ...(renderedHeaders as Record<string, any>) }
      : {};
    if (!Object.keys(normalizedHeaders).some((key) => key.toLowerCase() === 'user-agent')) {
      normalizedHeaders['User-Agent'] = 'ops-automation-httpRequest-preview/1.0';
    }
    if (!Object.keys(normalizedHeaders).some((key) => key.toLowerCase() === 'accept')) {
      normalizedHeaders.Accept = 'application/json, text/plain, */*';
    }
    const renderedQuery = this.pruneHttpTemplateValue(
      this.renderHttpTemplateValue(config.queryTemplate || {}, inputParams),
    );
    const renderedJson = this.pruneHttpTemplateValue(
      this.renderHttpTemplateValue(config.jsonTemplate || {}, inputParams),
    );
    const renderedData = this.pruneHttpTemplateValue(
      this.renderHttpTemplateValue(config.dataTemplate || {}, inputParams),
    );

    const requestInput: Record<string, any> = {
      method: String(config.method || 'GET').toUpperCase(),
      url: String(this.renderHttpTemplateValue(config.urlTemplate || '', inputParams) || '').trim(),
      headers: normalizedHeaders,
      params: renderedQuery && typeof renderedQuery === 'object' ? renderedQuery : {},
      timeout: Number(config.timeout || 30),
    };
    if (renderedJson && typeof renderedJson === 'object' && Object.keys(renderedJson as Record<string, unknown>).length > 0) {
      requestInput.json = renderedJson;
    }
    if (
      renderedData !== undefined
      && renderedData !== null
      && (
        typeof renderedData !== 'object'
        || Object.keys(renderedData as Record<string, unknown>).length > 0
      )
    ) {
      requestInput.data = renderedData;
    }
    return requestInput;
  }

  private async executeHttpPreviewRequest(requestInput: Record<string, any>): Promise<Record<string, any>> {
    const method = String(requestInput.method || 'GET').toUpperCase();
    const url = String(requestInput.url || '').trim();
    if (!url) {
      throw new Error('URL 模板渲染后为空，无法发起预览请求');
    }

    const executeOnce = async (targetUrl: string) => {
      const response = await axios.request({
        url: targetUrl,
        method: method as any,
        headers: requestInput.headers || {},
        params: requestInput.params || {},
        data: requestInput.json !== undefined ? requestInput.json : requestInput.data,
        timeout: Number(requestInput.timeout || 30) * 1000,
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data).slice(0, 400)}`);
      }
      return response;
    };

    try {
      const response = await executeOnce(url);
      return {
        method,
        url,
        statusCode: response.status,
        headers: response.headers || {},
        body: response.data,
        text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      };
    } catch (error: any) {
      const shouldFallbackToHttp = url.startsWith('https://')
        && /SSL|EPROTO|certificate|EOF/i.test(String(error?.message || ''));
      if (!shouldFallbackToHttp) {
        throw error;
      }
      const fallbackUrl = `http://${url.slice('https://'.length)}`;
      const response = await executeOnce(fallbackUrl);
      return {
        method,
        url: fallbackUrl,
        statusCode: response.status,
        headers: response.headers || {},
        body: response.data,
        text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      };
    }
  }

  private async requestAiOptimizedHttpConfig(
    config: Record<string, any>,
    resolvedRequest: Record<string, any>,
    previewResponse: Record<string, any>,
    userGoal: string,
  ): Promise<Record<string, any>> {
    const aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ai-orchestrator:3007';
    const responseBody = previewResponse.body ?? previewResponse;
    const responsePreview = JSON.stringify(responseBody, null, 2).slice(0, 20000);
    const responseLeafPaths = this.collectResponseLeafPaths(responseBody)
      .slice(0, 80)
      .map(({ path, value }) => `${path} = ${JSON.stringify(value)}`)
      .join('\n');
    const prompt = [
      '你是一个 HTTP API 配置优化助手，需要根据现有 httpRequest 配置、实际请求样本、真实响应结果，以及用户的自然语言目标，输出一个更合适的配置 JSON。',
      '目标是优化 Temporal Workflow 里的 httpRequest 步骤配置。',
      '',
      '要求：',
      '1. 只返回 JSON 对象，不要输出 Markdown。',
      '2. 仅允许输出字段：method, urlTemplate, queryTemplate, headersTemplate, jsonTemplate, dataTemplate, timeout, responseMode, responseBodyPath, responseFieldMappings, reason。',
      '3. 如果现有请求构造已经合理，不要随意改 method/urlTemplate/queryTemplate/jsonTemplate/dataTemplate。',
      '4. 如果用户目标只需要一个字段，优先推荐 responseMode=bodyPath，并填写 responseBodyPath。',
      '5. 如果用户目标需要多个字段，优先推荐 responseMode=bodyMap，并填写 responseFieldMappings。',
      '6. responseBodyPath 和 responseFieldMappings 的路径都必须相对于 body，不能带 body 前缀。',
      '7. responseFieldMappings 的 key 应该是简洁、业务化、稳定的英文或 camelCase 字段名，value 是响应体叶子路径。',
      '8. 只有在响应结构无法稳定映射时，才退回 responseMode=body 或 full，并在 reason 中说明。',
      '',
      `用户目标: ${userGoal}`,
      `当前步骤配置: ${JSON.stringify(config, null, 2)}`,
      `实际请求样本: ${JSON.stringify(resolvedRequest, null, 2)}`,
      `真实响应 body 样本: ${responsePreview}`,
      `可选叶子路径参考:\n${responseLeafPaths || '(无可用叶子路径)'}`,
    ].join('\n');

    const aiResponse = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
      modelId: 'default',
      prompt,
    }, { timeout: 180000 });

    return this.parseJsonFromAiContent(aiResponse.data?.result || '');
  }

  private mergeHttpConfigWithAiResult(
    baseConfig: Record<string, any>,
    aiResult: Record<string, any>,
  ): Record<string, any> {
    const nextConfig = {
      ...baseConfig,
      ...this.sanitizeJsonValue(aiResult || {}),
    };
    if (!['body', 'full', 'bodyPath', 'bodyMap'].includes(String(nextConfig.responseMode || 'body'))) {
      nextConfig.responseMode = baseConfig.responseMode || 'body';
    }
    if (typeof nextConfig.responseBodyPath === 'string') {
      nextConfig.responseBodyPath = nextConfig.responseBodyPath.replace(/^body\./, '');
    }
    const normalizedFieldMappings = Object.fromEntries(
      Object.entries((nextConfig.responseFieldMappings && typeof nextConfig.responseFieldMappings === 'object' && !Array.isArray(nextConfig.responseFieldMappings))
        ? nextConfig.responseFieldMappings
        : {})
        .map(([key, value]) => [
          String(key || '').trim(),
          String(value || '').trim().replace(/^body\./, ''),
        ])
        .filter(([key, value]) => key && value),
    );
    nextConfig.responseFieldMappings = normalizedFieldMappings;
    if (nextConfig.responseMode === 'bodyMap') {
      nextConfig.responseBodyPath = '';
      if (Object.keys(normalizedFieldMappings).length === 0) {
        nextConfig.responseMode = Object.keys(baseConfig.responseFieldMappings || {}).length > 0
          ? 'bodyMap'
          : (baseConfig.responseMode || 'body');
        nextConfig.responseFieldMappings = Object.keys(baseConfig.responseFieldMappings || {}).length > 0
          ? { ...(baseConfig.responseFieldMappings || {}) }
          : {};
      }
    } else {
      nextConfig.responseFieldMappings = {};
    }
    if (nextConfig.responseMode === 'bodyPath') {
      nextConfig.responseFieldMappings = {};
    }
    delete nextConfig.reason;
    return nextConfig;
  }

  async generateStructuredTransformConfig(
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>,
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    explanation?: string;
    error?: string;
  }> {
    const userGoal = String(userRequest || '').trim();
    if (!userGoal) {
      return { success: false, error: '请先输入希望 AI 生成的结构化转换目标描述' };
    }
    try {
      const aiResult = await this.requestAiStructuredTransformConfig(
        typeof existingConfig === 'object' && existingConfig ? this.normalizeStructuredTransformConfig(existingConfig) : {},
        sourceSample,
        userGoal,
      );
      const normalized = this.normalizeStructuredTransformConfig(aiResult || {});
      return {
        success: true,
        config: normalized,
        explanation: typeof aiResult?.reason === 'string' ? aiResult.reason : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Generate structuredTransform config failed: ${error.message}`);
      return { success: false, error: error.message || 'AI 生成结构化配置失败' };
    }
  }

  private async generateAiStructuredTransformDraftConfig(
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>,
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    sampleOutput?: unknown;
    explanation?: string;
    error?: string;
  }> {
    const userGoal = String(userRequest || '').trim();
    if (!userGoal) {
      return { success: false, error: '请先输入希望 AI 生成的 AI 转换目标描述' };
    }
    try {
      const aiResult = await this.requestAiStructuredTransformDraftConfig(
        typeof existingConfig === 'object' && existingConfig ? this.normalizeStructuredTransformConfig(existingConfig) : {},
        sourceSample,
        userGoal,
      );
      const normalized = this.normalizeStructuredTransformConfig(aiResult || {});
      return {
        success: true,
        config: normalized,
        sampleOutput: this.sanitizeJsonValue(aiResult?.sampleOutput),
        explanation: typeof aiResult?.reason === 'string' ? aiResult.reason : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Generate aiStructuredTransform draft config failed: ${error.message}`);
      return { success: false, error: error.message || 'AI 生成 AI 转换配置失败' };
    }
  }

  private async requestAiStructuredTransformDraftConfig(
    baseConfig: Record<string, any>,
    sourceSample: Record<string, any> | string,
    userGoal: string,
  ): Promise<Record<string, any>> {
    const aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ai-orchestrator:3007';
    const body = typeof sourceSample === 'string' ? sourceSample : JSON.stringify(sourceSample, null, 2);
    const leafPaths = typeof sourceSample === 'object'
      ? this.collectResponseLeafPaths(sourceSample as Record<string, any>).slice(0, 80).map(({ path, value }) => `${path} = ${JSON.stringify(value)}`).join('\n')
      : '';
    const prompt = [
      '你是一个 AI 结构化转换步骤配置助手，需要根据真实样本内容和用户目标，输出 builtin:aiStructuredTransform 的配置 JSON。',
      '目标是为 Temporal Workflow 草稿生成更合理的 AI 转换配置，并给出一个样本输出，供下游步骤继续观察与推导。',
      '',
      '要求：',
      '1. 只返回一个 JSON 对象，不要输出 Markdown。',
      '2. 仅允许输出字段：contentType, contentTemplate, instructionTemplate, outputMode, outputSchema, contextTemplate, sampleOutput, reason。',
      '3. contentType 只能是 text/html/json 之一；当样本是 JSON 时，请输出 json。',
      '4. contentTemplate 默认返回 {content}，不要内联完整样本。',
      '5. instructionTemplate 必须非空，要求明确、可执行，描述 AI 该如何转换输入。',
      '6. outputMode 只能是 json 或 text；若用户目标是格式化文本，可返回 text。',
      '7. outputMode=json 时，outputSchema 必须为非空对象；outputMode=text 时，outputSchema 可为空对象。',
      '8. sampleOutput 必须是基于真实样本推导出的一个示例输出，供后续步骤配置参考；如果 outputMode=text，则 sampleOutput 必须是字符串。',
      '9. 不要输出 fieldMappings 或 textTemplate，这一步是 AI 转换，不是固定规则转换。',
      '',
      `用户目标: ${userGoal}`,
      `当前配置: ${JSON.stringify(baseConfig, null, 2)}`,
      `真实样本: ${body.slice(0, 20000)}`,
      `可选叶子路径参考:\n${leafPaths || '(无可用叶子路径)'}`,
    ].join('\n');
    const aiResponse = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
      modelId: 'default',
      prompt,
    }, { timeout: 180000 });
    return this.parseJsonFromAiContent(aiResponse.data?.result || '');
  }

  private async requestAiStructuredTransformConfig(
    baseConfig: Record<string, any>,
    sourceSample: Record<string, any> | string,
    userGoal: string,
  ): Promise<Record<string, any>> {
    const aiOrchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://ai-orchestrator:3007';
    const body = typeof sourceSample === 'string' ? sourceSample : JSON.stringify(sourceSample, null, 2);
    const leafPaths = typeof sourceSample === 'object'
      ? this.collectResponseLeafPaths(sourceSample as Record<string, any>).slice(0, 80).map(({ path, value }) => `${path} = ${JSON.stringify(value)}`).join('\n')
      : '';
    const prompt = [
      '你是一个固定规则结构化转换配置助手，需要根据真实样本内容和用户目标，输出 builtin:structuredTransform（固定规则版）步骤的配置 JSON。',
      '目标是帮助 Temporal Workflow 生成稳定、可审计、默认不依赖 AI 的结构化转换配置。',
      '',
      '要求：',
      '1. 只返回一个 JSON 对象，不要输出 Markdown。',
      '2. 仅允许输出字段：contentType, contentTemplate, instructionTemplate, outputMode, outputSchema, contextTemplate, fieldMappings, textTemplate, reason。',
      '3. contentType 只能是 text/html/json 之一；当样本是 JSON 时，请输出 json。',
      '4. 默认优先输出固定规则：JSON 结构优先使用 fieldMappings，文本格式优先使用 textTemplate。',
      '5. instructionTemplate 仅作为说明性规则摘要，可为空；不要把 AI 提示词当作唯一执行逻辑。',
      '6. outputMode 缺省为 json；若用户目标是格式化纯文本，可返回 text。',
      '7. outputSchema 必须是对象，key 为输出字段名，value 为字段含义或类型提示（如 string/number/array.object 等）。',
      '8. fieldMappings 必须是对象，key 为输出字段名，value 为来源路径、已有字段名或模板变量名。',
      '9. textTemplate 必须是模板字符串，使用 {fieldName} 引用 fieldMappings 或输入内容中的字段；如果 outputMode=text，优先生成 textTemplate。',
      '10. 不要在 contentTemplate 中内联样本全文，请使用占位符；默认必须返回 {content}，不要返回 json/html/text 这类字面量。',
      '11. 不要输出 builtin:aiStructuredTransform 配置，不要把 AI 理解逻辑写进本配置对象。',
      '',
      `用户目标: ${userGoal}`,
      `当前配置: ${JSON.stringify(baseConfig, null, 2)}`,
      `真实样本: ${body.slice(0, 20000)}`,
      `可选叶子路径参考:\n${leafPaths || '(无可用叶子路径)'}`,
    ].join('\n');
    const aiResponse = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
      modelId: 'default',
      prompt,
    }, { timeout: 180000 });
    return this.parseJsonFromAiContent(aiResponse.data?.result || '');
  }

  private normalizeHttpRequestConfig(
    stepConfig: Record<string, any>,
    declaredInputKeys: Set<string> = new Set<string>(),
  ): Record<string, any> {
    void declaredInputKeys;
    const normalizedConfig = this.sanitizeJsonValue(stepConfig || {}) as Record<string, any>;
    const sanitizeTemplateString = (value: unknown): string => String(value || '')
      .trim()
      .replace(/^`+/, '')
      .replace(/`+$/, '')
      .replace(/`/g, '')
      .trim();
    const sanitizeTemplateRecord = (value: unknown): Record<string, any> => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          sanitizeTemplateString(key),
          typeof item === 'string' ? sanitizeTemplateString(item) : item,
        ]),
      );
    };

    const baseConfig = {
      method: String(normalizedConfig.method || 'GET').toUpperCase(),
      urlTemplate: sanitizeTemplateString(normalizedConfig.urlTemplate),
      queryTemplate: sanitizeTemplateRecord(normalizedConfig.queryTemplate),
      headersTemplate: sanitizeTemplateRecord(normalizedConfig.headersTemplate),
      jsonTemplate: sanitizeTemplateRecord(normalizedConfig.jsonTemplate),
      dataTemplate: sanitizeTemplateRecord(normalizedConfig.dataTemplate),
      timeout: Number(normalizedConfig.timeout || 30),
      responseMode: String(normalizedConfig.responseMode || 'body'),
      responseBodyPath: String(normalizedConfig.responseBodyPath || ''),
      responseFieldMappings: sanitizeTemplateRecord(normalizedConfig.responseFieldMappings),
    };

    if (!baseConfig.urlTemplate) {
      throw new Error('请先填写 URL 模板');
    }
    return baseConfig;
  }

  private normalizeStructuredTransformConfig(
    stepConfig: Record<string, any>,
    declaredInputKeys: Set<string> = new Set<string>(),
  ): Record<string, any> {
    void declaredInputKeys;
    const normalizedConfig = this.sanitizeJsonValue(stepConfig || {}) as Record<string, any>;
    const sanitizeTemplateString = (value: unknown): string => {
      const rawValue = typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value || '');
      return rawValue
        .trim()
        .replace(/^`+/, '')
        .replace(/`+$/, '')
        .replace(/`/g, '')
        .trim();
    };
    const sanitizeTemplateRecord = (value: unknown): Record<string, any> => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          sanitizeTemplateString(key),
          typeof item === 'string' ? sanitizeTemplateString(item) : item,
        ]),
      );
    };

    const normalizedContentTemplate = sanitizeTemplateString(normalizedConfig.contentTemplate);
    const hasTemplatePlaceholder = /\{[^{}]+\}/.test(normalizedContentTemplate);

    return {
      contentType: String(normalizedConfig.contentType || 'text').toLowerCase(),
      contentTemplate: hasTemplatePlaceholder ? normalizedContentTemplate : '{content}',
      instructionTemplate: sanitizeTemplateString(normalizedConfig.instructionTemplate || normalizedConfig.instruction),
      outputMode: String(normalizedConfig.outputMode || 'json').toLowerCase(),
      outputSchema: normalizedConfig.outputSchema && typeof normalizedConfig.outputSchema === 'object' && !Array.isArray(normalizedConfig.outputSchema)
        ? normalizedConfig.outputSchema
        : {},
      contextTemplate: sanitizeTemplateString(normalizedConfig.contextTemplate || normalizedConfig.context),
      fieldMappings: sanitizeTemplateRecord(normalizedConfig.fieldMappings),
      textTemplate: sanitizeTemplateString(normalizedConfig.textTemplate),
    };
  }

  private assertHttpRequestPreviewInputs(
    baseConfig: Record<string, any>,
    inputParams: Record<string, any>,
  ): void {
    const requiredInputKeys = Array.from(this.collectTemplateVariables(baseConfig));
    const missingInputKeys = requiredInputKeys.filter((key) => String(inputParams?.[key] ?? '').trim() === '');
    if (missingInputKeys.length > 0) {
      throw new Error(`请先为这些输入参数提供示例值后再进行 AI 优化: ${missingInputKeys.join('、')}`);
    }
  }

  private toPythonLiteral(value: unknown, indent = 0): string {
    const nextIndent = indent + 4;
    const currentPadding = ' '.repeat(indent);
    const nextPadding = ' '.repeat(nextIndent);

    if (value === null || value === undefined) {
      return 'None';
    }
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : 'None';
    }
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return '[]';
      }
      return `[\n${value.map((item) => `${nextPadding}${this.toPythonLiteral(item, nextIndent)}`).join(',\n')}\n${currentPadding}]`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        return '{}';
      }
      return `{\n${entries.map(([key, item]) => `${nextPadding}${JSON.stringify(key)}: ${this.toPythonLiteral(item, nextIndent)}`).join(',\n')}\n${currentPadding}}`;
    }
    return JSON.stringify(String(value));
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
