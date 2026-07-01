import { Injectable } from '@nestjs/common';
import {
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CreateCapabilityReleaseDTO,
  SkillDraftDTO,
  UpdateCapabilitySourceDTO,
} from '../interfaces';
import { ReleaseAuditAccessorDepsService } from './release-audit-accessor-deps.service';
import { ReleaseDraftQuerySourceService } from './release-draft-query-source.service';
import { ReleaseSupportAccessorDepsService } from './release-support-accessor-deps.service';

@Injectable()
export class ReleaseManagementAccessorSourceService {
  constructor(
    private readonly releaseAuditAccessorDepsService: ReleaseAuditAccessorDepsService,
    private readonly releaseDraftQuerySourceService: ReleaseDraftQuerySourceService,
    private readonly releaseSupportAccessorDepsService: ReleaseSupportAccessorDepsService
  ) {}

  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO> {
    return this.releaseSupportAccessorDepsService.getReleaseOrThrow(id);
  }

  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO> {
    return this.releaseSupportAccessorDepsService.getSkillDraftOrThrow(id);
  }

  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null
  ): Promise<void> {
    return this.releaseAuditAccessorDepsService.insertAuditEvent(
      releaseId,
      eventType,
      actorId,
      success,
      summary,
      details
    );
  }

  getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseDraftQuerySourceService.getCapabilityDetail(id);
  }

  createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseDraftQuerySourceService.createCapability(dto, userId);
  }

  updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseDraftQuerySourceService.updateSource(id, dto, userId);
  }
}
