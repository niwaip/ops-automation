import {
  BrowserPhaseCheck,
  ExecutionDto,
  ExecutionPhaseArtifactDto,
  ExecutionPhaseDto,
  ExecutionPhaseStepDto,
  ExecutionStepDto,
  ExecutionTakeoverRecordDto,
} from './execution.dto';
import { ApprovalStatus } from './contracts/approval-status';
import { ExecutionStatus } from './contracts/execution-status';
import { ExecutionStepStatus } from './contracts/execution-step-status';
import type { ExecutionSemantic } from '@ops/contracts';

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asRecordArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
};

const asNonEmptyString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const normalizeDerivedStepStatus = (step: Record<string, unknown>): string => {
  const status = asNonEmptyString(step.status);
  if (status) {
    const normalized = status.toLowerCase();
    if (normalized === 'success') {
      return 'completed';
    }
    if (normalized === 'error') {
      return 'failed';
    }
    return normalized;
  }
  if (step.success === false) {
    return 'failed';
  }
  return 'completed';
};

const derivePhaseStepsFromOutput = (
  phase: Record<string, unknown>,
): ExecutionPhaseStepDto[] => {
  const output = asRecord(phase.output || phase.outputJson || phase.output_json);
  const rawResult = asRecord(output?.rawResult);
  const runtimeOutput = asRecord(rawResult?.output);
  const phaseResults = asRecordArray(output?.phaseResults).length > 0
    ? asRecordArray(output?.phaseResults)
    : asRecordArray(runtimeOutput?.phaseResults);

  if (phaseResults.length === 0) {
    return [];
  }

  const phaseId = String(phase.id || '');
  const fallbackCreatedAt = (
    (phase.updatedAt || phase.updated_at || phase.createdAt || phase.created_at) as Date | undefined
  ) || new Date(0);
  const derivedSteps: ExecutionPhaseStepDto[] = [];

  phaseResults.forEach((phaseResult, phaseIndex) => {
    const resultBody = asRecord(phaseResult.result || phaseResult.output || phaseResult) || phaseResult;
    const nestedResults = asRecordArray(resultBody.results);

    const pushStep = (stepRecord: Record<string, unknown>, fallbackAction: string) => {
      const input = asRecord(stepRecord.input || stepRecord.args || stepRecord.params) || undefined;
      const outputRecord = asRecord(stepRecord.output || stepRecord.result || stepRecord.data || stepRecord) || undefined;
      const snapshot = asRecord(stepRecord.snapshot);
      const stepIndex = derivedSteps.length + 1;
      derivedSteps.push({
        id: `${phaseId}:derived:${stepIndex}`,
        phaseId,
        stepIndex,
        stepId: asNonEmptyString(stepRecord.stepId, stepRecord.step_id, stepRecord.id) || undefined,
        action: asNonEmptyString(
          stepRecord.action,
          stepRecord.command,
          stepRecord.name,
          fallbackAction,
        ) || 'execute',
        status: normalizeDerivedStepStatus(stepRecord),
        input,
        output: outputRecord,
        errorMessage: asNonEmptyString(stepRecord.errorMessage, stepRecord.error_message, stepRecord.message) || undefined,
        errorCode: asNonEmptyString(stepRecord.errorCode, stepRecord.error_code) || undefined,
        snapshotId: asNonEmptyString(stepRecord.snapshotId, stepRecord.snapshot_id, snapshot?.id) || undefined,
        createdAt: fallbackCreatedAt.toISOString(),
      });
    };

    if (nestedResults.length > 0) {
      nestedResults.forEach((nestedResult) => {
        pushStep(
          nestedResult,
          asNonEmptyString(
            nestedResult.command,
            phaseResult.stepName,
            phaseResult.activityName,
            phaseResult.phaseName,
            phaseResult.name,
          ) || 'execute',
        );
      });
      return;
    }

    pushStep(
      resultBody,
      asNonEmptyString(
        phaseResult.stepName,
        phaseResult.activityName,
        phaseResult.phaseName,
        phaseResult.name,
      ) || `phase_${phaseIndex + 1}`,
    );
  });

  return derivedSteps;
};

const asExecutionSemantic = (value: unknown): ExecutionSemantic | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.enabled !== 'boolean') {
    return null;
  }
  if (candidate.mode !== 'field_level' && candidate.mode !== 'complex_document') {
    return null;
  }
  if (typeof candidate.previewReady !== 'boolean' || typeof candidate.finalReady !== 'boolean') {
    return null;
  }
  if (typeof candidate.fallbackToFieldLevel !== 'boolean') {
    return null;
  }
  if (!Array.isArray(candidate.groupedMissing)) {
    return null;
  }
  return candidate as unknown as ExecutionSemantic;
};

