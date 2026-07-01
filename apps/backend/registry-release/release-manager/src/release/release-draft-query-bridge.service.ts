import { Injectable } from '@nestjs/common';
import {
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CreateCapabilityReleaseDTO,
  SkillDraftDTO,
  UpdateCapabilitySourceDTO,
} from '../interfaces';
import { ReleaseDraftService } from './release-draft.service';
import { ReleaseQueryService } from './release-query.service';

export type ReleaseDraftQueryBridgeSource = {
  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO>;
  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO>;
  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null
  ): Promise<void>;
};

@Injectable()
export class ReleaseDraftQueryBridgeService {
  constructor(
    private readonly releaseDraftService: ReleaseDraftService,
    private readonly releaseQueryService: ReleaseQueryService
  ) {}

  getCapabilityDetail(
    id: string,
    source: ReleaseDraftQueryBridgeSource
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseQueryService.getCapabilityDetail(id, {
      getReleaseOrThrow: (releaseId: string) => source.getReleaseOrThrow(releaseId),
      getSkillDraftOrThrow: (draftId: string) => source.getSkillDraftOrThrow(draftId),
    });
  }

  createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId: string | undefined,
    source: ReleaseDraftQueryBridgeSource
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseDraftService.createCapability(dto, userId, {
      getReleaseOrThrow: (releaseId: string) => source.getReleaseOrThrow(releaseId),
      insertAuditEvent: (
        releaseId: string,
        eventType: string,
        actorId: string | undefined,
        success: boolean,
        summary: string,
        details?: Record<string, unknown> | null
      ) => source.insertAuditEvent(releaseId, eventType, actorId, success, summary, details),
    });
  }

  updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId: string | undefined,
    source: ReleaseDraftQueryBridgeSource
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseDraftService.updateSource(id, dto, userId, {
      getReleaseOrThrow: (releaseId: string) => source.getReleaseOrThrow(releaseId),
      insertAuditEvent: (
        releaseId: string,
        eventType: string,
        actorId: string | undefined,
        success: boolean,
        summary: string,
        details?: Record<string, unknown> | null
      ) => source.insertAuditEvent(releaseId, eventType, actorId, success, summary, details),
    });
  }
}
