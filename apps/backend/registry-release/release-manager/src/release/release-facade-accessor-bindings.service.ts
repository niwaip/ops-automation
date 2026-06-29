import { Injectable } from '@nestjs/common';
import { CapabilityReleaseDTO } from '../interfaces';
import {
  ReleaseDraftAccessorDeps,
  ReleaseLifecycleAccessorDeps,
  ReleasePublishAccessorDeps,
  ReleaseQueryAccessorDeps,
} from './release-accessor-factory.service';
import type { ReleaseManagementAccessorDepsSource } from './release-accessor-deps.service';

@Injectable()
export class ReleaseFacadeAccessorBindingsService {
  createPublishAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleasePublishAccessorDeps {
    return {
      getReleaseOrThrow: (id: string) => source.getReleaseOrThrow(id),
      getCurrentSnapshotOrThrow: (release: CapabilityReleaseDTO) =>
        source.getCurrentSnapshotOrThrow(release),
      getSkillDraftOrThrow: (id: string) => source.getSkillDraftOrThrow(id),
      getCapabilityDetail: (id: string) => source.getCapabilityDetail(id),
      createCapability: (dto, userId) => source.createCapability(dto, userId),
      updateSource: (id, dto, userId) => source.updateSource(id, dto, userId),
      insertAuditEvent: (
        releaseId: string,
        eventType: string,
        actorId: string | undefined,
        success: boolean,
        summary: string,
        details?: Record<string, unknown> | null
      ) => source.insertAuditEvent(releaseId, eventType, actorId, success, summary, details),
    };
  }

  createDraftAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleaseDraftAccessorDeps {
    return {
      getReleaseOrThrow: (id: string) => source.getReleaseOrThrow(id),
      insertAuditEvent: (
        releaseId: string,
        eventType: string,
        actorId: string | undefined,
        success: boolean,
        summary: string,
        details?: Record<string, unknown> | null
      ) => source.insertAuditEvent(releaseId, eventType, actorId, success, summary, details),
    };
  }

  createQueryAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleaseQueryAccessorDeps {
    return {
      getReleaseOrThrow: (id: string) => source.getReleaseOrThrow(id),
      getSkillDraftOrThrow: (id: string) => source.getSkillDraftOrThrow(id),
    };
  }

  createLifecycleAccessorDeps(
    source: ReleaseManagementAccessorDepsSource
  ): ReleaseLifecycleAccessorDeps {
    return {
      getReleaseOrThrow: (id: string) => source.getReleaseOrThrow(id),
      insertAuditEvent: (
        releaseId: string,
        eventType: string,
        actorId: string | undefined,
        success: boolean,
        summary: string,
        details?: Record<string, unknown> | null
      ) => source.insertAuditEvent(releaseId, eventType, actorId, success, summary, details),
    };
  }
}
