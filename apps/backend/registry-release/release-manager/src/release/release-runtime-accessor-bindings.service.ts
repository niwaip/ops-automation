import { Injectable } from '@nestjs/common';
import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
} from '../interfaces';
import {
  ReleaseAssistAccessorDeps,
  ReleaseBuildValidationAccessorDeps,
  ReleaseDeploymentAccessorDeps,
  ReleaseRuntimeAccessorDeps,
} from './release-accessor-factory.service';
import type { ReleaseRuntimeAccessorDepsSource } from './release-accessor-deps.service';

@Injectable()
export class ReleaseRuntimeAccessorBindingsService {
  createRuntimeAccessorDeps(source: ReleaseRuntimeAccessorDepsSource): ReleaseRuntimeAccessorDeps {
    return {
      getCurrentSnapshotOrThrow: (release: CapabilityReleaseDTO) =>
        source.getCurrentSnapshotOrThrow(release),
      resolveTemporalExecutableBuildOrThrow: (
        release: CapabilityReleaseDTO,
        snapshot: CapabilitySourceSnapshotDTO,
        buildId: string | undefined,
        userId?: string
      ) => source.resolveTemporalExecutableBuildOrThrow(release, snapshot, buildId, userId),
      resolveWorkflowFnOrThrow: (payload: Record<string, unknown>) =>
        source.resolveWorkflowFnOrThrow(payload),
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

  createBuildValidationAccessorDeps(
    source: ReleaseRuntimeAccessorDepsSource
  ): ReleaseBuildValidationAccessorDeps {
    return {
      getReleaseOrThrow: (id: string) => source.getReleaseOrThrow(id),
      getCurrentSnapshotOrThrow: (release: CapabilityReleaseDTO) =>
        source.getCurrentSnapshotOrThrow(release),
      getBuildOrThrow: (id: string) => source.getBuildOrThrow(id),
      getValidationOrThrow: (id: string) => source.getValidationOrThrow(id),
      getSkillDraftOrThrow: (id: string) => source.getSkillDraftOrThrow(id),
      getLatestSuccessfulValidationOrThrow: (releaseId: string) =>
        source.getLatestSuccessfulValidationOrThrow(releaseId),
      resolveTemporalExecutableBuildOrThrow: (
        release: CapabilityReleaseDTO,
        snapshot: CapabilitySourceSnapshotDTO,
        buildId: string | undefined,
        userId?: string
      ) => source.resolveTemporalExecutableBuildOrThrow(release, snapshot, buildId, userId),
      resolveWorkflowFnOrThrow: (payload: Record<string, unknown>) =>
        source.resolveWorkflowFnOrThrow(payload),
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

  createDeploymentAccessorDeps(
    source: ReleaseRuntimeAccessorDepsSource
  ): ReleaseDeploymentAccessorDeps {
    return {
      getReleaseOrThrow: (id: string) => source.getReleaseOrThrow(id),
      getCurrentSnapshotOrThrow: (release: CapabilityReleaseDTO) =>
        source.getCurrentSnapshotOrThrow(release),
      getBuildOrThrow: (id: string) => source.getBuildOrThrow(id),
      getDeploymentOrThrow: (id: string) => source.getDeploymentOrThrow(id),
      getSkillDraftOrThrow: (id: string) => source.getSkillDraftOrThrow(id),
      resolveTemporalExecutableBuildOrThrow: (
        release: CapabilityReleaseDTO,
        snapshot: CapabilitySourceSnapshotDTO,
        buildId: string | undefined,
        userId?: string
      ) => source.resolveTemporalExecutableBuildOrThrow(release, snapshot, buildId, userId),
      resolveWorkflowFnOrThrow: (payload: Record<string, unknown>) =>
        source.resolveWorkflowFnOrThrow(payload),
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

  createAssistAccessorDeps(source: ReleaseRuntimeAccessorDepsSource): ReleaseAssistAccessorDeps {
    return {
      getReleaseOrThrow: (id: string) => source.getReleaseOrThrow(id),
      getCurrentSnapshotOrThrow: (release: CapabilityReleaseDTO) =>
        source.getCurrentSnapshotOrThrow(release),
      getBuildOrThrow: (id: string) => source.getBuildOrThrow(id),
      getValidationOrThrow: (id: string) => source.getValidationOrThrow(id),
      getDeploymentOrThrow: (id: string) => source.getDeploymentOrThrow(id),
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
