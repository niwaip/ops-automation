import { Prisma } from '../../../prisma';
import type { BrowserPhaseRecoveryPolicy } from '../../recovery/browser-phase-recovery.planner';
import type { BrowserPhaseCheck } from '../../state/execution.dto';
import { BROWSER_ACTIONS, BROWSER_RUNTIME } from '../browser/browser-execution-constants';

export type PlannerStepKind = 'skill' | 'tool' | 'human_input' | 'execution' | 'control';

export interface PlannerBrowserPhaseCommandInput {
  step_id?: string;
  capability_type?: string;
  action: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PlannerPlanStepInput {
  id: string;
  title: string;
  description: string;
  kind: PlannerStepKind;
  tool_name?: string;
  status: 'planned';
  phase_key?: string;
  phase_name?: string;
  phase_type?: string;
  commands?: PlannerBrowserPhaseCommandInput[];
  precheck?: BrowserPhaseCheck;
  postcheck?: BrowserPhaseCheck;
  recovery_policy?: {
    max_auto_retries?: number;
    allow_ai_recovery?: boolean;
    allow_human_takeover?: boolean;
    model_id?: string;
  };
  loop_control_action?: string;
  loop_id?: string;
  loop_segment?: 'pre_loop' | 'iteration' | 'post_loop' | 'control';
  loop_iteration?: number;
  loop_template?: boolean;
  loop_stop_condition?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PlannerPlanDraftStepInput {
  steps?: PlannerPlanStepInput[];
}

const hasBrowserPhaseCommands = (planStep: PlannerPlanStepInput): boolean =>
  Array.isArray(planStep.commands) && planStep.commands.length > 0;

const mapPlannerStepType = (planStep: PlannerPlanStepInput): string => {
  if (hasBrowserPhaseCommands(planStep)) {
    return 'system';
  }

  const { kind } = planStep;
  switch (kind) {
    case 'human_input':
      return 'input_collection';
    case 'control':
      return 'loop_control';
    case 'skill':
    case 'tool':
    case 'execution':
    default:
      return 'system';
  }
};

const mapPlannerStepAction = (planStep: PlannerPlanStepInput): string => {
  if (hasBrowserPhaseCommands(planStep)) {
    return BROWSER_ACTIONS.EXECUTE_PHASE;
  }

  const { kind } = planStep;
  switch (kind) {
    case 'human_input':
      return 'collect_input';
    case 'control':
      return typeof planStep.loop_control_action === 'string' && planStep.loop_control_action.trim().length > 0
          ? planStep.loop_control_action.trim()
          : 'loop_control';
    case 'skill':
    case 'tool':
      return 'execute_skill';
    case 'execution':
      return 'execute_plan';
    default:
      return 'planner_step';
  }
};

const normalizeBrowserPhaseCommands = (
  planStep: PlannerPlanStepInput
):
  | Array<{
      stepId: string;
      capabilityType: string;
      action: string;
      input: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }>
  | undefined => {
  if (!Array.isArray(planStep.commands) || planStep.commands.length === 0) {
    return undefined;
  }

  return planStep.commands
    .filter(
      (command): command is PlannerBrowserPhaseCommandInput =>
        Boolean(command) && typeof command.action === 'string' && command.action.trim().length > 0
    )
    .map((command, index) => ({
      stepId:
        typeof command.step_id === 'string' && command.step_id.trim().length > 0
          ? command.step_id.trim()
          : `${planStep.id}__command_${index + 1}`,
      capabilityType:
        typeof command.capability_type === 'string' && command.capability_type.trim().length > 0
          ? command.capability_type.trim().replace(/_/g, '.')
          : BROWSER_RUNTIME.CAPABILITY_TYPE,
      action: command.action.trim(),
      input:
        command.input && typeof command.input === 'object' && !Array.isArray(command.input)
          ? command.input
          : {},
      metadata:
        command.metadata && typeof command.metadata === 'object' && !Array.isArray(command.metadata)
          ? command.metadata
          : undefined,
    }));
};

const normalizeBrowserPhaseRecoveryPolicy = (
  planStep: PlannerPlanStepInput
): Record<string, unknown> | undefined => {
  const policy = planStep.recovery_policy;
  if (!policy) {
    return undefined;
  }

  const normalized: BrowserPhaseRecoveryPolicy = {
    ...(typeof policy.max_auto_retries === 'number'
      ? { maxAutoRetries: policy.max_auto_retries }
      : {}),
    ...(typeof policy.allow_ai_recovery === 'boolean'
      ? { allowAiRecovery: policy.allow_ai_recovery }
      : {}),
    ...(typeof policy.allow_human_takeover === 'boolean'
      ? { allowHumanTakeover: policy.allow_human_takeover }
      : {}),
    ...(typeof policy.model_id === 'string' && policy.model_id.trim().length > 0
      ? { modelId: policy.model_id.trim() }
      : {}),
  };

  return normalized as unknown as Record<string, unknown>;
};

interface PhaseMetadata {
  phaseKey: string;
  phaseName: string;
  phaseType: string;
}

const sanitizePhaseKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'phase';

const buildBootstrapPhaseMetadata = (): PhaseMetadata => ({
  phaseKey: 'phase_bootstrap_navigation',
  phaseName: 'Open target page',
  phaseType: 'browser_navigation',
});

const buildPlannerStepPhaseMetadata = (
  planStep: PlannerPlanStepInput,
  index: number
): PhaseMetadata => {
  if (planStep.phase_key && planStep.phase_name && planStep.phase_type) {
    return {
      phaseKey: planStep.phase_key,
      phaseName: planStep.phase_name,
      phaseType: planStep.phase_type,
    };
  }

  const defaultPhaseType = (() => {
    switch (planStep.kind) {
      case 'human_input':
        return 'input_collection';
      case 'control':
        return 'loop_control';
      case 'skill':
      case 'tool':
        return 'system_skill';
      case 'execution':
      default:
        return 'workflow_execution';
    }
  })();

  return {
    phaseKey: `phase_${String(index + 1).padStart(2, '0')}_${sanitizePhaseKey(planStep.id || planStep.title)}`,
    phaseName: planStep.title || `Phase ${index + 1}`,
    phaseType: defaultPhaseType,
  };
};

export const buildPlannedExecutionSteps = (
  executionId: string,
  normalizedInput: Record<string, unknown>,
  planDraft?: PlannerPlanDraftStepInput
): {
  steps: Prisma.ExecutionStepCreateManyInput[];
  bootstrapUrl?: string;
} => {
  const steps: Prisma.ExecutionStepCreateManyInput[] = [];
  let stepIndex = 1;
  const plannerMode =
    typeof normalizedInput.plannerMode === 'string' && normalizedInput.plannerMode.trim()
      ? normalizedInput.plannerMode.trim()
      : undefined;
  const bootstrapUrl =
    plannerMode === 'skill'
      ? undefined
      : typeof normalizedInput.url === 'string' && normalizedInput.url.trim()
        ? normalizedInput.url.trim()
        : undefined;

  if (bootstrapUrl) {
    const bootstrapPhase = buildBootstrapPhaseMetadata();
    steps.push({
      executionId,
      stepIndex: stepIndex++,
      name: 'Open target page',
      type: BROWSER_RUNTIME.STEP_TYPE,
      status: 'pending',
      action: BROWSER_ACTIONS.GOTO,
      targetJson: {
        url: bootstrapUrl,
        source: 'phase1_bootstrap',
        ...bootstrapPhase,
      } as Prisma.JsonObject,
      inputJson: {
        url: bootstrapUrl,
        ...bootstrapPhase,
      } as Prisma.JsonObject,
    });
  }

  for (const [index, planStep] of (planDraft?.steps || []).entries()) {
    const phase = buildPlannerStepPhaseMetadata(planStep, index);
    const commands = normalizeBrowserPhaseCommands(planStep);
    const recoveryPolicy = normalizeBrowserPhaseRecoveryPolicy(planStep);
    steps.push({
      executionId,
      stepIndex: stepIndex++,
      name: planStep.title,
      type: mapPlannerStepType(planStep),
      status: 'pending',
      action: planStep.tool_name || mapPlannerStepAction(planStep),
      targetJson: {
        plannerStepId: planStep.id,
        plannerKind: planStep.kind,
        ...phase,
        ...(commands ? { commands } : {}),
        ...(planStep.precheck ? { precheck: planStep.precheck } : {}),
        ...(planStep.postcheck ? { postcheck: planStep.postcheck } : {}),
        ...(recoveryPolicy ? { recoveryPolicy } : {}),
        ...(typeof planStep.loop_control_action === 'string'
          ? { loopControlAction: planStep.loop_control_action }
          : {}),
        ...(typeof planStep.loop_id === 'string' ? { loopId: planStep.loop_id } : {}),
        ...(typeof planStep.loop_segment === 'string' ? { loopSegment: planStep.loop_segment } : {}),
        ...(typeof planStep.loop_iteration === 'number'
          ? { loopIteration: planStep.loop_iteration }
          : {}),
        ...(typeof planStep.loop_template === 'boolean'
          ? { loopTemplate: planStep.loop_template }
          : {}),
        ...(planStep.loop_stop_condition ? { loopStopCondition: planStep.loop_stop_condition } : {}),
      } as Prisma.JsonObject,
      inputJson: {
        description: planStep.description,
        plannerStatus: planStep.status,
        ...phase,
        ...(commands ? { commands } : {}),
        ...(planStep.precheck ? { precheck: planStep.precheck } : {}),
        ...(planStep.postcheck ? { postcheck: planStep.postcheck } : {}),
        ...(recoveryPolicy ? { recoveryPolicy } : {}),
        ...(typeof planStep.loop_control_action === 'string'
          ? { loopControlAction: planStep.loop_control_action }
          : {}),
        ...(typeof planStep.loop_id === 'string' ? { loopId: planStep.loop_id } : {}),
        ...(typeof planStep.loop_segment === 'string' ? { loopSegment: planStep.loop_segment } : {}),
        ...(typeof planStep.loop_iteration === 'number'
          ? { loopIteration: planStep.loop_iteration }
          : {}),
        ...(typeof planStep.loop_template === 'boolean'
          ? { loopTemplate: planStep.loop_template }
          : {}),
        ...(planStep.loop_stop_condition ? { loopStopCondition: planStep.loop_stop_condition } : {}),
      } as Prisma.JsonObject,
    });
  }

  return {
    steps,
    bootstrapUrl,
  };
};
