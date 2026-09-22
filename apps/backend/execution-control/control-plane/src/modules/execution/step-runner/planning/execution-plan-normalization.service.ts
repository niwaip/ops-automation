import { Injectable } from '@nestjs/common';
import {
  CreateExecutionDto,
  ExecutionNormalizedInputJson,
  ExecutionParamSource,
  ExecutionRequiredInput,
} from '../../state/execution.dto';
import { BROWSER_RUNTIME } from '../browser/browser-execution-constants';
import { ExecutionInputResolutionService } from '../../human-control/execution-input-resolution.service';
import {
  BrowserLoopDraftLike,
  BrowserLoopWorkflowPlanLike,
  partitionBrowserTemplateStepsForLoopWorkflow,
} from '../browser/browser-loop-workflow-plan.builder';
import { BrowserPhaseCommandBuilder } from './browser-phase-command.builder';

interface SkillSchemaPropertyLike {
  type?: string;
  default?: unknown;
}

interface WorkflowParamPolicySnapshotLike {
  defaultValue?: unknown;
}

interface RuntimeDefaultResolutionLike {
  input: Record<string, unknown>;
  sources: Record<string, ExecutionParamSource>;
}

interface TemplateSchemaLike {
  paramsSchema?: {
    properties?: Record<string, SkillSchemaPropertyLike>;
  };
  inputPolicy?: {
    params?: Record<string, WorkflowParamPolicySnapshotLike>;
  };
}

interface SkillPayloadLike {
  paramsSchema?: {
    properties?: Record<string, SkillSchemaPropertyLike>;
  };
}

interface PlannerSkillMatchLike {
  skill_id: string;
  skill_name: string;
  confidence: number;
  match_reason?: string;
}

interface PlannerSemanticGroupedMissingLike {
  key: string;
  label: string;
  kind: 'field' | 'array_group';
  blocking: boolean;
  required: boolean;
  fieldNames: string[];
  missingFieldNames: string[];
  description?: string;
}

interface PlannerSemanticLike {
  enabled: boolean;
  mode: 'field_level' | 'complex_document';
  previewReady: boolean;
  finalReady: boolean;
  fallbackToFieldLevel: boolean;
  summary?: string;
  groupedMissing: PlannerSemanticGroupedMissingLike[];
  complexity: {
    category: 'simple' | 'complex_document';
    totalFields: number;
    requiredFields: number;
    missingFields: number;
    arrayGroups: number;
    reasonCodes: string[];
  };
}

export interface PlanDraftLike {
  plan_id: string;
  planner_mode: 'skill' | 'fallback' | 'browser_loop_workflow';
  objective: string;
  summary: string;
  skill_match?: PlannerSkillMatchLike;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    kind: 'skill' | 'tool' | 'human_input' | 'execution' | 'control';
    status: 'planned';
    commands?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }>;
  required_inputs: ExecutionRequiredInput[];
  risk_summary: {
    level: 'low' | 'medium' | 'high';
    requires_human_review: boolean;
    items: string[];
  };
  semantic?: PlannerSemanticLike;
  runtime_source_type?: string;
  loop_workflow?: BrowserLoopWorkflowPlanLike;
  [key: string]: unknown;
}

@Injectable()
export class ExecutionPlanNormalizationService {
  private readonly browserPhaseCommandBuilder = new BrowserPhaseCommandBuilder();
  constructor(private readonly executionInputResolutionService: ExecutionInputResolutionService) {}

  reconcilePlanDraftWithInput(
    planDraft: PlanDraftLike | undefined,
    input: Record<string, unknown> | undefined
  ): PlanDraftLike | undefined {
    if (!planDraft || !input) {
      return planDraft;
    }
    const resolvedInput = planDraft.required_inputs.reduce<Record<string, unknown>>((acc, item) => {
      if (!Object.prototype.hasOwnProperty.call(input, item.name)) {
        return acc;
      }
      const normalizedValue = this.executionInputResolutionService.normalizeSubmittedInputValue(
        input[item.name],
        item.type
      );
      if (!this.executionInputResolutionService.hasMeaningfulSubmittedInputValue(normalizedValue)) {
        return acc;
      }
      acc[item.name] = normalizedValue;
      return acc;
    }, {});
    return this.reconcilePlanDraftWithResolvedValues(planDraft, resolvedInput, 'user_input');
  }

