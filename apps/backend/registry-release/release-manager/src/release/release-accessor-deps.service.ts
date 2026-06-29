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
import { ReleaseSupportAccessorDepsService } from './release-support-accessor-deps.service';

export type ReleaseAccessorDepsSource = {
  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO>;
  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO>;
  getValidationOrThrow(id: string): Promise<CapabilityValidationDTO>;
  getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO>;
  getLatestSuccessfulValidationOrThrow(releaseId: string): Promise<CapabilityValidationDTO>;
  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId?: string
  ): Promise<CapabilityBuildDTO>;
  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string;
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
  getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO>;
  createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO>;
  updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO>;
};

export type ReleaseRuntimeAccessorDepsSource = Pick<
  ReleaseAccessorDepsSource,
  | 'getCurrentSnapshotOrThrow'
  | 'getBuildOrThrow'
  | 'getValidationOrThrow'
  | 'getDeploymentOrThrow'
  | 'getLatestSuccessfulValidationOrThrow'
  | 'resolveTemporalExecutableBuildOrThrow'
  | 'resolveWorkflowFnOrThrow'
  | 'getReleaseOrThrow'
  | 'getSkillDraftOrThrow'
  | 'insertAuditEvent'
>;

export type ReleaseManagementAccessorDepsSource = Pick<
  ReleaseAccessorDepsSource,
  | 'getReleaseOrThrow'
  | 'getCurrentSnapshotOrThrow'
  | 'getSkillDraftOrThrow'
  | 'insertAuditEvent'
  | 'getCapabilityDetail'
  | 'createCapability'
  | 'updateSource'
>;

@Injectable()
export class ReleaseAccessorDepsService {
  constructor(
    private readonly releaseSupportAccessorDepsService: ReleaseSupportAccessorDepsService
  ) {}

  createRuntimeAccessorDeps(source: ReleaseRuntimeAccessorDepsSource): ReleaseRuntimeAccessorDeps {
    return this.releaseSupportAccessorDepsService.createRuntimeAccessorDeps(source);
  }

  createBuildValidationAccessorDeps(
    source: ReleaseRuntimeAccessorDepsSource
  ): ReleaseBuildValidationAccessorDeps {
    return this.releaseSupportAccessorDepsService.createBuildValidationAccessorDeps(source);
  }

  createPublishAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleasePublishAccessorDeps {
    return this.releaseSupportAccessorDepsService.createPublishAccessorDeps(source);
  }

  createDraftAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleaseDraftAccessorDeps {
    return this.releaseSupportAccessorDepsService.createDraftAccessorDeps(source);
  }

  createQueryAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleaseQueryAccessorDeps {
    return this.releaseSupportAccessorDepsService.createQueryAccessorDeps(source);
  }

  createLifecycleAccessorDeps(
    source: ReleaseManagementAccessorDepsSource
  ): ReleaseLifecycleAccessorDeps {
    return this.releaseSupportAccessorDepsService.createLifecycleAccessorDeps(source);
  }

  createDeploymentAccessorDeps(
    source: ReleaseRuntimeAccessorDepsSource
  ): ReleaseDeploymentAccessorDeps {
    return this.releaseSupportAccessorDepsService.createDeploymentAccessorDeps(source);
  }

  createAssistAccessorDeps(source: ReleaseRuntimeAccessorDepsSource): ReleaseAssistAccessorDeps {
    return this.releaseSupportAccessorDepsService.createAssistAccessorDeps(source);
  }
}
