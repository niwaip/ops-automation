import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { isDeepStrictEqual } from 'util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toTemporalWorkflowArtifactDto,
  toTemporalWorkflowDto,
} from '../../modules/temporal-workflow/temporal-workflow-dto.helpers';
import { parseJson } from '../../modules/temporal-workflow/temporal-workflow-json.utils';
import { TemporalWorkflowNormalizationService } from '../../modules/temporal-workflow/temporal-workflow-normalization.service';
import type {
  ActivityDsl,
  CreateTemporalWorkflowDTO,
  TemporalWorkflowArtifactDTO,
  TemporalWorkflowDTO,
  UpdateTemporalWorkflowDTO,
  WorkflowDsl,
} from '../../modules/temporal-workflow/temporal-workflow.types';
import { TemporalWorkflowArtifactService } from './temporal-workflow-artifact.service';

@Injectable()
export class TemporalWorkflowManagementService {
  private readonly logger = new Logger(TemporalWorkflowManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowNormalizationService: TemporalWorkflowNormalizationService,
    private readonly workflowArtifactService: TemporalWorkflowArtifactService
  ) {}

  async findAll(): Promise<TemporalWorkflowDTO[]> {
    const workflows = await this.prisma.temporalWorkflow.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const normalizedWorkflows = await Promise.all(
      workflows.map((workflow) =>
        this.workflowArtifactService.repairWorkflowArtifactMetadataIfNeeded(workflow)
      )
    );
    return normalizedWorkflows.map((workflow) => toTemporalWorkflowDto(workflow));
  }

  async findOne(id: string): Promise<TemporalWorkflowDTO | null> {
    const workflow = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    if (!workflow) {
      return null;
    }
    const normalizedWorkflow =
      await this.workflowArtifactService.repairWorkflowArtifactMetadataIfNeeded(workflow);
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
          artifactHash: data.generatedCode
            ? this.workflowArtifactService.computeArtifactHash(data.generatedCode)
            : null,
          artifactVersion: data.generatedCode ? 1 : 0,
          generatedCode: data.generatedCode || null,
          // A generated Workflow is not enabled until the validated artifact is published.
          isActive: data.isActive ?? false,
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
      const existingActivityDsl =
        parseJson<ActivityDsl>(existing.activityDsl) || { activities: [] };
      const normalizedExistingActivityDsl =
        this.workflowNormalizationService.normalizeActivityDsl(existingActivityDsl);
      const normalizedActivityDsl = data.activityDsl
        ? this.workflowNormalizationService.normalizeActivityDsl(data.activityDsl)
        : normalizedExistingActivityDsl;
      const normalizedWorkflowDsl = data.workflowDsl
        ? await this.workflowNormalizationService.normalizeWorkflowDsl(
            data.workflowDsl,
            nextName,
            nextTaskQueue,
            normalizedActivityDsl
          )
        : undefined;
      const normalizedExistingWorkflowDsl = normalizedWorkflowDsl
        ? await this.workflowNormalizationService.normalizeWorkflowDsl(
            parseJson<WorkflowDsl>(existing.workflowDsl) || normalizedWorkflowDsl,
            existing.name,
            existing.taskQueue,
            normalizedExistingActivityDsl
          )
        : undefined;
      const omitValidationContract = (dsl: WorkflowDsl | undefined): WorkflowDsl | undefined => {
        if (!dsl) return undefined;
        const { validation: _validation, ...executableDsl } = dsl;
        return executableDsl as WorkflowDsl;
      };
      const isValidationContractChanged = Boolean(
        normalizedWorkflowDsl &&
          !isDeepStrictEqual(
            normalizedWorkflowDsl.validation,
            normalizedExistingWorkflowDsl?.validation
          )
      );
      const isWorkflowDslChanged = Boolean(
        normalizedWorkflowDsl &&
          !isDeepStrictEqual(
            omitValidationContract(normalizedWorkflowDsl),
            omitValidationContract(normalizedExistingWorkflowDsl)
          )
      );
      const isActivityDslChanged = Boolean(
        data.activityDsl &&
          !isDeepStrictEqual(normalizedActivityDsl, normalizedExistingActivityDsl)
      );
      const isDefinitionChanged = isWorkflowDslChanged || isActivityDslChanged;
      const isCodeChanged =
        data.generatedCode !== undefined && data.generatedCode !== existing.generatedCode;
      const shouldDiscardStaleCode = isDefinitionChanged && !isCodeChanged;
      const shouldUpdateCode = data.generatedCode !== undefined || shouldDiscardStaleCode;
      const nextGeneratedCode = shouldDiscardStaleCode
        ? null
        : data.generatedCode !== undefined
          ? data.generatedCode || null
          : existing.generatedCode;
      const shouldInvalidateValidation =
        isDefinitionChanged || isCodeChanged || isValidationContractChanged;

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
        ...(shouldInvalidateValidation && {
          deployedAt: null,
          isActive: false,
        }),
        ...(shouldUpdateCode
          ? {
              artifactHash: nextGeneratedCode
                ? this.workflowArtifactService.computeArtifactHash(nextGeneratedCode)
                : null,
              artifactVersion:
                this.workflowArtifactService.getCurrentArtifactVersion(existing) +
                (isCodeChanged && nextGeneratedCode ? 1 : 0),
              generatedCode: nextGeneratedCode,
              ...(shouldInvalidateValidation && {
                validatedAt: null,
                validationResultJson: Prisma.JsonNull,
                validationScore: 0,
                validationStatus: nextGeneratedCode ? 'generated' : 'draft',
              }),
            }
          : shouldInvalidateValidation
            ? {
                validatedAt: null,
                validationResultJson: Prisma.JsonNull,
                validationScore: 0,
                validationStatus: existing.generatedCode ? 'generated' : 'draft',
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
    const current = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    }
    const existing = await this.workflowArtifactService.repairWorkflowArtifactMetadataIfNeeded(
      current
    );

    if (!existing.generatedCode?.trim()) {
      throw new BadRequestException('当前 Workflow 尚未生成并保存代码，不能发布');
    }
    const binding = this.workflowArtifactService.inspectValidationBinding(existing);
    if (!binding.isCurrent) {
      throw new BadRequestException('当前 Workflow 工件尚未通过最新版本的真实验证，不能发布');
    }

    const deployResult = await this.prisma.temporalWorkflow.updateMany({
      where: {
        id,
        artifactHash: binding.artifactHash,
        artifactVersion: binding.artifactVersion,
        generatedCode: existing.generatedCode,
        updatedAt: existing.updatedAt,
        validatedAt: existing.validatedAt,
        validationStatus: 'validated',
      },
      data: {
        deployedAt: new Date(),
        isActive: true,
      },
    });
    if (deployResult.count !== 1) {
      throw new ConflictException(
        '发布期间 Workflow 工件或验证证据已发生变化，请重新检查并发布最新版本'
      );
    }
    const deployed = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    if (!deployed) {
      throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    }

    return toTemporalWorkflowDto(deployed);
  }

  async getArtifact(id: string): Promise<TemporalWorkflowArtifactDTO> {
    const current = await this.prisma.temporalWorkflow.findUnique({ where: { id } });
    const workflow = current
      ? await this.workflowArtifactService.repairWorkflowArtifactMetadataIfNeeded(current)
      : null;
    if (!workflow) {
      throw new NotFoundException(`Temporal Workflow 不存在: ${id}`);
    }
    return toTemporalWorkflowArtifactDto(workflow);
  }
}
