import { CapabilityReleaseAssistAccessors } from '../capability-release-assist.service';
import { CapabilityReleaseBuildValidationAccessors } from '../compiler/capability-release-build-validation.service';
import { CapabilityReleaseDeploymentAccessors } from '../publisher/capability-release-deployment.service';
import { Injectable } from '@nestjs/common';
import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityValidationDTO,
  DeploymentRecordDTO,
} from '../interfaces';
import { CapabilityReleaseRuntimeAccessors } from '../publisher/capability-release-runtime.service';
import { ReleaseRuntimeAccessorDepsSource } from './release-accessor-deps.service';
import { ReleaseAccessorSourceService } from './release-accessor-source.service';
import { ReleaseFacadeAccessorsService } from './release-facade-accessors.service';

@Injectable()
export class ReleaseRuntimeFacadeContextService {
  constructor(
    private readonly releaseFacadeAccessorsService: ReleaseFacadeAccessorsService,
    private readonly releaseAccessorSourceService: ReleaseAccessorSourceService
  ) {}

  ensureInfrastructure(): Promise<void> {
    return this.releaseAccessorSourceService.ensureInfrastructure();
  }

  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO> {
    return this.releaseAccessorSourceService.getReleaseOrThrow(id);
  }

  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO> {
    return this.releaseAccessorSourceService.getCurrentSnapshotOrThrow(release);
  }

  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO> {
    return this.releaseAccessorSourceService.getBuildOrThrow(id);
  }

  getValidationOrThrow(id: string): Promise<CapabilityValidationDTO> {
    return this.releaseAccessorSourceService.getValidationOrThrow(id);
  }

  getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO> {
    return this.releaseAccessorSourceService.getDeploymentOrThrow(id);
  }

  getLatestSuccessfulValidationOrThrow(releaseId: string): Promise<CapabilityValidationDTO> {
    return this.releaseAccessorSourceService.getLatestSuccessfulValidationOrThrow(releaseId);
  }

  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string
  ): Promise<CapabilityBuildDTO> {
    return this.releaseAccessorSourceService.resolveTemporalExecutableBuildOrThrow(
      release,
      snapshot,
      buildId,
      userId
    );
  }

  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string {
    return this.releaseAccessorSourceService.resolveWorkflowFnOrThrow(payload);
  }

  createRuntimeAccessors(source: ReleaseRuntimeAccessorDepsSource): CapabilityReleaseRuntimeAccessors {
    return this.releaseFacadeAccessorsService.createRuntimeAccessors(source);
  }

  createBuildValidationAccessors(
    source: ReleaseRuntimeAccessorDepsSource
  ): CapabilityReleaseBuildValidationAccessors {
    return this.releaseFacadeAccessorsService.createBuildValidationAccessors(source);
  }

  createDeploymentAccessors(
    source: ReleaseRuntimeAccessorDepsSource
  ): CapabilityReleaseDeploymentAccessors {
    return this.releaseFacadeAccessorsService.createDeploymentAccessors(source);
  }

  createAssistAccessors(source: ReleaseRuntimeAccessorDepsSource): CapabilityReleaseAssistAccessors {
    return this.releaseFacadeAccessorsService.createAssistAccessors(source);
  }
}