  applyRuntimeDefaultsToPlanDraft(
    planDraft: PlanDraftLike | undefined,
    runtimeDefaultInput: Record<string, unknown>,
    runtimeDefaultSources?: Record<string, ExecutionParamSource>
  ): PlanDraftLike | undefined {
    return this.reconcilePlanDraftWithResolvedValues(
      planDraft,
      runtimeDefaultInput,
      runtimeDefaultSources || 'default'
    );
  }

  buildRuntimeDefaultResolution(
    skillPayload: SkillPayloadLike | undefined,
    templateSchemas: TemplateSchemaLike[] = []
  ): RuntimeDefaultResolutionLike {
    return templateSchemas.reduce<RuntimeDefaultResolutionLike>(
      (acc, templateSchema) => {
        const properties = templateSchema?.paramsSchema?.properties || {};
        this.collectDefaultsFromSchemaProperties(acc, properties, 'default');
        this.collectDefaultsFromWorkflowPolicy(
          acc,
          templateSchema?.inputPolicy?.params,
          properties
        );
        return acc;
      },
      [skillPayload].reduce<RuntimeDefaultResolutionLike>(
        (acc, currentSkillPayload) => {
          this.collectDefaultsFromSchemaProperties(
            acc,
            currentSkillPayload?.paramsSchema?.properties || {},
            'default'
          );
          return acc;
        },
        { input: {}, sources: {} }
      )
    );
  }

  reconcilePlanSemantic(
    semantic: Record<string, unknown> | undefined,
    requiredInputs: ExecutionRequiredInput[]
  ): Record<string, unknown> | undefined {
    if (!semantic) {
      return undefined;
    }

    const semanticRecord = semantic as unknown as PlannerSemanticLike;
    const missingRequiredInputs = requiredInputs.filter((item) => item.required && item.missing);
    const missingFieldNames = new Set(missingRequiredInputs.map((item) => item.name));
    const groupedMissing = (semanticRecord.groupedMissing || [])
      .map((group) => {
        const groupFieldNames = this.resolveSemanticGroupFieldNames(group, requiredInputs);
        const currentMissingFieldNames = groupFieldNames.filter((name) =>
          missingFieldNames.has(name)
        );
        if (currentMissingFieldNames.length === 0) {
          return undefined;
        }

        return {
          ...group,
          fieldNames: groupFieldNames,
          missingFieldNames: currentMissingFieldNames,
        };
      })
      .filter((group): group is PlannerSemanticGroupedMissingLike => Boolean(group))
      .reduce<PlannerSemanticGroupedMissingLike[]>((acc, group) => {
        const normalizedGroup = this.normalizeSemanticGroupedMissing(group);
        const existing = acc.find(
          (item) => item.key === normalizedGroup.key && item.kind === normalizedGroup.kind
        );
        if (!existing) {
          acc.push(normalizedGroup);
          return acc;
        }
        existing.blocking = existing.blocking || normalizedGroup.blocking;
        existing.required = existing.required || normalizedGroup.required;
        existing.fieldNames = Array.from(
          new Set([...(existing.fieldNames || []), ...(normalizedGroup.fieldNames || [])])
        );
        existing.missingFieldNames = Array.from(
          new Set([
            ...(existing.missingFieldNames || []),
            ...(normalizedGroup.missingFieldNames || []),
          ])
        );
        existing.label = this.normalizeSemanticMissingLabel(
          existing.label || normalizedGroup.label
        );
        existing.description = existing.description || normalizedGroup.description;
        return acc;
      }, []);

    const coveredMissingNames = new Set(groupedMissing.flatMap((group) => group.missingFieldNames));
    missingRequiredInputs
      .filter((item) => !coveredMissingNames.has(item.name))
      .forEach((item) => {
        const normalizedKey = this.normalizeSemanticMissingKey(item.name);
        const existing = groupedMissing.find(
          (group) => group.key === normalizedKey && group.kind === 'field'
        );
        if (existing) {
          existing.fieldNames = Array.from(new Set([...(existing.fieldNames || []), item.name]));
          existing.missingFieldNames = Array.from(
            new Set([...(existing.missingFieldNames || []), item.name])
          );
          return;
        }
        groupedMissing.push({
          key: normalizedKey,
          label: this.normalizeSemanticMissingLabel(item.description || item.name),
          kind: 'field',
          blocking: true,
          required: true,
          fieldNames: [item.name],
          missingFieldNames: [item.name],
          description: `请补充 ${this.normalizeSemanticMissingLabel(item.description || item.name)}`,
        });
      });

    const blockingGroups = groupedMissing.filter((group) => group.blocking);
    const previewReady = blockingGroups.length === 0;
    const finalReady = groupedMissing.length === 0;
    const mode = semanticRecord.mode === 'complex_document' ? 'complex_document' : 'field_level';

    return {
      ...semanticRecord,
      previewReady,
      finalReady,
      summary: this.buildSemanticSummary(
        mode,
        finalReady,
        previewReady,
        groupedMissing.length,
        blockingGroups.length
      ),
      groupedMissing,
      complexity: {
        ...semanticRecord.complexity,
        requiredFields: requiredInputs.filter((item) => item.required).length,
        missingFields: missingRequiredInputs.length,
      },
    };
  }

