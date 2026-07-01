import { Injectable, OnModuleInit } from '@nestjs/common';
import { TemporalWorkflowCodegenOrchestrationService } from '../../workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';
import { TemporalWorkflowArtifactService } from '../../workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '../../workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowDraftOrchestrationService } from '../../workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '../../workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '../../workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowArtifactValidationService } from '../../workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowDslValidationService } from '../../workflow-registry/validation/temporal-workflow-dsl-validation.service';
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
  type UpdateTemporalWorkflowDTO,
  type WorkflowDsl,
} from './temporal-workflow.types';

export * from './temporal-workflow.types';

@Injectable()
export class TemporalWorkflowService implements OnModuleInit {
  constructor(
    private readonly codegenOrchestrationService: TemporalWorkflowCodegenOrchestrationService,
    private readonly workflowArtifactService: TemporalWorkflowArtifactService,
    private readonly workflowConfigOrchestrationService: TemporalWorkflowConfigOrchestrationService,
    private readonly workflowDraftOrchestrationService: TemporalWorkflowDraftOrchestrationService,
    private readonly workflowManagementService: TemporalWorkflowManagementService,
    private readonly workflowSessionOrchestrationService: TemporalWorkflowSessionOrchestrationService,
    private readonly workflowArtifactValidationService: TemporalWorkflowArtifactValidationService,
    private readonly workflowDslValidationService: TemporalWorkflowDslValidationService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.workflowArtifactService.ensureArtifactInfrastructure();
    await this.workflowArtifactService.repairLegacyArtifactMetadataOnStartup();
  }

  async findAll(): Promise<TemporalWorkflowDTO[]> {
    return this.workflowManagementService.findAll();
  }

  async findOne(id: string): Promise<TemporalWorkflowDTO | null> {
    return this.workflowManagementService.findOne(id);
  }

  async create(data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> {
    return this.workflowManagementService.create(data);
  }

  async update(id: string, data: UpdateTemporalWorkflowDTO): Promise<TemporalWorkflowDTO> {
    return this.workflowManagementService.update(id, data);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.workflowManagementService.delete(id);
  }

  async deploy(id: string): Promise<TemporalWorkflowDTO> {
    return this.workflowManagementService.deploy(id);
  }

  async generateTemplateWorkflowDraft(
    data: GenerateTemplateWorkflowDraftDTO
  ): Promise<TemplateWorkflowDraft> {
    return this.workflowDraftOrchestrationService.generateTemplateWorkflowDraft(data);
  }

  async compileTemplateWorkflowDraft(
    data: CompileTemplateWorkflowDraftDTO
  ): Promise<TemplateWorkflowDraft> {
    return this.workflowDraftOrchestrationService.compileTemplateWorkflowDraft(data);
  }

  async generateBrowserWorkflowDraft(
    data: GenerateBrowserWorkflowDraftDTO
  ): Promise<BrowserWorkflowDraft> {
    return this.workflowDraftOrchestrationService.generateBrowserWorkflowDraft(data);
  }

  async generateAiWorkflowDraft(data: GenerateAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.workflowDraftOrchestrationService.generateAiWorkflowDraft(data);
  }

  async refineAiWorkflowDraft(data: RefineAiWorkflowDraftDTO): Promise<AiWorkflowDraft> {
    return this.workflowDraftOrchestrationService.refineAiWorkflowDraft(data);
  }

  async createAiDraftSession(
    data: GenerateAiWorkflowDraftSessionDTO,
    userId?: string
  ): Promise<AiWorkflowDraftSession> {
    return this.workflowSessionOrchestrationService.createAiDraftSession(
      data,
      {
        generateAiWorkflowDraft: (payload) => this.generateAiWorkflowDraft(payload),
        refineAiWorkflowDraft: (payload) => this.refineAiWorkflowDraft(payload),
      },
      userId
    );
  }

  async refineAiDraftSession(
    data: RefineAiWorkflowDraftSessionDTO,
    userId?: string
  ): Promise<AiWorkflowDraftSession> {
    return this.workflowSessionOrchestrationService.refineAiDraftSession(
      data,
      {
        generateAiWorkflowDraft: (payload) => this.generateAiWorkflowDraft(payload),
        refineAiWorkflowDraft: (payload) => this.refineAiWorkflowDraft(payload),
      },
      userId
    );
  }

  async getAiDraftSession(sessionId: string, userId?: string): Promise<AiWorkflowDraftSession> {
    return this.workflowSessionOrchestrationService.getAiDraftSession(sessionId, userId);
  }

  async listAiDraftSessions(userId?: string): Promise<AiWorkflowDraftSessionListItem[]> {
    return this.workflowSessionOrchestrationService.listAiDraftSessions(userId);
  }

  async deleteAiDraftSession(sessionId: string, userId?: string): Promise<{ success: boolean }> {
    return this.workflowSessionOrchestrationService.deleteAiDraftSession(sessionId, userId);
  }

  async validate(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl
  ): Promise<TemporalValidationResult> {
    return this.workflowDslValidationService.validate(workflowDsl, activityDsl);
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
    return this.codegenOrchestrationService.generateWorkflowCode(
      workflowDsl,
      activityDsl,
      errorContext,
      forceAiGeneration,
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
    return this.codegenOrchestrationService.generateWorkflowCodeStreaming(
      workflowDsl,
      activityDsl,
      errorContext,
      forceAiGeneration,
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
    return this.codegenOrchestrationService.generateAndSaveWorkflowCode(
      id,
      errorContext,
      forceAiGeneration
    );
  }

  async validateSavedWorkflowArtifact(
    id: string,
    input?: Record<string, any>,
    timeout?: string
  ): Promise<{
    workflow: TemporalWorkflowDTO;
    validation: { success: boolean; logs: string[]; result?: any; error?: string; score: number };
  }> {
    return this.workflowArtifactValidationService.validateSavedWorkflowArtifact(id, input, timeout);
  }

  async getArtifact(id: string): Promise<TemporalWorkflowArtifactDTO> {
    return this.workflowManagementService.getArtifact(id);
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
    return this.workflowConfigOrchestrationService.optimizeHttpRequestConfig(
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
    return this.workflowConfigOrchestrationService.previewHttpRequestConfig(
      stepConfig,
      inputParams
    );
  }

  async validateWorkflowReal(
    code: string,
    fn: string,
    input?: Record<string, any>,
    taskQueue?: string,
    timeout?: string
  ): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    return this.workflowArtifactValidationService.validateWorkflowReal(
      code,
      fn,
      input,
      taskQueue,
      timeout
    );
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
    return this.workflowArtifactValidationService.validateWorkflowRealStreaming(
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
    return this.workflowConfigOrchestrationService.generateStructuredTransformConfig(
      sourceSample,
      userRequest,
      existingConfig
    );
  }
}
