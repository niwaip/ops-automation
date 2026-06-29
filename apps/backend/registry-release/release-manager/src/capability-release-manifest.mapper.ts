import type {
  ReleaseBindingRef,
  ReleaseManifest,
  ReleaseStepDefinition,
} from '@ops/backend-release-manifest';
import type {
  CapabilityReleaseDetailDTO,
  CapabilitySourceType,
  SkillDraftDTO,
} from './interfaces';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readExecutionFlow(detail: CapabilityReleaseDetailDTO): Array<Record<string, unknown>> {
  const draft = detail.currentSkillDraft?.draftPayload;
  if (Array.isArray(draft?.executionFlow)) {
    return draft.executionFlow.filter(
      (item): item is Record<string, unknown> => Boolean(asRecord(item))
    );
  }

  const sourcePayload = detail.currentSourceSnapshot?.sourcePayload;
  if (Array.isArray(sourcePayload?.executionFlow)) {
    return sourcePayload.executionFlow.filter(
      (item): item is Record<string, unknown> => Boolean(asRecord(item))
    );
  }

  const runtimeMetadata = asRecord(asRecord(sourcePayload?.apiEndpoints)?.runtimeMetadata);
  if (Array.isArray(runtimeMetadata?.executionPlan)) {
    return runtimeMetadata.executionPlan.filter(
      (item): item is Record<string, unknown> => Boolean(asRecord(item))
    );
  }

  return [];
}

function buildStepExecutor(step: Record<string, unknown>): string {
  const tool = asRecord(step.tool);
  const api = asRecord(step.api);
  return (
    asString(step.executor) ||
    asString(step.runtimeType) ||
    asString(step.capabilityType) ||
    asString(tool?.name) ||
    asString(api?.name) ||
    asString(step.type) ||
    'legacy-step'
  );
}

function mapExecutionFlowToSteps(
  executionFlow: Array<Record<string, unknown>>
): ReleaseStepDefinition[] {
  return executionFlow.map((step, index) => ({
    stepId: asString(step.id) || asString(step.stepId) || `step-${index + 1}`,
    stepType: asString(step.type) || asString(step.action) || 'unknown',
    executor: buildStepExecutor(step),
    input: step,
    metadata: {
      ...(asString(step.name) ? { name: asString(step.name) } : {}),
    },
  }));
}

function sourceTypeToBindingKind(sourceType: CapabilitySourceType): ReleaseBindingRef['kind'] {
  if (sourceType === 'browser_recording') {
    return 'template';
  }
  return 'workflow';
}

function buildBindings(detail: CapabilityReleaseDetailDTO): ReleaseBindingRef[] {
  const bindings: ReleaseBindingRef[] = [];
  const { release, currentSourceSnapshot, currentSkillDraft } = detail;

  if (currentSourceSnapshot) {
    bindings.push({
      id: currentSourceSnapshot.id,
      kind: sourceTypeToBindingKind(currentSourceSnapshot.sourceType),
      name: release.sourceName || release.id,
      version: String(currentSourceSnapshot.snapshotVersion),
    });
  }

  if (currentSkillDraft) {
    bindings.push({
      id: currentSkillDraft.id,
      kind: 'skill',
      name: currentSkillDraft.name,
      version: currentSkillDraft.updatedAt,
    });
  }

  if (release.publishedSkillId) {
    bindings.push({
      id: release.publishedSkillId,
      kind: 'skill',
      name: currentSkillDraft?.name || release.sourceName || release.id,
      version: String(release.releaseVersion),
    });
  }

  return bindings;
}

function buildRuntimeRequirements(
  detail: CapabilityReleaseDetailDTO
): Record<string, unknown> | undefined {
  const requirements: Record<string, unknown> = {};
  const sourcePayload = detail.currentSourceSnapshot?.sourcePayload;
  const workflowArtifactRef = detail.currentSourceSnapshot?.workflowArtifactRef;

  if (workflowArtifactRef) {
    requirements.workflowArtifactRef = workflowArtifactRef;
  }
  if (detail.release.publishedSkillId) {
    requirements.publishedSkillId = detail.release.publishedSkillId;
  }
  if (asString(sourcePayload?.taskQueue)) {
    requirements.taskQueue = asString(sourcePayload?.taskQueue);
  }

  return Object.keys(requirements).length > 0 ? requirements : undefined;
}

function buildPolicy(detail: CapabilityReleaseDetailDTO): Record<string, unknown> | undefined {
  const draft: SkillDraftDTO | null | undefined = detail.currentSkillDraft;
  if (!draft) {
    return undefined;
  }

  const policy: Record<string, unknown> = {};
  if (draft.tools.length > 0) {
    policy.tools = draft.tools;
  }
  if (draft.executionFlowTemplateIds.length > 0) {
    policy.executionFlowTemplateIds = draft.executionFlowTemplateIds;
  }
  return Object.keys(policy).length > 0 ? policy : undefined;
}

export function mapCapabilityReleaseDetailToManifest(
  detail: CapabilityReleaseDetailDTO
): ReleaseManifest {
  const releaseName =
    detail.currentSkillDraft?.name || detail.release.sourceName || `release-${detail.release.id}`;
  const executionFlow = readExecutionFlow(detail);

  return {
    createdAt: detail.release.createdAt,
    updatedAt: detail.release.updatedAt,
    createdBy: detail.release.createdBy || undefined,
    releaseId: detail.release.id,
    releaseName,
    version: String(detail.release.releaseVersion),
    bindings: buildBindings(detail),
    steps: mapExecutionFlowToSteps(executionFlow),
    runtimeRequirements: buildRuntimeRequirements(detail),
    policy: buildPolicy(detail),
  };
}
