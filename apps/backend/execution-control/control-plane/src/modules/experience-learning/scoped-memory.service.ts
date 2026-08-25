import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface MemoryScopeContext {
  organizationId?: string;
  teamIds?: string[];
  userId: string;
}

@Injectable()
export class ScopedMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(context: MemoryScopeContext, kind: string, memoryKey: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, scope_type AS "scopeType", scope_id AS "scopeId", kind,
              memory_key AS "memoryKey", value_json AS "value", source, version,
              expires_at AS "expiresAt", updated_at AS "updatedAt"
         FROM scoped_memories
        WHERE status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
          AND kind = $1 AND memory_key = $2
          AND ((scope_type = 'user' AND scope_id = $3::uuid)
            OR (scope_type = 'team' AND scope_id = ANY($4::uuid[]))
            OR (scope_type = 'organization' AND scope_id = $5::uuid))
        ORDER BY CASE scope_type WHEN 'user' THEN 3 WHEN 'team' THEN 2 ELSE 1 END DESC,
                 updated_at DESC
        LIMIT 1`,
      kind,
      memoryKey,
      context.userId,
      context.teamIds || [],
      context.organizationId || null
    );
    return rows[0] || null;
  }

  /**
   * Resolve organization/team scope from the control-plane's governed identity
   * tables.  The caller may provide only the active organization selected by a
   * signed identity; team membership is never accepted from request headers.
   */
  async resolveTrustedScope(input: {
    userId: string;
    activeOrganizationId?: string;
  }): Promise<MemoryScopeContext> {
    if (!input.activeOrganizationId) return { userId: input.userId };

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ organizationId: string; teamIds: string[] | null }>
    >(
      `SELECT membership.org_id AS "organizationId",
              COALESCE(
                array_agg(DISTINCT team_membership.team_id)
                  FILTER (WHERE team.is_active = true),
                ARRAY[]::uuid[]
              ) AS "teamIds"
         FROM org_memberships membership
         JOIN organizations organization
           ON organization.id = membership.org_id AND organization.is_active = true
         LEFT JOIN team_memberships team_membership
           ON team_membership.org_membership_id = membership.id
         LEFT JOIN teams team
           ON team.id = team_membership.team_id
        WHERE membership.user_id = $1::uuid
          AND membership.org_id = $2::uuid
          AND membership.status = 'active'
        GROUP BY membership.org_id`,
      input.userId,
      input.activeOrganizationId
    );
    const scope = rows[0];
    if (!scope) return { userId: input.userId };
    return {
      userId: input.userId,
      organizationId: scope.organizationId,
      teamIds: scope.teamIds || [],
    };
  }

  async upsert(input: {
    scopeType: 'organization' | 'team' | 'user';
    scopeId: string;
    organizationId?: string;
    kind: string;
    memoryKey: string;
    value: unknown;
    source: 'explicit' | 'approved_recipe' | 'policy';
    expiresAt?: Date;
  }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `INSERT INTO scoped_memories
        (id, scope_type, scope_id, organization_id, kind, memory_key, value_json,
         source, expires_at)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7::jsonb, $8, $9)
       ON CONFLICT (scope_type, scope_id, kind, memory_key)
       DO UPDATE SET value_json = EXCLUDED.value_json, source = EXCLUDED.source,
                     organization_id = EXCLUDED.organization_id,
                     expires_at = EXCLUDED.expires_at, status = 'active',
                     version = scoped_memories.version + 1, updated_at = NOW()
       RETURNING id, scope_type AS "scopeType", scope_id AS "scopeId", version`,
      randomUUID(),
      input.scopeType,
      input.scopeId,
      input.organizationId || null,
      input.kind,
      input.memoryKey,
      JSON.stringify(input.value),
      input.source,
      input.expiresAt || null
    );
    return rows[0];
  }
}
