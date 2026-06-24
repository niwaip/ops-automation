import { Injectable } from '@nestjs/common';
import type { ReleaseManifest } from '@ops/backend-release-manifest';
import type { CapabilityReleaseDetailDTO } from './interfaces';
import { mapCapabilityReleaseDetailToManifest } from './capability-release-manifest.mapper';

@Injectable()
export class CapabilityReleaseManifestService {
  buildManifest(detail: CapabilityReleaseDetailDTO): ReleaseManifest {
    return mapCapabilityReleaseDetailToManifest(detail);
  }
}
