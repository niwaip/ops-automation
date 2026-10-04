import { createHash } from 'node:crypto';
import { extractRecoveryCheckpoint } from './recovery-checkpoint.mapper';

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

export function resolveEffectiveUserId(
  execution: any,
  options?: { traceContext?: any }
): string | undefined {
  return (
    execution?.createdBy ||
    options?.traceContext?.userId ||
    (execution?.metadata as any)?.traceContext?.userId ||
    undefined
  );
}

export function sanitizeStepInput(
  input: Record<string, any>,
  inputSchema?: any
): Record<string, any> {
  const sanitizedInput: Record<string, any> = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (
      inputSchema?.additionalProperties === false &&
      inputSchema?.properties &&
      typeof inputSchema.properties === 'object' &&
      !Object.prototype.hasOwnProperty.call(inputSchema.properties, k) &&
      k !== 'idempotencyKey' &&
      k !== 'taskContext' &&
      k !== 'phase' &&
      k !== 'payloadHash' &&
      ![
        'downloadUrl',
        'fileUrl',
        'url',
        'downloadUrlA',
        'fileUrlA',
        'downloadUrlB',
        'fileUrlB',
        'files',
        'sourceDocxBase64',
        'sourceDocxUrl',
        'sourceDocxName',
        'sourceDocxSha256',
        'auditCertificateBlocks',
        'auditMetadata',
      ].includes(k)
    ) {
      continue;
    }
    sanitizedInput[k] = v;
  }
  return sanitizedInput;
}

export async function handleTakeoverRequiredStep(
  prisma: any,
  eventPublisher: any,
  execution: any,
  step: any,
  planNodeId: string,
  result: any,
  outputJson?: any
): Promise<void> {
  const takeoverReason =
    result?.takeoverReason ||
    result?.errorMessage ||
    `Step '${step.id}' requires human takeover`;

  await prisma.executionStep.update({
    where: { id: step.id },
    data: {
      status: 'failed',
      takeoverTriggered: true,
      errorMessage: takeoverReason,
      errorCode: result?.errorCode || 'TAKEOVER_REQUIRED',
      endedAt: new Date(),
      leaseExpiresAt: null,
      ...(outputJson ? { outputJson: outputJson as any } : {}),
    },
  });

  let preUpdateStatus = execution.status;
  if (typeof prisma.execution?.findUnique === 'function') {
    try {
      const freshExec = await prisma.execution.findUnique({
        where: { id: execution.id },
        select: { status: true },
      });
      if (freshExec?.status) {
        preUpdateStatus = freshExec.status;
      }
    } catch {
      // 容错
    }
  }
  if (preUpdateStatus === 'queued') {
    preUpdateStatus = 'running';
  }

  await prisma.execution.update({
    where: { id: execution.id },
    data: {
      status: 'human_control',
      takeoverRequired: true,
      takeoverReason,
      currentStepId: step.id,
      currentPhaseStatus: 'waiting_takeover',
    },
  });

  try {
    if (typeof prisma.executionTakeover?.create === 'function') {
      let phaseId = step.phaseId;
      let sessionFromPhase: string | null = null;
      if (typeof prisma.executionPhase?.findFirst === 'function') {
        const waitingPhase = await prisma.executionPhase.findFirst({
          where: { executionId: execution.id },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, runtimeSessionId: true },
        });
        if (!phaseId) {
          phaseId = waitingPhase?.id;
        }
        sessionFromPhase = waitingPhase?.runtimeSessionId || null;
      }
      if (phaseId) {
        const resolvedSessionId =
          step.runtimeSessionId ||
          sessionFromPhase ||
          execution.runtimeSessionId ||
          null;

        await prisma.executionTakeover.create({
          data: {
            executionId: execution.id,
            phaseId,
            runtimeSessionId: resolvedSessionId,
            status: 'requested',
            reason: takeoverReason,
          },
        });
      }
    }
  } catch {
    // 审计记录创建异常不阻断主流程
  }

  await eventPublisher.createEvent(
    execution.id,
    'step.failed',
    {
      stepId: step.id,
      planNodeId,
      shouldTakeover: true,
      takeoverRequired: true,
      takeoverReason,
      error: takeoverReason,
      errorMessage: takeoverReason,
      errorCode: result?.errorCode || 'TAKEOVER_REQUIRED',
      phaseStatus: 'waiting_takeover',
    },
    { stepId: step.id }
  );

  await eventPublisher.createEvent(
    execution.id,
    'execution.status_changed',
    {
      oldStatus: preUpdateStatus,
      newStatus: 'human_control',
      takeoverRequired: true,
      takeoverReason,
    },
    { stepId: step.id }
  );
}

