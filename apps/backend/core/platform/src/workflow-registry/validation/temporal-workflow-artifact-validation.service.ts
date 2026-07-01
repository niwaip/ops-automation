import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toTemporalWorkflowDto } from '../../modules/temporal-workflow/temporal-workflow-dto.helpers';
import { parseJson } from '../../modules/temporal-workflow/temporal-workflow-json.utils';
import type {
  TemporalWorkflowDTO,
  WorkflowDsl,
} from '../../modules/temporal-workflow/temporal-workflow.types';
import { TemporalWorkflowArtifactService } from '../workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowValidationFacadeService } from '../../modules/temporal-workflow/temporal-workflow-validation-facade.service';

type WorkflowValidationResult = {
  success: boolean;
  logs: string[];
  result?: any;
  error?: string;
  score: number;
};

@Injectable()
export class TemporalWorkflowArtifactValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationFacade: TemporalWorkflowValidationFacadeService,
    private readonly workflowArtifactService: TemporalWorkflowArtifactService
  ) {}

  async validateSavedWorkflowArtifact(
    id: string,
    input?: Record<string, any>,
    timeout?: string
  ): Promise<{
    workflow: TemporalWorkflowDTO;
    validation: WorkflowValidationResult;
  }> {
    const current = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    const existing = current
      ? await this.workflowArtifactService.repairWorkflowArtifactMetadataIfNeeded(current)
      : null;
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
        validationStatus: (validation.success ? 'validated' : 'failed') as any,
      },
    });

    return {
      workflow: toTemporalWorkflowDto(updated),
      validation,
    };
  }

  async validateWorkflowReal(
    code: string,
    fn: string,
    input?: Record<string, any>,
    taskQueue?: string,
    timeout?: string
  ): Promise<WorkflowValidationResult> {
    return this.validationFacade.validateWorkflowReal(code, fn, input, taskQueue, timeout);
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
    return this.validationFacade.validateWorkflowRealStreaming(
      code,
      fn,
      input,
      taskQueue,
      timeout,
      onLog
    );
  }
}
