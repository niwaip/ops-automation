import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';

export interface RenderResponse {
  downloadUrl: string;
  fileName: string;
  format: string;
  size?: number;
  artifacts?: ArtifactRef[];
}
