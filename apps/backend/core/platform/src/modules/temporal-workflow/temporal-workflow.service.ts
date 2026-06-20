import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, TemporalWorkflow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TemporalWorkflowAiDraftService } from './temporal-workflow-draft.service';
import { TemporalWorkflowBrowserDraftService } from './temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from './temporal-workflow-codegen.service';
import { TemporalWorkflowSessionService } from './temporal-workflow-session.service';
import { TemporalWorkflowValidationService } from './temporal-workflow-validation.service';
import { TemporalWorkflowConfigService } from './temporal-workflow-config.service';
import { TemporalWorkflowNormalizationService } from './temporal-workflow-normalization.service';
import { TemporalWorkflowTemplateService } from './temporal-workflow-template.service';
import {
  toTemporalWorkflowArtifactDto,
  toTemporalWorkflowDto,
} from './temporal-workflow-dto.helpers';
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
  type GenerateTemplateWorkflowDraftDTO,
  type RefineAiWorkflowDraftDTO,
  type RefineAiWorkflowDraftSessionDTO,
  type TemplateWorkflowDraft,
  type TemporalValidationResult,
  type TemporalWorkflowArtifactDTO,
  type TemporalWorkflowDTO,
  type TemporalWorkflowValidationStatus,
  type UpdateTemporalWorkflowDTO,
  type WorkflowDsl,
} from './temporal-workflow.types';

export * from './temporal-workflow.types';

