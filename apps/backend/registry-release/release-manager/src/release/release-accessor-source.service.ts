import { Injectable } from '@nestjs/common';
import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityValidationDTO,
  CreateCapabilityReleaseDTO,
  DeploymentRecordDTO,
  SkillDraftDTO,
  UpdateCapabilitySourceDTO,
} from '../interfaces';
import type { ReleaseAccessorDepsSource } from './release-accessor-deps.service';
import { ReleaseManagementAccessorSourceService } from './release-management-accessor-source.service';
import { ReleaseRuntimeAccessorSourceService } from './release-runtime-accessor-source.service';

@Injectable()
export class ReleaseAccessorSourceService implements ReleaseAccessorDepsSource {
  constructor(
    private readonly releaseRuntimeAccessorSourceService: ReleaseRuntimeAccessorSourceService,
    private readonly releaseManagementAccessorSourceService: ReleaseManagementAccessorSourceService
  ) {}

  ensureInfrastructure(): Promise<void> {
    return this.releaseRuntimeAccessorSourceService.ensureInfrastructure();
  }

  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO> {
    return this.releaseRuntimeAccessorSourceService.getReleaseOrThrow(id);
  }

  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO> {
    return this.releaseRuntimeAccessorSourceService.getCurrentSnapshotOrThrow(release);
  }

  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO> {
    return this.releaseRuntimeAccessorSourceService.getBuildOrThrow(id);
  }

  getValidationOrThrow(id: string): Promise<CapabilityValidationDTO> {
    return this.releaseRuntimeAccessorSourceService.getValidationOrThrow(id);
  }

  getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO> {
    return this.releaseRuntimeAccessorSourceService.getDeploymentOrThrow(id);
  }

  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO> {
    return this.releaseManagementAccessorSourceService.getSkillDraftOrThrow(id);
  }

  getLatestSuccessfulValidationOrThrow(releaseId: string): Promise<CapabilityValidationDTO> {
    return this.releaseRuntimeAccessorSourceService.getLatestSuccessfulValidationOrThrow(releaseId);
  }

  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string
  ): Promise<CapabilityBuildDTO> {
    return this.releaseRuntimeAccessorSourceService.resolveTemporalExecutableBuildOrThrow(
      release,
      snapshot,
      buildId,
      userId
    );
  }

  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string {
    return this.releaseRuntimeAccessorSourceService.resolveWorkflowFnOrThrow(payload);
  }

  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null
  ): Promise<void> {
    return this.releaseManagementAccessorSourceService.insertAuditEvent(
      releaseId,
      eventType,
      actorId,
      success,
      summary,
      details
    );
  }

  getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseManagementAccessorSourceService.getCapabilityDetail(id);
  }

  createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseManagementAccessorSourceService.createCapability(dto, userId);
  }

  updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseManagementAccessorSourceService.updateSource(id, dto, userId);
  }
}
