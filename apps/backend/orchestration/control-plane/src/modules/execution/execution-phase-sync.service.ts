import { Injectable, Logger } from '@nestjs/common';
import type { BrowserPhaseCheck } from './execution.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionPhaseService } from './execution-phase.service';
import { RuntimePhaseInvokeResult, RuntimeStepInvokeResult } from './runtime-adapter.interface';

interface WorkflowActivityPhaseDefinition {
  phaseKey: string;
  phaseName: string;
  phaseType: string;
  activityName?: string;
  parentPhaseKey: string;
  order: number;
}

@Injectable()
export class ExecutionPhaseSyncService {
  private readonly logger = new Logger(ExecutionPhaseSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionPhaseService: ExecutionPhaseService
  ) {}

  async markPhaseRunningForStep(
    executionId: string,
    runtimeSessionId: string,
    phaseMetadata?: { phaseKey: string; phaseName: string; phaseType: string },
    step?: Record<string, unknown> | null
  ): Promise<void> {
    if (!phaseMetadata) {
      return;
    }

    const stepInput = (step?.inputJson as Record<string, unknown> | undefined) || null;
    const stepTarget = (step?.targetJson as Record<string, unknown> | undefined) || null;
    await this.executionPhaseService.markRunning(executionId, phaseMetadata.phaseKey, {
      phaseName: phaseMetadata.phaseName,
      phaseType: phaseMetadata.phaseType,
      attempt: 1,
      runtimeSessionId,
      input: {
        stepId: step?.id,
        stepType: step?.type,
        action: step?.action,
        target: stepTarget,
        input: stepInput,
      },
      precheck: null,
    });
  }

  async initializeWorkflowActivityPhasesForSkillExecution(
    executionId: string,
    runtimeSessionId: string,
    capabilityId: string,
    phaseMetadata?: { phaseKey: string; phaseName: string; phaseType: string },
    step?: Record<string, unknown> | null
  ): Promise<void> {
    if (!phaseMetadata) {
      return;
    }

    const activityPhases = await this.loadWorkflowActivityPhaseDefinitions(
      capabilityId,
      phaseMetadata.phaseKey
    );
    if (activityPhases.length === 0) {
      return;
    }

    const sharedInput = {
      parentPhaseKey: phaseMetadata.phaseKey,
      parentPhaseName: phaseMetadata.phaseName,
      parentStepId: typeof step?.id === 'string' ? step.id : null,
      activityCount: activityPhases.length,
    };

    for (const activityPhase of activityPhases.slice(1)) {
      await this.executionPhaseService.createOrUpdatePhase({
        executionId,
        phaseKey: activityPhase.phaseKey,
        phaseName: activityPhase.phaseName,
        phaseType: activityPhase.phaseType,
        status: 'pending',
        attempt: 1,
        runtimeSessionId,
        input: {
          ...sharedInput,
          order: activityPhase.order,
          activityName: activityPhase.activityName || activityPhase.phaseName,
        },
      });
    }

    const firstActivityPhase = activityPhases[0];
    await this.executionPhaseService.markRunning(executionId, firstActivityPhase.phaseKey, {
      phaseName: firstActivityPhase.phaseName,
      phaseType: firstActivityPhase.phaseType,
      attempt: 1,
      runtimeSessionId,
      input: {
        ...sharedInput,
        order: firstActivityPhase.order,
        activityName: firstActivityPhase.activityName || firstActivityPhase.phaseName,
      },
      precheck: null,
    });
  }

