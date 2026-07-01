import { Injectable } from '@nestjs/common';
import { CapabilityReleasePublishAccessors } from '../publisher/capability-release-publish.service';
import {
  ReleaseDraftAccessorDeps,
  ReleaseLifecycleAccessorDeps,
  ReleasePublishAccessorDeps,
  ReleaseQueryAccessorDeps,
} from './release-accessor-factory.service';
import { CapabilityReleaseDraftAccessors } from './release-draft.service';
import { CapabilityReleaseLifecycleAccessors } from './release-lifecycle.service';
import { CapabilityReleaseQueryAccessors } from './release-query.service';

@Injectable()
export class ReleaseFacadeAccessorFactoryService {
  createPublishAccessors(deps: ReleasePublishAccessorDeps): CapabilityReleasePublishAccessors {
    return {
      getReleaseOrThrow: deps.getReleaseOrThrow,
      getSkillDraftOrThrow: deps.getSkillDraftOrThrow,
      getCurrentSnapshotOrThrow: deps.getCurrentSnapshotOrThrow,
      getCapabilityDetail: deps.getCapabilityDetail,
      createCapability: deps.createCapability,
      updateSource: deps.updateSource,
      insertAuditEvent: deps.insertAuditEvent,
    };
  }

  createDraftAccessors(deps: ReleaseDraftAccessorDeps): CapabilityReleaseDraftAccessors {
    return {
      getReleaseOrThrow: deps.getReleaseOrThrow,
      insertAuditEvent: deps.insertAuditEvent,
    };
  }

  createQueryAccessors(deps: ReleaseQueryAccessorDeps): CapabilityReleaseQueryAccessors {
    return {
      getReleaseOrThrow: deps.getReleaseOrThrow,
      getSkillDraftOrThrow: deps.getSkillDraftOrThrow,
    };
  }

  createLifecycleAccessors(
    deps: ReleaseLifecycleAccessorDeps
  ): CapabilityReleaseLifecycleAccessors {
    return {
      getReleaseOrThrow: deps.getReleaseOrThrow,
      insertAuditEvent: deps.insertAuditEvent,
    };
  }
}
