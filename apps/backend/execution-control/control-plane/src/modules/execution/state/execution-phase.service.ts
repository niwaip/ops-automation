import { Injectable, Logger } from '@nestjs/common';
import type { BrowserPhaseCheck } from './execution.dto';
import { PrismaService } from '../../prisma/prisma.service';

type RawRecord = Record<string, unknown>;

interface UpsertExecutionPhaseInput {
  executionId: string;
  phaseKey: string;
  phaseName: string;
  phaseType: string;
  status?: string;
  attempt?: number;
  runtimeSessionId?: string | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  precheck?: BrowserPhaseCheck | null;
  postcheck?: BrowserPhaseCheck | null;
  recoveryDecision?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

interface CreateExecutionTakeoverInput {
  executionId: string;
  phaseId: string;
  runtimeSessionId?: string | null;
  reason?: string | null;
  requestedBy?: string | null;
}

interface ResolveExecutionTakeoverInput {
  executionId: string;
  phaseId?: string | null;
  takeoverId?: string | null;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
  status?: string;
}

interface UpsertExecutionPhaseArtifactInput {
  artifactType: string;
  snapshotId?: string | null;
  pageUrl?: string | null;
  pageFingerprint?: string | null;
  payload?: Record<string, unknown> | null;
}

interface UpsertExecutionPhaseStepInput {
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
}

@Injectable()
export class ExecutionPhaseService {
  private readonly logger = new Logger(ExecutionPhaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createOrUpdatePhase(input: UpsertExecutionPhaseInput): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `
        INSERT INTO execution_phases (
          execution_id,
          phase_key,
          phase_name,
          phase_type,
          status,
          attempt,
          runtime_session_id,
          input_json,
          output_json,
          precheck_json,
          postcheck_json,
          recovery_decision_json,
          error_code,
          error_message,
          started_at,
          completed_at
        )
        VALUES (
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::uuid,
          CAST($8 AS jsonb),
          CAST($9 AS jsonb),
          CAST($10 AS jsonb),
          CAST($11 AS jsonb),
          CAST($12 AS jsonb),
          $13,
          $14,
          $15::timestamptz,
          $16::timestamptz
        )
        ON CONFLICT (execution_id, phase_key)
        DO UPDATE SET
          phase_name = EXCLUDED.phase_name,
          phase_type = EXCLUDED.phase_type,
          status = EXCLUDED.status,
          attempt = GREATEST(execution_phases.attempt, EXCLUDED.attempt),
          runtime_session_id = EXCLUDED.runtime_session_id,
          input_json = EXCLUDED.input_json,
          output_json = COALESCE(EXCLUDED.output_json, execution_phases.output_json),
          precheck_json = EXCLUDED.precheck_json,
          postcheck_json = EXCLUDED.postcheck_json,
          recovery_decision_json = COALESCE(EXCLUDED.recovery_decision_json, execution_phases.recovery_decision_json),
          error_code = EXCLUDED.error_code,
          error_message = EXCLUDED.error_message,
          started_at = COALESCE(execution_phases.started_at, EXCLUDED.started_at),
          completed_at = EXCLUDED.completed_at,
          updated_at = NOW()
      `,
      input.executionId,
      input.phaseKey,
      input.phaseName,
      input.phaseType,
      input.status || 'pending',
      Math.max(input.attempt || 0, 0),
      input.runtimeSessionId || null,
      this.toJsonString(input.input),
      this.toJsonString(input.output),
      this.toJsonString(input.precheck),
      this.toJsonString(input.postcheck),
      this.toJsonString(input.recoveryDecision),
      input.errorCode || null,
      input.errorMessage || null,
      input.startedAt || null,
      input.completedAt || null
    );

    await this.syncExecutionPhaseSummary(
      input.executionId,
      input.phaseKey,
      input.status || 'pending'
    );
  }

