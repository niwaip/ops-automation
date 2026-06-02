import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TemporalWorkflowAiDraftService,
} from './temporal-workflow-draft.service';
import {
  TemporalWorkflowBrowserDraftService,
} from './temporal-workflow-browser-draft.service';
import {
  TemporalWorkflowCodegenService,
} from './temporal-workflow-codegen.service';
import {
  TemporalWorkflowSessionService,
} from './temporal-workflow-session.service';
import {
  TemporalWorkflowValidationService,
} from './temporal-workflow-validation.service';
import { TemporalWorkflowConfigService } from './temporal-workflow-config.service';
import { TemporalWorkflowNormalizationService } from './temporal-workflow-normalization.service';
import {
  TemporalWorkflowTemplateService,
} from './temporal-workflow-template.service';
import { toTemporalWorkflowDto } from './temporal-workflow-dto.helpers';
import { parseJson } from './temporal-workflow-service.utils';
import { TemporalWorkflowSupportService } from './temporal-workflow-support.service';
import {
  type ActivityDsl,
  type AiWorkflowDraft,
  type AiWorkflowDraftSession,
  type AiWorkflowDraftSessionListItem,
  type BrowserWorkflowDraft,
  type CompileTemplateWorkflowDraftDTO,
  type CreateTemporalWorkflowDTO,
  type GenerateAiWorkflowDraftDTO,
  type GenerateAiWorkflowDraftSessionDTO,
  type GenerateBrowserWorkflowDraftDTO,
  type RefineAiWorkflowDraftDTO,
  type RefineAiWorkflowDraftSessionDTO,
  type TemplateWorkflowDraft,
  type TemporalValidationResult,
  type TemporalWorkflowDTO,
  type UpdateTemporalWorkflowDTO,
  type WorkflowDsl,
} from './temporal-workflow.types';

export * from './temporal-workflow.types';

@Injectable()
export class TemporalWorkflowService {
  private readonly logger = new Logger(TemporalWorkflowService.name);

  constructor(
    private prisma: PrismaService,
    private readonly aiDraftService: TemporalWorkflowAiDraftService,
    private readonly browserDraftService: TemporalWorkflowBrowserDraftService,
    private readonly codegenService: TemporalWorkflowCodegenService,
    private readonly sessionService: TemporalWorkflowSessionService,
    private readonly validationService: TemporalWorkflowValidationService,
    private readonly workflowConfigService: TemporalWorkflowConfigService,
    private readonly workflowNormalizationService: TemporalWorkflowNormalizationService,
    private readonly workflowTemplateService: TemporalWorkflowTemplateService,
    private readonly workflowSupportService: TemporalWorkflowSupportService,
  ) {}

  async findAll(): Promise<TemporalWorkflowDTO[]> {
    const workflows = await this.prisma.temporalWorkflow.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return workflows.map((workflow) => toTemporalWorkflowDto(workflow));
  }

  async findOne(id: string): Promise<TemporalWorkflowDTO | null> {
    const workflow = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    return workflow ? toTemporalWorkflowDto(workflow) : null;
  }