  async syncWorkflowActivityPhasesAfterSkillResult(
    executionId: string,
    runtimeSessionId: string,
    capabilityId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: { phaseKey: string; phaseName: string; phaseType: string }
  ): Promise<void> {
    if (!phaseMetadata) {
      return;
    }

    const activityPhases = await this.loadWorkflowActivityPhaseDefinitions(
      capabilityId,
      phaseMetadata.phaseKey
    );
    if (activityPhases.length === 0) {
      return;
    }

    const runtimePhaseResults = this.extractRuntimePhaseResults(result);
    if (runtimePhaseResults.length === 0) {
      const failedActivityPhase = !result.success
        ? await this.resolveFailedWorkflowActivityPhase(
            executionId,
            phaseMetadata.phaseKey,
            activityPhases
          )
        : null;
      if (!result.success && failedActivityPhase) {
        await this.executionPhaseService.createOrUpdatePhase({
          executionId,
          phaseKey: failedActivityPhase.phaseKey,
          phaseName: failedActivityPhase.phaseName,
          phaseType: failedActivityPhase.phaseType,
          status:
            result.status === 'takeover_required' || result.requiresTakeover
              ? 'waiting_takeover'
              : 'failed',
          attempt: 1,
          runtimeSessionId,
          output: {
            parentPhaseKey: phaseMetadata.phaseKey,
            activityName: failedActivityPhase.activityName || failedActivityPhase.phaseName,
            result: result.output || result.rawResult || null,
          },
          recoveryDecision: null,
          errorCode: result.errorCode || null,
          errorMessage: result.errorMessage || null,
          completedAt:
            result.status === 'takeover_required' || result.requiresTakeover ? null : new Date(),
        });
      }
      return;
    }

    for (const [index, activityPhase] of activityPhases.entries()) {
      const phaseResult = runtimePhaseResults[index];
      if (!phaseResult) {
        continue;
      }

      const phaseResultBody =
        this.readRecord(phaseResult.result, phaseResult.output, phaseResult) || phaseResult;
      const normalizedStatus = this.normalizeRuntimePhaseStepStatus(phaseResultBody);
      const phaseArtifacts = this.mapRuntimeArtifactsFromActivityPhaseResult(phaseResultBody);
      const phaseSteps = this.mapRuntimeStepsFromActivityPhaseResult(phaseResultBody, phaseResult);
      const phaseOutput = {
        parentPhaseKey: phaseMetadata.phaseKey,
        activityName: this.readNonEmptyString(
          phaseResult.activityName,
          activityPhase.activityName,
          activityPhase.phaseName
        ),
        stepName: this.readNonEmptyString(phaseResult.stepName, activityPhase.phaseName),
        result: phaseResultBody,
      };

      if (normalizedStatus === 'failed') {
        await this.executionPhaseService.createOrUpdatePhase({
          executionId,
          phaseKey: activityPhase.phaseKey,
          phaseName: activityPhase.phaseName,
          phaseType: activityPhase.phaseType,
          status: 'failed',
          attempt: 1,
          runtimeSessionId,
          output: phaseOutput,
          errorCode:
            this.readNonEmptyString(phaseResultBody.errorCode, phaseResultBody.error_code) ||
            result.errorCode ||
            null,
          errorMessage:
            this.readNonEmptyString(
              phaseResultBody.errorMessage,
              phaseResultBody.error_message,
              phaseResultBody.message
            ) ||
            result.errorMessage ||
            null,
          completedAt: new Date(),
        });
      } else if (normalizedStatus === 'waiting_takeover') {
        await this.executionPhaseService.createOrUpdatePhase({
          executionId,
          phaseKey: activityPhase.phaseKey,
          phaseName: activityPhase.phaseName,
          phaseType: activityPhase.phaseType,
          status: 'waiting_takeover',
          attempt: 1,
          runtimeSessionId,
          output: phaseOutput,
          errorCode:
            this.readNonEmptyString(phaseResultBody.errorCode, phaseResultBody.error_code) ||
            result.errorCode ||
            null,
          errorMessage:
            this.readNonEmptyString(
              phaseResultBody.errorMessage,
              phaseResultBody.error_message,
              phaseResultBody.message
            ) ||
            result.errorMessage ||
            null,
          completedAt: null,
        });
      } else {
        await this.executionPhaseService.markCompleted(executionId, activityPhase.phaseKey, {
          phaseName: activityPhase.phaseName,
          phaseType: activityPhase.phaseType,
          attempt: 1,
          runtimeSessionId,
          output: phaseOutput,
          postcheck: null,
        });
      }

      if (typeof this.executionPhaseService.replaceArtifacts === 'function') {
        await this.executionPhaseService.replaceArtifacts(
          executionId,
          activityPhase.phaseKey,
          phaseArtifacts
        );
      }
      if (typeof this.executionPhaseService.replaceSteps === 'function') {
        await this.executionPhaseService.replaceSteps(
          executionId,
          activityPhase.phaseKey,
          phaseSteps
        );
      }
    }
  }

