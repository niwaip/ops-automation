import { Injectable } from '@nestjs/common';
import { CapabilityReleaseAssistAccessors } from '../capability-release-assist.service';
import { CapabilityReleaseBuildValidationAccessors } from '../compiler/capability-release-build-validation.service';
import { CapabilityReleaseDeploymentAccessors } from '../publisher/capability-release-deployment.service';
import { CapabilityReleaseRuntimeAccessors } from '../publisher/capability-release-runtime.service';
import {
  ReleaseAssistAccessorDeps,
  ReleaseBuildValidationAccessorDeps,
  ReleaseDeploymentAccessorDeps,
  ReleaseRuntimeAccessorDeps,
} from './release-accessor-factory.service';

@Injectable()
export class ReleaseRuntimeAccessorFactoryService {
  createRuntimeAccessors(deps: ReleaseRuntimeAccessorDeps): CapabilityReleaseRuntimeAccessors {
    return {
      getCurrentSnapshotOrThrow: deps.getCurrentSnapshotOrThrow,
      resolveTemporalExecutableBuildOrThrow: deps.resolveTemporalExecutableBuildOrThrow,
      resolveWorkflowFnOrThrow: deps.resolveWorkflowFnOrThrow,
      insertAuditEvent: deps.insertAuditEvent,
    };
  }

  createBuildValidationAccessors(
    deps: ReleaseBuildValidationAccessorDeps
  ): CapabilityReleaseBuildValidationAccessors {
    return {
      getReleaseOrThrow: deps.getReleaseOrThrow,
      getCurrentSnapshotOrThrow: deps.getCurrentSnapshotOrThrow,
      getBuildOrThrow: deps.getBuildOrThrow,
      getValidationOrThrow: deps.getValidationOrThrow,
      getSkillDraftOrThrow: deps.getSkillDraftOrThrow,
      getLatestSuccessfulValidationOrThrow: deps.getLatestSuccessfulValidationOrThrow,
      resolveTemporalExecutableBuildOrThrow: deps.resolveTemporalExecutableBuildOrThrow,
      resolveWorkflowFnOrThrow: deps.resolveWorkflowFnOrThrow,
      insertAuditEvent: deps.insertAuditEvent,
    };
  }

  createDeploymentAccessors(
    deps: ReleaseDeploymentAccessorDeps
  ): CapabilityReleaseDeploymentAccessors {
    return {
      getReleaseOrThrow: deps.getReleaseOrThrow,
      getCurrentSnapshotOrThrow: deps.getCurrentSnapshotOrThrow,
      getBuildOrThrow: deps.getBuildOrThrow,
      getDeploymentOrThrow: deps.getDeploymentOrThrow,
      getSkillDraftOrThrow: deps.getSkillDraftOrThrow,
      resolveTemporalExecutableBuildOrThrow: deps.resolveTemporalExecutableBuildOrThrow,
      resolveWorkflowFnOrThrow: deps.resolveWorkflowFnOrThrow,
      insertAuditEvent: deps.insertAuditEvent,
    };
  }

  createAssistAccessors(deps: ReleaseAssistAccessorDeps): CapabilityReleaseAssistAccessors {
    return {
      getReleaseOrThrow: deps.getReleaseOrThrow,
      getCurrentSnapshotOrThrow: deps.getCurrentSnapshotOrThrow,
      getBuildOrThrow: deps.getBuildOrThrow,
      getValidationOrThrow: deps.getValidationOrThrow,
      getDeploymentOrThrow: deps.getDeploymentOrThrow,
      insertAuditEvent: deps.insertAuditEvent,
    };
  }
}
