import { createHash } from 'node:crypto';

/**
 * Pure helper functions extracted from DeterministicPlanSchedulerService
 * to enforce single-responsibility and control file complexity under 1200 lines.
 */

export function resolveBrowserRunOutputSchemaDigest(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const browserRunOutput = (value as Record<string, unknown>).browserRunOutput;
  if (
    !browserRunOutput ||
    typeof browserRunOutput !== 'object' ||
    Array.isArray(browserRunOutput)
  ) {
    return undefined;
  }
  const run = (browserRunOutput as Record<string, unknown>).run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return undefined;
  const digest = (run as Record<string, unknown>).contractDigest;
  return typeof digest === 'string' && /^[a-f0-9]{64}$/iu.test(digest) ? digest : undefined;
}

export function extractArtifacts(
  runtimeArtifacts: unknown,
  output: Record<string, any>
): Array<Record<string, any>> | undefined {
  const browserRunOutput = output.browserRunOutput;
  const candidates = [
    runtimeArtifacts,
    output.artifacts,
    browserRunOutput && typeof browserRunOutput === 'object'
      ? (browserRunOutput as Record<string, unknown>).artifacts
      : undefined,
    output.artifact ? [output.artifact] : undefined,
  ];
  const artifacts = candidates.find(Array.isArray);
  return Array.isArray(artifacts)
    ? artifacts.filter(
        (artifact): artifact is Record<string, any> =>
          Boolean(artifact) && typeof artifact === 'object' && !Array.isArray(artifact)
      )
    : undefined;
}

/**
 * Legacy vs V2 classification for the grace gate (fix ⑩).
 *
 * A frozen plan is V2 when EVERY node carries an authoritative `contractRef`
 * (attached at freeze time, §9.3). Plans with no frozen plan, no nodes, or
 * any node lacking a contractRef are treated as legacy — they are the only
 * executions the legacy grace deadline may reject.
 */
export function isLegacyPlan(execution: any): boolean {
  const nodes = (execution?.plan?.planJson as any)?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return true;
  return nodes.some((node: any) => !node?.contractRef);
}

export function mapPlanRuntimeTypeToExecutionRuntime(
  runtimeType?: string
): 'api' | 'workflow' | 'browser' | 'document' | 'custom' {
  const normalized = typeof runtimeType === 'string' ? runtimeType.trim().toLowerCase() : '';

  switch (normalized) {
    case 'api':
      return 'api';
    case 'workflow':
      return 'workflow';
    case 'browser_template':
    case 'browser':
      return 'browser';
    case 'artifact':
    case 'document':
      return 'document';
    default:
      return 'workflow';
  }
}

export function extractFinalOutputsFromSteps(
  planDraft: any,
  steps: any[],
  artifacts: any[],
  unwrapOutputFn: (val: any) => Record<string, any>
): Array<Record<string, any>> {
  const outputs: Array<Record<string, any>> = [];
  if (!Array.isArray(planDraft?.finalOutputs) || planDraft.finalOutputs.length === 0) {
    return outputs;
  }

  const stepByNode = new Map<string, any>();
  for (const step of steps) {
    if (step.planNodeId) stepByNode.set(step.planNodeId, step);
  }

  for (const req of planDraft.finalOutputs) {
    const step = stepByNode.get(req.fromNodeId);
    if (!step) continue;
    const outputData = unwrapOutputFn(step.outputJson);
    const value = outputData[req.fromNodeOutput];

    const matchedArtifact = artifacts.find(
      (art: any) => art.producerNodeId === req.fromNodeId || art.producerStepId === step.id
    );

    outputs.push({
      targetField: req.targetField,
      fromNodeId: req.fromNodeId,
      fromNodeOutput: req.fromNodeOutput,
      expectedType: req.expectedType,
      mimeType: req.mimeType,
      isArtifact: Boolean(req.isArtifact),
      value,
      artifact: matchedArtifact,
    });
  }

  return outputs;
}