  async syncPhaseAfterStepResult(
    executionId: string,
    runtimeSessionId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: { phaseKey: string; phaseName: string; phaseType: string },
    step?: Record<string, unknown> | null
  ): Promise<void> {
    if (!phaseMetadata) {
      return;
    }

    const phaseLikeResult = result as RuntimeStepInvokeResult & Partial<RuntimePhaseInvokeResult>;
    const phaseOutput = {
      stepId: step?.id,
      action: step?.action,
      output: result.output || null,
      snapshot: result.snapshot || null,
      rawResult: result.rawResult || null,
      ...(Array.isArray(phaseLikeResult.stepResults)
        ? { stepResults: phaseLikeResult.stepResults }
        : {}),
      ...(Array.isArray(result.artifacts) ? { artifacts: result.artifacts } : {}),
      ...(typeof phaseLikeResult.status === 'string' ? { status: phaseLikeResult.status } : {}),
      ...(phaseLikeResult.failedStepId ? { failedStepId: phaseLikeResult.failedStepId } : {}),
      ...(phaseLikeResult.failedAction ? { failedAction: phaseLikeResult.failedAction } : {}),
      ...(typeof phaseLikeResult.requiresTakeover === 'boolean'
        ? { requiresTakeover: phaseLikeResult.requiresTakeover }
        : {}),
      ...(phaseLikeResult.takeoverReason ? { takeoverReason: phaseLikeResult.takeoverReason } : {}),
    };
    const phaseArtifacts = this.mapRuntimeArtifactsToPhaseArtifacts(result);
    const phaseSteps = this.extractPhaseStepsFromRuntimeResult(result, step);

    if (result.success) {
      await this.executionPhaseService.markCompleted(executionId, phaseMetadata.phaseKey, {
        phaseName: phaseMetadata.phaseName,
        phaseType: phaseMetadata.phaseType,
        attempt: 1,
        runtimeSessionId,
        output: phaseOutput,
        postcheck: null,
      });
      if (typeof this.executionPhaseService.replaceArtifacts === 'function') {
        await this.executionPhaseService.replaceArtifacts(
          executionId,
          phaseMetadata.phaseKey,
          phaseArtifacts
        );
      }
      if (typeof this.executionPhaseService.replaceSteps === 'function') {
        await this.executionPhaseService.replaceSteps(
          executionId,
          phaseMetadata.phaseKey,
          phaseSteps
        );
      }
      return;
    }

    const mappedStatus =
      result.status === 'takeover_required'
        ? 'waiting_takeover'
        : result.status === 'waiting'
          ? 'resumable'
          : 'failed';

    await this.executionPhaseService.createOrUpdatePhase({
      executionId,
      phaseKey: phaseMetadata.phaseKey,
      phaseName: phaseMetadata.phaseName,
      phaseType: phaseMetadata.phaseType,
      status: mappedStatus,
      attempt: 1,
      runtimeSessionId,
      output: phaseOutput,
      recoveryDecision: null,
      errorCode: result.errorCode || null,
      errorMessage: result.errorMessage || null,
      completedAt: mappedStatus === 'failed' ? new Date() : null,
    });
    if (typeof this.executionPhaseService.replaceArtifacts === 'function') {
      await this.executionPhaseService.replaceArtifacts(
        executionId,
        phaseMetadata.phaseKey,
        phaseArtifacts
      );
    }
    if (typeof this.executionPhaseService.replaceSteps === 'function') {
      await this.executionPhaseService.replaceSteps(
        executionId,
        phaseMetadata.phaseKey,
        phaseSteps
      );
    }
  }

