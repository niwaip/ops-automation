import { Injectable } from '@nestjs/common';
import {
  CreateExecutionDto,
  ExecutionNormalizedInputJson,
  ExecutionParamSource,
  ExecutionRequiredInput,
} from './execution.dto';
import { BROWSER_ACTIONS, BROWSER_RUNTIME } from './browser-execution-constants';
import { ExecutionInputResolutionService } from './execution-input-resolution.service';


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
  planner_mode: 'skill' | 'fallback';
  objective: string;
  summary: string;
  skill_match?: PlannerSkillMatchLike;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    kind: 'skill' | 'tool' | 'human_input' | 'execution';
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
  [key: string]: unknown;
}

@Injectable()
export class ExecutionPlanNormalizationService {
  constructor(
    private readonly executionInputResolutionService: ExecutionInputResolutionService,
  ) {}

  reconcilePlanDraftWithInput(
    planDraft: PlanDraftLike | undefined,
    input: Record<string, unknown> | undefined,
  ): PlanDraftLike | undefined {
    if (!planDraft || !input) {
      return planDraft;
    }
    const resolvedInput = planDraft.required_inputs.reduce<Record<string, unknown>>((acc, item) => {
      if (!Object.prototype.hasOwnProperty.call(input, item.name)) {
        return acc;
      }
      const normalizedValue = this.executionInputResolutionService.normalizeSubmittedInputValue(input[item.name], item.type);
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
    runtimeDefaultSources?: Record<string, ExecutionParamSource>,
  ): PlanDraftLike | undefined {
    return this.reconcilePlanDraftWithResolvedValues(planDraft, runtimeDefaultInput, runtimeDefaultSources || 'default');
  }

  buildRuntimeDefaultResolution(
    skillPayload: SkillPayloadLike | undefined,
    templateSchemas: TemplateSchemaLike[] = [],
  ): RuntimeDefaultResolutionLike {
    return templateSchemas.reduce<RuntimeDefaultResolutionLike>((acc, templateSchema) => {
      const properties = templateSchema?.paramsSchema?.properties || {};
      this.collectDefaultsFromSchemaProperties(acc, properties, 'default');
      this.collectDefaultsFromWorkflowPolicy(acc, templateSchema?.inputPolicy?.params, properties);
      return acc;
    }, [skillPayload].reduce<RuntimeDefaultResolutionLike>((acc, currentSkillPayload) => {
      this.collectDefaultsFromSchemaProperties(acc, currentSkillPayload?.paramsSchema?.properties || {}, 'default');
      return acc;
    }, { input: {}, sources: {} }));
  }

  reconcilePlanSemantic(
    semantic: Record<string, unknown> | undefined,
    requiredInputs: ExecutionRequiredInput[],
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
        const currentMissingFieldNames = groupFieldNames.filter((name) => missingFieldNames.has(name));
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
        const existing = acc.find((item) => item.key === normalizedGroup.key && item.kind === normalizedGroup.kind);
        if (!existing) {
          acc.push(normalizedGroup);
          return acc;
        }
        existing.blocking = existing.blocking || normalizedGroup.blocking;
        existing.required = existing.required || normalizedGroup.required;
        existing.fieldNames = Array.from(new Set([...(existing.fieldNames || []), ...(normalizedGroup.fieldNames || [])]));
        existing.missingFieldNames = Array.from(new Set([
          ...(existing.missingFieldNames || []),
          ...(normalizedGroup.missingFieldNames || []),
        ]));
        existing.label = this.normalizeSemanticMissingLabel(existing.label || normalizedGroup.label);
        existing.description = existing.description || normalizedGroup.description;
        return acc;
      }, []);

    const coveredMissingNames = new Set(groupedMissing.flatMap((group) => group.missingFieldNames));
    missingRequiredInputs
      .filter((item) => !coveredMissingNames.has(item.name))
      .forEach((item) => {
        const normalizedKey = this.normalizeSemanticMissingKey(item.name);
        const existing = groupedMissing.find((group) => group.key === normalizedKey && group.kind === 'field');
        if (existing) {
          existing.fieldNames = Array.from(new Set([...(existing.fieldNames || []), item.name]));
          existing.missingFieldNames = Array.from(new Set([...(existing.missingFieldNames || []), item.name]));
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

    return {
      ...semanticRecord,
      previewReady,
      finalReady,
      summary: finalReady
        ? '文档参数已满足最终渲染要求。'
        : previewReady
          ? `文档可以先进入预览，但仍缺少 ${groupedMissing.length} 个业务组。`
          : `文档仍缺少 ${blockingGroups.length} 个关键业务组。`,
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

  normalizeExecutionRuntimeType(runtimeType?: string | null): 'browser' | 'document' | 'workflow' | 'custom' {
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
    normalizedInput?: Record<string, unknown>,
  ): 'browser' | 'document' | 'workflow' | 'custom' {
    const normalized = this.normalizeExecutionRuntimeType(runtimeType);
    if (normalized !== 'custom') {
      return normalized;
    }

    const hasBrowserPhaseCommands = Boolean(
      planDraft?.steps?.some((step) => Array.isArray(step.commands) && step.commands.length > 0),
    );
    if (hasBrowserPhaseCommands) {
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
      (typeof dto.skillId === 'string' && dto.skillId.trim())
      || (typeof dto.capabilityId === 'string' && dto.capabilityId.trim()),
    );
    if (!hasExplicitSkill) {
      return false;
    }

    const input = dto.input && typeof dto.input === 'object' && !Array.isArray(dto.input)
      ? dto.input
      : undefined;
    if (!input || Object.keys(input).length === 0) {
      return false;
    }

    const candidateKeys = ['prompt', 'task', 'goal', 'instruction', 'query', 'url'];
    return !candidateKeys.some((key) => typeof input[key] === 'string' && input[key].trim());
  }

  buildDirectExecutionPlanDraft(
    dto: CreateExecutionDto,
    resolvedSkillId: string,
  ): PlanDraftLike {
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

  buildPlannerResolvedInput(
    planDraft: PlanDraftLike | undefined,
    input?: Record<string, unknown>,
    runtimeDefaultInput?: Record<string, unknown>,
  ): Record<string, unknown> {
    const plannerExtractedInput = (planDraft?.required_inputs || []).reduce<Record<string, unknown>>(
      (acc, item) => {
        if (!item || item.missing || item.value === undefined || item.value === null) {
          return acc;
        }
        acc[item.name] = item.value;
        return acc;
      },
      {},
    );

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
  ): PlanDraftLike['steps'] {
    const plannerSteps: PlanDraftLike['steps'] = [];
    workflowSteps.forEach((workflowStep, index) => {
      const activityLabel = this.readNonEmptyString(
        workflowStep.name,
        workflowStep.activityName,
        workflowStep.activityRef,
      ) || `Activity ${index + 1}`;
      const activityKey = this.readNonEmptyString(
        workflowStep.id,
        workflowStep.activityName,
        workflowStep.activityRef,
        activityLabel,
      ) || `activity_${index + 1}`;
      const activityRef = this.readNonEmptyString(workflowStep.activityRef);
      const matchingActivity = browserActivities.find((activity, activityIndex) => {
        const fn = this.readNonEmptyString(activity.fn);
        const name = this.readNonEmptyString(activity.name);
        if (activityRef && fn && (activityRef === fn || activityRef === `custom:${fn}`)) {
          return true;
        }
        if (name && (name === activityLabel || name === this.readNonEmptyString(workflowStep.activityName))) {
          return true;
        }
        return activityIndex === index;
      });
      const commands = this.mapBrowserActivityCommands(
        this.readRecordArray(this.readRecord(matchingActivity?.config)?.steps),
        index + 1,
        activityLabel,
        resolvedInput,
      );
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
    objectiveBuilder: (dto: CreateExecutionDto) => string,
  ): ExecutionNormalizedInputJson {
    const rawInput = dto.input || {};
    const promptDebugCandidate = (rawInput as Record<string, unknown>).__promptDebug;
    const input = { ...rawInput } as Record<string, unknown>;
    delete input.__promptDebug;

    const paramResolution = this.executionInputResolutionService.buildParamResolutionFromRequiredInputs(planDraft?.required_inputs);
    const trackedKeys = new Set(Object.keys(paramResolution));
    const passthroughInput = this.executionInputResolutionService.omitTrackedInputKeys(
      {
        ...(runtimeDefaultInput || {}),
        ...input,
      },
      trackedKeys,
    );
    const plannerExtractedInput = Object.keys(paramResolution).length > 0
      ? this.executionInputResolutionService.buildFinalInputFromParamResolution(paramResolution)
      : (planDraft?.required_inputs || []).reduce<Record<string, unknown>>((acc, item) => {
          if (!item || item.missing || item.needs_confirmation || item.value === undefined || item.value === null) {
            return acc;
          }
          acc[item.name] = item.value;
          return acc;
        }, {});
    const mergedInput = {
      ...passthroughInput,
      ...plannerExtractedInput,
    };
    const requiredInputs = Object.keys(paramResolution).length > 0
      ? this.executionInputResolutionService.buildRequiredInputsFromParamResolution(paramResolution)
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
      promptDebugCandidate
      && typeof promptDebugCandidate === 'object'
      && !Array.isArray(promptDebugCandidate)
    ) {
      normalizedInput.promptDebug = promptDebugCandidate;
    }

    return normalizedInput;
  }

  private reconcilePlanDraftWithResolvedValues(
    planDraft: PlanDraftLike | undefined,
    resolvedInput: Record<string, unknown>,
    source: ExecutionRequiredInput['source'] | Record<string, ExecutionRequiredInput['source']>,
  ): PlanDraftLike | undefined {
    if (!planDraft || Object.keys(resolvedInput || {}).length === 0) {
      return planDraft;
    }

    const requiredInputs = planDraft.required_inputs.map((item) => {
      if (!this.executionInputResolutionService.isBlockingRequiredInput(item) || !Object.prototype.hasOwnProperty.call(resolvedInput, item.name)) {
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
          source: typeof source === 'string' ? source : (source[item.name] || item.source),
          missing: true,
        };
      }

      const resolvedSource = typeof source === 'string' ? source : (source[item.name] || item.source);
      return {
        ...item,
        value,
        missing: false,
        source: resolvedSource,
        needs_confirmation: false,
        missing_reason: undefined,
      };
    });

    const missingRequiredInputs = requiredInputs.filter((item) => item.required && this.executionInputResolutionService.isBlockingRequiredInput(item));
    const riskItems = missingRequiredInputs.length > 0
      ? Array.from(new Set([...planDraft.risk_summary.items, 'missing_required_inputs']))
      : planDraft.risk_summary.items.filter((item) => item !== 'missing_required_inputs');
    const steps = missingRequiredInputs.length > 0
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
      summary: missingRequiredInputs.length > 0
        ? `已识别技能 ${planDraft.skill_match?.skill_name || '目标技能'}，但仍缺少 ${missingRequiredInputs.length} 个关键输入。`
        : planDraft.skill_match
          ? `已识别技能 ${planDraft.skill_match.skill_name}，可以按计划进入执行。`
          : planDraft.summary,
      steps,
      required_inputs: requiredInputs,
      semantic: this.reconcilePlanSemantic(
        planDraft.semantic as unknown as Record<string, unknown> | undefined,
        requiredInputs,
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
    requiredInputs: ExecutionRequiredInput[],
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
      ? group.fieldNames.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [];
    if (fieldNames.length > 0) {
      return Array.from(new Set(fieldNames));
    }

    return [group.key];
  }

  private normalizeSemanticGroupedMissing(group: PlannerSemanticGroupedMissingLike): PlannerSemanticGroupedMissingLike {
    if (group.kind === 'array_group') {
      return group;
    }

    return {
      ...group,
      key: this.normalizeSemanticMissingKey(group.key),
      label: this.normalizeSemanticMissingLabel(group.label),
      description: typeof group.description === 'string' && group.description.trim()
        ? group.description
        : `请补充 ${this.normalizeSemanticMissingLabel(group.label || group.key)}`,
    };
  }

  private normalizeSemanticMissingKey(value: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return '';
    }

    return normalized
      .replace(/[._-](?:zh|ja|cn|jp)$/iu, '')
      .trim();
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

  private extractBootstrapUrl(
    input: Record<string, unknown>,
    planDraft?: PlanDraftLike,
  ): string | undefined {
    if (typeof input.url === 'string' && input.url.trim()) {
      return input.url;
    }

    const urlLikeInput = planDraft?.required_inputs.find(
      (item) => item.name.toLowerCase() === 'url' && typeof item.value === 'string' && item.value.trim(),
    );

    return typeof urlLikeInput?.value === 'string' ? urlLikeInput.value : undefined;
  }

  private collectDefaultsFromSchemaProperties(
    resolution: RuntimeDefaultResolutionLike,
    properties: Record<string, SkillSchemaPropertyLike>,
    source: ExecutionParamSource,
  ): void {
    Object.entries(properties || {}).forEach(([name, property]) => {
      const normalizedDefault = this.executionInputResolutionService.normalizeSubmittedInputValue(
        property?.default,
        String(property?.type || 'string'),
      );
      if (!this.executionInputResolutionService.hasMeaningfulSubmittedInputValue(normalizedDefault)) {
        return;
      }
      resolution.input[name] = normalizedDefault;
      resolution.sources[name] = source;
    });
  }

  private collectDefaultsFromWorkflowPolicy(
    resolution: RuntimeDefaultResolutionLike,
    policies: Record<string, WorkflowParamPolicySnapshotLike> | undefined,
    properties: Record<string, SkillSchemaPropertyLike>,
  ): void {
    Object.entries(policies || {}).forEach(([name, policy]) => {
      const normalizedDefault = this.executionInputResolutionService.normalizeSubmittedInputValue(
        policy?.defaultValue,
        String(properties[name]?.type || 'string'),
      );
      if (!this.executionInputResolutionService.hasMeaningfulSubmittedInputValue(normalizedDefault)) {
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
    resolvedInput: Record<string, unknown>,
  ): NonNullable<PlanDraftLike['steps'][number]['commands']> {
    const commands: NonNullable<PlanDraftLike['steps'][number]['commands']> = [];
    steps.forEach((step, index) => {
      const config = this.readRecord(step.config) || {};
      const normalizedAction = this.normalizeBrowserPhaseCommandAction(
        this.readNonEmptyString(config.action, step.action),
      );
      if (!normalizedAction) {
        return;
      }

      const input = this.buildBrowserPhaseCommandInput(
        normalizedAction,
        config,
        resolvedInput,
      );

      commands.push({
        step_id: `${this.sanitizePhaseKeyFragment(activityName)}__command_${String(index + 1).padStart(2, '0')}`,
        capability_type: BROWSER_RUNTIME.CAPABILITY_TYPE,
        action: normalizedAction,
        input,
        metadata: {
          stepName: this.readNonEmptyString(step.name) || `${activityName} command ${index + 1}`,
          activityName,
          activityOrder,
        },
      });
    });
    return commands;
  }

  private buildBrowserPhaseCommandInput(
    action: string,
    config: Record<string, unknown>,
    resolvedInput: Record<string, unknown>,
  ): Record<string, unknown> {
    const resolve = (value: unknown): unknown => this.resolveBrowserTemplateValue(value, resolvedInput);
    const target = this.readNonEmptyString(
      resolve(config.target),
      resolve(config.selector),
      resolve(config.url),
      resolve(config.text),
    );
    const duration = this.readInteger(resolve(config.duration), resolve(config.timeoutMs));
    const selector = this.readNonEmptyString(resolve(config.selector), resolve(config.target));
    const value = this.readNonEmptyString(resolve(config.value), resolve(config.text), resolve(config.query));
    const text = this.readNonEmptyString(resolve(config.text), resolve(config.value), resolve(config.query));
    const url = this.readNonEmptyString(resolve(config.url), resolve(config.target));

    const args = (() => {
      switch (action) {
        case BROWSER_ACTIONS.GOTO:
        case 'navigate':
          return Object.fromEntries(
            Object.entries({ url }).filter(([, item]) => item !== undefined),
          );
        case 'fill':
        case 'type_text':
          return Object.fromEntries(
            Object.entries({ selector, value, text }).filter(([, item]) => item !== undefined),
          );
        case 'click':
        case 'hover':
        case 'screenshot':
        case 'snapshot':
        case 'read_page':
        case 'get_text':
          return Object.fromEntries(
            Object.entries({ selector }).filter(([, item]) => item !== undefined),
          );
        case 'wait':
          return Object.fromEntries(
            Object.entries({ duration, selector }).filter(([, item]) => item !== undefined),
          );
        default:
          return Object.fromEntries(
            Object.entries({
              duration,
              selector,
              value,
              text,
              url,
            }).filter(([, item]) => item !== undefined),
          );
      }
    })();

    return {
      ...(target ? { target } : {}),
      ...(Object.keys(args).length > 0 ? { args } : {}),
    };
  }

  private resolveBrowserTemplateValue(
    value: unknown,
    resolvedInput: Record<string, unknown>,
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
        (current, pattern) => current.replace(pattern, (_match, key) => resolvePlaceholder(String(key))),
        value,
      );
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveBrowserTemplateValue(item, resolvedInput));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.resolveBrowserTemplateValue(item, resolvedInput)]),
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
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'phase';
  }

  private readRecordArray(source: unknown, key?: string): Record<string, unknown>[] {
    const target = key && source && typeof source === 'object' && !Array.isArray(source)
      ? (source as Record<string, unknown>)[key]
      : source;
    return Array.isArray(target)
      ? target.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
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
}
