import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import type { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
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
import { getMissingDeterministicPlanInputs } from '../plan-runtime/deterministic-plan-required-input';
import { SavedSkillResolverService } from '../../saved-skill/saved-skill-resolver.service';
import { configureSavedSkillExecution } from '../../saved-skill/saved-skill-runtime-params';
import { ExecutionOutboxService } from '../outbox/execution-outbox.service';
import { PlanRiskEvaluatorService } from '../risk/plan-risk-evaluator.service';
import { RecorderCompositePlanCompilerService } from '../plan-runtime/recorder-composite-plan-compiler.service';

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
    @Optional() private readonly savedSkillResolver?: SavedSkillResolverService,
    @Optional() private readonly executionOutboxService?: ExecutionOutboxService,
    @Optional() private readonly planRiskEvaluator?: PlanRiskEvaluatorService,
    @Optional() private readonly recorderCompositePlanCompiler?: RecorderCompositePlanCompilerService,
  ) {}

  async create(
    userId: string,
    dto: CreateExecutionDto,
    hooks: ExecutionCreateHooks,
    options?: { authToken?: string }
  ): Promise<ExecutionDto> {
    if (dto.executionMode === 'deterministic_plan') {
      if (!dto.deterministicPlan && dto.recorderComposition) {
        if (process.env.COMPOSITE_BROWSER_PLAN_ENABLED !== 'true') {
          throw new BadRequestException('COMPOSITE_BROWSER_PLAN_DISABLED');
        }
        if (!this.recorderCompositePlanCompiler) {
          throw new BadRequestException('RECORDER_COMPOSITION_COMPILER_UNAVAILABLE');
        }
        dto = {
          ...dto,
          deterministicPlan: (await this.recorderCompositePlanCompiler.compile(
            dto.recorderComposition,
          )) as unknown as Record<string, unknown>,
        };
      }
      if (dto.deterministicPlan && !dto.recorderComposition) {
        dto = {
          ...dto,
          deterministicPlan: (await this.expandSinglePublishedRecorderComposition(
            dto.deterministicPlan,
          )) as unknown as Record<string, unknown>,
        };
      }
      return this.createDeterministicExecution(userId, dto, hooks, options);
    }

    const requestedSkillId = dto.capabilityId || dto.skillId;
    if (requestedSkillId && this.savedSkillResolver) {
      const savedSkill = await this.savedSkillResolver.resolveForExecution(
        userId,
        requestedSkillId,
        dto.capabilityVersion || dto.skillVersion
      );
      if (savedSkill) {
        const configured = configureSavedSkillExecution(
          savedSkill.planSnapshot as unknown as DeterministicPlanDraftV1,
          savedSkill.fixedInput,
          dto.input || {}
        );
        if (configured.unknownOverrideKeys.length > 0) {
          throw new BadRequestException(
            `Saved workflow contains unknown runtime parameters: ${configured.unknownOverrideKeys.join(', ')}`
          );
        }
        return this.createDeterministicExecution(
          userId,
          {
            ...dto,
            skillId: savedSkill.skillId,
            capabilityId: savedSkill.skillId,
            skillVersion: savedSkill.version,
            capabilityVersion: savedSkill.version,
            executionMode: 'deterministic_plan',
            deterministicPlan: configured.planSnapshot as unknown as Record<string, unknown>,
            input: configured.executionInput,
          },
          hooks,
          options
        );
      }
    }

    const resolvedSkillId = dto.capabilityId || dto.skillId;
    const resolvedSkillVersion = dto.capabilityVersion || dto.skillVersion;

    if (!resolvedSkillId) {
      throw new BadRequestException('skillId or capabilityId is required');
    }

    const skillDescriptor = await this.executionPlanningService.assertSkillAccessibleByUser(
      resolvedSkillId,
      resolvedSkillVersion,
      options?.authToken,
      {
        id: userId,
        role: 'employee',
      }
    );

    const resolvedDto: CreateExecutionDto = {
      ...dto,
      skillId: resolvedSkillId,
      capabilityId: dto.capabilityId || resolvedSkillId,
      skillVersion: resolvedSkillVersion,
      capabilityVersion: dto.capabilityVersion || resolvedSkillVersion,
      idempotencyKey: this.normalizeIdempotencyKey(dto.idempotencyKey),
    };

    if (
      process.env.COMPOSITE_BROWSER_PLAN_ENABLED === 'true' &&
      this.recorderCompositePlanCompiler
    ) {
      const publishedComposition = await this.executionPlanningService.loadPublishedRecorderComposition(
        resolvedSkillId,
        resolvedSkillVersion || skillDescriptor.publishedReleaseVersion,
      );
      if (publishedComposition) {
        const deterministicPlan = await this.recorderCompositePlanCompiler.compile({
          browser: {
            skillId: resolvedSkillId,
            skillVersion: publishedComposition.skillVersion,
            outputNames: publishedComposition.outputNames,
          },
          objective: typeof resolvedDto.input?.objective === 'string' ? resolvedDto.input.objective : undefined,
          composition: publishedComposition.composition,
        });
        return this.createDeterministicExecution(
          userId,
          {
            ...resolvedDto,
            executionMode: 'deterministic_plan',
            deterministicPlan: deterministicPlan as unknown as Record<string, unknown>,
          },
          hooks,
          options,
        );
      }
    }

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

    const runtimeDefaultResolution =
      (await this.executionPlanningService.fetchSkillDefaultResolution(
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
    const planDraft =
      await this.executionPlanningService.rewriteBrowserRecordingPlanDraftWithActivities(
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
    const riskEvaluation = this.planRiskEvaluator?.evaluate(planDraft);
    const enforceRiskV2 = process.env.PLAN_RISK_EVALUATOR_V2_ENABLED === 'true';
    const requiresApproval = enforceRiskV2
      ? riskEvaluation?.requiresApproval || false
      : planDraft?.risk_summary.requires_human_review || false;
    const execution = await this.prisma.execution.create({
      data: {
        createdBy: userId,
        skillId: effectiveSkillId,
        skillVersion: effectiveSkillVersion,
        status: requiresApproval ? EXECUTION_STATUS.PENDING_APPROVAL : EXECUTION_STATUS.QUEUED,
        runtimeType: executionRuntimeType,
        inputJson: resolvedDto.input as never,
        normalizedInputJson: normalizedInput as never,
        riskLevel:
          enforceRiskV2 && riskEvaluation
            ? riskEvaluation.riskLevel
            : this.executionPlanNormalizationService.mapPlannerRiskLevel(planDraft as any),
        requiresApproval,
        approvalStatus: requiresApproval ? APPROVAL_STATUS.PENDING : APPROVAL_STATUS.NOT_REQUIRED,
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
          await hooks.enterWaitingInput(
            execution as unknown as Record<string, unknown>,
            waitingInputStep.id
          );
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

  private async expandSinglePublishedRecorderComposition(
    value: Record<string, unknown>,
  ): Promise<DeterministicPlanDraftV1> {
    const plan = value as unknown as DeterministicPlanDraftV1;
    if (
      process.env.COMPOSITE_BROWSER_PLAN_ENABLED !== 'true' ||
      !this.recorderCompositePlanCompiler ||
      !Array.isArray(plan.nodes) ||
      plan.nodes.length !== 1
    ) {
      return plan;
    }

    const browserNode = plan.nodes[0];
    if (browserNode.kind !== 'skill' || !browserNode.skillId) {
      return plan;
    }

    const publishedComposition =
      await this.executionPlanningService.loadPublishedRecorderComposition(
        browserNode.skillId,
        browserNode.skillVersion,
      );
    if (!publishedComposition) {
      return plan;
    }

    const compiled = await this.recorderCompositePlanCompiler.compile({
      browser: {
        skillId: browserNode.skillId,
        skillVersion: publishedComposition.skillVersion,
        outputNames: publishedComposition.outputNames,
      },
      objective: plan.objective,
      composition: publishedComposition.composition,
    });
    const compiledBrowserNode = compiled.nodes[0];
    if (compiledBrowserNode?.kind === 'skill') {
      compiledBrowserNode.inputBindings = browserNode.inputBindings;
      compiledBrowserNode.title = browserNode.title;
    }
    compiled.originalRequest = plan.originalRequest;
    compiled.requiredUserInputs = plan.requiredUserInputs;
    delete compiled.planHash;
    this.logger.log(
      `Expanded published browser composition '${browserNode.skillId}@${publishedComposition.skillVersion}' into ${compiled.nodes.length} deterministic nodes`,
    );
    return compiled;
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
    options?: { authToken?: string }
  ): Promise<ExecutionDto> {
    if (!dto.deterministicPlan) {
      throw new BadRequestException(
        'deterministicPlan is required when executionMode is deterministic_plan'
      );
    }

    const planDraft = dto.deterministicPlan as unknown as DeterministicPlanDraftV1;

    // Check accessibility and exact version matching for all Skill nodes in the plan
    if (Array.isArray(planDraft.nodes)) {
      for (const node of planDraft.nodes) {
        if (node.kind === 'skill' && node.skillId) {
          if (!node.skillVersion) {
            throw new BadRequestException(
              `Skill node '${node.nodeId || node.skillId}' is missing mandatory skillVersion`
            );
          }

          const skillDescriptor = await this.executionPlanningService.assertSkillAccessibleByUser(
            node.skillId,
            node.skillVersion,
            options?.authToken,
            { id: userId, role: 'employee' }
          );

          if (
            skillDescriptor.publishedReleaseVersion &&
            String(skillDescriptor.publishedReleaseVersion).trim() !==
              String(node.skillVersion).trim()
          ) {
            throw new BadRequestException(
              `Skill node '${node.nodeId || node.skillId}' version mismatch: submitted '${node.skillVersion}', but published executable version is '${skillDescriptor.publishedReleaseVersion}'`
            );
          }

          if (skillDescriptor.publishedReleaseStatus !== 'published') {
            throw new BadRequestException(
              `Skill node '${node.nodeId || node.skillId}' is not published (status=${skillDescriptor.publishedReleaseStatus || 'null'})`
            );
          }

          if (
            skillDescriptor.publishedDeploymentStatus !== 'deployed' &&
            skillDescriptor.publishedDeploymentStatus !== 'healthy'
          ) {
            throw new BadRequestException(
              `Skill node '${node.nodeId || node.skillId}' deployment is not active (status=${skillDescriptor.publishedDeploymentStatus || 'null'})`
            );
          }

          // Freeze metadata digest, handlerKey, and adapterRoute into node metadata
          const nodeMetadata = ((node as any).metadata ||= {});
          nodeMetadata.definitionDigest = skillDescriptor.definitionDigest;
          nodeMetadata.handlerKey = skillDescriptor.handlerKey;
          nodeMetadata.adapterRoute = skillDescriptor.adapterRoute;
        }
      }
    }

    const missingRequiredInputs = getMissingDeterministicPlanInputs(planDraft);
    const waitsForInput = missingRequiredInputs.length > 0;
    const riskEvaluation = this.planRiskEvaluator?.evaluate(planDraft, {
      requireDeclaredSideEffects: true,
    });
    const enforceRiskV2 = process.env.PLAN_RISK_EVALUATOR_V2_ENABLED === 'true';
    const requiresApproval = enforceRiskV2 && Boolean(riskEvaluation?.requiresApproval);
    const normalizedInput = waitsForInput
      ? {
          ...((dto.input as Record<string, unknown>) || {}),
          objective: planDraft.objective,
          input: {},
          requiredInputs: missingRequiredInputs,
          paramResolution:
            this.executionInputResolutionService.buildParamResolutionFromRequiredInputs(
              missingRequiredInputs
            ),
        }
      : (dto.input as Record<string, unknown>) || {};

    let createdExecutionId = '';

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.execution.create({
        data: {
          createdBy: userId,
          skillId: dto.skillId || dto.capabilityId || null,
          skillVersion: dto.skillVersion || dto.capabilityVersion || null,
          executionMode: 'deterministic_plan',
          status: waitsForInput
            ? EXECUTION_STATUS.WAITING_INPUT
            : requiresApproval
              ? EXECUTION_STATUS.PENDING_APPROVAL
              : EXECUTION_STATUS.QUEUED,
          runtimeType: 'plan',
          inputJson: (dto.input as any) || {},
          normalizedInputJson: normalizedInput as any,
          riskLevel: enforceRiskV2 && riskEvaluation ? riskEvaluation.riskLevel : 'L0',
          requiresApproval,
          approvalStatus: requiresApproval ? APPROVAL_STATUS.PENDING : APPROVAL_STATUS.NOT_REQUIRED,
          triggerType: dto.triggerType,
          scheduleId: dto.scheduleId,
        },
      });

      createdExecutionId = created.id;

      if (this.planFreezeService) {
        await this.planFreezeService.freezeAndPersistPlan(createdExecutionId, planDraft, tx);
      }

      if (waitsForInput) {
        const waitingStep = await tx.executionStep.create({
          data: {
            executionId: createdExecutionId,
            stepIndex: 0,
            name: '补充计划参数',
            type: 'input_collection',
            status: EXECUTION_STATUS.WAITING_INPUT,
            action: 'collect_plan_input',
            inputJson: { requiredInputs: missingRequiredInputs } as any,
          },
        });
        await tx.execution.update({
          where: { id: createdExecutionId },
          data: { currentStepId: waitingStep.id },
        });
      } else if (
        !requiresApproval &&
        process.env.EXECUTION_OUTBOX_ENABLED === 'true' &&
        this.executionOutboxService
      ) {
        await this.executionOutboxService.enqueue(
          {
            aggregateType: 'execution',
            aggregateId: createdExecutionId,
            eventType: 'execution.ready',
            payload: {
              executionId: createdExecutionId,
              dispatcherVersion: 'v2',
            },
          },
          tx
        );
      }
    });

    await hooks.emitEvent(createdExecutionId, EXECUTION_EVENT_TYPE.EXECUTION_CREATED, {
      executionMode: 'deterministic_plan',
      skillId: dto.skillId || dto.capabilityId || null,
      skillVersion: dto.skillVersion || dto.capabilityVersion || null,
      triggerType: dto.triggerType || null,
      scheduleId: dto.scheduleId || null,
      planDraft,
    });

    if (
      !waitsForInput &&
      !requiresApproval &&
      process.env.EXECUTION_OUTBOX_ENABLED !== 'true' &&
      this.planSchedulerService
    ) {
      setTimeout(() => {
        this.planSchedulerService?.advanceExecution(createdExecutionId).catch((err) => {
          this.logger.error(`Error advancing deterministic execution ${createdExecutionId}:`, err);
        });
      }, 0);
    }

    return hooks.getExecutionDto(createdExecutionId);
  }
}