export function resolveOutboundEffectMetadata(
  planNode: any,
  frozenMeta: any,
  resolvedInput: any,
  execution: any,
  stepId: string,
  stepIdempotencyKey: string,
  definitionVersion: string,
  capabilityVersion?: string,
  step?: any
): Record<string, any> {
  const frozenPhase = planNode?.metadata?.phase || frozenMeta?.phase;
  const frozenApprovedHash =
    planNode?.metadata?.approvedPayloadHash || frozenMeta?.approvedPayloadHash;
  const frozenPayloadHash = planNode?.metadata?.payloadHash || frozenMeta?.payloadHash;
  const frozenEffectId = planNode?.metadata?.effectId || frozenMeta?.effectId;

  const isApproved = execution?.approvalStatus === 'APPROVED';
  const previousStepOutput =
    step?.outputJson && typeof step.outputJson === 'object' ? step.outputJson : undefined;
  const stepPreparedHash = previousStepOutput?.payloadHash;
  const isStepPreviouslyPrepared = previousStepOutput?.phase === 'prepare' && Boolean(stepPreparedHash);

  const capabilityKey = step?.capabilityId || planNode?.capabilityId || '';
  const sideEffectClass =
    planNode?.sideEffectClass ||
    planNode?.metadata?.sideEffectClass ||
    frozenMeta?.sideEffectClass ||
    (capabilityKey === 'platform.email.send' ? 'external_write' : undefined);
  const isExternalWrite =
    sideEffectClass === 'external_write' || capabilityKey === 'platform.email.send';

  // Enforce commit authority: caller cannot self-authorize 'commit' in resolvedInput without prior prepare and approval
  if (resolvedInput?.phase === 'commit') {
    if (frozenPhase !== 'commit' && (!isApproved || !isStepPreviouslyPrepared)) {
      throw new Error(
        `UNAUTHORIZED_EFFECT_COMMIT: Step '${stepId}' cannot self-authorize 'commit' phase in runtime input without prior prepare and execution approval`
      );
    }
  }

  let effectivePhase = frozenPhase;
  if (!effectivePhase && isStepPreviouslyPrepared && isApproved) {
    effectivePhase = 'commit';
  } else if (!effectivePhase && isExternalWrite && !isStepPreviouslyPrepared) {
    // An external_write step MUST always begin in PREPARE phase, even if plan pre-approval was granted
    effectivePhase = 'prepare';
  } else if (!effectivePhase && resolvedInput?.phase === 'prepare') {
    effectivePhase = 'prepare';
  }

  const effectivePayloadHash =
    frozenApprovedHash ||
    (isStepPreviouslyPrepared && isApproved ? stepPreparedHash : undefined) ||
    frozenPayloadHash ||
    (effectivePhase === 'prepare' ? resolvedInput?.payloadHash : undefined);

  const sharedEffectKey =
    planNode?.metadata?.effectIdempotencyKey ||
    planNode?.metadata?.effectKey ||
    planNode?.metadata?.effectId ||
    frozenMeta?.effectIdempotencyKey ||
    frozenMeta?.effectKey ||
    frozenMeta?.effectId ||
    resolvedInput?.effectIdempotencyKey ||
    resolvedInput?.effectKey ||
    resolvedInput?.effectId ||
    (isStepPreviouslyPrepared ? previousStepOutput?.idempotencyKey : undefined);

  const effectiveIdempotencyKey = sharedEffectKey || stepIdempotencyKey;

  return {
    capabilityVersion: capabilityVersion || definitionVersion,
    definitionVersion,
    idempotencyKey: effectiveIdempotencyKey,
    effectIdempotencyKey: sharedEffectKey,
    phase: effectivePhase,
    payloadHash: effectivePayloadHash,
    approvedPayloadHash:
      frozenApprovedHash || (isStepPreviouslyPrepared && isApproved ? stepPreparedHash : undefined),
    effectId: frozenEffectId || previousStepOutput?.effectId,
    outboundEffect: {
      phase: effectivePhase,
      payloadHash: effectivePayloadHash,
      approvedPayloadHash:
        frozenApprovedHash || (isStepPreviouslyPrepared && isApproved ? stepPreparedHash : undefined),
      effectId: frozenEffectId || previousStepOutput?.effectId,
      idempotencyKey: effectiveIdempotencyKey,
    },
  };
}

