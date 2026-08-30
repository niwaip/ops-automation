import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeterministicTopologyDraftV1 } from '../topology/deterministic-topology.types';
import { calculateCapabilityIntentScore } from '../candidate-selection/capability-intent-match.util';

export interface UserHabitRecord {
  id: string;
  ownerUserId: string;
  kind: string;
  status: string;
  intentKey: string;
  savedSkillId: string | null;
  savedVersion: number | null;
  valueJson: any;
}

export interface HabitRouteDecision {
  type: 'exact_topology' | 'exemplar' | 'none';
  confidence: number;
  habit?: UserHabitRecord;
  topology?: DeterministicTopologyDraftV1;
  exemplarPrompt?: string;
}

@Injectable()
export class UserHabitRouterService {
  private readonly logger = new Logger(UserHabitRouterService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  public async evaluateHabit(
    userId: string | undefined,
    userRequest: string
  ): Promise<HabitRouteDecision> {
    if (!userId || !userRequest || !this.prisma) {
      return { type: 'none', confidence: 0 };
    }

    try {
      const habits = await this.prisma.$queryRawUnsafe<UserHabitRecord[]>(
        `SELECT id, owner_user_id AS "ownerUserId", kind, status,
                intent_key AS "intentKey", saved_skill_id AS "savedSkillId",
                saved_version AS "savedVersion", value_json AS "valueJson"
           FROM user_habits
          WHERE owner_user_id = $1::uuid
            AND status = 'active'
          ORDER BY updated_at DESC
          LIMIT 20`,
        userId
      );

      if (!habits || habits.length === 0) {
        return { type: 'none', confidence: 0 };
      }

      let bestHabit: UserHabitRecord | null = null;
      let bestScore = 0;

      for (const habit of habits) {
        const score = calculateCapabilityIntentScore(userRequest, [
          habit.intentKey,
          habit.valueJson?.name,
          habit.valueJson?.description,
        ]);
        if (score > bestScore) {
          bestScore = score;
          bestHabit = habit;
        }
      }

      if (!bestHabit || bestScore <= 0) {
        return { type: 'none', confidence: 0 };
      }

      const normalizedConfidence = Math.min(1.0, Math.max(0.1, bestScore / 100));

      // Exact match threshold: score >= 80 (exact sub/full match of intent_key)
      if (bestScore >= 80 && bestHabit.savedSkillId) {
        const versions = await this.prisma.$queryRawUnsafe<Array<{ planSnapshotJson: any }>>(
          `SELECT plan_snapshot_json AS "planSnapshotJson"
             FROM user_saved_skill_versions
            WHERE skill_id = $1::uuid
              AND version = $2
            LIMIT 1`,
          bestHabit.savedSkillId,
          bestHabit.savedVersion || 1
        );

        const snapshot = versions[0]?.planSnapshotJson;
        if (snapshot && Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0) {
          const topology: DeterministicTopologyDraftV1 = {
            schemaVersion: 'deterministic-topology/v1',
            objective: snapshot.objective || userRequest,
            matchDecision: 'matched',
            matchConfidence: 0.99,
            matchReason: `Matched learned user habit '${bestHabit.intentKey}' (0-Token Fast-Gate)`,
            nodes: snapshot.nodes.map((node: any, idx: number) => ({
              ref: `n${idx + 1}`,
              capabilityKey: node.skillId || node.operationId || `s${idx}`,
              dependsOn: node.dependsOn || (idx > 0 ? [`n${idx}`] : []),
            })),
            finalNodeRef: `n${snapshot.nodes.length}`,
            finalOutputKind: snapshot.finalOutputs?.[0]?.isArtifact ? 'artifact' : 'value',
            requiresExternalData: snapshot.nodes.some((n: any) => n.kind === 'skill'),
          };

          this.logger.log(
            `Habit Fast-Gate exact match for user ${userId}: "${bestHabit.intentKey}" -> 0-Token topology reuse`
          );

          return {
            type: 'exact_topology',
            confidence: 0.99,
            habit: bestHabit,
            topology,
          };
        }
      }

      // Partial match: provide an exemplar for LLM Few-Shot injection (confidence 0.35 ~ 0.8)
      if (bestScore >= 30) {
        const exemplarPrompt = `用户对类似意图 "${bestHabit.intentKey}" 曾习惯使用工作流模式`;
        return {
          type: 'exemplar',
          confidence: normalizedConfidence,
          habit: bestHabit,
          exemplarPrompt,
        };
      }

      return { type: 'none', confidence: 0 };
    } catch (err) {
      this.logger.warn(`Failed to evaluate user habit for user ${userId}: ${(err as Error).message}`);
      return { type: 'none', confidence: 0 };
    }
  }
}
