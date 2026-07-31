import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { APPROVAL_STATUS } from '../contracts/approval-status';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import { EXECUTION_STATUS } from '../contracts/execution-status';
import { CreateExecutionEventOptions } from '../state/execution-event.service';
import {
  CreateExecutionDto,
  ExecutionDto,
  ExecutionParamSource,
  ExecutionRequiredInput,
} from '../state/execution.dto';
import { ExecutionInputResolutionService } from '../human-control/execution-input-resolution.service';
import { ExecutionStepService } from '../step-runner/steps/execution-step.service';
import { ExecutionPlanNormalizationService } from '../step-runner/planning/execution-plan-normalization.service';
import { ExecutionPlanningService } from '../step-runner/planning/execution-planning.service';
import { buildPlannedExecutionSteps } from '../step-runner/planning/execution-plan-step.builder';
import { DeterministicPlanFreezeService } from '../plan-runtime/deterministic-plan-freeze.service';
import { DeterministicPlanSchedulerService } from '../plan-runtime/deterministic-plan-scheduler.service';

interface RuntimeDefaultResolution {
  input: Record<string, unknown>;
  sources: Record<string, ExecutionParamSource>;
}

interface PlannerSkillMatch {
  skill_id: string;
  skill_name: string;
  confidence: number;
  match_reason?: string;
}

interface PlannerSemantic {
  mode: 'field_level' | 'complex_document';
  previewReady: boolean;
  finalReady: boolean;
  groupedMissing: unknown[];
}

interface PlannerPlanDraft {
  plan_id: string;
  planner_mode: 'skill' | 'fallback' | 'browser_loop_workflow';
  summary: string;
  skill_match?: PlannerSkillMatch;
  required_inputs: ExecutionRequiredInput[];
  risk_summary: {
    level: 'low' | 'medium' | 'high';
    requires_human_review: boolean;
    items: string[];
  };
  semantic?: PlannerSemantic;
  usage?: unknown;
  steps: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ExecutionCreateHooks {
  getExecutionDto: (id: string) => Promise<ExecutionDto>;
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  enterWaitingInput: (execution: Record<string, unknown>, stepId: string) => Promise<void>;
  startExecution: (executionId: string) => Promise<void>;
}

@Injectable()
export class ExecutionCreateService {
  private readonly logger = new Logger(ExecutionCreateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionPlanningService: ExecutionPlanningService,
    private readonly executionPlanNormalizationService: ExecutionPlanNormalizationService,
    private readonly executionInputResolutionService: ExecutionInputResolutionService,
    private readonly executionStepService: ExecutionStepService,
    private readonly planFreezeService?: DeterministicPlanFreezeService,
    private readonly planSchedulerService?: DeterministicPlanSchedulerService,
  ) {}

