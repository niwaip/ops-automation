import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toTemporalWorkflowDto } from '../../modules/temporal-workflow/temporal-workflow-dto.helpers';
import { parseJson } from '../../modules/temporal-workflow/temporal-workflow-json.utils';
import type {
  TemporalWorkflowDTO,
  WorkflowDsl,
} from '../../modules/temporal-workflow/temporal-workflow.types';
import { TemporalWorkflowArtifactService } from '../workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowValidationFacadeService } from '../../modules/temporal-workflow/temporal-workflow-validation-facade.service';
import { TemporalWorkflowValidationContractService } from './temporal-workflow-validation-contract.service';

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
    private readonly workflowArtifactService: TemporalWorkflowArtifactService,
    private readonly validationContractService: TemporalWorkflowValidationContractService
  ) {}

  private redactValidationInput(input: Record<string, any>): Record<string, any> {
    return Object.entries(input).reduce<Record<string, any>>((acc, [key, value]) => {
      if (/(api[-_]?key|token|secret|password|authorization|cookie)/i.test(key)) {
        acc[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        acc[key] = this.redactValidationInput(value);
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

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

    const normalizedValidation = this.validationContractService.normalizeInput(
      workflowDsl,
      input
    );
    const validationInput = normalizedValidation.input;
    const runtimeValidation = await this.validateWorkflowReal(
      existing.generatedCode,
      workflowClassName,
      validationInput,
      existing.taskQueue,
      timeout
    );
    const contractValidation = runtimeValidation.success
      ? this.validationContractService.validateResult(
          workflowDsl,
          runtimeValidation.result,
          normalizedValidation.scenario
        )
      : { success: false, errors: [] };
    const validation = runtimeValidation.success && !contractValidation.success
      ? {
          ...runtimeValidation,
          success: false,
          score: 0,
          error:
            contractValidation.errors.join('；') ||
            runtimeValidation.error ||
            '端到端业务结果契约验证失败',
          logs: [
            ...runtimeValidation.logs,
            ...contractValidation.errors.map((error) => `业务结果契约失败: ${error}`),
          ],
        }
      : runtimeValidation;
    const attemptedAt = new Date();
    const validatedAt = validation.success ? attemptedAt : null;
    // Bind evidence to the exact code bytes that were executed. A persisted hash is metadata,
    // not a source of truth, and may come from an older normalization rule.
    const artifactHash = this.workflowArtifactService.computeArtifactHash(existing.generatedCode);
    const artifactVersion = this.workflowArtifactService.getCurrentArtifactVersion(existing);
    const validationResultJson = {
      artifactHash,
      artifactVersion,
      error: validation.error || null,
      attemptedAt: attemptedAt.toISOString(),
      input: this.redactValidationInput(validationInput),
      logs: validation.logs,
      result: validation.result ?? null,
      score: validation.score,
      success: validation.success,
      timeout: timeout || null,
      validatedAt: validatedAt?.toISOString() || null,
      workflowId: existing.id,
      workflowClassName,
      validationScenario: normalizedValidation.scenario?.id || null,
    };

    const writeResult = await this.prisma.temporalWorkflow.updateMany({
      where: {
        id,
        artifactVersion,
        generatedCode: existing.generatedCode,
        updatedAt: existing.updatedAt,
      },
      data: {
        artifactHash,
        validatedAt,
        validationResultJson: validationResultJson as any,
        validationScore: validation.score,
        validationStatus: (validation.success ? 'validated' : 'failed') as any,
      },
    });
    if (writeResult.count !== 1) {
      throw new ConflictException(
        '真实验证执行期间 Workflow 工件或定义已发生变化，本次结果未写入，请重新验证最新版本'
      );
    }
    const updated = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    if (!updated) {
      throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    }

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
