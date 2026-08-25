import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface RecipePromotionState {
  status: string;
  riskLevel: string;
  shadowRuns: number;
  shadowPasses: number;
  approvedBy?: string | null;
}

@Injectable()
export class CandidateRecipeService {
  constructor(private readonly prisma: PrismaService) {}

  async createCandidate(input: {
    scopeType: 'organization' | 'team' | 'user';
    scopeId: string;
    intentFingerprint: string;
    topologyDigest: string;
    recipe: Record<string, unknown>;
    riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize version allocation for one governed intent.  A recipe can
      // never replace an existing version, and it always starts non-executable.
      const lockKey = `${input.scopeType}:${input.scopeId}:${input.intentFingerprint}`;
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, lockKey);
      const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO candidate_recipes
          (id, scope_type, scope_id, intent_fingerprint, topology_digest, recipe_json, risk_level,
           status, version)
         SELECT $1::uuid, $2, $3::uuid, $4, $5, $6::jsonb, $7, 'candidate',
                COALESCE(MAX(version), 0) + 1
           FROM candidate_recipes
          WHERE scope_type = $2 AND scope_id = $3::uuid AND intent_fingerprint = $4
         RETURNING id, scope_type AS "scopeType", scope_id AS "scopeId", intent_fingerprint AS "intentFingerprint",
                   topology_digest AS "topologyDigest", risk_level AS "riskLevel", status, version`,
        randomUUID(),
        input.scopeType,
        input.scopeId,
        input.intentFingerprint,
        input.topologyDigest,
        JSON.stringify(input.recipe),
        input.riskLevel
      );
      return rows[0];
    });
  }

  canPromote(state: RecipePromotionState, target: 'approved' | 'canary' | 'active') {
    const passRate = state.shadowRuns > 0 ? state.shadowPasses / state.shadowRuns : 0;
    if (target === 'approved') {
      return {
        allowed: state.status === 'shadow' && state.shadowRuns >= 20 && passRate >= 0.95,
        passRate,
      };
    }
    if (target === 'canary') {
      return { allowed: state.status === 'approved' && Boolean(state.approvedBy), passRate };
    }
    return {
      allowed:
        state.status === 'canary' &&
        Boolean(state.approvedBy) &&
        state.shadowRuns >= 50 &&
        passRate >= 0.98,
      passRate,
    };
  }

  async recordShadowEvaluation(
    candidateRecipeId: string,
    fixtureId: string,
    passed: boolean,
    comparison: Record<string, unknown>
  ) {
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRawUnsafe<Array<{ passed: boolean }>>(
        `INSERT INTO candidate_recipe_evaluations
          (id, candidate_recipe_id, fixture_id, passed, comparison_json)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)
         ON CONFLICT (candidate_recipe_id, fixture_id) DO NOTHING
         RETURNING passed`,
        randomUUID(),
        candidateRecipeId,
        fixtureId,
        passed,
        JSON.stringify(comparison)
      );
      if (inserted.length > 0) {
        await tx.$executeRawUnsafe(
          `UPDATE candidate_recipes
              SET status = CASE WHEN status = 'candidate' THEN 'shadow' ELSE status END,
                  shadow_runs = shadow_runs + 1,
                  shadow_passes = shadow_passes + CASE WHEN $1 THEN 1 ELSE 0 END,
                  updated_at = NOW()
            WHERE id = $2::uuid`,
          passed,
          candidateRecipeId
        );
      }
      return { recorded: inserted.length > 0 };
    });
  }

  async promote(
    candidateRecipeId: string,
    target: 'approved' | 'canary' | 'active',
    actorId: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<RecipePromotionState[]>(
        `SELECT status, risk_level AS "riskLevel", shadow_runs AS "shadowRuns",
                shadow_passes AS "shadowPasses", approved_by AS "approvedBy"
           FROM candidate_recipes WHERE id = $1::uuid FOR UPDATE`,
        candidateRecipeId
      );
      const state = rows[0];
      if (!state) throw new BadRequestException('Candidate recipe not found');
      const decision = this.canPromote(
        target === 'approved' ? { ...state, approvedBy: actorId } : state,
        target
      );
      if (!decision.allowed) {
        throw new BadRequestException(
          `Candidate recipe cannot promote from ${state.status} to ${target}; shadowRuns=${state.shadowRuns}, passRate=${decision.passRate.toFixed(3)}`
        );
      }
      await tx.$executeRawUnsafe(
        `UPDATE candidate_recipes
            SET status = $1, approved_by = COALESCE(approved_by, $2::uuid), updated_at = NOW()
          WHERE id = $3::uuid`,
        target,
        actorId,
        candidateRecipeId
      );
      return { id: candidateRecipeId, status: target, passRate: decision.passRate };
    });
  }
}
