import { Injectable } from '@nestjs/common';
import { CapabilityReleaseAssistAccessors } from '../capability-release-assist.service';
import { CapabilityReleaseBuildValidationAccessors } from '../compiler/capability-release-build-validation.service';
import { CapabilityReleaseDeploymentAccessors } from '../publisher/capability-release-deployment.service';
import { CapabilityReleasePublishAccessors } from '../publisher/capability-release-publish.service';
import { CapabilityReleaseRuntimeAccessors } from '../publisher/capability-release-runtime.service';
import {
  ReleaseManagementAccessorDepsSource,
  ReleaseRuntimeAccessorDepsSource,
} from './release-accessor-deps.service';
import { CapabilityReleaseDraftAccessors } from './release-draft.service';
import { ReleaseManagementFacadeAccessorsService } from './release-management-facade-accessors.service';
import { CapabilityReleaseLifecycleAccessors } from './release-lifecycle.service';
import { CapabilityReleaseQueryAccessors } from './release-query.service';
import { ReleaseRuntimeFacadeAccessorsService } from './release-runtime-facade-accessors.service';

@Injectable()
export class ReleaseFacadeAccessorsService {
  constructor(
    private readonly releaseRuntimeFacadeAccessorsService: ReleaseRuntimeFacadeAccessorsService,
    private readonly releaseManagementFacadeAccessorsService: ReleaseManagementFacadeAccessorsService
  ) {}

  createRuntimeAccessors(source: ReleaseRuntimeAccessorDepsSource): CapabilityReleaseRuntimeAccessors {
    return this.releaseRuntimeFacadeAccessorsService.createRuntimeAccessors(source);
  }

  createBuildValidationAccessors(
    source: ReleaseRuntimeAccessorDepsSource
  ): CapabilityReleaseBuildValidationAccessors {
    return this.releaseRuntimeFacadeAccessorsService.createBuildValidationAccessors(source);
  }

  createPublishAccessors(source: ReleaseManagementAccessorDepsSource): CapabilityReleasePublishAccessors {
    return this.releaseManagementFacadeAccessorsService.createPublishAccessors(source);
  }

  createDraftAccessors(source: ReleaseManagementAccessorDepsSource): CapabilityReleaseDraftAccessors {
    return this.releaseManagementFacadeAccessorsService.createDraftAccessors(source);
  }

  createQueryAccessors(source: ReleaseManagementAccessorDepsSource): CapabilityReleaseQueryAccessors {
    return this.releaseManagementFacadeAccessorsService.createQueryAccessors(source);
  }

  createLifecycleAccessors(
    source: ReleaseManagementAccessorDepsSource
  ): CapabilityReleaseLifecycleAccessors {
    return this.releaseManagementFacadeAccessorsService.createLifecycleAccessors(source);
  }

  createDeploymentAccessors(
    source: ReleaseRuntimeAccessorDepsSource
  ): CapabilityReleaseDeploymentAccessors {
    return this.releaseRuntimeFacadeAccessorsService.createDeploymentAccessors(source);
  }

  createAssistAccessors(source: ReleaseRuntimeAccessorDepsSource): CapabilityReleaseAssistAccessors {
    return this.releaseRuntimeFacadeAccessorsService.createAssistAccessors(source);
  }
}
