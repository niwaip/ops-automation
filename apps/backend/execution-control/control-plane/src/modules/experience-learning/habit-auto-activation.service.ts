import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { HabitCandidateRow } from './habit-learning.types';

interface SavedWorkflowReviewRow {
  aiReviewJson: Record<string, unknown>;
}

export interface HabitAutoActivationResult {
  activated: boolean;
  reason: 'activated' | 'disabled' | 'not_eligible' | 'review_not_passed' | 'version_inactive';
}

export interface HabitAutoActivationBatchResult {
  considered: number;
  activated: number;
  failed: number;
}

/**
 * Activates only user-private, frozen workflow reuse candidates that already
 * passed the AI review attached to the exact saved-workflow version.
 *
 * This service never asks an administrator to approve an individual user's
 * routing habit and never calls the model again during the daily batch.
 */
@Injectable()
export class HabitAutoActivationService {
  private readonly logger = new Logger(HabitAutoActivationService.name);

  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return process.env.HABIT_LEARNING_ACTIVATION_ENABLED !== 'false';
  }

  async activatePendingAiApproved(limit = 200): Promise<HabitAutoActivationBatchResult> {
    if (!this.isEnabled()) return { considered: 0, activated: 0, failed: 0 };
    const candidates = await this.prisma.$queryRawUnsafe<HabitCandidateRow[]>(
      `SELECT id, owner_user_id AS "ownerUserId", kind, status,
              risk_level AS "riskLevel", intent_key AS "intentKey",
              saved_skill_id AS "savedSkillId", saved_version AS "savedVersion",
              evidence_json AS "evidenceJson", review_json AS "reviewJson",
              shadow_json AS "shadowJson", source_run_id AS "sourceRunId",
              policy_version AS "policyVersion", created_at AS "createdAt",
              updated_at AS "updatedAt"
         FROM user_habit_candidates
        WHERE status IN ('candidate', 'shadow')
          AND kind = 'workflow_reuse'
          AND review_json->>'decision' = 'pass'
        ORDER BY created_at ASC
        LIMIT $1`,
      Math.max(1, Math.min(limit, 500))
    );
    let activated = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const result = await this.activateIfAiApproved(candidate);
        if (result.activated) activated += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `AI-approved user routing habit activation failed: ${candidate.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    return { considered: candidates.length, activated, failed };
  }

  async activateIfAiApproved(
    candidate: HabitCandidateRow
  ): Promise<HabitAutoActivationResult> {
    if (!this.isEnabled()) return { activated: false, reason: 'disabled' };
    if (!this.isEligibleWorkflowCandidate(candidate)) {
      return { activated: false, reason: 'not_eligible' };
    }
    if (candidate.reviewJson?.decision !== 'pass') {
      return { activated: false, reason: 'review_not_passed' };
    }

    const exactVersion = await this.loadActiveExactVersion(candidate);
    if (!exactVersion || exactVersion.aiReviewJson?.decision !== 'pass') {
      await this.markVersionInactive(candidate.id);
      return { activated: false, reason: 'version_inactive' };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO user_habits
          (id, owner_user_id, kind, status, intent_key, saved_skill_id, saved_version,
           value_json, source_candidate_id, version, contract_digest, expires_at)
         VALUES ($1::uuid, $2::uuid, $3, 'active', $4, $5::uuid, $6, $7::jsonb,
                 $8::uuid, 1, $9, NOW() + INTERVAL '180 days')
         ON CONFLICT (owner_user_id, kind, intent_key)
         DO UPDATE SET status = 'active', saved_skill_id = EXCLUDED.saved_skill_id,
                       saved_version = EXCLUDED.saved_version,
                       value_json = EXCLUDED.value_json,
                       source_candidate_id = EXCLUDED.source_candidate_id,
                       version = user_habits.version + 1,
                       contract_digest = EXCLUDED.contract_digest,
                       expires_at = EXCLUDED.expires_at,
                       updated_at = NOW()`,
        randomUUID(),
        candidate.ownerUserId,
        candidate.kind,
        candidate.intentKey,
        candidate.savedSkillId,
        candidate.savedVersion,
        JSON.stringify({
          savedSkillId: candidate.savedSkillId,
          savedVersion: candidate.savedVersion,
        }),
        candidate.id,
        String(candidate.evidenceJson?.planHash || '') || null
      );
      await tx.$executeRawUnsafe(
        `UPDATE user_habit_candidates
            SET status = 'active',
                shadow_json = COALESCE(shadow_json, '{}'::jsonb) || $1::jsonb,
                updated_at = NOW()
          WHERE id = $2::uuid`,
        JSON.stringify({
          activationDecision: 'ai_review_pass',
          reviewSource: 'saved_workflow_version_review',
          administratorApprovalRequired: false,
          activatedAt: new Date().toISOString(),
        }),
        candidate.id
      );
    });
    this.logger.log(`AI-approved user routing habit activated: ${candidate.id}`);
    return { activated: true, reason: 'activated' };
  }

  private isEligibleWorkflowCandidate(candidate: HabitCandidateRow): boolean {
    return Boolean(
      candidate.kind === 'workflow_reuse' &&
        candidate.savedSkillId &&
        candidate.savedVersion &&
        candidate.evidenceJson?.explicitUserSave === true &&
        candidate.reviewJson?.reusedExactVersionReview === true &&
        candidate.reviewJson?.planChanged === false
    );
  }

  private async loadActiveExactVersion(candidate: HabitCandidateRow) {
    const rows = await this.prisma.$queryRawUnsafe<SavedWorkflowReviewRow[]>(
      `SELECT v.ai_review_json AS "aiReviewJson"
         FROM user_saved_skills s
         JOIN user_saved_skill_versions v ON v.id = s.active_version_id
        WHERE s.id = $1::uuid
          AND s.owner_user_id = $2::uuid
          AND s.status = 'active'
          AND s.visibility = 'private'
          AND v.version = $3
        LIMIT 1`,
      candidate.savedSkillId,
      candidate.ownerUserId,
      candidate.savedVersion
    );
    return rows[0];
  }

  private markVersionInactive(candidateId: string) {
    return this.prisma.$executeRawUnsafe(
      `UPDATE user_habit_candidates
          SET status = 'held',
              shadow_json = COALESCE(shadow_json, '{}'::jsonb) ||
                '{"activationDecision":"exact_version_inactive"}'::jsonb,
              updated_at = NOW()
        WHERE id = $1::uuid`,
      candidateId
    );
  }
}
