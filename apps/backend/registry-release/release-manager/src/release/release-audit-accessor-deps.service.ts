import { Injectable } from '@nestjs/common';
import { CapabilityReleaseAuditService } from '../audit/capability-release-audit.service';

@Injectable()
export class ReleaseAuditAccessorDepsService {
  constructor(
    private readonly capabilityReleaseAuditService: CapabilityReleaseAuditService
  ) {}

  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null
  ): Promise<void> {
    return this.capabilityReleaseAuditService.insertAuditEvent(
      releaseId,
      eventType,
      actorId,
      success,
      summary,
      details || undefined
    );
  }
}
