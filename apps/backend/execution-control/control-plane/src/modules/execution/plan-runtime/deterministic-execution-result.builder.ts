import type { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';

export interface ResolvedFinalOutput extends Record<string, unknown> {
  targetField?: string;
  fromNodeOutput?: string;
  value?: unknown;
  isArtifact?: boolean;
  artifact?: { name?: string };
}

export function buildDeterministicExecutionResult(input: {
  executionId: string;
  plan: DeterministicPlanDraftV1;
  finalOutputs: ResolvedFinalOutput[];
  artifacts: unknown[];
  finishedAt?: Date;
}): Record<string, unknown> {
  const body = pickTopLevelBody(input.finalOutputs);
  const title = pickTopLevelTitle(input.finalOutputs, input.plan);
  const finishedAt = (input.finishedAt || new Date()).toISOString();

  return {
    execution: {
      executionId: input.executionId,
      status: 'success',
      finishedAt,
    },
    result: {
      resultType: 'deterministic_plan',
      ...(title ? { title } : {}),
      ...(body ? { summary: body } : {}),
      businessData: {
        finalOutputs: input.finalOutputs,
      },
    },
    artifacts: input.artifacts,
    presentation: {
      preferAiSummary: false,
      preferStructuredView: false,
      ...(body
        ? {
            chatSummary: body,
            notificationSummary: body,
            detailText: body,
          }
        : {}),
      summaryFormat: 'plain_text',
      detailFormat: 'plain_text',
    },
  };
}

function pickTopLevelBody(finalOutputs: ResolvedFinalOutput[]): string | undefined {
  const priorityKeys = ['markdown_content', 'summary', 'body', 'content', 'text'];
  for (const key of priorityKeys) {
    const match = finalOutputs.find(
      (output) =>
        typeof output.value === 'string' &&
        output.value.length > 0 &&
        (String(output.fromNodeOutput) === key || String(output.targetField) === key),
    );
    if (typeof match?.value === 'string') return match.value;
  }

  return finalOutputs
    .filter(
      (output) =>
        typeof output.value === 'string' && output.value.length > 0 && !output.isArtifact,
    )
    .sort((a, b) => String(b.value).length - String(a.value).length)[0]?.value as
    | string
    | undefined;
}

function pickTopLevelTitle(
  finalOutputs: ResolvedFinalOutput[],
  plan: DeterministicPlanDraftV1,
): string | undefined {
  const titled = finalOutputs.find(
    (output) => typeof output.value === 'string' && output.value.length > 0 && output.isArtifact,
  );
  if (titled?.artifact?.name) return titled.artifact.name;
  return plan.objective || undefined;
}