  mapPlannerRiskLevel(planDraft: PlanDraftLike | undefined): string {
    switch (planDraft?.risk_summary.level) {
      case 'high':
        return 'L2';
      case 'medium':
        return 'L1';
      case 'low':
      default:
        return 'L0';
    }
  }

  normalizeExecutionRuntimeType(
    runtimeType?: string | null
  ): 'browser' | 'document' | 'workflow' | 'custom' {
    const normalized = typeof runtimeType === 'string' ? runtimeType.trim().toLowerCase() : '';
    if (normalized === 'browser') {
      return 'browser';
    }
    if (normalized === 'document') {
      return 'document';
    }
    if (normalized === 'workflow' || normalized === 'temporal_worker') {
      return 'workflow';
    }
    if (normalized === 'custom' || normalized === 'flow_runtime' || normalized === 'sandbox') {
      return 'custom';
    }
    return 'custom';
  }

  resolveExecutionRuntimeType(
    runtimeType?: string | null,
    planDraft?: PlanDraftLike,
    normalizedInput?: Record<string, unknown>
  ): 'browser' | 'document' | 'workflow' | 'custom' {
    const normalized = this.normalizeExecutionRuntimeType(runtimeType);
    if (normalized !== 'custom') {
      return normalized;
    }

    const hasBrowserPhaseCommands = Boolean(
      planDraft?.steps?.some((step) => Array.isArray(step.commands) && step.commands.length > 0)
    );
    if (hasBrowserPhaseCommands) {
      return BROWSER_RUNTIME.TYPE;
    }

    if (
      this.browserPhaseCommandBuilder.readNonEmptyString(
        normalizedInput?.runtimeSourceType,
        planDraft?.runtime_source_type
      ) === 'browser_recording'
    ) {
      return BROWSER_RUNTIME.TYPE;
    }

    const bootstrapUrl = typeof normalizedInput?.url === 'string' ? normalizedInput.url.trim() : '';
    if (/^https?:\/\//i.test(bootstrapUrl)) {
      return BROWSER_RUNTIME.TYPE;
    }

    return normalized;
  }

