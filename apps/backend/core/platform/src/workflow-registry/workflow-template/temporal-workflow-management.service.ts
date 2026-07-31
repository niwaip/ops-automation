import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../prisma/client';
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
      const isCodeChanged =
        data.generatedCode !== undefined &&
        data.generatedCode !== existing.generatedCode;

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
                ? this.workflowArtifactService.computeArtifactHash(data.generatedCode)
                : null,
              artifactVersion:
                this.workflowArtifactService.getCurrentArtifactVersion(existing) +
                (isCodeChanged && data.generatedCode ? 1 : 0),
              generatedCode: data.generatedCode || null,
              ...(isCodeChanged && {
                validatedAt: null,
                validationResultJson: Prisma.JsonNull,
                validationScore: 0,
                validationStatus: data.generatedCode ? 'generated' : 'draft',
              }),
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
