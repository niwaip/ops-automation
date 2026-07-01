import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ReleaseManagerPrismaPort } from '../platform-runtime.ports';
import { mapCapabilityAuditEvent } from '../capability-release.mapper';
import { ReleaseAuditEventDTO } from '../interfaces';
import { RELEASE_MANAGER_PRISMA } from '../platform-runtime.tokens';

@Injectable()
export class CapabilityReleaseAuditService {
  constructor(@Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort) {}

  async getAuditEvents(releaseId: string): Promise<ReleaseAuditEventDTO[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM release_audit_events
       WHERE release_id = $1::uuid
       ORDER BY created_at DESC`,
      releaseId
    );
    return rows.map((row) => mapCapabilityAuditEvent(row));
  }

  async insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO release_audit_events (
        id, release_id, event_type, actor_id, success, summary, details_json, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7::jsonb, now()
      )`,
      randomUUID(),
      releaseId,
      eventType,
      actorId || null,
      success,
      summary,
      JSON.stringify(details || null)
    );
  }
}
