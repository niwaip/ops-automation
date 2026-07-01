import { Injectable } from '@nestjs/common';
import {
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CreateCapabilityReleaseDTO,
  SkillDraftDTO,
  UpdateCapabilitySourceDTO,
} from '../interfaces';
import {
  ReleaseDraftQueryBridgeService,
  ReleaseDraftQueryBridgeSource,
} from './release-draft-query-bridge.service';
import { ReleaseAuditAccessorDepsService } from './release-audit-accessor-deps.service';
import { ReleaseSupportAccessorDepsService } from './release-support-accessor-deps.service';

@Injectable()
export class ReleaseDraftQuerySourceService implements ReleaseDraftQueryBridgeSource {
  constructor(
    private readonly releaseAuditAccessorDepsService: ReleaseAuditAccessorDepsService,
    private readonly releaseDraftQueryBridgeService: ReleaseDraftQueryBridgeService,
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
    return this.releaseDraftQueryBridgeService.getCapabilityDetail(id, this);
  }

  createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseDraftQueryBridgeService.createCapability(dto, userId, this);
  }

  updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseDraftQueryBridgeService.updateSource(id, dto, userId, this);
  }
}