  async create(data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> {
    try {
      const normalizedActivityDsl = this.workflowNormalizationService.normalizeActivityDsl(data.activityDsl);
      const normalizedWorkflowDsl = await this.workflowNormalizationService.normalizeWorkflowDsl(
        data.workflowDsl,
        data.name,
        data.taskQueue,
        normalizedActivityDsl,
      );
      const created = await this.prisma.temporalWorkflow.create({
        data: {
          name: this.workflowNormalizationService.normalizeName(data.name),
          description: this.workflowNormalizationService.normalizeDescription(data.description),
          taskQueue: this.workflowNormalizationService.normalizeTaskQueue(data.taskQueue || data.workflowDsl?.taskQueue),
          workflowDsl: normalizedWorkflowDsl as any,
          activityDsl: normalizedActivityDsl as any,
          generatedCode: data.generatedCode || null,
          isActive: true,
        },
      });
      return toTemporalWorkflowDto(created);
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
        : parseJson<WorkflowDsl>(existing.workflowDsl)?.taskQueue || existing.taskQueue;
      const normalizedActivityDsl = data.activityDsl
        ? this.workflowNormalizationService.normalizeActivityDsl(data.activityDsl)
        : parseJson<ActivityDsl>(existing.activityDsl) || { activities: [] };
      const normalizedWorkflowDsl = data.workflowDsl
        ? await this.workflowNormalizationService.normalizeWorkflowDsl(
            data.workflowDsl,
            nextName,
            nextTaskQueue,
            normalizedActivityDsl,
          )
        : undefined;
      const updated = await this.prisma.temporalWorkflow.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: this.workflowNormalizationService.normalizeName(data.name) }),
          ...(data.description !== undefined && { description: this.workflowNormalizationService.normalizeDescription(data.description) }),
          ...(data.taskQueue !== undefined && { taskQueue: this.workflowNormalizationService.normalizeTaskQueue(nextTaskQueue) }),
          ...(normalizedWorkflowDsl && { workflowDsl: normalizedWorkflowDsl as any }),
          ...(data.activityDsl && { activityDsl: normalizedActivityDsl as any }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.generatedCode !== undefined && { generatedCode: data.generatedCode || null }),
        },
      });
      return toTemporalWorkflowDto(updated);
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
    const existing = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    }

    const workflowDsl = parseJson<WorkflowDsl>(existing.workflowDsl);
    const activityDsl = parseJson<ActivityDsl>(existing.activityDsl);
    const deterministicCode = workflowDsl && activityDsl
      ? await this.workflowSupportService.createEnrichedActivityDsl(workflowDsl, activityDsl)
        .then((enrichedActivityDsl) => (
          this.workflowSupportService.buildDeterministicWorkflowCode(workflowDsl, enrichedActivityDsl)
        ))
        .catch(() => null)
      : null;

    const deployed = await this.prisma.temporalWorkflow.update({
      where: { id },
      data: {
        deployedAt: new Date(),
        ...(deterministicCode ? { generatedCode: deterministicCode } : {}),
      },
    });

    return toTemporalWorkflowDto(deployed);
  }

  async generateTemplateWorkflowDraft(templateId: string): Promise<TemplateWorkflowDraft> {
    return this.workflowTemplateService.generateTemplateWorkflowDraft(
      templateId,
      this.workflowSupportService.createTemplateSupport(),
    );
  }

  async compileTemplateWorkflowDraft(
    data: CompileTemplateWorkflowDraftDTO,
  ): Promise<TemplateWorkflowDraft> {
    return this.workflowTemplateService.compileTemplateWorkflowDraft(
      data,
      this.workflowSupportService.createTemplateSupport(),
    );
  }

  async generateBrowserWorkflowDraft(
    data: GenerateBrowserWorkflowDraftDTO,
  ): Promise<BrowserWorkflowDraft> {
    return this.browserDraftService.generateBrowserWorkflowDraft(
      data,
      this.workflowSupportService.createBrowserDraftSupport(),
    );
  }

  async generateAiWorkflowDraft(data: GenerateAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.aiDraftService.generateWorkflowDraft(data, this.workflowSupportService.createAiDraftSupport());
  }

  async refineAiWorkflowDraft(data: RefineAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.aiDraftService.refineWorkflowDraft(data, this.workflowSupportService.createAiDraftSupport());
  }

  async createAiDraftSession(
    data: GenerateAiWorkflowDraftSessionDTO,
    userId?: string,
  ): Promise<AiWorkflowDraftSession> {
    return this.sessionService.createAiDraftSession(
      data,
      this.workflowSupportService.createSessionSupport(
        (payload) => this.generateAiWorkflowDraft(payload),
        (payload) => this.refineAiWorkflowDraft(payload),
      ),
      userId,
    );
  }

  async refineAiDraftSession(
    data: RefineAiWorkflowDraftSessionDTO,
    userId?: string,
  ): Promise<AiWorkflowDraftSession> {
    return this.sessionService.refineAiDraftSession(
      data,
      this.workflowSupportService.createSessionSupport(
        (payload) => this.generateAiWorkflowDraft(payload),
        (payload) => this.refineAiWorkflowDraft(payload),
      ),
      userId,
    );
  }

  async getAiDraftSession(sessionId: string, userId?: string): Promise<AiWorkflowDraftSession> {
    return this.sessionService.getAiDraftSession(sessionId, userId);
  }

  async listAiDraftSessions(userId?: string): Promise<AiWorkflowDraftSessionListItem[]> {
    return this.sessionService.listAiDraftSessions(userId);
  }

  async deleteAiDraftSession(sessionId: string, userId?: string): Promise<{ success: boolean }> {
    return this.sessionService.deleteAiDraftSession(sessionId, userId);
  }

  async validate(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): Promise<TemporalValidationResult> {
    return this.workflowSupportService.validateDsl(workflowDsl, activityDsl);
  }

  async generateWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext?: string,
    forceAiGeneration = false,
    onProgress?: (log: string) => void,
  ): Promise<{ success: boolean; code?: string; error?: string; attempts?: number; autoRetried?: boolean; generationMode?: 'deterministic' | 'ai' }> {
    const enrichedActivityDsl = await this.workflowSupportService.createEnrichedActivityDsl(workflowDsl, activityDsl);

    if (typeof onProgress === 'function') {
      onProgress(`[${new Date().toISOString()}] 已解析 ${workflowDsl.steps.length} 个步骤，收集到 ${enrichedActivityDsl.activities.length} 个 Activity 定义`);
    }

    return this.codegenService.generateWorkflowCode(
      workflowDsl,
      enrichedActivityDsl,
      errorContext,
      forceAiGeneration,
      this.workflowSupportService.createCodegenSupport(),
      onProgress,
    );
  }

  async generateWorkflowCodeStreaming(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext: string | undefined,
    forceAiGeneration: boolean | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; code?: string; error?: string; attempts?: number; autoRetried?: boolean; generationMode?: 'deterministic' | 'ai' }> {
    const enrichedActivityDsl = await this.workflowSupportService.createEnrichedActivityDsl(workflowDsl, activityDsl);

    return this.codegenService.generateWorkflowCodeStreaming(
      workflowDsl,
      enrichedActivityDsl,
      errorContext,
      forceAiGeneration,
      this.workflowSupportService.createCodegenSupport(),
      onLog,
    );
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
    return this.workflowConfigService.optimizeHttpRequestConfig(stepConfig, inputParams, userRequest);
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
    return this.workflowConfigService.previewHttpRequestConfig(stepConfig, inputParams);
  }

  async validateWorkflowReal(
    code: string,
    fn: string,
    input?: Record<string, any>,
    taskQueue?: string,
    timeout?: string,
  ): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    return this.validationService.validateWorkflowReal(code, fn, input, taskQueue, timeout);
  }

  async validateWorkflowRealStreaming(
    code: string,
    fn: string,
    input: Record<string, any> | undefined,
    taskQueue: string | undefined,
    timeout: string | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; logs?: string[]; traceback?: string; error?: string; score: number }> {
    return this.validationService.validateWorkflowRealStreaming(
      code,
      fn,
      input,
      taskQueue,
      timeout,
      onLog,
    );
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
    return this.workflowConfigService.generateStructuredTransformConfig(sourceSample, userRequest, existingConfig);
  }

}