  async markRunning(
    executionId: string,
    phaseKey: string,
    updates: Pick<
      UpsertExecutionPhaseInput,
      'phaseName' | 'phaseType' | 'attempt' | 'runtimeSessionId' | 'input' | 'precheck'
    >
  ): Promise<void> {
    await this.createOrUpdatePhase({
      executionId,
      phaseKey,
      phaseName: updates.phaseName,
      phaseType: updates.phaseType,
      status: 'running',
      attempt: updates.attempt,
      runtimeSessionId: updates.runtimeSessionId,
      input: updates.input,
      precheck: updates.precheck,
      startedAt: new Date(),
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    });
  }

  async markCompleted(
    executionId: string,
    phaseKey: string,
    updates: Pick<
      UpsertExecutionPhaseInput,
      'phaseName' | 'phaseType' | 'attempt' | 'runtimeSessionId' | 'output' | 'postcheck'
    >
  ): Promise<void> {
    await this.createOrUpdatePhase({
      executionId,
      phaseKey,
      phaseName: updates.phaseName,
      phaseType: updates.phaseType,
      status: 'completed',
      attempt: updates.attempt,
      runtimeSessionId: updates.runtimeSessionId,
      output: updates.output,
      postcheck: updates.postcheck,
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    });
  }

  async markFailed(
    executionId: string,
    phaseKey: string,
    updates: Pick<
      UpsertExecutionPhaseInput,
      | 'phaseName'
      | 'phaseType'
      | 'attempt'
      | 'runtimeSessionId'
      | 'output'
      | 'postcheck'
      | 'recoveryDecision'
      | 'errorCode'
      | 'errorMessage'
    >
  ): Promise<void> {
    await this.createOrUpdatePhase({
      executionId,
      phaseKey,
      phaseName: updates.phaseName,
      phaseType: updates.phaseType,
      status: 'failed',
      attempt: updates.attempt,
      runtimeSessionId: updates.runtimeSessionId,
      output: updates.output,
      postcheck: updates.postcheck,
      recoveryDecision: updates.recoveryDecision,
      errorCode: updates.errorCode,
      errorMessage: updates.errorMessage,
      completedAt: new Date(),
    });
  }

  async markWaitingTakeover(
    executionId: string,
    phaseKey: string,
    updates: Pick<
      UpsertExecutionPhaseInput,
      | 'phaseName'
      | 'phaseType'
      | 'attempt'
      | 'runtimeSessionId'
      | 'output'
      | 'postcheck'
      | 'recoveryDecision'
      | 'errorCode'
      | 'errorMessage'
    >
  ): Promise<void> {
    await this.createOrUpdatePhase({
      executionId,
      phaseKey,
      phaseName: updates.phaseName,
      phaseType: updates.phaseType,
      status: 'waiting_takeover',
      attempt: updates.attempt,
      runtimeSessionId: updates.runtimeSessionId,
      output: updates.output,
      postcheck: updates.postcheck,
      recoveryDecision: updates.recoveryDecision,
      errorCode: updates.errorCode,
      errorMessage: updates.errorMessage,
      completedAt: null,
    });
  }

  async markResumable(
    executionId: string,
    phaseKey: string,
    updates: Pick<
      UpsertExecutionPhaseInput,
      | 'phaseName'
      | 'phaseType'
      | 'attempt'
      | 'runtimeSessionId'
      | 'output'
      | 'postcheck'
      | 'recoveryDecision'
      | 'errorCode'
      | 'errorMessage'
    >
  ): Promise<void> {
    await this.createOrUpdatePhase({
      executionId,
      phaseKey,
      phaseName: updates.phaseName,
      phaseType: updates.phaseType,
      status: 'resumable',
      attempt: updates.attempt,
      runtimeSessionId: updates.runtimeSessionId,
      output: updates.output,
      postcheck: updates.postcheck,
      recoveryDecision: updates.recoveryDecision,
      errorCode: updates.errorCode || null,
      errorMessage: updates.errorMessage || null,
      completedAt: null,
    });
  }

