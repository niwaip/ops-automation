import { CapabilityReleaseAssistAccessors } from '../capability-release-assist.service';
import { CapabilityReleaseBuildValidationAccessors } from '../compiler/capability-release-build-validation.service';
import { CapabilityReleaseDeploymentAccessors } from '../publisher/capability-release-deployment.service';
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
import { CapabilityReleasePublishAccessors } from '../publisher/capability-release-publish.service';
import { CapabilityReleaseRuntimeAccessors } from '../publisher/capability-release-runtime.service';
import { ReleaseAccessorDepsSource } from './release-accessor-deps.service';
import { CapabilityReleaseDraftAccessors } from './release-draft.service';
import { ReleaseManagementFacadeContextService } from './release-management-facade-context.service';
import { CapabilityReleaseLifecycleAccessors } from './release-lifecycle.service';
import { CapabilityReleaseQueryAccessors } from './release-query.service';
import { ReleaseRuntimeFacadeContextService } from './release-runtime-facade-context.service';

@Injectable()
export class ReleaseFacadeContextService implements ReleaseAccessorDepsSource {
  constructor(
    private readonly releaseRuntimeFacadeContextService: ReleaseRuntimeFacadeContextService,
    private readonly releaseManagementFacadeContextService: ReleaseManagementFacadeContextService
  ) {}

  ensureInfrastructure(): Promise<void> {
    return this.releaseRuntimeFacadeContextService.ensureInfrastructure();
  }

  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO> {
    return this.releaseRuntimeFacadeContextService.getReleaseOrThrow(id);
  }

  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO> {
    return this.releaseRuntimeFacadeContextService.getCurrentSnapshotOrThrow(release);
  }

  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO> {
    return this.releaseRuntimeFacadeContextService.getBuildOrThrow(id);
  }

  getValidationOrThrow(id: string): Promise<CapabilityValidationDTO> {
    return this.releaseRuntimeFacadeContextService.getValidationOrThrow(id);
  }

  getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO> {
    return this.releaseRuntimeFacadeContextService.getDeploymentOrThrow(id);
  }

  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO> {
    return this.releaseManagementFacadeContextService.getSkillDraftOrThrow(id);
  }

  getLatestSuccessfulValidationOrThrow(releaseId: string): Promise<CapabilityValidationDTO> {
    return this.releaseRuntimeFacadeContextService.getLatestSuccessfulValidationOrThrow(releaseId);
  }

  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string
  ): Promise<CapabilityBuildDTO> {
    return this.releaseRuntimeFacadeContextService.resolveTemporalExecutableBuildOrThrow(
      release,
      snapshot,
      buildId,
      userId
    );
  }

  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string {
    return this.releaseRuntimeFacadeContextService.resolveWorkflowFnOrThrow(payload);
  }

  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null
  ): Promise<void> {
    return this.releaseManagementFacadeContextService.insertAuditEvent(
      releaseId,
      eventType,
      actorId,
      success,
      summary,
      details
    );
  }

  getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseManagementFacadeContextService.getCapabilityDetail(id);
  }

  createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseManagementFacadeContextService.createCapability(dto, userId);
  }

  updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO> {
    return this.releaseManagementFacadeContextService.updateSource(id, dto, userId);
  }

  createRuntimeAccessors(): CapabilityReleaseRuntimeAccessors {
    return this.releaseRuntimeFacadeContextService.createRuntimeAccessors(this);
  }

  createBuildValidationAccessors(): CapabilityReleaseBuildValidationAccessors {
    return this.releaseRuntimeFacadeContextService.createBuildValidationAccessors(this);
  }

  createPublishAccessors(): CapabilityReleasePublishAccessors {
    return this.releaseManagementFacadeContextService.createPublishAccessors(this);
  }

  createDraftAccessors(): CapabilityReleaseDraftAccessors {
    return this.releaseManagementFacadeContextService.createDraftAccessors(this);
  }

  createQueryAccessors(): CapabilityReleaseQueryAccessors {
    return this.releaseManagementFacadeContextService.createQueryAccessors(this);
  }

  createLifecycleAccessors(): CapabilityReleaseLifecycleAccessors {
    return this.releaseManagementFacadeContextService.createLifecycleAccessors(this);
  }

  createDeploymentAccessors(): CapabilityReleaseDeploymentAccessors {
    return this.releaseRuntimeFacadeContextService.createDeploymentAccessors(this);
  }

  createAssistAccessors(): CapabilityReleaseAssistAccessors {
    return this.releaseRuntimeFacadeContextService.createAssistAccessors(this);
  }
}
