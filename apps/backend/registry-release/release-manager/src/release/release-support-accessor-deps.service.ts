import { Injectable } from '@nestjs/common';
import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityValidationDTO,
  DeploymentRecordDTO,
  SkillDraftDTO,
} from '../interfaces';
import {
  ReleaseAssistAccessorDeps,
  ReleaseBuildValidationAccessorDeps,
  ReleaseDeploymentAccessorDeps,
  ReleaseDraftAccessorDeps,
  ReleaseLifecycleAccessorDeps,
  ReleasePublishAccessorDeps,
  ReleaseQueryAccessorDeps,
  ReleaseRuntimeAccessorDeps,
} from './release-accessor-factory.service';
import { ReleaseAccessorBindingsService } from './release-accessor-bindings.service';
import type {
  ReleaseManagementAccessorDepsSource,
  ReleaseRuntimeAccessorDepsSource,
} from './release-accessor-deps.service';
import { ReleaseSupportService } from './release-support.service';

@Injectable()
export class ReleaseSupportAccessorDepsService {
  constructor(
    private readonly releaseAccessorBindingsService: ReleaseAccessorBindingsService,
    private readonly releaseSupportService: ReleaseSupportService
  ) {}

  ensureInfrastructure(): Promise<void> {
    return this.releaseSupportService.ensureInfrastructure();
  }

  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO> {
    return this.releaseSupportService.getReleaseOrThrow(id);
  }

  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO> {
    return this.releaseSupportService.getCurrentSnapshotOrThrow(release);
  }

  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO> {
    return this.releaseSupportService.getBuildOrThrow(id);
  }

  getValidationOrThrow(id: string): Promise<CapabilityValidationDTO> {
    return this.releaseSupportService.getValidationOrThrow(id);
  }

  getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO> {
    return this.releaseSupportService.getDeploymentOrThrow(id);
  }

  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO> {
    return this.releaseSupportService.getSkillDraftOrThrow(id);
  }

  getLatestSuccessfulValidationOrThrow(releaseId: string): Promise<CapabilityValidationDTO> {
    return this.releaseSupportService.getLatestSuccessfulValidationOrThrow(releaseId);
  }

  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string
  ): Promise<CapabilityBuildDTO> {
    return this.releaseSupportService.resolveTemporalExecutableBuildOrThrow(
      release,
      snapshot,
      buildId,
      userId
    );
  }

  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string {
    return this.releaseSupportService.resolveWorkflowFnOrThrow(payload);
  }

  createRuntimeAccessorDeps(source: ReleaseRuntimeAccessorDepsSource): ReleaseRuntimeAccessorDeps {
    return this.releaseAccessorBindingsService.createRuntimeAccessorDeps(source);
  }

  createBuildValidationAccessorDeps(
    source: ReleaseRuntimeAccessorDepsSource
  ): ReleaseBuildValidationAccessorDeps {
    return this.releaseAccessorBindingsService.createBuildValidationAccessorDeps(source);
  }

  createPublishAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleasePublishAccessorDeps {
    return this.releaseAccessorBindingsService.createPublishAccessorDeps(source);
  }

  createDraftAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleaseDraftAccessorDeps {
    return this.releaseAccessorBindingsService.createDraftAccessorDeps(source);
  }

  createQueryAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleaseQueryAccessorDeps {
    return this.releaseAccessorBindingsService.createQueryAccessorDeps(source);
  }

  createLifecycleAccessorDeps(
    source: ReleaseManagementAccessorDepsSource
  ): ReleaseLifecycleAccessorDeps {
    return this.releaseAccessorBindingsService.createLifecycleAccessorDeps(source);
  }

  createDeploymentAccessorDeps(
    source: ReleaseRuntimeAccessorDepsSource
  ): ReleaseDeploymentAccessorDeps {
    return this.releaseAccessorBindingsService.createDeploymentAccessorDeps(source);
  }

  createAssistAccessorDeps(source: ReleaseRuntimeAccessorDepsSource): ReleaseAssistAccessorDeps {
    return this.releaseAccessorBindingsService.createAssistAccessorDeps(source);
  }
}
