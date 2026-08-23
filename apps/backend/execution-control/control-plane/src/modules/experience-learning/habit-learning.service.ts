import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeWorkflowAlias } from '../saved-skill/workflow-alias-normalizer';
import {
  HABIT_POLICY_VERSION,
  type HabitCandidateRow,
  type SavedWorkflowEvidenceRow,
} from './habit-learning.types';
import {
  detectHabitRisk,
  habitAuditSnapshot,
  serializeHabitDates,
} from './habit-learning.utils';
import { HabitAutoActivationService } from './habit-auto-activation.service';

@Injectable()
export class HabitLearningService {
  private readonly logger = new Logger(HabitLearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoActivation: HabitAutoActivationService
  ) {}

  async runNow(runKey = `manual:${randomUUID()}`, cutoff = new Date()) {
    const previous = await this.prisma.$queryRawUnsafe<Array<{ windowEnd: Date }>>(
      `SELECT window_end AS "windowEnd"
         FROM habit_learning_runs
        WHERE status = 'succeeded'
        ORDER BY window_end DESC
        LIMIT 1`
    );
    const windowStart = previous[0]?.windowEnd || new Date(cutoff.getTime() - 30 * 86400000);
    let runId: string = randomUUID();
    const inserted = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO habit_learning_runs
        (id, idempotency_key, policy_version, status, window_start, window_end,
         lease_owner, lease_expires_at)
       VALUES ($1::uuid, $2, $3, 'running', $4, $5, $6, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      runId,
      runKey,
      HABIT_POLICY_VERSION,
      windowStart,
      cutoff,
      process.env.HOSTNAME || 'control-plane'
    );
    if (!inserted[0]) {
      const recovered = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE habit_learning_runs
            SET status = 'running', lease_owner = $1,
                lease_expires_at = NOW() + INTERVAL '15 minutes',
                error_summary = NULL, completed_at = NULL, started_at = NOW()
          WHERE idempotency_key = $2
            AND (status = 'failed' OR (status = 'running' AND lease_expires_at < NOW()))
        RETURNING id`,
        process.env.HOSTNAME || 'control-plane',
        runKey
      );
      if (!recovered[0]) {
        await this.autoActivation.activatePendingAiApproved();
        return this.getRunByKey(runKey);
      }
      runId = recovered[0].id;
    }

    try {
      await this.expireStaleHabits();
      const workflows = await this.loadSavedWorkflowEvidence(windowStart, cutoff);
      let candidateCount = 0;
      const itemErrors: string[] = [];
      for (const workflow of workflows) {
        try {
          candidateCount += await this.createWorkflowReuseCandidate(runId, workflow);
        } catch (error: unknown) {
          const userKey = createHash('sha256')
            .update(workflow.ownerUserId)
            .digest('hex')
            .slice(0, 12);
          const errorMessage = error instanceof Error ? error.message : String(error);
          const summary = `user=${userKey}, skill=${workflow.skillId}: ${errorMessage.slice(0, 300)}`;
          itemErrors.push(summary);
          this.logger.warn(`Habit candidate skipped: ${summary}`);
        }
      }
      const activation = await this.autoActivation.activatePendingAiApproved();
      if (activation.failed > 0) {
        itemErrors.push(`AI auto-activation failures=${activation.failed}`);
      }
      const processedUsers = new Set(workflows.map((workflow) => workflow.ownerUserId)).size;
      await this.prisma.$executeRawUnsafe(
        `UPDATE habit_learning_runs
            SET status = 'succeeded', candidate_count = $1, processed_users = $2,
                error_summary = $3,
                completed_at = NOW(), lease_expires_at = NULL
          WHERE id = $4::uuid`,
        candidateCount,
        processedUsers,
        itemErrors.length ? itemErrors.join('\n').slice(0, 2000) : null,
        runId
      );
      return this.getRun(runId);
    } catch (error: unknown) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE habit_learning_runs
            SET status = 'failed', error_summary = $1, completed_at = NOW(),
                lease_expires_at = NULL
          WHERE id = $2::uuid`,
        (error instanceof Error ? error.message : String(error)).slice(0, 2000),
        runId
      );
      throw error;
    }
  }

  async listCandidates(limit = 100) {
    const rows = await this.prisma.$queryRawUnsafe<Array<HabitCandidateRow & { userKey: string; workflowName: string | null }>>(
      `SELECT c.id,
              c.owner_user_id AS "ownerUserId",
              SUBSTRING(MD5(c.owner_user_id::text), 1, 12) AS "userKey",
              c.kind,
              c.status,
              c.risk_level AS "riskLevel",
              c.intent_key AS "intentKey",
              c.saved_skill_id AS "savedSkillId",
              c.saved_version AS "savedVersion",
              c.evidence_json AS "evidenceJson",
              c.review_json AS "reviewJson",
              c.shadow_json AS "shadowJson",
              c.source_run_id AS "sourceRunId",
              c.policy_version AS "policyVersion",
              s.name AS "workflowName",
              c.created_at AS "createdAt",
              c.updated_at AS "updatedAt"
         FROM user_habit_candidates c
         LEFT JOIN user_saved_skills s ON s.id = c.saved_skill_id
        ORDER BY c.created_at DESC
        LIMIT $1`,
      Math.max(1, Math.min(limit, 200))
    );
    return { candidates: rows.map((row) => this.toAdminCandidate(row)) };
  }

  async getCandidate(id: string) {
    const result = await this.listCandidates(200);
    const candidate = result.candidates.find((item) => item.id === id);
    if (!candidate) throw new NotFoundException(`Habit candidate ${id} not found`);
    return candidate;
  }

  async applyCandidateAction(
    actorUserId: string,
    candidateId: string,
    action: 'hold' | 'reject' | 'rollback',
    reason?: string
  ) {
    const beforeRows = await this.loadCandidate(candidateId);
    const before = beforeRows[0];
    if (!before) throw new NotFoundException(`Habit candidate ${candidateId} not found`);
    if (action === 'rollback') {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE user_habits SET status = 'disabled', updated_at = NOW()
            WHERE source_candidate_id = $1::uuid AND status <> 'disabled'`,
          candidateId
        );
        await tx.$executeRawUnsafe(
          `UPDATE user_habit_candidates SET status = 'rolled_back', updated_at = NOW()
            WHERE id = $1::uuid`,
          candidateId
        );
      });
    } else {
      const status = action === 'hold' ? 'held' : 'rejected';
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE user_habit_candidates SET status = $1, updated_at = NOW()
            WHERE id = $2::uuid`,
          status,
          candidateId
        );
        await tx.$executeRawUnsafe(
          `UPDATE user_habits
              SET status = $1, updated_at = NOW()
            WHERE source_candidate_id = $2::uuid`,
          action === 'hold' ? 'held' : 'disabled',
          candidateId
        );
      });
    }
    const after = (await this.loadCandidate(candidateId))[0];
    await this.writeAudit(actorUserId, candidateId, action, reason, before, after);
    return this.getCandidate(candidateId);
  }

  async listRuns() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      status: string;
      policyVersion: string;
      windowStart: Date;
      windowEnd: Date;
      candidateCount: number;
      processedUsers: number;
      errorSummary: string | null;
      startedAt: Date;
      completedAt: Date | null;
    }>>(
      `SELECT id, status, policy_version AS "policyVersion",
              window_start AS "windowStart", window_end AS "windowEnd",
              candidate_count AS "candidateCount", processed_users AS "processedUsers",
              error_summary AS "errorSummary", started_at AS "startedAt",
              completed_at AS "completedAt"
         FROM habit_learning_runs
        ORDER BY started_at DESC
        LIMIT 50`
    );
    return { runs: rows.map((row) => serializeHabitDates(row)) };
  }

  async listAdminHabits() {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT h.id,
              SUBSTRING(MD5(h.owner_user_id::text), 1, 12) AS "userKey",
              h.kind, h.status, h.intent_key AS "intentKey",
              h.saved_skill_id AS "savedSkillId", h.saved_version AS "savedVersion",
              h.version, h.expires_at AS "expiresAt", h.updated_at AS "updatedAt",
              s.name AS "workflowName"
         FROM user_habits h
         LEFT JOIN user_saved_skills s ON s.id = h.saved_skill_id
        ORDER BY h.updated_at DESC
        LIMIT 200`
    );
    return { habits: rows.map((row) => serializeHabitDates(row)) };
  }

  async getOverview() {
    const [candidateCounts, habitCounts, latestRun] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ status: string; count: bigint }>>(
        `SELECT status, COUNT(*)::bigint AS count
           FROM user_habit_candidates GROUP BY status`
      ),
      this.prisma.$queryRawUnsafe<Array<{ status: string; count: bigint }>>(
        `SELECT status, COUNT(*)::bigint AS count FROM user_habits GROUP BY status`
      ),
      this.listRuns(),
    ]);
    return {
      candidatesEnabled: process.env.HABIT_LEARNING_DAILY_JOB_ENABLED === 'true',
      activationEnabled: this.autoActivation.isEnabled(),
      candidateCounts: Object.fromEntries(
        candidateCounts.map((row) => [row.status, Number(row.count)])
      ),
      habitCounts: Object.fromEntries(habitCounts.map((row) => [row.status, Number(row.count)])),
      latestRun: latestRun.runs[0] || null,
    };
  }

  async getUserState(ownerUserId: string) {
    const [preference, habits] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ recommendationEnabled: boolean; updatedAt: Date }>>(
        `SELECT recommendation_enabled AS "recommendationEnabled", updated_at AS "updatedAt"
           FROM user_personalization_preferences WHERE owner_user_id = $1::uuid`,
        ownerUserId
      ),
      this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, kind, status, intent_key AS "intentKey",
                saved_skill_id AS "savedSkillId", saved_version AS "savedVersion",
                version, expires_at AS "expiresAt", updated_at AS "updatedAt"
           FROM user_habits WHERE owner_user_id = $1::uuid ORDER BY updated_at DESC`,
        ownerUserId
      ),
    ]);
    return {
      personalization: preference[0]
        ? serializeHabitDates(preference[0])
        : { recommendationEnabled: false },
      habits: habits.map((row) => serializeHabitDates(row)),
    };
  }

  async updatePersonalization(ownerUserId: string, recommendationEnabled: boolean) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO user_personalization_preferences
        (owner_user_id, recommendation_enabled, updated_at)
       VALUES ($1::uuid, $2, NOW())
       ON CONFLICT (owner_user_id)
       DO UPDATE SET recommendation_enabled = EXCLUDED.recommendation_enabled, updated_at = NOW()`,
      ownerUserId,
      recommendationEnabled
    );
    return this.getUserState(ownerUserId);
  }

  async updateUserHabitStatus(ownerUserId: string, habitId: string, status: 'active' | 'disabled') {
    const changed = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE user_habits SET status = $1, updated_at = NOW()
        WHERE id = $2::uuid AND owner_user_id = $3::uuid
        RETURNING id`,
      status,
      habitId,
      ownerUserId
    );
    if (!changed[0]) throw new NotFoundException(`Habit ${habitId} not found`);
    return this.getUserState(ownerUserId);
  }

  async clearUserPersonalization(ownerUserId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM user_habits WHERE owner_user_id = $1::uuid`,
        ownerUserId
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM user_habit_candidates WHERE owner_user_id = $1::uuid`,
        ownerUserId
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM user_personalization_preferences WHERE owner_user_id = $1::uuid`,
        ownerUserId
      );
    });
    return { cleared: true };
  }

  private async loadSavedWorkflowEvidence(windowStart: Date, windowEnd: Date) {
    return this.prisma.$queryRawUnsafe<SavedWorkflowEvidenceRow[]>(
      `SELECT s.owner_user_id AS "ownerUserId", s.id AS "skillId", v.version,
              s.name, v.source_execution_id AS "sourceExecutionId",
              v.plan_hash AS "planHash", v.plan_snapshot_json AS "planSnapshotJson",
              v.ai_review_json AS "aiReviewJson"
         FROM user_saved_skills s
         JOIN user_saved_skill_versions v ON v.id = s.active_version_id
        WHERE s.status = 'active'
          AND s.visibility = 'private'
          AND s.updated_at > $1
          AND s.updated_at <= $2`,
      windowStart,
      windowEnd
    );
  }

  private async createWorkflowReuseCandidate(runId: string, row: SavedWorkflowEvidenceRow) {
    const intentKey = normalizeWorkflowAlias(row.name);
    if (!intentKey) return 0;
    const idempotencyKey = createHash('sha256')
      .update(`${HABIT_POLICY_VERSION}:${row.ownerUserId}:${row.skillId}:${row.version}:${intentKey}`)
      .digest('hex');
    const riskLevel = detectHabitRisk(row.planSnapshotJson);
    const reviewDecision = String(row.aiReviewJson?.decision || 'warning');
    const candidateStatus = reviewDecision === 'pass' ? 'shadow' : 'candidate';
    const inserted = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO user_habit_candidates
        (id, idempotency_key, owner_user_id, kind, status, risk_level, intent_key,
         saved_skill_id, saved_version, evidence_json, review_json, shadow_json,
         source_run_id, policy_version)
       VALUES ($1::uuid, $2, $3::uuid, 'workflow_reuse', $4, $5, $6,
               $7::uuid, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::uuid, $13)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      randomUUID(),
      idempotencyKey,
      row.ownerUserId,
      candidateStatus,
      riskLevel,
      intentKey,
      row.skillId,
      row.version,
      JSON.stringify({
        source: 'saved_workflow',
        explicitUserSave: true,
        sourceExecutionId: row.sourceExecutionId,
        planHash: row.planHash,
        technicalSuccessAlone: false,
      }),
      JSON.stringify({
        ...row.aiReviewJson,
        source: 'saved_workflow_version_review',
        reusedExactVersionReview: true,
        planChanged: false,
      }),
      JSON.stringify({
        decision: 'eligible_for_shadow',
        selectedSkillId: row.skillId,
        selectedVersion: row.version,
        executedSideEffects: false,
      }),
      runId,
      HABIT_POLICY_VERSION
    );
    return inserted[0] ? 1 : 0;
  }

  private loadCandidate(candidateId: string) {
    return this.prisma.$queryRawUnsafe<HabitCandidateRow[]>(
      `SELECT id, owner_user_id AS "ownerUserId", kind, status,
              risk_level AS "riskLevel", intent_key AS "intentKey",
              saved_skill_id AS "savedSkillId", saved_version AS "savedVersion",
              evidence_json AS "evidenceJson", review_json AS "reviewJson",
              shadow_json AS "shadowJson", source_run_id AS "sourceRunId",
              policy_version AS "policyVersion", created_at AS "createdAt",
              updated_at AS "updatedAt"
         FROM user_habit_candidates WHERE id = $1::uuid LIMIT 1`,
      candidateId
    );
  }

  private writeAudit(
    actorUserId: string,
    targetId: string,
    action: string,
    reason: string | undefined,
    before: unknown,
    after: unknown
  ) {
    return this.prisma.$executeRawUnsafe(
      `INSERT INTO habit_governance_audits
        (id, actor_user_id, target_type, target_id, action, reason, before_json, after_json)
       VALUES ($1::uuid, $2::uuid, 'candidate', $3::uuid, $4, $5, $6::jsonb, $7::jsonb)`,
      randomUUID(),
      actorUserId,
      targetId,
      action,
      reason?.trim() || null,
      JSON.stringify(habitAuditSnapshot(before)),
      JSON.stringify(habitAuditSnapshot(after))
    );
  }

  private async expireStaleHabits() {
    await this.prisma.$executeRawUnsafe(
      `UPDATE user_habits SET status = 'expired', updated_at = NOW()
        WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()`
    );
  }

  private async getRunByKey(runKey: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM habit_learning_runs WHERE idempotency_key = $1 LIMIT 1`,
      runKey
    );
    return rows[0] ? this.getRun(rows[0].id) : null;
  }

  private async getRun(runId: string) {
    const result = await this.listRuns();
    return result.runs.find((run) => run.id === runId) || null;
  }

  private toAdminCandidate(row: HabitCandidateRow & { userKey: string; workflowName: string | null }) {
    const { ownerUserId: _ownerUserId, ...safe } = row;
    return serializeHabitDates(safe);
  }
}