  async completeActivePhasesOnExecutionSuccess(
    executionId: string,
    runtimeSessionId: string
  ): Promise<void> {
    const phases = await this.executionPhaseService.listByExecutionId(executionId);
    if (!Array.isArray(phases) || phases.length === 0) {
      return;
    }

    const completionTime = new Date();
    const activePhases = phases
      .filter((phase) => {
        const status = this.readNonEmptyString(phase.status);
        return status === 'running' || status === 'waiting_takeover' || status === 'resumable';
      })
      .sort((left, right) => {
        const leftKey = this.readNonEmptyString(left.phaseKey, left.phase_key) || '';
        const rightKey = this.readNonEmptyString(right.phaseKey, right.phase_key) || '';
        return leftKey.length - rightKey.length;
      });

    for (const phase of activePhases) {
      const phaseKey = this.readNonEmptyString(phase.phaseKey, phase.phase_key);
      if (!phaseKey) {
        continue;
      }
      await this.executionPhaseService.createOrUpdatePhase({
        executionId,
        phaseKey,
        phaseName: this.readNonEmptyString(phase.phaseName, phase.phase_name) || phaseKey,
        phaseType:
          this.readNonEmptyString(phase.phaseType, phase.phase_type) || 'workflow_activity',
        status: 'completed',
        attempt: this.readInteger(phase.attempt) || 0,
        runtimeSessionId:
          this.readNonEmptyString(phase.runtimeSessionId, phase.runtime_session_id) ||
          runtimeSessionId,
        input: this.parseJsonRecord(phase.inputJson ?? phase.input_json),
        output: this.parseJsonRecord(phase.outputJson ?? phase.output_json),
        precheck: this.parseJsonRecord(phase.precheckJson ?? phase.precheck_json) as
          | BrowserPhaseCheck
          | undefined,
        postcheck: this.parseJsonRecord(phase.postcheckJson ?? phase.postcheck_json) as
          | BrowserPhaseCheck
          | undefined,
        recoveryDecision: this.parseJsonRecord(
          phase.recoveryDecision ?? phase.recovery_decision_json
        ),
        errorCode: null,
        errorMessage: null,
        startedAt: this.readDateValue(phase.startedAt, phase.started_at) || null,
        completedAt: completionTime,
      });
    }
  }

  private mapRuntimeArtifactsToPhaseArtifacts(result: RuntimeStepInvokeResult): Array<{
    artifactType: string;
    snapshotId?: string | null;
    pageUrl?: string | null;
    pageFingerprint?: string | null;
    payload?: Record<string, unknown> | null;
  }> {
    if (!Array.isArray(result.artifacts) || result.artifacts.length === 0) {
      return [];
    }

    return result.artifacts.map((artifact) => ({
      artifactType: artifact.type,
      snapshotId: artifact.id || null,
      pageUrl: artifact.url || null,
      pageFingerprint: this.extractPageFingerprintFromArtifactMetadata(artifact.metadata) || null,
      payload: artifact.metadata || null,
    }));
  }

  private extractPageFingerprintFromArtifactMetadata(
    metadata?: Record<string, unknown>
  ): string | undefined {
    if (!metadata) {
      return undefined;
    }
    const page = metadata.page;
    if (
      page &&
      typeof page === 'object' &&
      typeof (page as Record<string, unknown>).fingerprint === 'string'
    ) {
      return ((page as Record<string, unknown>).fingerprint as string).trim() || undefined;
    }
    if (typeof metadata.pageFingerprint === 'string' && metadata.pageFingerprint.trim()) {
      return metadata.pageFingerprint.trim();
    }
    if (typeof metadata.page_fingerprint === 'string' && metadata.page_fingerprint.trim()) {
      return metadata.page_fingerprint.trim();
    }
    return undefined;
  }

  private extractRuntimePhaseResults(result: RuntimeStepInvokeResult): Record<string, unknown>[] {
    const outputPhaseResults = this.readRecordArray(result.output?.phaseResults);
    if (outputPhaseResults.length > 0) {
      return outputPhaseResults;
    }
    return this.readRecordArray(result.rawResult?.output, 'phaseResults');
  }

