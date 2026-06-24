import { Injectable } from '@nestjs/common';
import {
  CreateExecutionDto,
  ExecutionNormalizedInputJson,
  ExecutionParamSource,
  ExecutionRequiredInput,
} from '../../state/execution.dto';
import { BROWSER_ACTIONS, BROWSER_RUNTIME } from '../browser/browser-execution-constants';
import { ExecutionInputResolutionService } from '../../human-control/execution-input-resolution.service';
import {
  BrowserLoopDraftLike,
  BrowserLoopWorkflowPlanLike,
  partitionBrowserTemplateStepsForLoopWorkflow,
} from '../browser/browser-loop-workflow-plan.builder';

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

interface PlanDraftLike {
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
      this.readNonEmptyString(
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
      this.readNonEmptyString(planDraft.skill_match?.skill_name, resolvedSkillId) || resolvedSkillId;

    return {
      ...planDraft,
      planner_mode: 'skill',
      ...(this.readNonEmptyString(options?.runtimeSourceType)
        ? {
            runtime_source_type: this.readNonEmptyString(options?.runtimeSourceType),
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
          this.readNonEmptyString(planDraft.skill_match?.match_reason) || 'explicit_skill_selection',
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
      this.readNonEmptyString(input.planDraft.skill_match?.skill_name, input.resolvedSkillId) ||
      input.resolvedSkillId;
    const loopPartition = partitionBrowserTemplateStepsForLoopWorkflow({
      templateSteps: input.templateSteps,
      loopDraft: input.loopDraft,
      loopId: `${input.resolvedSkillId}_loop`,
    });

    const stepCounter = { value: 0 };
    const browserSteps = [
      ...loopPartition.preLoopSteps.map((step) =>
        this.buildBrowserLoopWorkflowActivityStep({
          templateStep: step,
          segment: 'pre_loop',
          loopPlan: loopPartition.loopPlan,
          counter: stepCounter,
          resolvedInput: input.resolvedInput,
        })
      ),
      this.buildBrowserLoopWorkflowControlStep({
        id: 'loop_init',
        title: 'Loop init',
        description: '初始化循环上下文。',
        loopPlan: loopPartition.loopPlan,
      }),
      ...loopPartition.iterationSteps.map((step) =>
        this.buildBrowserLoopWorkflowActivityStep({
          templateStep: step,
          segment: 'iteration',
          loopPlan: loopPartition.loopPlan,
          counter: stepCounter,
          resolvedInput: input.resolvedInput,
          loopIteration: 1,
          loopTemplate: true,
        })
      ),
      this.buildBrowserLoopWorkflowControlStep({
        id: 'loop_eval_after_iteration',
        title: 'Loop evaluate',
        description: '根据 stop condition 评估是否继续下一轮。',
        loopPlan: loopPartition.loopPlan,
        stopCondition: loopPartition.loopPlan.stopWhen as Record<string, unknown> | undefined,
      }),
      ...loopPartition.postLoopSteps.map((step) =>
        this.buildBrowserLoopWorkflowActivityStep({
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
        this.readNonEmptyString(input.runtimeSourceType) || 'browser_recording',
      loop_workflow: loopPartition.loopPlan,
      skill_match: {
        skill_id: input.resolvedSkillId,
        skill_name: skillName,
        confidence:
          typeof input.planDraft.skill_match?.confidence === 'number'
            ? input.planDraft.skill_match.confidence
            : 1,
        match_reason:
          this.readNonEmptyString(input.planDraft.skill_match?.match_reason) ||
          'browser_loop_workflow',
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
        this.readNonEmptyString(
          workflowStep.name,
          workflowStep.activityName,
          workflowStep.activityRef
        ) || `Activity ${index + 1}`;
      const activityKey =
        this.readNonEmptyString(
          workflowStep.id,
          workflowStep.activityName,
          workflowStep.activityRef,
          activityLabel
        ) || `activity_${index + 1}`;
      const activityRef = this.readNonEmptyString(workflowStep.activityRef);
      const matchingActivity = browserActivities.find((activity, activityIndex) => {
        const fn = this.readNonEmptyString(activity.fn);
        const name = this.readNonEmptyString(activity.name);
        if (activityRef && fn && (activityRef === fn || activityRef === `custom:${fn}`)) {
          return true;
        }
        if (
          name &&
          (name === activityLabel || name === this.readNonEmptyString(workflowStep.activityName))
        ) {
          return true;
        }
        return activityIndex === index;
      });
      const activitySourceSteps = this.readRecordArray(
        this.readRecord(matchingActivity?.config)?.steps
      );
      const enrichedActivity = this.mergeBrowserActivityStepsWithTemplateSteps(
        activitySourceSteps,
        templateSteps,
        templateStepCursor
      );
      const commands = this.mapBrowserActivityCommands(
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
        phase_key: `phase_${String(index + 1).padStart(2, '0')}_${this.sanitizePhaseKeyFragment(activityKey)}`,
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

    if (this.readNonEmptyString(planDraft?.runtime_source_type)) {
      normalizedInput.runtimeSourceType = this.readNonEmptyString(planDraft.runtime_source_type);
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

  private mapBrowserActivityCommands(
    steps: Record<string, unknown>[],
    activityOrder: number,
    activityName: string,
    resolvedInput: Record<string, unknown>
  ): NonNullable<PlanDraftLike['steps'][number]['commands']> {
    const commands: NonNullable<PlanDraftLike['steps'][number]['commands']> = [];
    steps.forEach((step, index) => {
      const config = {
        ...step,
        ...(this.readRecord(step.config) || {}),
      };
      const normalizedAction = this.normalizeBrowserPhaseCommandAction(
        this.readNonEmptyString(config.action, step.action)
      );
      if (!normalizedAction) {
        return;
      }

      const input = this.buildBrowserPhaseCommandInput(normalizedAction, config, resolvedInput);

      // #region debug-point A:browser-phase-command-normalization
      (() => {
        const suspiciousAction = ['read_value', 'branch'].includes(normalizedAction);
        const suspiciousShape =
          typeof step.action === 'string' ||
          Boolean((step as Record<string, unknown>).locator) ||
          Boolean((step as Record<string, unknown>).params) ||
          Boolean((step as Record<string, unknown>).branch) ||
          typeof (step as Record<string, unknown>).output_var === 'string';
        if (!suspiciousAction && !suspiciousShape) {
          return;
        }
        const fs = require('node:fs');
        let u = 'http://127.0.0.1:7777/event';
        let s = 'gross-margin-review';
        try {
          const env = fs.readFileSync('.dbg/gross-margin-review.env', 'utf8');
          u = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u;
          s = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s;
        } catch {}
        fetch(u, {
          method: 'POST',
          body: JSON.stringify({
            sessionId: s,
            runId: 'pre-fix',
            hypothesisId: suspiciousAction ? 'A' : 'B',
            location: 'execution-plan-normalization.service.ts:765',
            msg: '[DEBUG] browser phase command normalized',
            data: {
              activityName,
              activityOrder,
              index: index + 1,
              rawStepAction: this.readNonEmptyString(step.action, config.action) || null,
              normalizedAction,
              rawStepKeys: Object.keys(step),
              configKeys: Object.keys(config),
              builtInput: input,
              rawStep: {
                step_id: this.readNonEmptyString(step.step_id, step.stepId) || null,
                action: step.action || null,
                locator: this.readRecord(step.locator),
                params: this.readRecord(step.params),
                branch: this.readRecord(step.branch),
                output_var:
                  typeof step.output_var === 'string'
                    ? step.output_var
                    : typeof step.outputVar === 'string'
                      ? step.outputVar
                      : null,
              },
              resolvedInput,
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion

      const metadata = {
        stepName: this.readNonEmptyString(step.name) || `${activityName} command ${index + 1}`,
        activityName,
        activityOrder,
        ...(this.buildBrowserPhaseCommandMetadata(normalizedAction, config) || {}),
      };

      commands.push({
        step_id: `${this.sanitizePhaseKeyFragment(activityName)}__command_${String(index + 1).padStart(2, '0')}`,
        capability_type: BROWSER_RUNTIME.CAPABILITY_TYPE,
        action: normalizedAction,
        input,
        metadata,
      });
    });
    return commands;
  }

  private mergeBrowserActivityStepsWithTemplateSteps(
    activitySteps: Record<string, unknown>[],
    templateSteps: Record<string, unknown>[],
    templateStepCursor: number
  ): { steps: Record<string, unknown>[]; nextTemplateStepCursor: number } {
    if (activitySteps.length === 0 || templateSteps.length === 0) {
      return {
        steps: activitySteps,
        nextTemplateStepCursor: templateStepCursor,
      };
    }

    let nextTemplateStepCursor = templateStepCursor;
    const steps = activitySteps.map((step) => {
      const sourceAction = this.normalizeBrowserPhaseCommandAction(
        this.readNonEmptyString(step.action, this.readRecord(step.config)?.action)
      );
      if (!sourceAction) {
        return step;
      }

      for (let index = nextTemplateStepCursor; index < templateSteps.length; index += 1) {
        const templateStep = templateSteps[index];
        const templateAction = this.normalizeBrowserPhaseCommandAction(
          this.readNonEmptyString(templateStep.action, this.readRecord(templateStep.config)?.action)
        );
        if (!templateAction || templateAction !== sourceAction) {
          continue;
        }

        nextTemplateStepCursor = index + 1;
        return {
          ...step,
          ...templateStep,
          config: {
            ...(this.readRecord(step.config) || {}),
            ...(this.readRecord(templateStep.config) || {}),
          },
        };
      }

      return step;
    });

    return {
      steps,
      nextTemplateStepCursor,
    };
  }

  private buildBrowserLoopWorkflowActivityStep(input: {
    templateStep: Record<string, unknown>;
    segment: 'pre_loop' | 'iteration' | 'post_loop';
    loopPlan: BrowserLoopWorkflowPlanLike;
    counter: { value: number };
    resolvedInput: Record<string, unknown>;
    loopIteration?: number;
    loopTemplate?: boolean;
  }): PlanDraftLike['steps'][number] {
    input.counter.value += 1;
    const templateStepId =
      this.readNonEmptyString(input.templateStep.step_id, input.templateStep.id) ||
      `template_step_${input.counter.value}`;
    const title =
      this.readNonEmptyString(input.templateStep.description, input.templateStep.name) ||
      templateStepId;
    const commands = this.mapBrowserActivityCommands(
      [input.templateStep],
      input.counter.value,
      title,
      input.resolvedInput
    );

    return {
      id: `${input.segment}_${templateStepId}`,
      title,
      description: `执行浏览器步骤 ${title}。`,
      kind: 'tool',
      status: 'planned',
      phase_key: `phase_${String(input.counter.value).padStart(2, '0')}_${this.sanitizePhaseKeyFragment(`${input.segment}_${templateStepId}`)}`,
      phase_name: title,
      phase_type: 'workflow_activity',
      commands,
      loop_id: input.loopPlan.loopId,
      loop_segment: input.segment,
      ...(typeof input.loopIteration === 'number' ? { loop_iteration: input.loopIteration } : {}),
      ...(typeof input.loopTemplate === 'boolean' ? { loop_template: input.loopTemplate } : {}),
      recovery_policy: {
        max_auto_retries: 1,
        allow_human_takeover: true,
      },
    };
  }

  private buildBrowserLoopWorkflowControlStep(input: {
    id: string;
    title: string;
    description: string;
    loopPlan: BrowserLoopWorkflowPlanLike;
    stopCondition?: Record<string, unknown>;
  }): PlanDraftLike['steps'][number] {
    return {
      id: input.id,
      title: input.title,
      description: input.description,
      kind: 'control',
      status: 'planned',
      tool_name: 'loop_control',
      phase_key: `phase_${this.sanitizePhaseKeyFragment(input.id)}`,
      phase_name: input.title,
      phase_type: 'loop_control',
      loop_control_action: input.id,
      loop_id: input.loopPlan.loopId,
      loop_segment: 'control',
      ...(input.stopCondition ? { loop_stop_condition: input.stopCondition } : {}),
    };
  }

  private buildBrowserPhaseCommandInput(
    action: string,
    config: Record<string, unknown>,
    resolvedInput: Record<string, unknown>
  ): Record<string, unknown> {
    const resolve = (value: unknown): unknown =>
      this.resolveBrowserTemplateValue(value, resolvedInput);
    const params = this.readRecord(config.params) || {};
    const locatorTarget = this.buildBrowserPhaseLocatorTarget(
      this.readRecord(config.locator, params.locator),
      resolvedInput
    );
    const target = this.readNonEmptyString(
      locatorTarget,
      resolve(config.target),
      resolve(params.target),
      resolve(config.selector),
      resolve(params.selector),
      resolve(config.url),
      resolve(params.url),
      resolve(config.text),
      resolve(params.text),
      resolve(config.value),
      resolve(params.value)
    );
    const duration = this.readInteger(
      resolve(config.duration),
      resolve(params.duration),
      resolve(config.timeoutMs),
      resolve(params.timeoutMs)
    );
    const selector = this.readNonEmptyString(
      locatorTarget,
      resolve(config.selector),
      resolve(params.selector),
      resolve(config.target),
      resolve(params.target)
    );
    const value = this.readNonEmptyString(
      resolve(config.value),
      resolve(params.value),
      resolve(config.text),
      resolve(params.text),
      resolve(config.query),
      resolve(params.query)
    );
    const text = this.readNonEmptyString(
      resolve(config.text),
      resolve(params.text),
      resolve(config.value),
      resolve(params.value),
      resolve(config.query),
      resolve(params.query)
    );
    const url = this.readNonEmptyString(
      resolve(config.url),
      resolve(params.url),
      resolve(config.target),
      resolve(params.target)
    );

    const args = (() => {
      switch (action) {
        case BROWSER_ACTIONS.GOTO:
        case 'navigate':
          return Object.fromEntries(
            Object.entries({ url }).filter(([, item]) => item !== undefined)
          );
        case 'fill':
        case 'type_text':
          return Object.fromEntries(
            Object.entries({ selector, value, text }).filter(([, item]) => item !== undefined)
          );
        case 'click':
        case 'hover':
        case 'screenshot':
        case 'snapshot':
        case 'read_page':
        case 'get_text':
          return Object.fromEntries(
            Object.entries({ selector }).filter(([, item]) => item !== undefined)
          );
        case 'wait':
          return Object.fromEntries(
            Object.entries({ duration, selector }).filter(([, item]) => item !== undefined)
          );
        default:
          return Object.fromEntries(
            Object.entries({
              duration,
              selector,
              value,
              text,
              url,
            }).filter(([, item]) => item !== undefined)
          );
      }
    })();

    return {
      ...(target ? { target } : {}),
      ...(Object.keys(args).length > 0 ? { args } : {}),
    };
  }

  private buildBrowserPhaseCommandMetadata(
    action: string,
    config: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {};
    const outputVar = this.readNonEmptyString(config.outputVar, config.output_var);
    if (outputVar) {
      metadata.outputVar = outputVar;
    }

    if (action === 'branch') {
      const branch = this.readRecord(config.branch);
      const conditionFn = this.readNonEmptyString(branch?.conditionFn, branch?.condition_fn);
      if (conditionFn) {
        metadata.branch = {
          conditionFn,
          onMatch:
            this.readNonEmptyString(branch?.onMatch, branch?.on_match) === 'stop'
              ? 'stop'
              : 'continue',
          onMismatch:
            this.readNonEmptyString(branch?.onMismatch, branch?.on_mismatch) === 'takeover'
              ? 'takeover'
              : this.readNonEmptyString(branch?.onMismatch, branch?.on_mismatch) === 'continue'
                ? 'continue'
                : 'stop',
          ...(this.readNonEmptyString(branch?.takeoverReason, branch?.takeover_reason)
            ? {
                takeoverReason: this.readNonEmptyString(
                  branch?.takeoverReason,
                  branch?.takeover_reason
                ),
              }
            : {}),
          ...(this.readNonEmptyString(branch?.description)
            ? { description: this.readNonEmptyString(branch?.description) }
            : {}),
        };
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private resolveBrowserTemplateValue(
    value: unknown,
    resolvedInput: Record<string, unknown>
  ): unknown {
    if (typeof value === 'string') {
      const resolvePlaceholder = (rawKey: string): string => {
        const resolved = resolvedInput[rawKey.trim()];
        return resolved === undefined || resolved === null ? '' : String(resolved);
      };

      return [
        /\$\{\s*([^}]+?)\s*\}/g,
        /\{\{\s*([^}]+?)\s*\}\}/g,
        /\{([A-Za-z0-9_.\[\]-]+)\}/g,
      ].reduce(
        (current, pattern) =>
          current.replace(pattern, (_match, key) => resolvePlaceholder(String(key))),
        value
      );
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveBrowserTemplateValue(item, resolvedInput));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.resolveBrowserTemplateValue(item, resolvedInput),
        ])
      );
    }
    return value;
  }

  private normalizeBrowserPhaseCommandAction(action: string | undefined): string | undefined {
    if (!action) {
      return undefined;
    }

    const normalized = action.trim().toLowerCase();
    switch (normalized) {
      case 'navigate':
        return BROWSER_ACTIONS.GOTO;
      case 'read_value':
        return 'get_text';
      case 'waitforselector':
        return BROWSER_ACTIONS.WAIT;
      case 'press':
        return BROWSER_ACTIONS.PRESS_KEY;
      case 'type':
        return BROWSER_ACTIONS.TYPE_TEXT;
      default:
        return normalized;
    }
  }

  private sanitizePhaseKeyFragment(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'phase'
    );
  }

  private readRecordArray(source: unknown, key?: string): Record<string, unknown>[] {
    const target =
      key && source && typeof source === 'object' && !Array.isArray(source)
        ? (source as Record<string, unknown>)[key]
        : source;
    return Array.isArray(target)
      ? target.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : [];
  }

  private readRecord(...values: unknown[]): Record<string, unknown> | null {
    for (const value of values) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return null;
  }

  private readNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private readInteger(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return Math.trunc(parsed);
        }
      }
    }
    return undefined;
  }

  private buildBrowserPhaseLocatorTarget(
    locator: Record<string, unknown> | null,
    resolvedInput: Record<string, unknown>
  ): string | undefined {
    if (!locator) {
      return undefined;
    }
    const type = this.readNonEmptyString(locator.type)?.toLowerCase();
    const rawValue = this.resolveBrowserTemplateValue(locator.value, resolvedInput);
    const value = this.readNonEmptyString(rawValue);
    if (!type || !value) {
      return undefined;
    }

    switch (type) {
      case 'css':
        return value;
      case 'role':
        return `role=${value}`;
      case 'text':
        return `text=${value}`;
      case 'testid':
      case 'data-testid':
        return `[data-testid="${value}"]`;
      case 'xpath':
        return `xpath=${value}`;
      default:
        return value;
    }
  }
}