export const mapExecutionToDto = (
  execution: Record<string, unknown>,
): ExecutionDto => {
  const normalizedInput =
    (execution.normalizedInputJson || execution.normalized_input_json) as Record<string, unknown> | null;
  const input =
    (execution.inputJson || execution.input_json) as Record<string, unknown> | null;
  const result =
    (execution.resultJson || execution.result_json) as Record<string, unknown> | null;
  const usage =
    (normalizedInput && typeof normalizedInput === 'object'
      ? (normalizedInput.__usage as Record<string, unknown> | undefined)
      : undefined) || null;
  const semantic = asExecutionSemantic(
    normalizedInput && typeof normalizedInput === 'object'
      ? (normalizedInput.semantic as unknown)
      : undefined,
  );

  const rawPhases = Array.isArray(execution.phases)
    ? execution.phases
    : Array.isArray(execution.executionPhases)
      ? execution.executionPhases
      : [];

  return {
    id: execution.id as string,
    skillId: execution.skillId as string,
    capabilityId: (execution.capabilityId || execution.skillId) as string | null,
    skillVersion: (execution.skillVersion || execution.skill_version) as string | null,
    capabilityVersion: (execution.capabilityVersion || execution.skillVersion || execution.capability_version || execution.skill_version) as string | null,
    status: execution.status as ExecutionStatus,
    runtimeType: execution.runtimeType as string | null,
    riskLevel: execution.riskLevel as 'L0' | 'L1' | 'L2' | 'L3' | null,
    currentStepId: execution.currentStepId as string | null,
    runtimeSessionId: (execution.runtimeSessionId || execution.runtime_session_id) as string | null,
    currentPhaseKey: (execution.currentPhaseKey || execution.current_phase_key) as string | null,
    currentPhaseStatus: (execution.currentPhaseStatus || execution.current_phase_status) as string | null,
    takeoverStatus: (execution.takeoverStatus || execution.takeover_status) as string | null,
    requiresApproval: execution.requiresApproval as boolean,
    approvalStatus: execution.approvalStatus as ApprovalStatus | null,
    takeoverRequired: execution.takeoverRequired as boolean,
    takeoverReason: execution.takeoverReason as string | null,
    resultJson: result,
    inputJson: input,
    normalizedInputJson: normalizedInput,
    input,
    normalizedInput,
    semantic,
    result,
    usage,
    failureCode: execution.failureCode as string | null,
    failureReason: execution.failureReason as string | null,
    startedAt: execution.startedAt ? (execution.startedAt as Date).toISOString() : null,
    endedAt: execution.endedAt ? (execution.endedAt as Date).toISOString() : null,
    createdAt: (execution.createdAt as Date).toISOString(),
    updatedAt: (execution.updatedAt as Date).toISOString(),
    createdBy: (execution.createdBy || execution.created_by) as string | null,
    createdByName: (execution.createdByName || execution.created_by_name) as string | null,
    phases: rawPhases.map((phase) => mapExecutionPhaseToDto(phase as Record<string, unknown>)),
  };
};

export const mapExecutionPhaseArtifactToDto = (
  artifact: Record<string, unknown>,
): ExecutionPhaseArtifactDto => {
  return {
    id: artifact.id as string,
    artifactType: (artifact.artifactType || artifact.artifact_type) as string,
    snapshotId: (artifact.snapshotId || artifact.snapshot_id) as string | null,
    pageUrl: (artifact.pageUrl || artifact.page_url) as string | null,
    pageFingerprint: (artifact.pageFingerprint || artifact.page_fingerprint) as string | null,
    payload: (artifact.payload || artifact.payloadJson || artifact.payload_json) as Record<string, unknown> | null,
    createdAt: ((artifact.createdAt || artifact.created_at) as Date).toISOString(),
  };
};

export const mapExecutionTakeoverRecordToDto = (
  takeover: Record<string, unknown>,
): ExecutionTakeoverRecordDto => {
  return {
    id: takeover.id as string,
    status: takeover.status as string,
    reason: takeover.reason as string | null,
    requestedBy: (takeover.requestedBy || takeover.requested_by) as string | null,
    resolvedBy: (takeover.resolvedBy || takeover.resolved_by) as string | null,
    resolutionNote: (takeover.resolutionNote || takeover.resolution_note) as string | null,
    createdAt: ((takeover.createdAt || takeover.created_at) as Date).toISOString(),
    resolvedAt: (takeover.resolvedAt || takeover.resolved_at)
      ? ((takeover.resolvedAt || takeover.resolved_at) as Date).toISOString()
      : null,
  };
};

