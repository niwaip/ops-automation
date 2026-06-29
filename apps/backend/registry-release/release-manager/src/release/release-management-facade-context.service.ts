import { Injectable } from '@nestjs/common';
import {
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CreateCapabilityReleaseDTO,
  SkillDraftDTO,
  UpdateCapabilitySourceDTO,
} from '../interfaces';
import { CapabilityReleasePublishAccessors } from '../publisher/capability-release-publish.service';
import { ReleaseManagementAccessorDepsSource } from './release-accessor-deps.service';
import { ReleaseAccessorSourceService } from './release-accessor-source.service';
import { CapabilityReleaseDraftAccessors } from './release-draft.service';
import { ReleaseManagementFacadeAccessorsService } from './release-management-facade-accessors.service';
import { CapabilityReleaseLifecycleAccessors } from './release-lifecycle.service';
import { CapabilityReleaseQueryAccessors } from './release-query.service';

@Injectable()
export class ReleaseManagementFacadeContextService {
  constructor(
    private readonly releaseManagementFacadeAccessorsService: ReleaseManagementFacadeAccessorsService,
    private readonly releaseAccessorSourceService: ReleaseAccessorSourceService
  ) {}

  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO> {
    return this.releaseAccessorSourceService.getReleaseOrThrow(id);
  }

  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO> {
    return this.releaseAccessorSourceService.getSkillDraftOrThrow(id);
  }

  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null
  ): Promise<void> {
    return this.releaseAccessorSourceService.insertAuditEvent(
      releaseId,
      eventType,
      actorId,
      success,
      summary,
      details
    );
  }

  getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseAccessorSourceService.getCapabilityDetail(id);
  }

  createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseAccessorSourceService.createCapability(dto, userId);
  }

  updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseAccessorSourceService.updateSource(id, dto, userId);
  }

  createPublishAccessors(
    source: ReleaseManagementAccessorDepsSource
  ): CapabilityReleasePublishAccessors {
    return this.releaseManagementFacadeAccessorsService.createPublishAccessors(source);
  }

  createDraftAccessors(source: ReleaseManagementAccessorDepsSource): CapabilityReleaseDraftAccessors {
    return this.releaseManagementFacadeAccessorsService.createDraftAccessors(source);
  }

  createQueryAccessors(source: ReleaseManagementAccessorDepsSource): CapabilityReleaseQueryAccessors {
    return this.releaseManagementFacadeAccessorsService.createQueryAccessors(source);
  }

  createLifecycleAccessors(
    source: ReleaseManagementAccessorDepsSource
  ): CapabilityReleaseLifecycleAccessors {
    return this.releaseManagementFacadeAccessorsService.createLifecycleAccessors(source);
  }
}