  private async resolveFailedWorkflowActivityPhase(
    executionId: string,
    parentPhaseKey: string,
    activityPhases: WorkflowActivityPhaseDefinition[]
  ): Promise<WorkflowActivityPhaseDefinition | null> {
    if (typeof this.executionPhaseService?.listByExecutionId !== 'function') {
      return activityPhases[0] || null;
    }

    const existingPhases = await this.executionPhaseService.listByExecutionId(executionId);
    const candidatePhases = existingPhases
      .filter((phase) => {
        const phaseType = this.readNonEmptyString(phase.phaseType, phase.phase_type);
        if (phaseType !== 'workflow_activity') {
          return false;
        }
        const input = this.readRecord(phase.input, phase.input_json);
        return this.readNonEmptyString(input?.parentPhaseKey) === parentPhaseKey;
      })
      .sort((left, right) => {
        const leftInput = this.readRecord(left.input, left.input_json);
        const rightInput = this.readRecord(right.input, right.input_json);
        const leftOrder = Number(leftInput?.order || 0);
        const rightOrder = Number(rightInput?.order || 0);
        return rightOrder - leftOrder;
      });

    const activePhase =
      candidatePhases.find((phase) => {
        const status = this.readNonEmptyString(phase.status);
        return status === 'running' || status === 'waiting_takeover' || status === 'resumable';
      }) || candidatePhases[0];

    const activePhaseKey = activePhase
      ? this.readNonEmptyString(activePhase.phaseKey, activePhase.phase_key)
      : undefined;
    if (!activePhaseKey) {
      return activityPhases[0] || null;
    }

    return (
      activityPhases.find((phase) => phase.phaseKey === activePhaseKey) || activityPhases[0] || null
    );
  }

  private mapRuntimeArtifactsFromActivityPhaseResult(
    phaseResultBody: Record<string, unknown>
  ): Array<{
    artifactType: string;
    snapshotId?: string | null;
    pageUrl?: string | null;
    pageFingerprint?: string | null;
    payload?: Record<string, unknown> | null;
  }> {
    const runtimeArtifacts = this.readRecordArray(phaseResultBody, 'artifacts');
    if (runtimeArtifacts.length === 0) {
      return [];
    }

    const mappedArtifacts = runtimeArtifacts.map((artifact) => {
      const snapshot = this.readRecord(artifact.snapshot);
      const artifactRecord = this.readRecord(artifact.artifact);
      const snapshotId = this.readNonEmptyString(
        artifact.snapshotId,
        artifact.snapshot_id,
        snapshot?.id
      );
      const snapshotPath = this.readNonEmptyString(snapshot?.path);
      const artifactPath = this.readNonEmptyString(artifactRecord?.path);
      const command = this.readNonEmptyString(artifact.command);
      const status = this.readNonEmptyString(artifact.status);

      if (!snapshotId && !snapshotPath && !artifactPath) {
        return null;
      }

      return {
        artifactType: snapshotId ? 'snapshot' : 'browser_artifact',
        snapshotId: snapshotId || null,
        pageUrl: null,
        pageFingerprint: null,
        payload: {
          ...(command ? { command } : {}),
          ...(status ? { status } : {}),
          ...(snapshotPath ? { snapshotPath } : {}),
          ...(artifactPath ? { artifactPath } : {}),
        },
      };
    });

    return mappedArtifacts.filter((item) => item !== null);
  }

  private mapRuntimeStepsFromActivityPhaseResult(
    phaseResultBody: Record<string, unknown>,
    phaseResult?: Record<string, unknown>
  ): Array<{
    stepIndex: number;
    stepId?: string | null;
    action: string;
    status: string;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    errorMessage?: string | null;
    errorCode?: string | null;
    snapshotId?: string | null;
    startedAt?: Date | null;
    endedAt?: Date | null;
  }> {
    const nestedResults = this.readRecordArray(phaseResultBody, 'results');
    if (nestedResults.length > 0) {
      return nestedResults.map((nestedResult, index) =>
        this.mapRuntimePhaseStepRecord(nestedResult, index + 1, {
          phaseResult,
          fallbackAction:
            this.readNonEmptyString(
              nestedResult.action,
              nestedResult.command,
              phaseResult?.stepName,
              phaseResult?.activityName
            ) || 'execute',
        })
      );
    }

    return [
      this.mapRuntimePhaseStepRecord(phaseResultBody, 1, {
        phaseResult,
        fallbackAction:
          this.readNonEmptyString(phaseResult?.stepName, phaseResult?.activityName) || 'execute',
      }),
    ];
  }