export const mapExecutionPhaseStepToDto = (
  step: Record<string, unknown>,
): ExecutionPhaseStepDto => {
  return {
    id: step.id as string,
    phaseId: (step.phaseId || step.phase_id) as string,
    stepIndex: (step.stepIndex || step.step_index) as number,
    stepId: (step.stepId || step.step_id) as string | null,
    action: step.action as string,
    status: step.status as string,
    input: (step.input || step.inputJson || step.input_json) as Record<string, unknown> | null,
    output: (step.output || step.outputJson || step.output_json) as Record<string, unknown> | null,
    errorMessage: (step.errorMessage || step.error_message) as string | null,
    errorCode: (step.errorCode || step.error_code) as string | null,
    snapshotId: (step.snapshotId || step.snapshot_id) as string | null,
    startedAt: (step.startedAt || step.started_at)
      ? ((step.startedAt || step.started_at) as Date).toISOString()
      : null,
    endedAt: (step.endedAt || step.ended_at)
      ? ((step.endedAt || step.ended_at) as Date).toISOString()
      : null,
    createdAt: ((step.createdAt || step.created_at) as Date).toISOString(),
  };
};

export const mapExecutionPhaseToDto = (
  phase: Record<string, unknown>,
): ExecutionPhaseDto => {
  const rawArtifacts = Array.isArray(phase.artifacts)
    ? phase.artifacts
    : Array.isArray(phase.executionPhaseArtifacts)
      ? phase.executionPhaseArtifacts
      : [];
  const rawTakeovers = Array.isArray(phase.takeovers)
    ? phase.takeovers
    : Array.isArray(phase.executionTakeovers)
      ? phase.executionTakeovers
      : [];
  const rawSteps = Array.isArray(phase.steps)
    ? phase.steps
    : Array.isArray(phase.executionPhaseSteps)
      ? phase.executionPhaseSteps
      : [];
  const mappedSteps = rawSteps.length > 0
    ? rawSteps.map((step) => mapExecutionPhaseStepToDto(step as Record<string, unknown>))
    : derivePhaseStepsFromOutput(phase);

  return {
    id: phase.id as string,
    executionId: (phase.executionId || phase.execution_id) as string,
    phaseKey: (phase.phaseKey || phase.phase_key) as string,
    phaseName: (phase.phaseName || phase.phase_name) as string,
    phaseType: (phase.phaseType || phase.phase_type) as string,
    status: phase.status as string,
    attempt: (phase.attempt as number) ?? 0,
    runtimeSessionId: (phase.runtimeSessionId || phase.runtime_session_id) as string | null,
    input: (phase.input || phase.inputJson || phase.input_json) as Record<string, unknown> | null,
    output: (phase.output || phase.outputJson || phase.output_json) as Record<string, unknown> | null,
    precheck: (phase.precheck || phase.precheckJson || phase.precheck_json) as BrowserPhaseCheck | null,
    postcheck: (phase.postcheck || phase.postcheckJson || phase.postcheck_json) as BrowserPhaseCheck | null,
    errorCode: (phase.errorCode || phase.error_code) as string | null,
    errorMessage: (phase.errorMessage || phase.error_message) as string | null,
    recoveryDecision: (phase.recoveryDecision || phase.recoveryDecisionJson || phase.recovery_decision_json) as Record<string, unknown> | null,
    startedAt: (phase.startedAt || phase.started_at)
      ? ((phase.startedAt || phase.started_at) as Date).toISOString()
      : null,
    completedAt: (phase.completedAt || phase.completed_at || phase.endedAt || phase.ended_at)
      ? ((phase.completedAt || phase.completed_at || phase.endedAt || phase.ended_at) as Date).toISOString()
      : null,
    createdAt: ((phase.createdAt || phase.created_at) as Date).toISOString(),
    updatedAt: ((phase.updatedAt || phase.updated_at) as Date).toISOString(),
    artifacts: rawArtifacts.map((artifact) => mapExecutionPhaseArtifactToDto(artifact as Record<string, unknown>)),
    steps: mappedSteps,
    takeovers: rawTakeovers.map((takeover) => mapExecutionTakeoverRecordToDto(takeover as Record<string, unknown>)),
  };
};

export const mapExecutionStepToDto = (
  step: Record<string, unknown>,
): ExecutionStepDto => {
  return {
    id: step.id as string,
    executionId: step.executionId as string,
    stepIndex: step.stepIndex as number,
    name: (step.name as string) || '',
    type: step.type as string,
    status: step.status as ExecutionStepStatus,
    action: step.action as string | null,
    inputJson: (step.inputJson || step.input_json) as Record<string, unknown> | null,
    outputJson: (step.outputJson || step.output_json) as Record<string, unknown> | null,
    errorCode: step.errorCode as string | null,
    errorMessage: step.errorMessage as string | null,
    snapshotId: step.snapshotId as string | null,
    takeoverTriggered: step.takeoverTriggered as boolean,
    startedAt: step.startedAt ? (step.startedAt as Date).toISOString() : null,
    endedAt: step.endedAt ? (step.endedAt as Date).toISOString() : null,
    createdAt: (step.createdAt as Date).toISOString(),
    updatedAt: (step.updatedAt as Date).toISOString(),
  };
};