  buildPlannerUserInput(dto: CreateExecutionDto): string {
    const input = dto.input || {};
    const candidateKeys = ['prompt', 'task', 'goal', 'instruction', 'query', 'url'];

    for (const key of candidateKeys) {
      const value = input[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return JSON.stringify({
      skillId: dto.skillId,
      runtimeType: this.normalizeExecutionRuntimeType(dto.runtimeType),
      input,
    });
  }

  shouldSkipPlannerForExplicitStructuredInput(dto: CreateExecutionDto): boolean {
    const hasExplicitSkill = Boolean(
      (typeof dto.skillId === 'string' && dto.skillId.trim()) ||
      (typeof dto.capabilityId === 'string' && dto.capabilityId.trim())
    );
    if (!hasExplicitSkill) {
      return false;
    }

    const input =
      dto.input && typeof dto.input === 'object' && !Array.isArray(dto.input)
        ? dto.input
        : undefined;
    if (!input || Object.keys(input).length === 0) {
      return false;
    }

    const candidateKeys = ['prompt', 'task', 'goal', 'instruction', 'query', 'url'];
    return !candidateKeys.some((key) => typeof input[key] === 'string' && input[key].trim());
  }

  buildDirectExecutionPlanDraft(dto: CreateExecutionDto, resolvedSkillId: string): PlanDraftLike {
    return {
      plan_id: `direct-${resolvedSkillId}`,
      planner_mode: 'skill',
      objective: this.buildPlannerUserInput(dto),
      summary: '调用显式指定的技能执行结构化输入。',
      skill_match: {
        skill_id: resolvedSkillId,
        skill_name: resolvedSkillId,
        confidence: 1,
        match_reason: 'explicit_skill_selection',
      },
      steps: [
        {
          id: 'execute_selected_skill',
          title: 'Execute selected skill',
          description: 'Run the explicitly selected skill with the provided structured input.',
          kind: 'skill',
          status: 'planned',
        },
      ],
      required_inputs: [],
      risk_summary: {
        level: 'low',
        requires_human_review: false,
        items: ['explicit_skill_selected'],
      },
    };
  }

  buildDirectSkillExecutionPlanDraftFromExisting(
    planDraft: PlanDraftLike,
    resolvedSkillId: string,
    options?: {
      runtimeSourceType?: string;
    }
  ): PlanDraftLike {
    const skillName =
      this.browserPhaseCommandBuilder.readNonEmptyString(
        planDraft.skill_match?.skill_name,
        resolvedSkillId
      ) || resolvedSkillId;

    return {
      ...planDraft,
      planner_mode: 'skill',
      ...(this.browserPhaseCommandBuilder.readNonEmptyString(options?.runtimeSourceType)
        ? {
            runtime_source_type: this.browserPhaseCommandBuilder.readNonEmptyString(
              options?.runtimeSourceType
            ),
          }
        : {}),
      skill_match: {
        skill_id: resolvedSkillId,
        skill_name: skillName,
        confidence:
          typeof planDraft.skill_match?.confidence === 'number'
            ? planDraft.skill_match.confidence
            : 1,
        match_reason:
          this.browserPhaseCommandBuilder.readNonEmptyString(planDraft.skill_match?.match_reason) ||
          'explicit_skill_selection',
      },
      steps: [
        {
          id: 'execute_selected_skill',
          title: skillName,
          description: `执行技能 ${skillName}。`,
          kind: 'skill',
          status: 'planned',
        },
      ],
    };
  }

  buildBrowserLoopWorkflowPlanDraftFromExisting(input: {
    planDraft: PlanDraftLike;
    resolvedSkillId: string;
    resolvedInput: Record<string, unknown>;
    templateSteps: Record<string, unknown>[];
    loopDraft?: BrowserLoopDraftLike;
    runtimeSourceType?: string;
  }): PlanDraftLike {
    const skillName =
      this.browserPhaseCommandBuilder.readNonEmptyString(
        input.planDraft.skill_match?.skill_name,
        input.resolvedSkillId
      ) || input.resolvedSkillId;
    const loopPartition = partitionBrowserTemplateStepsForLoopWorkflow({
      templateSteps: input.templateSteps,
      loopDraft: input.loopDraft,
      loopId: `${input.resolvedSkillId}_loop`,
    });

    const stepCounter = { value: 0 };
    const browserSteps = [
      ...loopPartition.preLoopSteps.map((step) =>
        this.browserPhaseCommandBuilder.buildBrowserLoopWorkflowActivityStep({
          templateStep: step,
          segment: 'pre_loop',
          loopPlan: loopPartition.loopPlan,
          counter: stepCounter,
          resolvedInput: input.resolvedInput,
        })
      ),
      this.browserPhaseCommandBuilder.buildBrowserLoopWorkflowControlStep({
        id: 'loop_init',
        title: 'Loop init',
        description: '初始化循环上下文。',
        loopPlan: loopPartition.loopPlan,
      }),
      ...loopPartition.iterationSteps.map((step) =>
        this.browserPhaseCommandBuilder.buildBrowserLoopWorkflowActivityStep({
          templateStep: step,
          segment: 'iteration',
          loopPlan: loopPartition.loopPlan,
          counter: stepCounter,
          resolvedInput: input.resolvedInput,
          loopIteration: 1,
          loopTemplate: true,
        })
      ),
      this.browserPhaseCommandBuilder.buildBrowserLoopWorkflowControlStep({
        id: 'loop_eval_after_iteration',
        title: 'Loop evaluate',
        description: '根据 stop condition 评估是否继续下一轮。',
        loopPlan: loopPartition.loopPlan,
        stopCondition: loopPartition.loopPlan.stopWhen as Record<string, unknown> | undefined,
      }),
      ...loopPartition.postLoopSteps.map((step) =>
        this.browserPhaseCommandBuilder.buildBrowserLoopWorkflowActivityStep({
          templateStep: step,
          segment: 'post_loop',
          loopPlan: loopPartition.loopPlan,
          counter: stepCounter,
          resolvedInput: input.resolvedInput,
        })
      ),
    ].filter(Boolean);

    return {
      ...input.planDraft,
      planner_mode: 'browser_loop_workflow',
      runtime_source_type:
        this.browserPhaseCommandBuilder.readNonEmptyString(input.runtimeSourceType) ||
        'browser_recording',
      loop_workflow: loopPartition.loopPlan,
      skill_match: {
        skill_id: input.resolvedSkillId,
        skill_name: skillName,
        confidence:
          typeof input.planDraft.skill_match?.confidence === 'number'
            ? input.planDraft.skill_match.confidence
            : 1,
        match_reason:
          this.browserPhaseCommandBuilder.readNonEmptyString(
            input.planDraft.skill_match?.match_reason
          ) || 'browser_loop_workflow',
      },
      summary: '执行浏览器循环工作流。',
      steps: browserSteps,
    };
  }

  buildPlannerResolvedInput(
    planDraft: PlanDraftLike | undefined,
    input?: Record<string, unknown>,
    runtimeDefaultInput?: Record<string, unknown>
  ): Record<string, unknown> {
    const plannerExtractedInput = (planDraft?.required_inputs || []).reduce<
      Record<string, unknown>
    >((acc, item) => {
      if (!item || item.missing || item.value === undefined || item.value === null) {
        return acc;
      }
      acc[item.name] = item.value;
      return acc;
    }, {});

    return {
      ...(runtimeDefaultInput || {}),
      ...plannerExtractedInput,
      ...(input || {}),
    };
  }

  buildBrowserRecordingPlannerSteps(
    workflowSteps: Record<string, unknown>[],
    browserActivities: Record<string, unknown>[],
    resolvedInput: Record<string, unknown>,
    templateSteps: Record<string, unknown>[] = []
  ): PlanDraftLike['steps'] {
    const plannerSteps: PlanDraftLike['steps'] = [];
    let templateStepCursor = 0;
    workflowSteps.forEach((workflowStep, index) => {
      const activityLabel =
        this.browserPhaseCommandBuilder.readNonEmptyString(
          workflowStep.name,
          workflowStep.activityName,
          workflowStep.activityRef
        ) || `Activity ${index + 1}`;
      const activityKey =
        this.browserPhaseCommandBuilder.readNonEmptyString(
          workflowStep.id,
          workflowStep.activityName,
          workflowStep.activityRef,
          activityLabel
        ) || `activity_${index + 1}`;
      const activityRef = this.browserPhaseCommandBuilder.readNonEmptyString(
        workflowStep.activityRef
      );
      const matchingActivity = browserActivities.find((activity, activityIndex) => {
        const fn = this.browserPhaseCommandBuilder.readNonEmptyString(activity.fn);
        const name = this.browserPhaseCommandBuilder.readNonEmptyString(activity.name);
        if (activityRef && fn && (activityRef === fn || activityRef === `custom:${fn}`)) {
          return true;
        }
        if (
          name &&
          (name === activityLabel ||
            name === this.browserPhaseCommandBuilder.readNonEmptyString(workflowStep.activityName))
        ) {
          return true;
        }
        return activityIndex === index;
      });
      const activitySourceSteps = this.browserPhaseCommandBuilder.readRecordArray(
        this.browserPhaseCommandBuilder.readRecord(matchingActivity?.config)?.steps
      );
      const enrichedActivity =
        this.browserPhaseCommandBuilder.mergeBrowserActivityStepsWithTemplateSteps(
          activitySourceSteps,
          templateSteps,
          templateStepCursor
        );
      const commands = this.browserPhaseCommandBuilder.mapBrowserActivityCommands(
        enrichedActivity.steps,
        index + 1,
        activityLabel,
        resolvedInput
      );
      templateStepCursor = enrichedActivity.nextTemplateStepCursor;
      if (commands.length === 0) {
        return;
      }

      plannerSteps.push({
        id: activityKey,
        title: activityLabel,
        description: `执行 ${activityLabel} activity。`,
        kind: 'tool',
        status: 'planned',
        phase_key: `phase_${String(index + 1).padStart(2, '0')}_${this.browserPhaseCommandBuilder.sanitizePhaseKeyFragment(activityKey)}`,
        phase_name: activityLabel,
        phase_type: 'workflow_activity',
        commands,
        recovery_policy: {
          max_auto_retries: 1,
          allow_human_takeover: true,
        },
      });
    });
    return plannerSteps;
  }

  buildNormalizedInput(
    dto: CreateExecutionDto,
    planDraft: PlanDraftLike | undefined,
    runtimeDefaultInput: Record<string, unknown> | undefined,
    runtimeDefaultSources: Record<string, ExecutionParamSource> | undefined,
    objectiveBuilder: (dto: CreateExecutionDto) => string
  ): ExecutionNormalizedInputJson {
    const rawInput = dto.input || {};
    const promptDebugCandidate = (rawInput as Record<string, unknown>).__promptDebug;
    const input = { ...rawInput } as Record<string, unknown>;
    delete input.__promptDebug;

    const paramResolution =
      this.executionInputResolutionService.buildParamResolutionFromRequiredInputs(
        planDraft?.required_inputs
      );
    const trackedKeys = new Set(Object.keys(paramResolution));
    const passthroughInput = this.executionInputResolutionService.omitTrackedInputKeys(
      {
        ...(runtimeDefaultInput || {}),
        ...input,
      },
      trackedKeys
    );
    const plannerExtractedInput =
      Object.keys(paramResolution).length > 0
        ? this.executionInputResolutionService.buildFinalInputFromParamResolution(paramResolution)
        : (planDraft?.required_inputs || []).reduce<Record<string, unknown>>((acc, item) => {
            if (
              !item ||
              item.missing ||
              item.needs_confirmation ||
              item.value === undefined ||
              item.value === null
            ) {
              return acc;
            }
            acc[item.name] = item.value;
            return acc;
          }, {});
    const mergedInput = {
      ...passthroughInput,
      ...plannerExtractedInput,
    };
    const requiredInputs =
      Object.keys(paramResolution).length > 0
        ? this.executionInputResolutionService.buildRequiredInputsFromParamResolution(
            paramResolution
          )
        : planDraft?.required_inputs;

    const normalizedInput: ExecutionNormalizedInputJson = {
      objective: planDraft?.objective || objectiveBuilder(dto),
      plannerMode: planDraft?.planner_mode,
      plannerSummary: planDraft?.summary,
      requiredInputs,
      input: mergedInput,
      ...(Object.keys(paramResolution).length > 0 ? { paramResolution } : {}),
    };

    if (runtimeDefaultSources && Object.keys(runtimeDefaultSources).length > 0) {
      normalizedInput.runtimeDefaultSources = runtimeDefaultSources;
    }

    if (planDraft?.skill_match) {
      normalizedInput.skillMatch = planDraft.skill_match;
      normalizedInput.capabilityMatch = {
        capabilityId: planDraft.skill_match.skill_id,
        capabilityName: planDraft.skill_match.skill_name,
        confidence: planDraft.skill_match.confidence,
        matchReason: planDraft.skill_match.match_reason,
      };
    }

    if (planDraft?.steps) {
      normalizedInput.planSteps = planDraft.steps;
    }

    if (this.browserPhaseCommandBuilder.readNonEmptyString(planDraft?.runtime_source_type)) {
      normalizedInput.runtimeSourceType = this.browserPhaseCommandBuilder.readNonEmptyString(
        planDraft.runtime_source_type
      );
    }

    if (planDraft?.loop_workflow) {
      normalizedInput.loopWorkflow = planDraft.loop_workflow;
    }

    if (planDraft?.risk_summary) {
      normalizedInput.riskSummary = planDraft.risk_summary;
    }

    if (planDraft?.semantic) {
      normalizedInput.semantic = planDraft.semantic;
    }

    const bootstrapUrl = this.extractBootstrapUrl(mergedInput, planDraft);
    if (bootstrapUrl) {
      normalizedInput.url = bootstrapUrl;
    }

    if (
      promptDebugCandidate &&
      typeof promptDebugCandidate === 'object' &&
      !Array.isArray(promptDebugCandidate)
    ) {
      normalizedInput.promptDebug = promptDebugCandidate;
    }

    return normalizedInput;
  }

  private reconcilePlanDraftWithResolvedValues(
    planDraft: PlanDraftLike | undefined,
    resolvedInput: Record<string, unknown>,
    source: ExecutionRequiredInput['source'] | Record<string, ExecutionRequiredInput['source']>
  ): PlanDraftLike | undefined {
    if (!planDraft || Object.keys(resolvedInput || {}).length === 0) {
      return planDraft;
    }

    const requiredInputs = planDraft.required_inputs.map((item) => {
      if (
        !this.executionInputResolutionService.isBlockingRequiredInput(item) ||
        !Object.prototype.hasOwnProperty.call(resolvedInput, item.name)
      ) {
        return item;
      }

      const value = resolvedInput[item.name];
      if (!this.executionInputResolutionService.hasMeaningfulSubmittedInputValue(value)) {
        return item;
      }
      if (!this.isRequiredInputValueAllowed(item, value)) {
        return item;
      }

      if (item.needs_confirmation && source !== 'user_input') {
        return {
          ...item,
          value,
          source: typeof source === 'string' ? source : source[item.name] || item.source,
          missing: true,
        };
      }

      const resolvedSource = typeof source === 'string' ? source : source[item.name] || item.source;
      return {
        ...item,
        value,
        missing: false,
        source: resolvedSource,
        needs_confirmation: false,
        missing_reason: undefined,
      };
    });

    const missingRequiredInputs = requiredInputs.filter(
      (item) => item.required && this.executionInputResolutionService.isBlockingRequiredInput(item)
    );
    const riskItems =
      missingRequiredInputs.length > 0
        ? Array.from(new Set([...planDraft.risk_summary.items, 'missing_required_inputs']))
        : planDraft.risk_summary.items.filter((item) => item !== 'missing_required_inputs');
    const steps =
      missingRequiredInputs.length > 0
        ? planDraft.steps.map((step) => {
            if (step.kind !== 'human_input') {
              return step;
            }
            return {
              ...step,
              description: `补齐必填参数: ${missingRequiredInputs.map((item) => item.name).join(', ')}`,
            };
          })
        : planDraft.steps.filter((step) => step.kind !== 'human_input');

    return {
      ...planDraft,
      summary:
        missingRequiredInputs.length > 0
          ? `已识别技能 ${planDraft.skill_match?.skill_name || '目标技能'}，但仍缺少 ${missingRequiredInputs.length} 个关键输入。`
          : planDraft.skill_match
            ? `已识别技能 ${planDraft.skill_match.skill_name}，可以按计划进入执行。`
            : planDraft.summary,
      steps,
      required_inputs: requiredInputs,
      semantic: this.reconcilePlanSemantic(
        planDraft.semantic as unknown as Record<string, unknown> | undefined,
        requiredInputs
      ) as unknown as PlannerSemanticLike | undefined,
      risk_summary: {
        ...planDraft.risk_summary,
        level: missingRequiredInputs.length > 0 ? planDraft.risk_summary.level : 'low',
        items: riskItems.length > 0 ? riskItems : ['no_material_risk_detected'],
      },
    };
  }

  private isRequiredInputValueAllowed(item: ExecutionRequiredInput, value: unknown): boolean {
    if (!Array.isArray(item.enum) || item.enum.length === 0) {
      return true;
    }
    return (typeof value === 'string' || typeof value === 'number') && item.enum.includes(value);
  }

  private resolveSemanticGroupFieldNames(
    group: PlannerSemanticGroupedMissingLike,
    requiredInputs: ExecutionRequiredInput[]
  ): string[] {
    if (group.kind === 'array_group') {
      const groupPrefix = `${group.key}[].`;
      const fieldNames = requiredInputs
        .map((item) => item.name)
        .filter((name) => name === group.key || name.startsWith(groupPrefix));
      if (fieldNames.length > 0) {
        return fieldNames;
      }
    }

    const fieldNames = Array.isArray(group.fieldNames)
      ? group.fieldNames.filter(
          (name): name is string => typeof name === 'string' && name.trim().length > 0
        )
      : [];
    if (fieldNames.length > 0) {
      return Array.from(new Set(fieldNames));
    }

    return [group.key];
  }

  private normalizeSemanticGroupedMissing(
    group: PlannerSemanticGroupedMissingLike
  ): PlannerSemanticGroupedMissingLike {
    if (group.kind === 'array_group') {
      return group;
    }

    return {
      ...group,
      key: this.normalizeSemanticMissingKey(group.key),
      label: this.normalizeSemanticMissingLabel(group.label),
      description:
        typeof group.description === 'string' && group.description.trim()
          ? group.description
          : `请补充 ${this.normalizeSemanticMissingLabel(group.label || group.key)}`,
    };
  }

  private normalizeSemanticMissingKey(value: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return '';
    }

    return normalized.replace(/[._-](?:zh|ja|cn|jp)$/iu, '').trim();
  }

  private normalizeSemanticMissingLabel(value: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return '';
    }

    return normalized
      .replace(/\s*[（(](?:中文|日文|日语|zh|ja|cn|jp)[）)]\s*$/iu, '')
      .replace(/[._-](?:zh|ja|cn|jp)$/iu, '')
      .trim();
  }

