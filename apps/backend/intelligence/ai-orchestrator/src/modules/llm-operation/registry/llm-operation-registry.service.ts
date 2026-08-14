import { Injectable, Logger, Inject } from '@nestjs/common';
import { LLM_OPERATION_REPOSITORY } from './llm-operation.repository';
import type { LlmOperationRepository } from './llm-operation.repository';
import type {
  LlmOperationRecord,
  LlmOperationVersionRecord,
  LlmOperationActivationRecord,
  Environment,
  LegacyLlmOperationVersion,
  LlmOperationSummary,
  LlmOperationDetail,
} from './types';
import { OperationDigestRecomputeService } from './operation-digest-recompute.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from './errors';
import { LLM_OPERATION_TEMPLATES } from '../llm-operation.registry';
import {
  buildOperationManifest,
  computeOperationContractDigest,
  computeOperationDigestFromManifest,
} from '../operation-manifest.util';

@Injectable()
export class LlmOperationRegistryService {
  constructor(
    @Inject(LLM_OPERATION_REPOSITORY)
    private readonly repository: LlmOperationRepository,
    private readonly digestRecompute: OperationDigestRecomputeService,
    private readonly logger: Logger,
  ) {}

  public async listActiveOperations(): Promise<LlmOperationSummary[]> {
    const operations = await this.repository.listOperations();
    const activeOperations = operations.filter((op) => op.status === 'active');

    const summaries: LlmOperationSummary[] = [];
    for (const operation of activeOperations) {
      const activation = await this.repository.findActivationByOperationAndEnv(
        operation.id,
        'production',
      );
      if (!activation) continue;

      const currentVersion = await this.repository.findVersionById(activation.versionId);
      if (!currentVersion || !['approved', 'deprecated'].includes(currentVersion.state)) {
        continue;
      }
      this.digestRecompute.assertDigestMatchesPersisted(currentVersion);

      summaries.push({
        operation,
        currentVersion,
        activation,
      });
    }

    return summaries;
  }

  public async getOperation(operationKey: string): Promise<LlmOperationDetail | null> {
    const operation = await this.repository.findOperationByKey(operationKey);
    if (!operation) {
      return null;
    }

    const versions = await this.repository.listVersionsByOperationId(operation.id);
    const activations: LlmOperationActivationRecord[] = [];

    const activation = await this.repository.findActivationByOperationAndEnv(
      operation.id,
      'production',
    );
    if (activation) {
      activations.push(activation);
    }

    return {
      operation,
      versions,
      activations,
    };
  }

  public async resolveActiveVersion(
    operationKey: string,
    environment: Environment,
  ): Promise<{
    source: 'database' | 'legacy_registry';
    version: LlmOperationVersionRecord | LegacyLlmOperationVersion;
    operation: LlmOperationRecord | null;
  }> {
    const operation = await this.repository.findOperationByKey(operationKey);
    
    if (operation) {
      const activation = await this.repository.findActivationByOperationAndEnv(
        operation.id,
        environment,
      );

      if (activation) {
        const version = await this.repository.findVersionById(activation.versionId);
        if (version) {
          this.digestRecompute.assertDigestMatchesPersisted(version);
          return {
            source: 'database',
            version,
            operation,
          };
        }
      }
    }

    const template = LLM_OPERATION_TEMPLATES[operationKey as keyof typeof LLM_OPERATION_TEMPLATES];
    if (template) {
      this.logger.warn(
        `LLM_OPERATION_LEGACY_REGISTRY_FALLBACK: ${operationKey} not found in DB, falling back to legacy registry`,
        'LlmOperationRegistryService',
      );

      const manifestJson = buildOperationManifest(
        operationKey as keyof typeof LLM_OPERATION_TEMPLATES,
        template,
        template.version,
      );

      const legacyVersion: LegacyLlmOperationVersion = {
        id: 'legacy',
        operationId: null,
        version: template.version,
        state: 'approved',
        manifestJson,
        operationDigest: computeOperationDigestFromManifest(manifestJson, template.version),
        contractDigest: computeOperationContractDigest(
          operationKey,
          template.version,
          manifestJson,
        ),
        changeSummary: 'Legacy registry fallback',
        source: 'legacy_registry',
        approvedBy: null,
        approvedAt: null,
        createdBy: 'legacy',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return {
        source: 'legacy_registry',
        version: legacyVersion,
        operation: null,
      };
    }

    throw new LlmOperationError(
      LLM_OPERATION_ERROR_CODES.NOT_FOUND,
      `Operation not found: ${operationKey}`,
    );
  }

  public async resolveExactVersion(
    operationKey: string,
    version: string,
  ): Promise<LlmOperationVersionRecord | null> {
    const operation = await this.repository.findOperationByKey(operationKey);
    if (!operation) {
      return null;
    }

    const versionRecord = await this.repository.findVersionByOperationIdAndVersion(
      operation.id,
      version,
    );
    
    if (versionRecord) {
      this.digestRecompute.assertDigestMatchesPersisted(versionRecord);
    }

    return versionRecord;
  }
}
