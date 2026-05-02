import { Prisma } from '@prisma/client';

export type PlannerStepKind = 'skill' | 'tool' | 'human_input' | 'execution';

export interface PlannerPlanStepInput {
  id: string;
  title: string;
  description: string;
  kind: PlannerStepKind;
  tool_name?: string;
  status: 'planned';
}

export interface PlannerPlanDraftStepInput {
  steps?: PlannerPlanStepInput[];
}

const mapPlannerStepType = (kind: PlannerStepKind): string => {
  switch (kind) {
    case 'human_input':
      return 'input_collection';
    case 'skill':
    case 'tool':
    case 'execution':
    default:
      return 'system';
  }
};

const mapPlannerStepAction = (kind: PlannerStepKind): string => {
  switch (kind) {
    case 'human_input':
      return 'collect_input';
    case 'skill':
    case 'tool':
      return 'execute_skill';
    case 'execution':
      return 'execute_plan';
    default:
      return 'planner_step';
  }
};

export const buildPlannedExecutionSteps = (
  executionId: string,
  normalizedInput: Record<string, unknown>,
  planDraft?: PlannerPlanDraftStepInput,
): {
  steps: Prisma.ExecutionStepCreateManyInput[];
  bootstrapUrl?: string;
} => {
  const steps: Prisma.ExecutionStepCreateManyInput[] = [];
  let stepIndex = 1;
  const bootstrapUrl =
    typeof normalizedInput.url === 'string' && normalizedInput.url.trim()
      ? normalizedInput.url.trim()
      : undefined;

  if (bootstrapUrl) {
    steps.push({
      executionId,
      stepIndex: stepIndex++,
      name: 'Open target page',
      type: 'browser_action',
      status: 'pending',
      action: 'goto',
      targetJson: { url: bootstrapUrl, source: 'phase1_bootstrap' } as Prisma.JsonObject,
      inputJson: { url: bootstrapUrl } as Prisma.JsonObject,
    });
  }

  for (const planStep of planDraft?.steps || []) {
    steps.push({
      executionId,
      stepIndex: stepIndex++,
      name: planStep.title,
      type: mapPlannerStepType(planStep.kind),
      status: 'pending',
      action: planStep.tool_name || mapPlannerStepAction(planStep.kind),
      targetJson: {
        plannerStepId: planStep.id,
        plannerKind: planStep.kind,
      } as Prisma.JsonObject,
      inputJson: {
        description: planStep.description,
        plannerStatus: planStep.status,
      } as Prisma.JsonObject,
    });
  }

  return {
    steps,
    bootstrapUrl,
  };
};
