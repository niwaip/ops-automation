import { Injectable } from '@nestjs/common';
import { LlmOperationVersionRecord } from './types';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from './errors';
import { computeOperationDigestFromManifest } from '../operation-manifest.util';

@Injectable()
export class OperationDigestRecomputeService {
  public computeDigestForVersion(version: LlmOperationVersionRecord): string {
    return computeOperationDigestFromManifest(version.manifestJson, version.version);
  }

  public assertDigestMatchesPersisted(version: LlmOperationVersionRecord): void {
    const recomputedDigest = this.computeDigestForVersion(version);
    const persistedDigest = version.operationDigest;

    if (recomputedDigest !== persistedDigest) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.DIGEST_MISMATCH,
        `Digest mismatch for version ${version.version}`,
        {
          operationKey: version.operationId,
          version: version.version,
          persistedDigest,
          recomputedDigest,
        },
      );
    }
  }
}
