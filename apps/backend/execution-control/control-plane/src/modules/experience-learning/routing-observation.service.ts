import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RecordRoutingObservationDto } from './experience-learning.dto';

@Injectable()
export class RoutingObservationService {
  constructor(private readonly prisma: PrismaService) {}

  async record(ownerUserId: string, input: RecordRoutingObservationDto) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; createdAt: Date }>>(
      `INSERT INTO routing_observations
        (id, owner_user_id, request_fingerprint, route_source, match_method,
         selected_source_id, selected_version, candidate_count, match_score,
         planner_invoked, planner_input_tokens, contract_status, business_status, error_code,
         routing_policy_version, routing_policy_digest)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id, created_at AS "createdAt"`,
      randomUUID(),
      ownerUserId,
      input.requestFingerprint,
      input.routeSource,
      input.matchMethod || null,
      input.selectedSourceId || null,
      input.selectedVersion || null,
      input.candidateCount,
      input.matchScore ?? null,
      input.plannerInvoked,
      input.plannerInputTokens ?? null,
      input.contractStatus || null,
      input.businessStatus || null,
      input.errorCode || null,
      input.routingPolicyVersion || null,
      input.routingPolicyDigest || null
    );
    return {
      id: rows[0].id,
      createdAt: rows[0].createdAt.toISOString(),
    };
  }

  async getDiagnostics() {
    const [summary, sources, recent] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{
        total: bigint;
        savedWorkflowReuse: bigint;
        plannerInvocations: bigint;
        noMatch: bigint;
        plannerInputTokens: bigint;
      }>>(
        `SELECT COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE route_source = 'saved_workflow')::bigint AS "savedWorkflowReuse",
                COUNT(*) FILTER (WHERE planner_invoked)::bigint AS "plannerInvocations",
                COUNT(*) FILTER (WHERE route_source = 'no_match')::bigint AS "noMatch",
                COALESCE(SUM(planner_input_tokens), 0)::bigint AS "plannerInputTokens"
           FROM routing_observations
          WHERE created_at >= NOW() - INTERVAL '30 days'`
      ),
      this.prisma.$queryRawUnsafe<Array<{ routeSource: string; count: bigint }>>(
        `SELECT route_source AS "routeSource", COUNT(*)::bigint AS count
           FROM routing_observations
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY route_source
          ORDER BY count DESC`
      ),
      this.prisma.$queryRawUnsafe<Array<{
        id: string;
        userKey: string;
        routeSource: string;
        matchMethod: string | null;
        candidateCount: number;
        matchScore: number | null;
        plannerInvoked: boolean;
        routingPolicyVersion: string | null;
        routingPolicyDigest: string | null;
        createdAt: Date;
      }>>(
        `SELECT id,
                SUBSTRING(MD5(owner_user_id::text), 1, 12) AS "userKey",
                route_source AS "routeSource",
                match_method AS "matchMethod",
                candidate_count AS "candidateCount",
                match_score AS "matchScore",
                planner_invoked AS "plannerInvoked",
                routing_policy_version AS "routingPolicyVersion",
                routing_policy_digest AS "routingPolicyDigest",
                created_at AS "createdAt"
           FROM routing_observations
          ORDER BY created_at DESC
          LIMIT 50`
      ),
    ]);
    const item = summary[0];
    return {
      windowDays: 30,
      total: Number(item?.total || 0),
      savedWorkflowReuse: Number(item?.savedWorkflowReuse || 0),
      plannerInvocations: Number(item?.plannerInvocations || 0),
      noMatch: Number(item?.noMatch || 0),
      plannerInputTokens: Number(item?.plannerInputTokens || 0),
      sources: sources.map((source) => ({
        routeSource: source.routeSource,
        count: Number(source.count),
      })),
      recent: recent.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
