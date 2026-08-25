import { Injectable } from '@nestjs/common';
import { assertPlanningDecisionV1 } from '@ops/backend-planning-decision';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RecordPlanningDecisionDto } from './experience-learning.dto';

@Injectable()
export class PlanningDecisionService {
  constructor(private readonly prisma: PrismaService) {}

  async record(ownerUserId: string, input: RecordPlanningDecisionDto) {
    assertPlanningDecisionV1(input.decision);
    const decision = input.decision;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; createdAt: Date }>>(
      `INSERT INTO planning_decisions
        (id, owner_user_id, execution_id, request_fingerprint, schema_version,
         route_class, route_source, decision_json, shadow, routing_policy_version,
         routing_policy_digest, catalog_snapshot_digest)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
       RETURNING id, created_at AS "createdAt"`,
      randomUUID(),
      ownerUserId,
      input.executionId || null,
      input.requestFingerprint,
      decision.schemaVersion,
      decision.routeClass,
      decision.routeSource,
      JSON.stringify(decision),
      input.shadow,
      decision.routingPolicyVersion,
      decision.routingPolicyDigest,
      decision.catalogSnapshotDigest
    );
    return {
      id: rows[0].id,
      createdAt: rows[0].createdAt.toISOString(),
      shadow: input.shadow,
    };
  }
}