  private buildSemanticSummary(
    mode: 'field_level' | 'complex_document',
    finalReady: boolean,
    previewReady: boolean,
    groupedMissingCount: number,
    blockingGroupCount: number
  ): string {
    if (mode === 'complex_document') {
      return finalReady
        ? '文档参数已满足最终渲染要求。'
        : previewReady
          ? `文档可以先进入预览，但仍缺少 ${groupedMissingCount} 个业务组。`
          : `文档仍缺少 ${blockingGroupCount} 个关键业务组。`;
    }

    return finalReady ? '执行参数已满足要求。' : `仍缺少 ${blockingGroupCount} 个必填参数。`;
  }

  private extractBootstrapUrl(
    input: Record<string, unknown>,
    planDraft?: PlanDraftLike
  ): string | undefined {
    if (typeof input.url === 'string' && input.url.trim()) {
      return input.url;
    }

    const urlLikeInput = planDraft?.required_inputs.find(
      (item) =>
        item.name.toLowerCase() === 'url' && typeof item.value === 'string' && item.value.trim()
    );

    return typeof urlLikeInput?.value === 'string' ? urlLikeInput.value : undefined;
  }

  private collectDefaultsFromSchemaProperties(
    resolution: RuntimeDefaultResolutionLike,
    properties: Record<string, SkillSchemaPropertyLike>,
    source: ExecutionParamSource
  ): void {
    Object.entries(properties || {}).forEach(([name, property]) => {
      if (this.isRuntimeCredentialField(name, property)) {
        return;
      }
      const normalizedDefault = this.executionInputResolutionService.normalizeSubmittedInputValue(
        property?.default,
        String(property?.type || 'string')
      );
      if (
        !this.executionInputResolutionService.hasMeaningfulSubmittedInputValue(normalizedDefault)
      ) {
        return;
      }
      resolution.input[name] = normalizedDefault;
      resolution.sources[name] = source;
    });
  }

