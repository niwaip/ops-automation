import { Injectable } from '@nestjs/common';
import { CapabilityReleasePublishAccessors } from '../publisher/capability-release-publish.service';
import { ReleaseAccessorFactoryService } from './release-accessor-factory.service';
import {
  ReleaseAccessorDepsService,
  ReleaseManagementAccessorDepsSource,
} from './release-accessor-deps.service';
import { CapabilityReleaseDraftAccessors } from './release-draft.service';
import { CapabilityReleaseLifecycleAccessors } from './release-lifecycle.service';
import { CapabilityReleaseQueryAccessors } from './release-query.service';

@Injectable()
export class ReleaseManagementFacadeAccessorsService {
  constructor(
    private readonly releaseAccessorFactoryService: ReleaseAccessorFactoryService,
    private readonly releaseAccessorDepsService: ReleaseAccessorDepsService
  ) {}

  createPublishAccessors(source: ReleaseManagementAccessorDepsSource): CapabilityReleasePublishAccessors {
    return this.releaseAccessorFactoryService.createPublishAccessors(
      this.releaseAccessorDepsService.createPublishAccessorDeps(source)
    );
  }

  createDraftAccessors(source: ReleaseManagementAccessorDepsSource): CapabilityReleaseDraftAccessors {
    return this.releaseAccessorFactoryService.createDraftAccessors(
      this.releaseAccessorDepsService.createDraftAccessorDeps(source)
    );
  }

  createQueryAccessors(source: ReleaseManagementAccessorDepsSource): CapabilityReleaseQueryAccessors {
    return this.releaseAccessorFactoryService.createQueryAccessors(
      this.releaseAccessorDepsService.createQueryAccessorDeps(source)
    );
  }

  createLifecycleAccessors(
    source: ReleaseManagementAccessorDepsSource
  ): CapabilityReleaseLifecycleAccessors {
    return this.releaseAccessorFactoryService.createLifecycleAccessors(
      this.releaseAccessorDepsService.createLifecycleAccessorDeps(source)
    );
  }
}