  private async loadWorkflowActivityPhaseDefinitions(
    capabilityId: string,
    parentPhaseKey: string
  ): Promise<WorkflowActivityPhaseDefinition[]> {
    if (!capabilityId) {
      return [];
    }
    if (typeof this.prisma.$queryRawUnsafe !== 'function') {
      return [];
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ source_payload_json?: unknown }>>(
        `
          SELECT css.source_payload_json
          FROM capability_releases cr
          INNER JOIN capability_source_snapshots css
            ON css.id = cr.current_source_snapshot_id
          WHERE cr.published_skill_id = $1::uuid
            AND cr.archived_at IS NULL
          ORDER BY cr.updated_at DESC
          LIMIT 1
        `,
        capabilityId
      );

      const sourcePayload = this.parseJsonRecord(rows[0]?.source_payload_json);
      const workflowDsl = this.parseJsonRecord(sourcePayload?.workflowDsl);
      const workflowSteps = Array.isArray(workflowDsl?.steps)
        ? workflowDsl.steps.filter(
            (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
          )
        : [];
      const activitySteps = workflowSteps.filter((step) => {
        const stepType = this.readNonEmptyString(step.type);
        return stepType === 'activity';
      });

      return activitySteps.map((activityStep, index) => {
        const activityKeySource =
          this.readNonEmptyString(
            activityStep.activityName,
            activityStep.activityRef,
            activityStep.name
          ) || `activity_${index + 1}`;
        const activityLabel =
          this.readNonEmptyString(
            activityStep.name,
            activityStep.activityName,
            activityStep.activityRef
          ) || `Activity ${index + 1}`;

        return {
          phaseKey: `${parentPhaseKey}__activity_${String(index + 1).padStart(2, '0')}_${this.sanitizePhaseKeyFragment(activityKeySource)}`,
          phaseName: activityLabel,
          phaseType: 'workflow_activity',
          activityName:
            this.readNonEmptyString(
              activityStep.activityName,
              activityStep.activityRef,
              activityLabel
            ) || undefined,
          parentPhaseKey,
          order: index + 1,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      this.logger.warn(
        `Failed to load workflow activity phases for capability ${capabilityId}: ${message}`
      );
      return [];
    }
  }

  private parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private sanitizePhaseKeyFragment(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || 'activity';
  }

  private extractPhaseStepsFromRuntimeResult(
    result: RuntimeStepInvokeResult,
    step?: Record<string, unknown> | null
  ): Array<{
    stepIndex: number;
    stepId?: string | null;
    action: string;
    status: string;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    errorMessage?: string | null;
    errorCode?: string | null;
    snapshotId?: string | null;
    startedAt?: Date | null;
    endedAt?: Date | null;
  }> {
    const phaseResults =
      this.readRecordArray(result.output?.phaseResults).length > 0
        ? this.readRecordArray(result.output?.phaseResults)
        : this.readRecordArray(result.rawResult?.output, 'phaseResults');

    if (phaseResults.length > 0) {
      const flattenedSteps: Array<{
        stepIndex: number;
        stepId?: string | null;
        action: string;
        status: string;
        input?: Record<string, unknown> | null;
        output?: Record<string, unknown> | null;
        errorMessage?: string | null;
        errorCode?: string | null;
        snapshotId?: string | null;
        startedAt?: Date | null;
        endedAt?: Date | null;
      }> = [];

      phaseResults.forEach((phaseResult, phaseIndex) => {
        const phaseResultBody = this.readRecord(
          phaseResult.result,
          phaseResult.output,
          phaseResult
        );
        const nestedResults = this.readRecordArray(phaseResultBody, 'results');

        if (nestedResults.length > 0) {
          nestedResults.forEach((nestedResult) => {
            flattenedSteps.push(
              this.mapRuntimePhaseStepRecord(nestedResult, flattenedSteps.length + 1, {
                phaseResult,
                fallbackAction:
                  this.readNonEmptyString(
                    nestedResult.action,
                    nestedResult.command,
                    phaseResult.stepName,
                    phaseResult.phaseName,
                    phaseResult.name,
                    step?.action
                  ) || 'execute',
              })
            );
          });
          return;
        }

        flattenedSteps.push(
          this.mapRuntimePhaseStepRecord(phaseResultBody, flattenedSteps.length + 1, {
            phaseResult,
            fallbackAction:
              this.readNonEmptyString(
                phaseResult.stepName,
                phaseResult.phaseName,
                phaseResult.name,
                step?.action
              ) || `phase_${phaseIndex + 1}`,
          })
        );
      });

      return flattenedSteps;
    }

    const topLevelStepResults =
      this.readRecordArray(result.output?.stepResults).length > 0
        ? this.readRecordArray(result.output?.stepResults)
        : this.readRecordArray(result.rawResult?.output, 'stepResults');
    if (topLevelStepResults.length > 0) {
      return topLevelStepResults.map((stepResult, index) =>
        this.mapRuntimePhaseStepRecord(stepResult, index + 1, {
          fallbackAction:
            this.readNonEmptyString(stepResult.action, stepResult.name, step?.action) || 'execute',
        })
      );
    }

    return [];
  }

  private mapRuntimePhaseStepRecord(
    stepRecord: Record<string, unknown>,
    stepIndex: number,
    options?: {
      phaseResult?: Record<string, unknown>;
      fallbackAction?: string;
    }
  ): {
    stepIndex: number;
    stepId?: string | null;
    action: string;
    status: string;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    errorMessage?: string | null;
    errorCode?: string | null;
    snapshotId?: string | null;
    startedAt?: Date | null;
    endedAt?: Date | null;
  } {
    const snapshot = this.readRecord(stepRecord.snapshot);
    const input = this.readRecord(stepRecord.input, stepRecord.args, stepRecord.params);
    const output = this.readRecord(
      stepRecord.output,
      stepRecord.result,
      stepRecord.data,
      stepRecord
    );

    return {
      stepIndex,
      stepId: this.readNonEmptyString(stepRecord.stepId, stepRecord.step_id, stepRecord.id) || null,
      action:
        this.readNonEmptyString(
          stepRecord.action,
          stepRecord.command,
          stepRecord.name,
          options?.fallbackAction
        ) || 'execute',
      status: this.normalizeRuntimePhaseStepStatus(stepRecord),
      input,
      output,
      errorMessage:
        this.readNonEmptyString(
          stepRecord.errorMessage,
          stepRecord.error_message,
          stepRecord.message
        ) || null,
      errorCode: this.readNonEmptyString(stepRecord.errorCode, stepRecord.error_code) || null,
      snapshotId:
        this.readNonEmptyString(stepRecord.snapshotId, stepRecord.snapshot_id, snapshot?.id) ||
        null,
      startedAt: null,
      endedAt: null,
    };
  }

  private normalizeRuntimePhaseStepStatus(stepRecord: Record<string, unknown>): string {
    const explicitStatus = this.readNonEmptyString(stepRecord.status);
    if (explicitStatus) {
      const normalized = explicitStatus.toLowerCase();
      if (normalized === 'success') {
        return 'completed';
      }
      if (normalized === 'error') {
        return 'failed';
      }
      if (normalized === 'takeover_required') {
        return 'waiting_takeover';
      }
      return normalized;
    }

    if (stepRecord.success === true) {
      return 'completed';
    }
    if (stepRecord.success === false) {
      return 'failed';
    }
    if (
      this.readNonEmptyString(stepRecord.errorMessage, stepRecord.error_message, stepRecord.message)
    ) {
      return 'failed';
    }
    return 'completed';
  }

  private readRecordArray(source: unknown, key?: string): Record<string, unknown>[] {
    const value =
      key && source && typeof source === 'object'
        ? (source as Record<string, unknown>)[key]
        : source;
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
    );
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
      if (typeof value === 'string' && value.trim()) {
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
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  private readDateValue(...values: unknown[]): Date | undefined {
    for (const value of values) {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
    return undefined;
  }
}
