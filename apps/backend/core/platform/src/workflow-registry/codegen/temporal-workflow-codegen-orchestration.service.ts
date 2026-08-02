import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toTemporalWorkflowDto } from '../../modules/temporal-workflow/temporal-workflow-dto.helpers';
import { parseJson } from '../../modules/temporal-workflow/temporal-workflow-json.utils';
import { TemporalWorkflowCodegenService } from '../../modules/temporal-workflow/temporal-workflow-codegen.service';
import { TemporalWorkflowSupportService } from '../../modules/temporal-workflow/temporal-workflow-support.service';
import type {
  ActivityDsl,
  TemporalWorkflowDTO,
  WorkflowDsl,
} from '../../modules/temporal-workflow/temporal-workflow.types';
import { TemporalWorkflowArtifactService } from '../workflow-template/temporal-workflow-artifact.service';

type WorkflowCodegenResult = {
  success: boolean;
  code?: string;
  error?: string;
  attempts?: number;
  autoRetried?: boolean;
  generationMode?: 'deterministic' | 'ai';
};

@Injectable()
export class TemporalWorkflowCodegenOrchestrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codegenService: TemporalWorkflowCodegenService,
    private readonly workflowArtifactService: TemporalWorkflowArtifactService,
    private readonly workflowSupportService: TemporalWorkflowSupportService
  ) {}

  async generateWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext?: string,
    forceAiGeneration = false,
    onProgress?: (log: string) => void
  ): Promise<WorkflowCodegenResult> {
    const enrichedActivityDsl = await this.workflowSupportService.createEnrichedActivityDsl(
      workflowDsl,
      activityDsl,
      onProgress
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
  ): Promise<WorkflowCodegenResult> {
    const enrichedActivityDsl = await this.workflowSupportService.createEnrichedActivityDsl(
      workflowDsl,
      activityDsl,
      onLog
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
        artifactHash: this.workflowArtifactService.computeArtifactHash(result.code),
        artifactVersion: this.workflowArtifactService.getCurrentArtifactVersion(existing) + 1,
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
}
