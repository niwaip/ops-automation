import { Injectable } from '@nestjs/common';
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
import type {
  ReleaseManagementAccessorDepsSource,
  ReleaseRuntimeAccessorDepsSource,
} from './release-accessor-deps.service';
import { ReleaseFacadeAccessorBindingsService } from './release-facade-accessor-bindings.service';
import { ReleaseRuntimeAccessorBindingsService } from './release-runtime-accessor-bindings.service';

@Injectable()
export class ReleaseAccessorBindingsService {
  constructor(
    private readonly releaseRuntimeAccessorBindingsService: ReleaseRuntimeAccessorBindingsService,
    private readonly releaseFacadeAccessorBindingsService: ReleaseFacadeAccessorBindingsService
  ) {}

  createRuntimeAccessorDeps(source: ReleaseRuntimeAccessorDepsSource): ReleaseRuntimeAccessorDeps {
    return this.releaseRuntimeAccessorBindingsService.createRuntimeAccessorDeps(source);
  }

  createBuildValidationAccessorDeps(
    source: ReleaseRuntimeAccessorDepsSource
  ): ReleaseBuildValidationAccessorDeps {
    return this.releaseRuntimeAccessorBindingsService.createBuildValidationAccessorDeps(source);
  }

  createPublishAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleasePublishAccessorDeps {
    return this.releaseFacadeAccessorBindingsService.createPublishAccessorDeps(source);
  }

  createDraftAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleaseDraftAccessorDeps {
    return this.releaseFacadeAccessorBindingsService.createDraftAccessorDeps(source);
  }

  createQueryAccessorDeps(source: ReleaseManagementAccessorDepsSource): ReleaseQueryAccessorDeps {
    return this.releaseFacadeAccessorBindingsService.createQueryAccessorDeps(source);
  }

  createLifecycleAccessorDeps(
    source: ReleaseManagementAccessorDepsSource
  ): ReleaseLifecycleAccessorDeps {
    return this.releaseFacadeAccessorBindingsService.createLifecycleAccessorDeps(source);
  }

  createDeploymentAccessorDeps(
    source: ReleaseRuntimeAccessorDepsSource
  ): ReleaseDeploymentAccessorDeps {
    return this.releaseRuntimeAccessorBindingsService.createDeploymentAccessorDeps(source);
  }

  createAssistAccessorDeps(source: ReleaseRuntimeAccessorDepsSource): ReleaseAssistAccessorDeps {
    return this.releaseRuntimeAccessorBindingsService.createAssistAccessorDeps(source);
  }
}