export async function handlePreparedOutboundEffectStep(
  prisma: any,
  execution: any,
  step: any,
  outputJson: any
): Promise<void> {
  await prisma.executionStep.update({
    where: { id: step.id },
    data: {
      status: 'pending',
      outputJson: outputJson as any,
      leaseExpiresAt: null,
    },
  });

  await prisma.execution.update({
    where: { id: execution.id },
    data: {
      status: 'pending_approval',
      approvalStatus: 'pending',
      currentStepId: step.id,
    },
  });
}

function truncateString(str: string, maxLength: number): string {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

export async function materializeContentRefs(
  executionId: string,
  producerStepId: string,
  output: Record<string, any>,
  resultRefs?: any
): Promise<Record<string, any>> {
  const candidates = Array.isArray(output.contentCandidates) ? output.contentCandidates : [];
  if (!candidates.length) return output;
  const next = { ...output };
  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.outputName === 'string' &&
      candidate.outputName.trim()
    ) {
      if (!next[candidate.outputName]) {
        next[candidate.outputName] = candidate.text || candidate;
      }
    }
  }
  if (!resultRefs?.enabled || process.env.BROWSER_CONTENT_REF_ENABLED === 'false')
    return next;
  delete next.contentCandidates;
  const browser =
    next.browserRunOutput && typeof next.browserRunOutput === 'object'
      ? (next.browserRunOutput as Record<string, any>)
      : undefined;
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || typeof candidate.text !== 'string')
      continue;
    if (typeof candidate.sourceUrl !== 'string' || !candidate.sourceUrl.trim()) {
      if (typeof candidate.outputName === 'string') delete next[candidate.outputName];
      continue;
    }
    const text = candidate.text;
    const ref = await resultRefs.create({
      executionId,
      producerStepId,
      payload: { schemaVersion: 'extracted-content/v1', markdown: text },
      schemaDigest: createHash('sha256').update('extracted-content/v1').digest('hex'),
    });
    const content = {
      schemaVersion: 'content-ref/v1',
      contentId: createHash('sha256')
        .update(`${executionId}|${producerStepId}|${candidate.sourceStepId || ''}|${ref.id}`)
        .digest('hex')
        .slice(0, 32),
      resultRefId: ref.id,
      pageId: '',
      sourceUrl: candidate.sourceUrl || '',
      finalUrl: candidate.finalUrl || candidate.sourceUrl || '',
      ...(candidate.title ? { title: candidate.title } : {}),
      mediaType: 'text/plain',
      extraction: {
        profile: candidate.profile || 'article',
        method: candidate.method || 'visible-text',
        confidence: Number(candidate.confidence) || 0,
        fallbackLevel: Number(candidate.fallbackLevel) || 0,
        extractedAt: new Date().toISOString(),
      },
      integrity: {
        sha256: createHash('sha256').update(text).digest('hex'),
        chars: text.length,
        bytes: Buffer.byteLength(text),
        truncated: candidate.truncated === true,
      },
      safety: {
        activeContentRemoved: candidate.activeContentRemoved === true,
        suspectedPromptInjection: candidate.suspectedPromptInjection === true,
        untrustedExternalContent: true,
      },
      preview: truncateString(text, 160),
    };
    const page = Array.isArray(browser?.pages)
      ? browser.pages.find((item: any) => item.stepId === candidate.sourceStepId)
      : undefined;
    if (page) {
      content.pageId = page.pageId;
      page.content = content;
    }
    if (typeof candidate.outputName === 'string' && candidate.outputName.trim()) {
      next[candidate.outputName] = content;
    }
  }
  return next;
}
