import { Injectable } from '@nestjs/common';
import { CapabilityReleaseAssistAccessors } from '../capability-release-assist.service';
import { CapabilityReleaseBuildValidationAccessors } from '../compiler/capability-release-build-validation.service';
import { CapabilityReleaseDeploymentAccessors } from '../publisher/capability-release-deployment.service';
import { CapabilityReleaseRuntimeAccessors } from '../publisher/capability-release-runtime.service';
import { ReleaseAccessorFactoryService } from './release-accessor-factory.service';
import {
  ReleaseAccessorDepsService,
  ReleaseRuntimeAccessorDepsSource,
} from './release-accessor-deps.service';

@Injectable()
export class ReleaseRuntimeFacadeAccessorsService {
  constructor(
    private readonly releaseAccessorFactoryService: ReleaseAccessorFactoryService,
    private readonly releaseAccessorDepsService: ReleaseAccessorDepsService
  ) {}

  createRuntimeAccessors(source: ReleaseRuntimeAccessorDepsSource): CapabilityReleaseRuntimeAccessors {
    return this.releaseAccessorFactoryService.createRuntimeAccessors(
      this.releaseAccessorDepsService.createRuntimeAccessorDeps(source)
    );
  }

  createBuildValidationAccessors(
    source: ReleaseRuntimeAccessorDepsSource
  ): CapabilityReleaseBuildValidationAccessors {
    return this.releaseAccessorFactoryService.createBuildValidationAccessors(
      this.releaseAccessorDepsService.createBuildValidationAccessorDeps(source)
    );
  }

  createDeploymentAccessors(
    source: ReleaseRuntimeAccessorDepsSource
  ): CapabilityReleaseDeploymentAccessors {
    return this.releaseAccessorFactoryService.createDeploymentAccessors(
      this.releaseAccessorDepsService.createDeploymentAccessorDeps(source)
    );
  }

  createAssistAccessors(source: ReleaseRuntimeAccessorDepsSource): CapabilityReleaseAssistAccessors {
    return this.releaseAccessorFactoryService.createAssistAccessors(
      this.releaseAccessorDepsService.createAssistAccessorDeps(source)
    );
  }
}
