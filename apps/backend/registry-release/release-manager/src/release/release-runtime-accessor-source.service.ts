import { Injectable } from '@nestjs/common';
import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityValidationDTO,
  DeploymentRecordDTO,
  SkillDraftDTO,
} from '../interfaces';
import { ReleaseSupportAccessorDepsService } from './release-support-accessor-deps.service';

@Injectable()
export class ReleaseRuntimeAccessorSourceService {
  constructor(
    private readonly releaseSupportAccessorDepsService: ReleaseSupportAccessorDepsService
  ) {}

  ensureInfrastructure(): Promise<void> {
    return this.releaseSupportAccessorDepsService.ensureInfrastructure();
  }

  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO> {
    return this.releaseSupportAccessorDepsService.getReleaseOrThrow(id);
  }

  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO> {
    return this.releaseSupportAccessorDepsService.getCurrentSnapshotOrThrow(release);
  }

  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO> {
    return this.releaseSupportAccessorDepsService.getBuildOrThrow(id);
  }

  getValidationOrThrow(id: string): Promise<CapabilityValidationDTO> {
    return this.releaseSupportAccessorDepsService.getValidationOrThrow(id);
  }

  getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO> {
    return this.releaseSupportAccessorDepsService.getDeploymentOrThrow(id);
  }

  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO> {
    return this.releaseSupportAccessorDepsService.getSkillDraftOrThrow(id);
  }

  getLatestSuccessfulValidationOrThrow(releaseId: string): Promise<CapabilityValidationDTO> {
    return this.releaseSupportAccessorDepsService.getLatestSuccessfulValidationOrThrow(releaseId);
  }

  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string
  ): Promise<CapabilityBuildDTO> {
    return this.releaseSupportAccessorDepsService.resolveTemporalExecutableBuildOrThrow(
      release,
      snapshot,
      buildId,
      userId
    );
  }

  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string {
    return this.releaseSupportAccessorDepsService.resolveWorkflowFnOrThrow(payload);
  }
}