export function resolvePhaseRecoveryMetadata(
  existingPhase: any,
  options?: any,
  stepInput?: any
): Record<string, any> {
  const metadata: Record<string, any> = {};
  if (!existingPhase && !options && !stepInput) return metadata;

  const rawDecision =
    existingPhase?.recoveryDecisionJson ??
    existingPhase?.recovery_decision_json ??
    existingPhase?.recoveryDecision;
  const recoveryDecision =
    rawDecision && typeof rawDecision === 'object' && !Array.isArray(rawDecision)
      ? (rawDecision as Record<string, unknown>)
      : undefined;

  const rawPatch =
    recoveryDecision?.patch ??
    stepInput?.__recoveryPatch ??
    options?.recoveryPatch;
  const patch =
    rawPatch && typeof rawPatch === 'object' && !Array.isArray(rawPatch)
      ? (rawPatch as Record<string, unknown>)
      : undefined;

  if (recoveryDecision) {
    metadata.recoveryDecision = recoveryDecision;
    if (recoveryDecision.takeoverId) {
      metadata.takeoverId = recoveryDecision.takeoverId;
    }
    if (recoveryDecision.resolvedBy || recoveryDecision.reconciledBy) {
      metadata.resolvedBy = recoveryDecision.resolvedBy || recoveryDecision.reconciledBy;
    }
    if (recoveryDecision.resolvedAt) {
      metadata.resolvedAt = recoveryDecision.resolvedAt;
    }
    if (recoveryDecision.resolutionNote || recoveryDecision.comment) {
      metadata.resolutionNote = recoveryDecision.resolutionNote || recoveryDecision.comment;
    }
  }

  if (patch) {
    metadata.recoveryDecision = metadata.recoveryDecision || recoveryDecision || { patch };
    metadata.recoveryPatch = patch;
    if (typeof patch.resumeFromStepId === 'string' && patch.resumeFromStepId.trim()) {
      metadata.resumeFromStepId = patch.resumeFromStepId.trim();
    } else if (
      patch.type === 'resolve_by_human' &&
      typeof patch.failedStepId === 'string' &&
      /^step_\d+$/.test(patch.failedStepId.trim())
    ) {
      const nextNum = parseInt(patch.failedStepId.trim().replace('step_', ''), 10) + 1;
      metadata.resumeFromStepId = `step_${nextNum}`;
    }
    if (typeof patch.failedStepId === 'string' && patch.failedStepId.trim()) {
      metadata.failedStepId = patch.failedStepId.trim();
    }
    if (patch.type) {
      metadata.recoveryType = patch.type;
    }
    if (patch.variables && typeof patch.variables === 'object') {
      metadata.variables = { ...patch.variables };
      metadata.browserPhaseVariables = { ...patch.variables };
    }
  }

  const rawOutput =
    existingPhase?.outputJson ??
    existingPhase?.output_json ??
    existingPhase?.output;
  const previousPhaseOutput =
    rawOutput && typeof rawOutput === 'object' && !Array.isArray(rawOutput)
      ? (rawOutput as Record<string, unknown>)
      : undefined;
  const nestedPhaseOutput =
    previousPhaseOutput?.output &&
    typeof previousPhaseOutput.output === 'object' &&
    !Array.isArray(previousPhaseOutput.output)
      ? (previousPhaseOutput.output as Record<string, unknown>)
      : previousPhaseOutput;

  if (nestedPhaseOutput) {
    const checkpoint = extractRecoveryCheckpoint(nestedPhaseOutput);
    if (checkpoint.variables && typeof checkpoint.variables === 'object') {
      metadata.variables = {
        ...checkpoint.variables,
        ...(metadata.variables || {}),
      };
    }
    if (checkpoint.runtimeEvidence && typeof checkpoint.runtimeEvidence === 'object') {
      metadata.runtimeEvidence = checkpoint.runtimeEvidence;
    }
    if (Array.isArray(checkpoint.previousStepResults)) {
      metadata.previousStepResults = checkpoint.previousStepResults;
    }
    if (checkpoint.previousPhaseResults?.length) {
      metadata.previousPhaseResults = checkpoint.previousPhaseResults;
      metadata.loopIteration = patch?.loopIteration || checkpoint.loopIteration;
    }
  }

  // 回退机制：若阶段输出因异常被冲掉，从 stepInput 中恢复业务变量与证据
  if (!metadata.variables && stepInput?.variables && typeof stepInput.variables === 'object') {
    metadata.variables = { ...stepInput.variables };
  }
  if (!metadata.runtimeEvidence && stepInput?.runtimeEvidence && typeof stepInput.runtimeEvidence === 'object') {
    metadata.runtimeEvidence = { ...stepInput.runtimeEvidence };
  }

  const explicitResumeStepId =
    (typeof options?.resumeFromStepId === 'string' && options.resumeFromStepId.trim()) ||
    (typeof stepInput?.__resumeFromStepId === 'string' && stepInput.__resumeFromStepId.trim());
  if (explicitResumeStepId) {
    metadata.resumeFromStepId = explicitResumeStepId;
  }

  return metadata;
}

