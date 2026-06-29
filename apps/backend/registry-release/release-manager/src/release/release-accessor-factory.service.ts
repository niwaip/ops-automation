import { Injectable } from '@nestjs/common';
import { CapabilityReleaseAssistAccessors } from '../capability-release-assist.service';
import { CapabilityReleaseBuildValidationAccessors } from '../compiler/capability-release-build-validation.service';
import { CapabilityReleaseDeploymentAccessors } from '../publisher/capability-release-deployment.service';
import { CapabilityReleasePublishAccessors } from '../publisher/capability-release-publish.service';
import { CapabilityReleaseRuntimeAccessors } from '../publisher/capability-release-runtime.service';
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
import { CapabilityReleaseDraftAccessors } from './release-draft.service';
import { CapabilityReleaseLifecycleAccessors } from './release-lifecycle.service';
import { CapabilityReleaseQueryAccessors } from './release-query.service';
import { ReleaseFacadeAccessorFactoryService } from './release-facade-accessor-factory.service';
import { ReleaseRuntimeAccessorFactoryService } from './release-runtime-accessor-factory.service';

type InsertAuditEventFn = (
  releaseId: string,
  eventType: string,
  actorId: string | undefined,
  success: boolean,
  summary: string,
  details?: Record<string, unknown> | null
) => Promise<void>;

export type ReleaseAccessorFactoryDeps = {
  getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO>;
  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO>;
  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO>;
  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO>;
  getValidationOrThrow(id: string): Promise<CapabilityValidationDTO>;
  getDeploymentOrThrow(id: string): Promise<DeploymentRecordDTO>;
  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO>;
  getLatestSuccessfulValidationOrThrow(releaseId: string): Promise<CapabilityValidationDTO>;
  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId: string | undefined
  ): Promise<CapabilityBuildDTO>;
  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string;
  createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO>;
  updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO>;
  insertAuditEvent: InsertAuditEventFn;
};

export type ReleaseRuntimeAccessorDeps = Pick<
  ReleaseAccessorFactoryDeps,
  | 'getCurrentSnapshotOrThrow'
  | 'resolveTemporalExecutableBuildOrThrow'
  | 'resolveWorkflowFnOrThrow'
  | 'insertAuditEvent'
>;

export type ReleaseBuildValidationAccessorDeps = Pick<
  ReleaseAccessorFactoryDeps,
  | 'getReleaseOrThrow'
  | 'getCurrentSnapshotOrThrow'
  | 'getBuildOrThrow'
  | 'getValidationOrThrow'
  | 'getSkillDraftOrThrow'
  | 'getLatestSuccessfulValidationOrThrow'
  | 'resolveTemporalExecutableBuildOrThrow'
  | 'resolveWorkflowFnOrThrow'
  | 'insertAuditEvent'
>;

export type ReleasePublishAccessorDeps = Pick<
  ReleaseAccessorFactoryDeps,
  | 'getReleaseOrThrow'
  | 'getCurrentSnapshotOrThrow'
  | 'getSkillDraftOrThrow'
  | 'getCapabilityDetail'
  | 'createCapability'
  | 'updateSource'
  | 'insertAuditEvent'
>;

export type ReleaseDraftAccessorDeps = Pick<
  ReleaseAccessorFactoryDeps,
  'getReleaseOrThrow' | 'insertAuditEvent'
>;

export type ReleaseQueryAccessorDeps = Pick<
  ReleaseAccessorFactoryDeps,
  'getReleaseOrThrow' | 'getSkillDraftOrThrow'
>;

export type ReleaseLifecycleAccessorDeps = Pick<
  ReleaseAccessorFactoryDeps,
  'getReleaseOrThrow' | 'insertAuditEvent'
>;

export type ReleaseDeploymentAccessorDeps = Pick<
  ReleaseAccessorFactoryDeps,
  | 'getReleaseOrThrow'
  | 'getCurrentSnapshotOrThrow'
  | 'getBuildOrThrow'
  | 'getDeploymentOrThrow'
  | 'getSkillDraftOrThrow'
  | 'resolveTemporalExecutableBuildOrThrow'
  | 'resolveWorkflowFnOrThrow'
  | 'insertAuditEvent'
>;

export type ReleaseAssistAccessorDeps = Pick<
  ReleaseAccessorFactoryDeps,
  | 'getReleaseOrThrow'
  | 'getCurrentSnapshotOrThrow'
  | 'getBuildOrThrow'
  | 'getValidationOrThrow'
  | 'getDeploymentOrThrow'
  | 'insertAuditEvent'
>;

@Injectable()
export class ReleaseAccessorFactoryService {
  constructor(
    private readonly releaseRuntimeAccessorFactoryService: ReleaseRuntimeAccessorFactoryService,
    private readonly releaseFacadeAccessorFactoryService: ReleaseFacadeAccessorFactoryService
  ) {}

  createRuntimeAccessors(deps: ReleaseRuntimeAccessorDeps): CapabilityReleaseRuntimeAccessors {
    return this.releaseRuntimeAccessorFactoryService.createRuntimeAccessors(deps);
  }

  createBuildValidationAccessors(
    deps: ReleaseBuildValidationAccessorDeps
  ): CapabilityReleaseBuildValidationAccessors {
    return this.releaseRuntimeAccessorFactoryService.createBuildValidationAccessors(deps);
  }

  createPublishAccessors(deps: ReleasePublishAccessorDeps): CapabilityReleasePublishAccessors {
    return this.releaseFacadeAccessorFactoryService.createPublishAccessors(deps);
  }

  createDraftAccessors(deps: ReleaseDraftAccessorDeps): CapabilityReleaseDraftAccessors {
    return this.releaseFacadeAccessorFactoryService.createDraftAccessors(deps);
  }

  createQueryAccessors(deps: ReleaseQueryAccessorDeps): CapabilityReleaseQueryAccessors {
    return this.releaseFacadeAccessorFactoryService.createQueryAccessors(deps);
  }

  createLifecycleAccessors(
    deps: ReleaseLifecycleAccessorDeps
  ): CapabilityReleaseLifecycleAccessors {
    return this.releaseFacadeAccessorFactoryService.createLifecycleAccessors(deps);
  }

  createDeploymentAccessors(
    deps: ReleaseDeploymentAccessorDeps
  ): CapabilityReleaseDeploymentAccessors {
    return this.releaseRuntimeAccessorFactoryService.createDeploymentAccessors(deps);
  }

  createAssistAccessors(deps: ReleaseAssistAccessorDeps): CapabilityReleaseAssistAccessors {
    return this.releaseRuntimeAccessorFactoryService.createAssistAccessors(deps);
  }
}
