import { Injectable, Logger } from '@nestjs/common';
import { LlmOperationRegistryService } from './registry/llm-operation-registry.service';
import { computeOperationContractDigest } from './operation-manifest.util';
import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';
import { AttestationService } from './eval/attestation.service';
import type { OperationAttestation } from './eval/types';
import { SYSTEM_OPERATION_DEFINITIONS } from './system-operation-definitions';

type JsonSchema = Record<string, unknown>;

export interface LlmOperationCatalogProjection {
  capabilityRef: {
    id: string;
    version: string;
    digest: string;                  // operationDigest（覆盖 Manifest 全字段）
    contractDigest: string;          // 合同包络 digest（覆盖 input/output Schema）
  };
  capabilityKind: 'llm_operation';
  displayName: string;
  summary: string;
  goals: string[];
  inputSchema: JsonSchema | null;
  outputSchema: JsonSchema | null;
  runtime: {
    type: 'llm_operation';
    executionRuntimeType?: string;
  };
  lifecycle: {
    status: 'active' | 'deprecated' | 'disabled';
    environment?: string;
  };
  governance: {
    attestationId?: string;
    evaluatedAt?: string;
    approvedAt?: string;
  };
}

@Injectable()
export class LlmOperationCatalogProjector {
  private readonly logger = new Logger(LlmOperationCatalogProjector.name);

  constructor(
    private readonly registry: LlmOperationRegistryService,
    private readonly attestation: AttestationService,
  ) {}

  public async projectAll(): Promise<LlmOperationCatalogProjection[]> {
    try {
      const operations = await this.registry.listActiveOperations();
      const projections = await Promise.all(
        operations.map(async (op) => {
          const versionId = op.currentVersion?.id;
          const version = op.currentVersion?.version;
          const operationKey = op.operation?.operationKey;
          if (!versionId || !version || !operationKey) return null;
          if (!(await this.attestation.hasValidAttestation(versionId))) return null;
          const proof = await this.attestation.getLatestAttestation(operationKey, version);
          return proof ? this.fromDbRecord(op, proof) : null;
        }),
      );
      return projections.filter(
        (projection): projection is LlmOperationCatalogProjection => projection !== null,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to project attested LLM Operations; returning no candidates: ${err.message}`,
      );
      return [];
    }
  }

  public async projectOne(operationId: string): Promise<LlmOperationCatalogProjection | null> {
    try {
      const resolved = await this.registry.resolveActiveVersion(operationId as LlmOperationIdV1, 'production');
      if (!resolved) return null;
      if (!(await this.attestation.hasValidAttestation(resolved.version.id))) return null;
      const proof = await this.attestation.getLatestAttestation(
        operationId,
        resolved.version.version,
      );
      return proof ? this.fromResolvedVersion(operationId, resolved.version, proof) : null;
    } catch (err: any) {
      this.logger.error(
        `Failed to project attested LLM Operation '${operationId}': ${err.message}`,
      );
      return null;
    }
  }

  private fromDbRecord(
    op: any,
    proof: OperationAttestation,
  ): LlmOperationCatalogProjection {
    const operationKey = op.operation.operationKey as string;
    const definition = SYSTEM_OPERATION_DEFINITIONS[operationKey as LlmOperationIdV1];
    const metadata = definition ? {
      displayName: definition.displayName,
      summary: definition.description,
      goals: definition.goals,
    } : {
      displayName: op.operation.displayName || operationKey,
      summary: op.operation.description || operationKey,
      goals: [],
    };

    const manifest = op.currentVersion?.manifestJson || {};
    const version = op.currentVersion?.version || '1';
    const digest = op.currentVersion?.operationDigest || '';
    const contractDigest =
      op.currentVersion?.contractDigest ||
      computeOperationContractDigest(operationKey, version, manifest);

    return {
      capabilityRef: {
        id: operationKey,
        version,
        digest,
        contractDigest,
      },
      capabilityKind: 'llm_operation',
      displayName: metadata.displayName,
      summary: metadata.summary,
      goals: metadata.goals,
      inputSchema: manifest.inputSchema || null,
      outputSchema: manifest.outputSchema || null,
      runtime: {
        type: 'llm_operation',
      },
      lifecycle: {
        status: op.operation.status,
        environment: op.activation?.environment,
      },
      governance: {
        attestationId: proof.id,
        evaluatedAt: proof.createdAt.toISOString(),
        approvedAt: op.currentVersion?.approvedAt?.toISOString?.(),
      },
    };
  }

  private fromResolvedVersion(
    operationId: string,
    version: any,
    proof: OperationAttestation,
  ): LlmOperationCatalogProjection {
    const definition = SYSTEM_OPERATION_DEFINITIONS[operationId as LlmOperationIdV1];
    const metadata = definition ? {
      displayName: definition.displayName,
      summary: definition.description,
      goals: definition.goals,
    } : {
      displayName: operationId,
      summary: operationId,
      goals: [],
    };

    const manifest = version.manifestJson || {};
    const versionStr = version.version || '1';
    const digest = version.operationDigest || '';
    const contractDigest =
      version.contractDigest ||
      computeOperationContractDigest(operationId, versionStr, manifest);

    return {
      capabilityRef: {
        id: operationId,
        version: versionStr,
        digest,
        contractDigest,
      },
      capabilityKind: 'llm_operation',
      displayName: metadata.displayName,
      summary: metadata.summary,
      goals: metadata.goals,
      inputSchema: manifest.inputSchema || null,
      outputSchema: manifest.outputSchema || null,
      runtime: {
        type: 'llm_operation',
      },
      lifecycle: {
        status: 'active',
        environment: 'production',
      },
      governance: {
        attestationId: proof.id,
        evaluatedAt: proof.createdAt.toISOString(),
        approvedAt: version.approvedAt?.toISOString?.(),
      },
    };
  }
}