@Injectable()
export class TemporalWorkflowService implements OnModuleInit {
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
    private readonly workflowSupportService: TemporalWorkflowSupportService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureArtifactInfrastructure();
    await this.repairLegacyArtifactMetadataOnStartup();
  }

  async findAll(): Promise<TemporalWorkflowDTO[]> {
    const workflows = await this.prisma.temporalWorkflow.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const normalizedWorkflows = await Promise.all(
      workflows.map((workflow) => this.repairWorkflowArtifactMetadataIfNeeded(workflow))
    );
    return normalizedWorkflows.map((workflow) => toTemporalWorkflowDto(workflow));
  }

  async findOne(id: string): Promise<TemporalWorkflowDTO | null> {
    const workflow = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    if (!workflow) {
      return null;
    }
    const normalizedWorkflow = await this.repairWorkflowArtifactMetadataIfNeeded(workflow);
    return toTemporalWorkflowDto(normalizedWorkflow);
  }

  async create(data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> {
    try {
      const normalizedActivityDsl = this.workflowNormalizationService.normalizeActivityDsl(
        data.activityDsl
      );
      const normalizedWorkflowDsl = await this.workflowNormalizationService.normalizeWorkflowDsl(
        data.workflowDsl,
        data.name,
        data.taskQueue,
        normalizedActivityDsl
      );
      const created = await this.prisma.temporalWorkflow.create({
        data: {
          activityDsl: normalizedActivityDsl as any,
          artifactHash: data.generatedCode ? this.computeArtifactHash(data.generatedCode) : null,
          artifactVersion: data.generatedCode ? 1 : 0,
          generatedCode: data.generatedCode || null,
          isActive: true,
          name: this.workflowNormalizationService.normalizeName(data.name),
          description: this.workflowNormalizationService.normalizeDescription(data.description),
          taskQueue: this.workflowNormalizationService.normalizeTaskQueue(
            data.taskQueue || data.workflowDsl?.taskQueue
          ),
          workflowDsl: normalizedWorkflowDsl as any,
          validatedAt: null,
          validationResultJson: Prisma.JsonNull,
          validationScore: 0,
          validationStatus: data.generatedCode ? 'generated' : 'draft',
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
      const nextTaskQueue =
        data.taskQueue !== undefined
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
            normalizedActivityDsl
          )
        : undefined;
      const updatePayload: Prisma.TemporalWorkflowUpdateInput = {
        ...(data.name !== undefined && {
          name: this.workflowNormalizationService.normalizeName(data.name),
        }),
        ...(data.description !== undefined && {
          description: this.workflowNormalizationService.normalizeDescription(data.description),
        }),
        ...(data.taskQueue !== undefined && {
          taskQueue: this.workflowNormalizationService.normalizeTaskQueue(nextTaskQueue),
        }),
        ...(normalizedWorkflowDsl && { workflowDsl: normalizedWorkflowDsl as any }),
        ...(data.activityDsl && { activityDsl: normalizedActivityDsl as any }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.generatedCode !== undefined
          ? {
              artifactHash: data.generatedCode
                ? this.computeArtifactHash(data.generatedCode)
                : null,
              artifactVersion:
                this.getCurrentArtifactVersion(existing) + (data.generatedCode ? 1 : 0),
              generatedCode: data.generatedCode || null,
              validatedAt: null,
              validationResultJson: Prisma.JsonNull,
              validationScore: 0,
              validationStatus: data.generatedCode ? 'generated' : 'draft',
            }
          : {}),
      };
      const updated = await this.prisma.temporalWorkflow.update({
        where: { id },
        data: updatePayload,
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

    const deployed = await this.prisma.temporalWorkflow.update({
      where: { id },
      data: {
        deployedAt: new Date(),
      },
    });

    return toTemporalWorkflowDto(deployed);
  }

  async generateTemplateWorkflowDraft(
    data: GenerateTemplateWorkflowDraftDTO
  ): Promise<TemplateWorkflowDraft> {
    return this.workflowTemplateService.generateTemplateWorkflowDraftFromRequest(
      data,
      this.workflowSupportService.createTemplateSupport()
    );
  }

  async compileTemplateWorkflowDraft(
    data: CompileTemplateWorkflowDraftDTO
  ): Promise<TemplateWorkflowDraft> {
    return this.workflowTemplateService.compileTemplateWorkflowDraft(
      data,
      this.workflowSupportService.createTemplateSupport()
    );
  }

  async generateBrowserWorkflowDraft(
    data: GenerateBrowserWorkflowDraftDTO
  ): Promise<BrowserWorkflowDraft> {
    return this.browserDraftService.generateBrowserWorkflowDraft(
      data,
      this.workflowSupportService.createBrowserDraftSupport()
    );
  }

  async generateAiWorkflowDraft(data: GenerateAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.aiDraftService.generateWorkflowDraft(
      data,
      this.workflowSupportService.createAiDraftSupport()
    );
  }

  async refineAiWorkflowDraft(data: RefineAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.aiDraftService.refineWorkflowDraft(
      data,
      this.workflowSupportService.createAiDraftSupport()
    );
  }

  async createAiDraftSession(
    data: GenerateAiWorkflowDraftSessionDTO,
    userId?: string
  ): Promise<AiWorkflowDraftSession> {
    return this.sessionService.createAiDraftSession(
      data,
      this.workflowSupportService.createSessionSupport(
        (payload) => this.generateAiWorkflowDraft(payload),
        (payload) => this.refineAiWorkflowDraft(payload)
      ),
      userId
    );
  }

  async refineAiDraftSession(
    data: RefineAiWorkflowDraftSessionDTO,
    userId?: string
  ): Promise<AiWorkflowDraftSession> {
    return this.sessionService.refineAiDraftSession(
      data,
      this.workflowSupportService.createSessionSupport(
        (payload) => this.generateAiWorkflowDraft(payload),
        (payload) => this.refineAiWorkflowDraft(payload)
      ),
      userId
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

  async validate(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl
  ): Promise<TemporalValidationResult> {
    return this.workflowSupportService.validateDsl(workflowDsl, activityDsl);
  }

  async generateWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext?: string,
    forceAiGeneration = false,
    onProgress?: (log: string) => void
  ): Promise<{
    success: boolean;
    code?: string;
    error?: string;
    attempts?: number;
    autoRetried?: boolean;
    generationMode?: 'deterministic' | 'ai';
  }> {
    const enrichedActivityDsl = await this.workflowSupportService.createEnrichedActivityDsl(
      workflowDsl,
      activityDsl
    );

    if (typeof onProgress === 'function') {
      onProgress(
        `[${new Date().toISOString()}] 已解析 ${workflowDsl.steps.length} 个步骤，收集到 ${enrichedActivityDsl.activities.length} 个 Activity 定义`
      );
    }

    return this.codegenService.generateWorkflowCode(
      workflowDsl,
      enrichedActivityDsl,
      errorContext,
      forceAiGeneration,
      this.workflowSupportService.createCodegenSupport(),
      onProgress
    );
  }

  async generateWorkflowCodeStreaming(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext: string | undefined,
    forceAiGeneration: boolean | undefined,
    onLog: (log: string) => void
  ): Promise<{
    success: boolean;
    code?: string;
    error?: string;
    attempts?: number;
    autoRetried?: boolean;
    generationMode?: 'deterministic' | 'ai';
  }> {
    const enrichedActivityDsl = await this.workflowSupportService.createEnrichedActivityDsl(
      workflowDsl,
      activityDsl
    );

    return this.codegenService.generateWorkflowCodeStreaming(
      workflowDsl,
      enrichedActivityDsl,
      errorContext,
      forceAiGeneration,
      this.workflowSupportService.createCodegenSupport(),
      onLog
    );
  }

  async generateAndSaveWorkflowCode(
    id: string,
    errorContext?: string,
    forceAiGeneration = false
  ): Promise<{
    workflow: TemporalWorkflowDTO;
    generation: {
      success: boolean;
      code: string;
      attempts?: number;
      autoRetried?: boolean;
      generationMode?: 'deterministic' | 'ai';
    };
  }> {
    const existing = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    }

    const workflowDsl = parseJson<WorkflowDsl>(existing.workflowDsl);
    const activityDsl = parseJson<ActivityDsl>(existing.activityDsl);
    if (!workflowDsl || !activityDsl) {
      throw new BadRequestException('当前 Workflow 缺少完整 DSL，无法生成代码');
    }

    const result = await this.generateWorkflowCode(
      workflowDsl,
      activityDsl,
      errorContext,
      forceAiGeneration
    );
    if (!result.success || !result.code) {
      throw new BadRequestException(result.error || 'Workflow 代码生成失败');
    }

    const updated = await this.prisma.temporalWorkflow.update({
      where: { id },
      data: {
        artifactHash: this.computeArtifactHash(result.code),
        artifactVersion: this.getCurrentArtifactVersion(existing) + 1,
        generatedCode: result.code,
        validatedAt: null,
        validationResultJson: Prisma.JsonNull,
        validationScore: 0,
        validationStatus: 'generated',
      },
    });

    return {
      workflow: toTemporalWorkflowDto(updated),
      generation: {
        success: true,
        code: result.code,
        attempts: result.attempts,
        autoRetried: result.autoRetried,
        generationMode: result.generationMode,
      },
    };
  }

  async validateSavedWorkflowArtifact(
    id: string,
    input?: Record<string, any>,
    timeout?: string
  ): Promise<{
    workflow: TemporalWorkflowDTO;
    validation: { success: boolean; logs: string[]; result?: any; error?: string; score: number };
  }> {
    const current = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    const existing = current ? await this.repairWorkflowArtifactMetadataIfNeeded(current) : null;
    if (!existing) {
      throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    }

    if (!existing.generatedCode?.trim()) {
      throw new BadRequestException('当前 Workflow 尚未生成并保存代码，请先执行“生成并保存代码”');
    }

    const workflow = toTemporalWorkflowDto(existing);
    const workflowDsl = parseJson<WorkflowDsl>(existing.workflowDsl);
    const workflowClassName = workflowDsl?.workflowClassName?.trim();
    if (!workflowClassName) {
      throw new BadRequestException(
        `工作流 "${workflow.name}" 缺少 Python 类名 (workflowDsl.workflowClassName)，无法执行真实验证`
      );
    }

    const validation = await this.validateWorkflowReal(
      existing.generatedCode,
      workflowClassName,
      input,
      existing.taskQueue,
      timeout
    );

    const updated = await this.prisma.temporalWorkflow.update({
      where: { id },
      data: {
        validatedAt: new Date(),
        validationResultJson: {
          error: validation.error || null,
          input: input || null,
          logs: validation.logs,
          result: validation.result ?? null,
          score: validation.score,
          success: validation.success,
          timeout: timeout || null,
          workflowClassName,
        } as any,
        validationScore: validation.score,
        validationStatus: (validation.success
          ? 'validated'
          : 'failed') as TemporalWorkflowValidationStatus,
      },
    });

    return {
      workflow: toTemporalWorkflowDto(updated),
      validation,
    };
  }

  async getArtifact(id: string): Promise<TemporalWorkflowArtifactDTO> {
    const current = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    const workflow = current ? await this.repairWorkflowArtifactMetadataIfNeeded(current) : null;
    if (!workflow) {
      throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    }
    return toTemporalWorkflowArtifactDto(workflow);
  }

  async optimizeHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams: Record<string, any> = {},
    userRequest?: string
  ): Promise<{
    success: boolean;
    optimizedConfig?: Record<string, any>;
    previewResponse?: Record<string, any>;
    explanation?: string;
    error?: string;
  }> {
    return this.workflowConfigService.optimizeHttpRequestConfig(
      stepConfig,
      inputParams,
      userRequest
    );
  }

  async previewHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams: Record<string, any> = {}
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
    timeout?: string
  ): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    return this.validationService.validateWorkflowReal(code, fn, input, taskQueue, timeout);
  }

  async validateWorkflowRealStreaming(
    code: string,
    fn: string,
    input: Record<string, any> | undefined,
    taskQueue: string | undefined,
    timeout: string | undefined,
    onLog: (log: string) => void
  ): Promise<{
    success: boolean;
    result?: any;
    logs?: string[];
    traceback?: string;
    error?: string;
    score: number;
  }> {
    return this.validationService.validateWorkflowRealStreaming(
      code,
      fn,
      input,
      taskQueue,
      timeout,
      onLog
    );
  }

  async generateStructuredTransformConfig(
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    explanation?: string;
    error?: string;
  }> {
    return this.workflowConfigService.generateStructuredTransformConfig(
      sourceSample,
      userRequest,
      existingConfig
    );
  }

  private async ensureArtifactInfrastructure(): Promise<void> {
    const statements = [
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS artifact_version integer NOT NULL DEFAULT 0`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS artifact_hash varchar(128) NULL`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS validation_status varchar(32) NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS validation_score integer NOT NULL DEFAULT 0`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS validation_result_json jsonb NULL`,
      `ALTER TABLE temporal_workflows
       ADD COLUMN IF NOT EXISTS validated_at timestamptz NULL`,
      `CREATE INDEX IF NOT EXISTS idx_temporal_workflows_validation_status
       ON temporal_workflows(validation_status)`,
      `CREATE INDEX IF NOT EXISTS idx_temporal_workflows_validated_at
       ON temporal_workflows(validated_at DESC)`,
    ];

    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
    }
  }

  private async repairLegacyArtifactMetadataOnStartup(): Promise<void> {
    const workflows = await this.prisma.temporalWorkflow.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    let repairedCount = 0;

    for (const workflow of workflows) {
      const repaired = await this.repairWorkflowArtifactMetadataIfNeeded(workflow);
      if (repaired !== workflow) {
        repairedCount += 1;
      }
    }

    if (repairedCount > 0) {
      this.logger.log(`Repaired ${repairedCount} temporal workflow artifact metadata record(s)`);
    }
  }

  private async repairWorkflowArtifactMetadataIfNeeded(
    workflow: TemporalWorkflow
  ): Promise<TemporalWorkflow> {
    const patch = this.buildLegacyArtifactMetadataPatch(workflow);
    if (!patch) {
      return workflow;
    }

    return this.prisma.temporalWorkflow.update({
      where: { id: workflow.id },
      data: patch,
    });
  }

  private buildLegacyArtifactMetadataPatch(
    workflow: TemporalWorkflow
  ): Prisma.TemporalWorkflowUpdateInput | null {
    const generatedCode =
      typeof workflow.generatedCode === 'string' ? workflow.generatedCode.trim() : '';
    const validationResult =
      parseJson<Record<string, unknown>>(workflow.validationResultJson) || {};
    const validationSuccess =
      typeof validationResult.success === 'boolean' ? validationResult.success : undefined;
    const validationScore =
      typeof validationResult.score === 'number' ? validationResult.score : undefined;
    const persistedArtifactVersion = Number((workflow as any).artifactVersion || 0);
    const persistedValidationScore = Number((workflow as any).validationScore || 0);
    const persistedValidationStatus =
      typeof (workflow as any).validationStatus === 'string'
        ? String((workflow as any).validationStatus).trim()
        : '';
    const hasValidatedAt = Boolean((workflow as any).validatedAt);

    const derivedArtifactVersion = generatedCode ? Math.max(persistedArtifactVersion, 1) : 0;
    const derivedArtifactHash = generatedCode ? this.computeArtifactHash(generatedCode) : null;
    const derivedValidationStatus: TemporalWorkflowValidationStatus =
      validationSuccess === true || hasValidatedAt
        ? 'validated'
        : validationSuccess === false
          ? 'failed'
          : generatedCode
            ? 'generated'
            : 'draft';
    const derivedValidationScore =
      validationScore !== undefined
        ? validationScore
        : validationSuccess === true
          ? 100
          : generatedCode
            ? persistedValidationScore
            : 0;

    const patch: Prisma.TemporalWorkflowUpdateInput = {};

    if (generatedCode && persistedArtifactVersion <= 0) {
      patch.artifactVersion = derivedArtifactVersion as any;
    }
    if (
      generatedCode &&
      (!workflow.artifactHash || workflow.artifactHash !== derivedArtifactHash)
    ) {
      patch.artifactHash = derivedArtifactHash as any;
    }
    if (persistedValidationStatus !== derivedValidationStatus) {
      patch.validationStatus = derivedValidationStatus as any;
    }
    if (persistedValidationScore !== derivedValidationScore) {
      patch.validationScore = derivedValidationScore as any;
    }
    if (derivedValidationStatus === 'validated' && !hasValidatedAt) {
      patch.validatedAt = workflow.updatedAt || new Date();
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }

  private getCurrentArtifactVersion(
    workflow: { artifactVersion?: number | null } | null | undefined
  ): number {
    return Number(workflow?.artifactVersion || 0);
  }

  private computeArtifactHash(code: string): string {
    return `sha256:${createHash('sha256').update(code).digest('hex')}`;
  }
}