  private collectDefaultsFromWorkflowPolicy(
    resolution: RuntimeDefaultResolutionLike,
    policies: Record<string, WorkflowParamPolicySnapshotLike> | undefined,
    properties: Record<string, SkillSchemaPropertyLike>
  ): void {
    Object.entries(policies || {}).forEach(([name, policy]) => {
      if (this.isRuntimeCredentialField(name, properties[name])) {
        return;
      }
      const normalizedDefault = this.executionInputResolutionService.normalizeSubmittedInputValue(
        policy?.defaultValue,
        String(properties[name]?.type || 'string')
      );
      if (
        !this.executionInputResolutionService.hasMeaningfulSubmittedInputValue(normalizedDefault)
      ) {
        return;
      }
      resolution.input[name] = normalizedDefault;
      resolution.sources[name] = 'workflow_default';
    });
  }

  private isRuntimeCredentialField(name: string, property?: SkillSchemaPropertyLike): boolean {
    const rawProp = property as Record<string, unknown> | undefined;
    if (
      rawProp?.isSecret === true ||
      rawProp?.format === 'password' ||
      Boolean(rawProp?.credentialCategory)
    ) {
      return true;
    }
    const lower = name.toLowerCase();
    return (
      lower.includes('credential') ||
      lower.includes('password') ||
      lower.includes('passwd') ||
      lower.includes('devicekey') ||
      lower.includes('device_key') ||
      /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|secret)$/i.test(name) ||
      (typeof rawProp?.description === 'string' &&
        /(密码|口令|密钥|凭证|私钥|token)/i.test(rawProp.description))
    );
  }
}