  async getByExecutionIdAndPhaseKey(
    executionId: string,
    phaseKey: string
  ): Promise<RawRecord | null> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<RawRecord[]>(
        `
          SELECT
            ep.id,
            ep.execution_id,
            ep.phase_key,
            ep.phase_name,
            ep.phase_type,
            ep.status,
            ep.attempt,
            ep.runtime_session_id,
            ep.input_json,
            ep.output_json,
            ep.precheck_json,
            ep.postcheck_json,
            ep.recovery_decision_json,
            ep.error_code,
            ep.error_message,
            ep.started_at,
            ep.completed_at,
            ep.created_at,
            ep.updated_at
          FROM execution_phases ep
          WHERE ep.execution_id = $1::uuid
            AND ep.phase_key = $2
          LIMIT 1
        `,
        executionId,
        phaseKey
      );

      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch (error) {
      if (this.isMissingPhaseTableError(error)) {
        return null;
      }
      throw error;
    }
  }

  async createTakeoverRecord(input: CreateExecutionTakeoverInput): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `
        INSERT INTO execution_takeovers (
          execution_id,
          phase_id,
          runtime_session_id,
          status,
          reason,
          requested_by
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          'requested',
          $4,
          $5::uuid
        )
      `,
      input.executionId,
      input.phaseId,
      input.runtimeSessionId || null,
      input.reason || null,
      input.requestedBy || null
    );

    await this.updateExecutionTakeoverStatus(input.executionId, 'requested');
  }

  async replaceSteps(
    executionId: string,
    phaseKey: string,
    steps: UpsertExecutionPhaseStepInput[]
  ): Promise<void> {
    try {
      const phase = await this.getByExecutionIdAndPhaseKey(executionId, phaseKey);
      const phaseId = typeof phase?.id === 'string' ? phase.id : String(phase?.id || '').trim();
      if (!phaseId) {
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `
            DELETE FROM execution_phase_steps
            WHERE phase_id = $1::uuid
          `,
          phaseId
        );

        for (const step of steps) {
          await tx.$executeRawUnsafe(
            `
              INSERT INTO execution_phase_steps (
                phase_id,
                step_index,
                step_id,
                action,
                status,
                input_json,
                output_json,
                error_message,
                error_code,
                snapshot_id,
                started_at,
                ended_at
              )
              VALUES (
                $1::uuid,
                $2,
                $3,
                $4,
                $5,
                CAST($6 AS jsonb),
                CAST($7 AS jsonb),
                $8,
                $9,
                $10,
                $11::timestamptz,
                $12::timestamptz
              )
            `,
            phaseId,
            step.stepIndex,
            step.stepId || null,
            step.action,
            step.status,
            this.toJsonString(step.input),
            this.toJsonString(step.output),
            step.errorMessage || null,
            step.errorCode || null,
            step.snapshotId || null,
            step.startedAt || null,
            step.endedAt || null
          );
        }
      });
    } catch (error) {
      if (this.isMissingPhaseTableError(error)) {
        return;
      }
      throw error;
    }
  }

  async appendSteps(
    executionId: string,
    phaseKey: string,
    steps: UpsertExecutionPhaseStepInput[]
  ): Promise<void> {
    try {
      const phase = await this.getByExecutionIdAndPhaseKey(executionId, phaseKey);
      const phaseId = typeof phase?.id === 'string' ? phase.id : String(phase?.id || '').trim();
      if (!phaseId || steps.length === 0) {
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        // 使用行级锁对 phase 进行排他锁定，彻底解决同一 phase 的并发 appendSteps 竞争问题
        await tx.$executeRawUnsafe(
          `SELECT id FROM execution_phases WHERE id = $1::uuid FOR UPDATE`,
          phaseId
        );

        for (const step of steps) {
          const updated = await tx.$executeRawUnsafe(
            `
              UPDATE execution_phase_steps
              SET
                step_id = $3,
                action = $4,
                status = $5,
                input_json = CAST($6 AS jsonb),
                output_json = CAST($7 AS jsonb),
                error_message = $8,
                error_code = $9,
                snapshot_id = $10,
                started_at = COALESCE($11::timestamptz, started_at),
                ended_at = COALESCE($12::timestamptz, ended_at)
              WHERE phase_id = $1::uuid
                AND step_index = $2
            `,
            phaseId,
            step.stepIndex,
            step.stepId || null,
            step.action,
            step.status,
            this.toJsonString(step.input),
            this.toJsonString(step.output),
            step.errorMessage || null,
            step.errorCode || null,
            step.snapshotId || null,
            step.startedAt || null,
            step.endedAt || null
          );

          if (updated === 0) {
            await tx.$executeRawUnsafe(
              `
                INSERT INTO execution_phase_steps (
                  phase_id,
                  step_index,
                  step_id,
                  action,
                  status,
                  input_json,
                  output_json,
                  error_message,
                  error_code,
                  snapshot_id,
                  started_at,
                  ended_at
                )
                VALUES (
                  $1::uuid,
                  $2,
                  $3,
                  $4,
                  $5,
                  CAST($6 AS jsonb),
                  CAST($7 AS jsonb),
                  $8,
                  $9,
                  $10,
                  $11::timestamptz,
                  $12::timestamptz
                )
              `,
              phaseId,
              step.stepIndex,
              step.stepId || null,
              step.action,
              step.status,
              this.toJsonString(step.input),
              this.toJsonString(step.output),
              step.errorMessage || null,
              step.errorCode || null,
              step.snapshotId || null,
              step.startedAt || null,
              step.endedAt || null
            );
          }
        }
      });
    } catch (error) {
      if (this.isMissingPhaseTableError(error)) {
        return;
      }
      throw error;
    }
  }

  async replaceArtifacts(
    executionId: string,
    phaseKey: string,
    artifacts: UpsertExecutionPhaseArtifactInput[]
  ): Promise<void> {
    try {
      const phase = await this.getByExecutionIdAndPhaseKey(executionId, phaseKey);
      const phaseId = typeof phase?.id === 'string' ? phase.id : String(phase?.id || '').trim();
      if (!phaseId) {
        return;
      }

      await this.prisma.$executeRawUnsafe(
        `
          DELETE FROM execution_phase_artifacts
          WHERE phase_id = $1::uuid
        `,
        phaseId
      );

      for (const artifact of artifacts) {
        await this.prisma.$executeRawUnsafe(
          `
            INSERT INTO execution_phase_artifacts (
              phase_id,
              artifact_type,
              snapshot_id,
              page_url,
              page_fingerprint,
              payload_json
            )
            VALUES (
              $1::uuid,
              $2,
              $3,
              $4,
              $5,
              CAST($6 AS jsonb)
            )
          `,
          phaseId,
          artifact.artifactType || 'document',
          artifact.snapshotId || null,
          artifact.pageUrl || null,
          artifact.pageFingerprint || null,
          this.toJsonString(artifact.payload)
        );
      }
    } catch (error) {
      if (this.isMissingPhaseTableError(error)) {
        return;
      }
      throw error;
    }
  }

  async appendArtifacts(
    executionId: string,
    phaseKey: string,
    artifacts: UpsertExecutionPhaseArtifactInput[]
  ): Promise<void> {
    try {
      const phase = await this.getByExecutionIdAndPhaseKey(executionId, phaseKey);
      const phaseId = typeof phase?.id === 'string' ? phase.id : String(phase?.id || '').trim();
      if (!phaseId) {
        return;
      }

      for (const artifact of artifacts) {
        await this.prisma.$executeRawUnsafe(
          `
            INSERT INTO execution_phase_artifacts (
              phase_id,
              artifact_type,
              snapshot_id,
              page_url,
              page_fingerprint,
              payload_json
            )
            VALUES (
              $1::uuid,
              $2,
              $3,
              $4,
              $5,
              CAST($6 AS jsonb)
            )
          `,
          phaseId,
          artifact.artifactType || 'document',
          artifact.snapshotId || null,
          artifact.pageUrl || null,
          artifact.pageFingerprint || null,
          this.toJsonString(artifact.payload)
        );
      }
    } catch (error) {
      if (this.isMissingPhaseTableError(error)) {
        return;
      }
      throw error;
    }
  }

  async resolveTakeoverRecord(input: ResolveExecutionTakeoverInput): Promise<void> {
    let updated = 0;

    if (input.takeoverId) {
      // 1. 若提供了具体 takeoverId，精确解决该记录
      updated = await this.prisma.$executeRawUnsafe(
        `
          UPDATE execution_takeovers
          SET
            status = $2,
            resolved_by = $3::uuid,
            resolution_note = COALESCE($4, resolution_note),
            resolved_at = NOW()
          WHERE id = $1::uuid
            AND status IN ('requested', 'pending')
        `,
        input.takeoverId,
        input.status || 'resolved',
        input.resolvedBy || null,
        input.resolutionNote || null
      );
    } else if (input.phaseId) {
      // 2. 若指定了 phaseId，严格限制在该 phaseId 范围内匹配待决记录，严禁跨 phase 误关其他阶段的接管记录
      updated = await this.prisma.$executeRawUnsafe(
        `
          UPDATE execution_takeovers
          SET
            status = $3,
            resolved_by = $4::uuid,
            resolution_note = COALESCE($5, resolution_note),
            resolved_at = NOW()
          WHERE id = (
            SELECT et.id
            FROM execution_takeovers et
            WHERE et.execution_id = $1::uuid
              AND et.phase_id = $2::uuid
              AND et.status IN ('requested', 'pending')
            ORDER BY et.created_at DESC
            LIMIT 1
          )
        `,
        input.executionId,
        input.phaseId,
        input.status || 'resolved',
        input.resolvedBy || null,
        input.resolutionNote || null
      );
    } else {
      // 3. 仅当未指定 phaseId 和 takeoverId 时，按 executionId 解决最新的待决记录
      updated = await this.prisma.$executeRawUnsafe(
        `
          UPDATE execution_takeovers
          SET
            status = $2,
            resolved_by = $3::uuid,
            resolution_note = COALESCE($4, resolution_note),
            resolved_at = NOW()
          WHERE id = (
            SELECT et.id
            FROM execution_takeovers et
            WHERE et.execution_id = $1::uuid
              AND et.status IN ('requested', 'pending')
            ORDER BY et.created_at DESC
            LIMIT 1
          )
        `,
        input.executionId,
        input.status || 'resolved',
        input.resolvedBy || null,
        input.resolutionNote || null
      );
    }

    // 4. 执行摘要状态从实际剩余待决记录数量推导，杜绝提前宣称全部 resolved
    try {
      const remainingRows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
        `
          SELECT count(*)::int as count
          FROM execution_takeovers
          WHERE execution_id = $1::uuid
            AND status IN ('requested', 'pending')
        `,
        input.executionId
      );
      const remainingCount = Number(remainingRows?.[0]?.count ?? 0);

      if (remainingCount === 0 && updated > 0) {
        // 当且仅当所有待决接管记录均已处置完毕且本次确实发生处置时，才将摘要标记为 resolved
        await this.updateExecutionTakeoverStatus(input.executionId, 'resolved');
      } else if (remainingCount > 0) {
        // 若仍有其他阶段待决接管，保持为 requested
        await this.updateExecutionTakeoverStatus(input.executionId, 'requested');
      }
    } catch {
      // 容错处理
    }
  }

  async listByExecutionId(executionId: string): Promise<RawRecord[]> {
    try {
      const phases = await this.prisma.$queryRawUnsafe<RawRecord[]>(
        `
          SELECT
            ep.id,
            ep.execution_id,
            ep.phase_key,
            ep.phase_name,
            ep.phase_type,
            ep.status,
            ep.attempt,
            ep.runtime_session_id,
            ep.input_json,
            ep.output_json,
            ep.precheck_json,
            ep.postcheck_json,
            ep.recovery_decision_json,
            ep.error_code,
            ep.error_message,
            ep.started_at,
            ep.completed_at,
            ep.created_at,
            ep.updated_at
          FROM execution_phases ep
          WHERE ep.execution_id = $1::uuid
          ORDER BY ep.created_at ASC
        `,
        executionId
      );

      if (!Array.isArray(phases) || phases.length === 0) {
        return [];
      }

      const withArtifactsAndTakeovers: RawRecord[] = [];
      for (const phase of phases) {
        const phaseId = String(phase.id || '').trim();
        if (!phaseId) {
          withArtifactsAndTakeovers.push({
            ...phase,
            artifacts: [],
            takeovers: [],
          });
          continue;
        }

        const [artifacts, takeovers, steps] = await Promise.all([
          this.listArtifactsByPhaseId(phaseId),
          this.listTakeoversByPhaseId(phaseId),
          this.listStepsByPhaseId(phaseId),
        ]);

        withArtifactsAndTakeovers.push({
          ...phase,
          artifacts,
          takeovers,
          steps,
        });
      }

      return withArtifactsAndTakeovers;
    } catch (error) {
      if (this.isMissingPhaseTableError(error)) {
        return [];
      }

      throw error;
    }
  }

  private async listStepsByPhaseId(phaseId: string): Promise<RawRecord[]> {
    try {
      return await this.prisma.$queryRawUnsafe<RawRecord[]>(
        `
          SELECT
            eps.id,
            eps.phase_id,
            eps.step_index,
            eps.step_id,
            eps.action,
            eps.status,
            eps.input_json,
            eps.output_json,
            eps.error_message,
            eps.error_code,
            eps.snapshot_id,
            eps.started_at,
            eps.ended_at,
            eps.created_at
          FROM execution_phase_steps eps
          WHERE eps.phase_id = $1::uuid
          ORDER BY eps.created_at ASC, eps.step_index ASC
        `,
        phaseId
      );
    } catch (error) {
      if (this.isMissingPhaseTableError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async listArtifactsByPhaseId(phaseId: string): Promise<RawRecord[]> {
    try {
      return await this.prisma.$queryRawUnsafe<RawRecord[]>(
        `
          SELECT
            epa.id,
            epa.phase_id,
            epa.artifact_type,
            epa.snapshot_id,
            epa.page_url,
            epa.page_fingerprint,
            epa.payload_json,
            epa.created_at
          FROM execution_phase_artifacts epa
          WHERE epa.phase_id = $1::uuid
          ORDER BY epa.created_at ASC
        `,
        phaseId
      );
    } catch (error) {
      if (this.isMissingPhaseTableError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async listTakeoversByPhaseId(phaseId: string): Promise<RawRecord[]> {
    try {
      return await this.prisma.$queryRawUnsafe<RawRecord[]>(
        `
          SELECT
            et.id,
            et.execution_id,
            et.phase_id,
            et.runtime_session_id,
            et.status,
            et.reason,
            et.requested_by,
            et.resolved_by,
            et.resolution_note,
            et.created_at,
            et.resolved_at
          FROM execution_takeovers et
          WHERE et.phase_id = $1::uuid
          ORDER BY et.created_at ASC
        `,
        phaseId
      );
    } catch (error) {
      if (this.isMissingPhaseTableError(error)) {
        return [];
      }
      throw error;
    }
  }

  private isMissingPhaseTableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    const isMissing =
      /execution_phases|execution_phase_artifacts|execution_takeovers/i.test(message) &&
      /does not exist|doesn't exist|no such table|relation/i.test(message);

    if (isMissing) {
      this.logger.debug('Execution phase tables are not available yet, returning empty phase list');
    }

    return isMissing;
  }

  private async syncExecutionPhaseSummary(
    executionId: string,
    phaseKey: string,
    phaseStatus: string
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `
        UPDATE executions
        SET
          current_phase_key = $2,
          current_phase_status = $3,
          takeover_status = CASE
            WHEN $3 = 'waiting_takeover' THEN 'requested'
            WHEN $3 = 'resumable' THEN 'resumable'
            WHEN $3 = 'running' THEN 'in_progress'
            WHEN $3 = 'completed' AND takeover_status IN ('requested', 'resumable', 'in_progress') THEN 'resolved'
            WHEN $3 = 'failed' AND takeover_status IN ('requested', 'resumable', 'in_progress') THEN 'failed'
            ELSE takeover_status
          END,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      executionId,
      phaseKey,
      phaseStatus
    );
  }

  private toJsonString(value: Record<string, unknown> | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    return JSON.stringify(value);
  }

  private async updateExecutionTakeoverStatus(
    executionId: string,
    takeoverStatus: string | null
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `
        UPDATE executions
        SET
          takeover_status = $2,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      executionId,
      takeoverStatus
    );
  }
}