  async create(
    userId: string,
    dto: CreateExecutionDto,
    hooks: ExecutionCreateHooks,
    options?: { authToken?: string }
  ): Promise<ExecutionDto> {
    if (dto.executionMode === 'deterministic_plan') {
      return this.createDeterministicExecution(userId, dto, hooks, options);
    }

    const resolvedSkillId = dto.capabilityId || dto.skillId;
    const resolvedSkillVersion = dto.capabilityVersion || dto.skillVersion;

    if (!resolvedSkillId) {
      throw new BadRequestException('skillId or capabilityId is required');
    }

    await this.executionPlanningService.assertSkillAccessibleByUser(resolvedSkillId, resolvedSkillVersion, options?.authToken, {
      id: userId,
      role: 'employee',
    });

    const resolvedDto: CreateExecutionDto = {
      ...dto,
      skillId: resolvedSkillId,
      capabilityId: dto.capabilityId || resolvedSkillId,
      skillVersion: resolvedSkillVersion,
      capabilityVersion: dto.capabilityVersion || resolvedSkillVersion,
      idempotencyKey: this.normalizeIdempotencyKey(dto.idempotencyKey),
    };

    if (resolvedDto.idempotencyKey) {
      const existingExecutionId = await this.findExistingExecutionIdByIdempotencyKey(
        userId,
        resolvedDto.idempotencyKey
      );
      if (existingExecutionId) {
        this.logger.log(
          `Reusing existing execution ${existingExecutionId} for idempotency key ${resolvedDto.idempotencyKey}`
        );
        return hooks.getExecutionDto(existingExecutionId);
      }
    }

    const runtimeDefaultResolution = (await this.executionPlanningService.fetchSkillDefaultResolution(
      resolvedSkillId,
      options?.authToken,
      { id: userId, role: 'employee' }
    )) as RuntimeDefaultResolution;
    const runtimeDefaultInput = runtimeDefaultResolution.input;

    const providedPlanDraft =
      resolvedDto.planDraft &&
      typeof resolvedDto.planDraft === 'object' &&
      !Array.isArray(resolvedDto.planDraft)
        ? (resolvedDto.planDraft as unknown as PlannerPlanDraft)
        : undefined;
    const shouldUseDirectExecutionPlan =
      !providedPlanDraft &&
      this.executionPlanNormalizationService.shouldSkipPlannerForExplicitStructuredInput(
        resolvedDto
      );
    const shouldGeneratePlanDraft = !providedPlanDraft && !shouldUseDirectExecutionPlan;
    const generatedPlanDraft =
      providedPlanDraft ||
      (shouldGeneratePlanDraft
        ? await this.executionPlanningService.generatePlanDraft(
            userId,
            resolvedDto,
            options?.authToken
          )
        : undefined);
    const effectiveGeneratedPlanDraft =
      generatedPlanDraft ||
      (shouldUseDirectExecutionPlan
        ? (this.executionPlanNormalizationService.buildDirectExecutionPlanDraft(
            resolvedDto,
            resolvedSkillId
          ) as unknown as PlannerPlanDraft)
        : undefined);
    const reconciledPlanDraft = this.executionPlanNormalizationService.reconcilePlanDraftWithInput(
      generatedPlanDraft as any,
      resolvedDto.input
    ) as unknown as PlannerPlanDraft | undefined;
    const reconciledDirectPlanDraft =
      !reconciledPlanDraft && effectiveGeneratedPlanDraft
        ? (this.executionPlanNormalizationService.reconcilePlanDraftWithInput(
            effectiveGeneratedPlanDraft as any,
            resolvedDto.input
          ) as unknown as PlannerPlanDraft | undefined)
        : reconciledPlanDraft;
    const defaultedPlanDraft =
      this.executionPlanNormalizationService.applyRuntimeDefaultsToPlanDraft(
        reconciledDirectPlanDraft as any,
        runtimeDefaultInput,
        runtimeDefaultResolution.sources
      ) as unknown as PlannerPlanDraft | undefined;
    const planDraft = await this.executionPlanningService.rewriteBrowserRecordingPlanDraftWithActivities(
      defaultedPlanDraft,
      resolvedSkillId,
      resolvedDto.input,
      runtimeDefaultInput
    );
    const plannedCapabilityId = planDraft?.skill_match?.skill_id;
    const effectiveSkillId = plannedCapabilityId || resolvedSkillId;
    const effectiveSkillVersion = resolvedSkillVersion;
    const normalizedInput = this.executionPlanNormalizationService.buildNormalizedInput(
      resolvedDto,
      planDraft as any,
      runtimeDefaultInput,
      runtimeDefaultResolution.sources,
      (draftDto) => this.executionPlanNormalizationService.buildPlannerUserInput(draftDto)
    );

    const usage = planDraft?.usage || resolvedDto.usage;
    if (usage) {
      (normalizedInput as Record<string, unknown>).__usage = usage;
    }

    const executionRuntimeType = this.executionPlanNormalizationService.resolveExecutionRuntimeType(
      resolvedDto.runtimeType,
      planDraft as any,
      normalizedInput
    );
    const execution = await this.prisma.execution.create({
      data: {
        createdBy: userId,
        skillId: effectiveSkillId,
        skillVersion: effectiveSkillVersion,
        status: planDraft?.risk_summary.requires_human_review
          ? EXECUTION_STATUS.PENDING_APPROVAL
          : EXECUTION_STATUS.QUEUED,
        runtimeType: executionRuntimeType,
        inputJson: resolvedDto.input as never,
        normalizedInputJson: normalizedInput as never,
        riskLevel: this.executionPlanNormalizationService.mapPlannerRiskLevel(
          planDraft as any
        ),
        requiresApproval: planDraft?.risk_summary.requires_human_review || false,
        approvalStatus: planDraft?.risk_summary.requires_human_review
          ? APPROVAL_STATUS.PENDING
          : APPROVAL_STATUS.NOT_REQUIRED,
        takeoverRequired: false,
        triggerType: resolvedDto.triggerType,
        scheduleId: resolvedDto.scheduleId,
      },
    });

    await hooks.emitEvent(execution.id, EXECUTION_EVENT_TYPE.EXECUTION_CREATED, {
      userId,
      skillId: effectiveSkillId,
      capabilityId: plannedCapabilityId || resolvedDto.capabilityId || resolvedSkillId,
      capabilityVersion: effectiveSkillVersion || resolvedDto.capabilityVersion || null,
      ...(resolvedDto.idempotencyKey ? { idempotencyKey: resolvedDto.idempotencyKey } : {}),
    });

    if (planDraft) {
      await hooks.emitEvent(execution.id, EXECUTION_EVENT_TYPE.EXECUTION_PLAN_GENERATED, {
        planId: planDraft.plan_id,
        plannerMode: planDraft.planner_mode,
        summary: planDraft.summary,
        skillMatch: planDraft.skill_match,
        capabilityMatch: planDraft.skill_match
          ? {
              capabilityId: planDraft.skill_match.skill_id,
              capabilityName: planDraft.skill_match.skill_name,
              confidence: planDraft.skill_match.confidence,
              matchReason: planDraft.skill_match.match_reason,
            }
          : undefined,
        riskSummary: planDraft.risk_summary,
        semantic: planDraft.semantic
          ? {
              mode: planDraft.semantic.mode,
              previewReady: planDraft.semantic.previewReady,
              finalReady: planDraft.semantic.finalReady,
              groupedMissingCount: planDraft.semantic.groupedMissing.length,
            }
          : undefined,
      });
    }

    await this.createPlannedSteps(execution.id, normalizedInput, planDraft, hooks);

    const hasMissingRequiredInputs = Boolean(
      planDraft?.required_inputs?.some(
        (item: ExecutionRequiredInput) =>
          item.required && this.executionInputResolutionService.isBlockingRequiredInput(item)
      )
    );

    this.logger.log(`Execution created: ${execution.id}`);

    if (!execution.requiresApproval) {
      if (hasMissingRequiredInputs) {
        const waitingInputStep = await this.executionStepService.findPendingInputCollectionStep(
          execution.id
        );

        if (waitingInputStep) {
          await hooks.enterWaitingInput(execution as unknown as Record<string, unknown>, waitingInputStep.id);
          return hooks.getExecutionDto(execution.id);
        }
      }

      hooks.startExecution(execution.id).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to start execution ${execution.id}: ${msg}`);
      });
    }

    return hooks.getExecutionDto(execution.id);
  }

  private normalizeIdempotencyKey(idempotencyKey?: string): string | undefined {
    if (typeof idempotencyKey !== 'string') {
      return undefined;
    }

    const normalized = idempotencyKey.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private async findExistingExecutionIdByIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<string | undefined> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ execution_id: string }>>(
      `
        SELECT e.id AS execution_id
        FROM executions e
        INNER JOIN execution_events ev
          ON ev.execution_id = e.id
        WHERE e.created_by = $1::uuid
          AND ev.event_type = $2
          AND ev.payload_json->>'idempotencyKey' = $3
        ORDER BY ev.created_at DESC
        LIMIT 1
      `,
      userId,
      EXECUTION_EVENT_TYPE.EXECUTION_CREATED,
      idempotencyKey
    );

    const executionId = rows[0]?.execution_id;
    return typeof executionId === 'string' && executionId.trim().length > 0
      ? executionId
      : undefined;
  }

  private async createPlannedSteps(
    executionId: string,
    normalizedInput: Record<string, unknown>,
    planDraft: PlannerPlanDraft | undefined,
    hooks: Pick<ExecutionCreateHooks, 'emitEvent'>
  ): Promise<void> {
    const { steps, bootstrapUrl } = buildPlannedExecutionSteps(
      executionId,
      normalizedInput,
      planDraft as any
    );

    if (steps.length === 0) {
      return;
    }

    await this.executionStepService.createManyPlannedSteps(steps);

    await hooks.emitEvent(executionId, EXECUTION_EVENT_TYPE.EXECUTION_STEPS_PLANNED, {
      stepCount: steps.length,
      bootstrapUrl,
      plannerStepCount: planDraft?.steps.length || 0,
    });
  }

  private async createDeterministicExecution(
    userId: string,
    dto: CreateExecutionDto,
    hooks: ExecutionCreateHooks,
    options?: { authToken?: string },
  ): Promise<ExecutionDto> {
    if (!dto.deterministicPlan) {
      throw new BadRequestException('deterministicPlan is required when executionMode is deterministic_plan');
    }

    const planDraft = dto.deterministicPlan as any;

    // Check accessibility and exact version matching for all Skill nodes in the plan
    if (Array.isArray(planDraft.nodes)) {
      for (const node of planDraft.nodes) {
        if (node.kind === 'skill' && node.skillId) {
          if (!node.skillVersion) {
            throw new BadRequestException(`Skill node '${node.nodeId || node.skillId}' is missing mandatory skillVersion`);
          }

          const skillDescriptor = await this.executionPlanningService.assertSkillAccessibleByUser(
            node.skillId,
            node.skillVersion,
            options?.authToken,
            { id: userId, role: 'employee' },
          );

          if (
            skillDescriptor.publishedReleaseVersion &&
            String(skillDescriptor.publishedReleaseVersion).trim() !== String(node.skillVersion).trim()
          ) {
            throw new BadRequestException(
              `Skill node '${node.nodeId || node.skillId}' version mismatch: submitted '${node.skillVersion}', but published executable version is '${skillDescriptor.publishedReleaseVersion}'`,
            );
          }

          if (skillDescriptor.publishedReleaseStatus !== 'published') {
            throw new BadRequestException(
              `Skill node '${node.nodeId || node.skillId}' is not published (status=${skillDescriptor.publishedReleaseStatus || 'null'})`,
            );
          }

          if (skillDescriptor.publishedDeploymentStatus !== 'deployed' && skillDescriptor.publishedDeploymentStatus !== 'healthy') {
            throw new BadRequestException(
              `Skill node '${node.nodeId || node.skillId}' deployment is not active (status=${skillDescriptor.publishedDeploymentStatus || 'null'})`,
            );
          }

          // Freeze metadata digest, handlerKey, and adapterRoute into node metadata
          if (!node.metadata) node.metadata = {};
          node.metadata.definitionDigest = skillDescriptor.definitionDigest;
          node.metadata.handlerKey = skillDescriptor.handlerKey;
          node.metadata.adapterRoute = skillDescriptor.adapterRoute;
        }
      }
    }

    let createdExecutionId = '';

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.execution.create({
        data: {
          createdBy: userId,
          executionMode: 'deterministic_plan',
          status: EXECUTION_STATUS.QUEUED,
          runtimeType: 'plan',
          inputJson: (dto.input as any) || {},
          normalizedInputJson: (dto.input as any) || {},
        },
      });

      createdExecutionId = created.id;

      if (this.planFreezeService) {
        await this.planFreezeService.freezeAndPersistPlan(createdExecutionId, planDraft, tx);
      }
    });

    await hooks.emitEvent(createdExecutionId, EXECUTION_EVENT_TYPE.EXECUTION_CREATED, {
      executionMode: 'deterministic_plan',
      planDraft,
    });

    if (this.planSchedulerService) {
      setTimeout(() => {
        this.planSchedulerService?.advanceExecution(createdExecutionId).catch((err) => {
          this.logger.error(`Error advancing deterministic execution ${createdExecutionId}:`, err);
        });
      }, 0);
    }

    return hooks.getExecutionDto(createdExecutionId);
  }
}
