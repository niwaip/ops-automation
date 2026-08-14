import { Injectable, Logger, Inject } from '@nestjs/common';
import { LLM_OPERATION_REPOSITORY } from '../registry/llm-operation.repository';
import type { LlmOperationRepository } from '../registry/llm-operation.repository';
import type {
  LlmOperationRecord,
  LlmOperationVersionRecord,
  LlmOperationActivationRecord,
  LlmOperationActivationEventRecord,
  LlmOperationDetail,
} from '../registry/types';
import { LlmOperationRegistryService } from '../registry/llm-operation-registry.service';
import { OperationActivationService } from '../registry/operation-activation.service';
import { OperationVersionPolicyService } from '../registry/operation-version-policy.service';
import { OperationDigestRecomputeService } from '../registry/operation-digest-recompute.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../registry/errors';
import {
  computeOperationContractDigest,
  computeOperationDigestFromManifest,
} from '../operation-manifest.util';
import { AttestationService } from '../eval/attestation.service';
import {
  OperationValidationOrchestratorService,
  type OperationValidationResult,
} from '../eval/operation-validation-orchestrator.service';
import type {
  CreateVersionDraftDto,
  UpdateDraftDto,
  ApproveVersionDto,
  ActivateVersionDto,
  RollbackDto,
  AdjustCanaryDto,
  ListOperationsQueryDto,
  VersionDiffResult,
} from './dto/admin.dto';

@Injectable()
export class OperationAdminService {
  constructor(
    private readonly registry: LlmOperationRegistryService,
    private readonly activation: OperationActivationService,
    private readonly versionPolicy: OperationVersionPolicyService,
    private readonly digestRecompute: OperationDigestRecomputeService,
    private readonly attestation: AttestationService,
    private readonly validationOrchestrator: OperationValidationOrchestratorService,
    @Inject(LLM_OPERATION_REPOSITORY)
    private readonly repository: LlmOperationRepository,
    private readonly logger: Logger,
  ) {}

  public async listOperations(query: ListOperationsQueryDto): Promise<LlmOperationRecord[]> {
    const operations = await this.repository.listOperations();
    let filtered = operations;
    if (query.status) filtered = filtered.filter((op) => op.status === query.status);
    if (query.owner) filtered = filtered.filter((op) => op.owner === query.owner);
    if (query.limit) filtered = filtered.slice(0, query.limit);
    return filtered;
  }

  public async upsertOperationByKey(
    operationKey: string,
    data: Omit<LlmOperationRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<LlmOperationRecord> {
    return this.repository.upsertOperationByKey(operationKey, data);
  }

  public async getOperationDetail(operationKey: string): Promise<LlmOperationDetail | null> {
    return this.registry.getOperation(operationKey);
  }

  public async createVersionDraft(
    operationKey: string,
    dto: CreateVersionDraftDto,
    actor: string,
  ): Promise<LlmOperationVersionRecord> {
    const operation = await this.findOperationOrThrow(operationKey);
    const manifestJson = this.normalizeManifestVersion(dto.manifestJson, dto.version);
    const operationDigest = computeOperationDigestFromManifest(manifestJson, dto.version);
    const contractDigest = computeOperationContractDigest(
      operationKey,
      dto.version,
      manifestJson,
    );
    const versionRecord = await this.repository.insertVersion({
      operationId: operation.id,
      version: dto.version,
      state: 'draft',
      manifestJson,
      operationDigest,
      contractDigest,
      changeSummary: dto.changeSummary,
      source: 'admin_created',
      approvedBy: null,
      approvedAt: null,
      createdBy: actor,
    });
    this.logger.log(`Created draft ${operationKey}@${dto.version} by ${actor}`, 'OperationAdminService');
    return versionRecord;
  }

  public async updateDraft(
    operationKey: string,
    version: string,
    dto: UpdateDraftDto,
  ): Promise<LlmOperationVersionRecord> {
    const versionRecord = await this.findVersionOrThrow(operationKey, version);
    if (versionRecord.id !== dto.expectedVersionId) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.CONCURRENT_MODIFICATION,
        `Concurrent modification detected: expected ${dto.expectedVersionId} but found ${versionRecord.id}`,
        { expected: dto.expectedVersionId, actual: versionRecord.id },
      );
    }
    if (!['draft', 'validation_failed'].includes(versionRecord.state)) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.INVALID_STATE_TRANSITION,
        `Only draft or validation_failed versions can be edited; current state is '${versionRecord.state}'`,
        { operationKey, version, state: versionRecord.state },
      );
    }
    const manifestJson = this.normalizeManifestVersion(dto.manifestJson, version);
    const operationDigest = computeOperationDigestFromManifest(manifestJson, version);
    const contractDigest = computeOperationContractDigest(operationKey, version, manifestJson);
    const updatedVersion = await this.repository.updateVersion(versionRecord.id, {
      state: 'draft',
      manifestJson,
      operationDigest,
      contractDigest,
      changeSummary: dto.changeSummary,
    });
    this.logger.log(`Updated draft ${operationKey}@${version}`, 'OperationAdminService');
    return updatedVersion;
  }

  public async approveVersion(
    operationKey: string,
    version: string,
    dto: ApproveVersionDto,
  ): Promise<LlmOperationVersionRecord> {
    const versionRecord = await this.findVersionOrThrow(operationKey, version);
    if (versionRecord.id !== dto.expectedVersionId) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.CONCURRENT_MODIFICATION,
        `Concurrent modification detected: expected ${dto.expectedVersionId} but found ${versionRecord.id}`,
        { expected: dto.expectedVersionId, actual: versionRecord.id },
      );
    }
    this.digestRecompute.assertDigestMatchesPersisted(versionRecord);
    this.versionPolicy.assertTransitionAllowed(versionRecord.state, 'approved');
    if (dto.approvedBy === versionRecord.createdBy) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.ATTESTATION_INVALID,
        'The version creator cannot approve the same version',
        { createdBy: versionRecord.createdBy, approvedBy: dto.approvedBy },
      );
    }
    if (!(await this.attestation.hasValidAttestation(versionRecord.id))) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.ATTESTATION_INVALID,
        `A valid attestation is required before approving ${operationKey}@${version}`,
      );
    }
    const updatedVersion = await this.repository.updateVersionState(
      versionRecord.id,
      'approved',
      dto.approvedBy,
    );
    this.logger.log(`Approved ${operationKey}@${version} by ${dto.approvedBy}`, 'OperationAdminService');
    return updatedVersion;
  }

  public async transitionToValidating(
    operationKey: string,
    version: string,
    actor: string,
  ): Promise<{ version: LlmOperationVersionRecord; validation: OperationValidationResult }> {
    const operation = await this.findOperationOrThrow(operationKey);
    const versionRecord = await this.findVersionByOperationOrThrow(operation.id, version);
    this.digestRecompute.assertDigestMatchesPersisted(versionRecord);
    this.versionPolicy.assertTransitionAllowed(versionRecord.state, 'validating');
    await this.repository.updateVersionState(versionRecord.id, 'validating');

    try {
      const validation = await this.validationOrchestrator.validate({
        operation,
        version: versionRecord,
        actor,
      });
      this.versionPolicy.assertTransitionAllowed('validating', 'candidate');
      const candidate = await this.repository.updateVersionState(versionRecord.id, 'candidate');
      this.logger.log(
        `Validated ${operationKey}@${version}; automatically transitioned to candidate by ${actor}`,
        'OperationAdminService',
      );
      return { version: candidate, validation };
    } catch (error) {
      await this.repository.updateVersionState(versionRecord.id, 'validation_failed');
      if (error instanceof LlmOperationError) throw error;
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.VALIDATION_FAILED,
        `Validation failed for ${operationKey}@${version}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async activate(
    operationKey: string,
    dto: ActivateVersionDto,
  ): Promise<LlmOperationActivationRecord> {
    if (
      dto.environment === 'production' &&
      !(await this.attestation.hasValidAttestationForVersion(operationKey, dto.version))
    ) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.ATTESTATION_INVALID,
        `A valid attestation is required before production activation of ${operationKey}@${dto.version}`,
      );
    }
    return this.activation.activate({
      operationKey,
      version: dto.version,
      environment: dto.environment,
      actor: dto.actor,
      reason: dto.reason,
      label: dto.label,
      rolloutPercent: dto.rolloutPercent,
    });
  }

  public async rollback(
    operationKey: string,
    dto: RollbackDto,
  ): Promise<LlmOperationActivationRecord> {
    return this.activation.rollback({
      operationKey,
      environment: dto.environment,
      actor: dto.actor,
      reason: dto.reason,
    });
  }

  public async adjustCanary(
    operationKey: string,
    dto: AdjustCanaryDto,
  ): Promise<LlmOperationActivationRecord> {
    return this.activation.adjustCanary({
      operationKey,
      environment: dto.environment,
      rolloutPercent: dto.rolloutPercent,
      actor: dto.actor,
      reason: dto.reason,
    });
  }

  public async listActivationHistory(
    operationKey: string,
    limit: number = 20,
  ): Promise<LlmOperationActivationEventRecord[]> {
    return this.activation.listHistory(operationKey, limit);
  }

  public async diffVersions(
    operationKey: string,
    fromVersion: string,
    toVersion: string,
  ): Promise<VersionDiffResult> {
    const operation = await this.findOperationOrThrow(operationKey);
    const fromVersionRecord = await this.findVersionByOperationOrThrow(operation.id, fromVersion);
    const toVersionRecord = await this.findVersionByOperationOrThrow(operation.id, toVersion);
    const changes = this.computeDiff(fromVersionRecord.manifestJson, toVersionRecord.manifestJson, '');
    return {
      operationKey,
      from: {
        version: fromVersionRecord.version,
        operationDigest: fromVersionRecord.operationDigest,
        manifestJson: fromVersionRecord.manifestJson,
      },
      to: {
        version: toVersionRecord.version,
        operationDigest: toVersionRecord.operationDigest,
        manifestJson: toVersionRecord.manifestJson,
      },
      changes,
    };
  }

  public async getRegistryHealth(): Promise<{
    dbBacked: boolean;
    legacyFallbacksAvailable: number;
    seedStatus: 'applied' | 'partial' | 'not_applied';
  }> {
    const operations = await this.repository.listOperations();
    const dbBacked = operations.length > 0;
    return { dbBacked, legacyFallbacksAvailable: 0, seedStatus: dbBacked ? 'applied' : 'not_applied' };
  }

  private async findOperationOrThrow(operationKey: string): Promise<LlmOperationRecord> {
    const operation = await this.repository.findOperationByKey(operationKey);
    if (!operation) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.NOT_FOUND,
        `Operation not found: ${operationKey}`,
      );
    }
    return operation;
  }

  private async findVersionOrThrow(
    operationKey: string,
    version: string,
  ): Promise<LlmOperationVersionRecord> {
    const operation = await this.findOperationOrThrow(operationKey);
    return this.findVersionByOperationOrThrow(operation.id, version);
  }

  private async findVersionByOperationOrThrow(
    operationId: string,
    version: string,
  ): Promise<LlmOperationVersionRecord> {
    const versionRecord = await this.repository.findVersionByOperationIdAndVersion(
      operationId,
      version,
    );
    if (!versionRecord) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.VERSION_NOT_FOUND,
        `Version not found: ${version}`,
      );
    }
    return versionRecord;
  }

  private normalizeManifestVersion(
    manifestJson: Record<string, unknown>,
    version: string,
  ): Record<string, unknown> {
    return { ...manifestJson, version };
  }

  private computeDiff(
    from: Record<string, unknown>,
    to: Record<string, unknown>,
    basePath: string,
  ): VersionDiffResult['changes'] {
    const changes: VersionDiffResult['changes'] = [];
    const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const key of allKeys) {
      const path = basePath ? `${basePath}/${key}` : `/${key}`;
      const fromValue = from[key];
      const toValue = to[key];
      if (!(key in from)) {
        changes.push({ path, kind: 'added', toValue });
      } else if (!(key in to)) {
        changes.push({ path, kind: 'removed', fromValue });
      } else if (fromValue === toValue) {
        continue;
      } else if (
        typeof fromValue === 'object' &&
        fromValue !== null &&
        !Array.isArray(fromValue) &&
        typeof toValue === 'object' &&
        toValue !== null &&
        !Array.isArray(toValue)
      ) {
        changes.push(...this.computeDiff(fromValue as Record<string, unknown>, toValue as Record<string, unknown>, path));
      } else if (Array.isArray(fromValue) && Array.isArray(toValue)) {
        if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
          changes.push({ path, kind: 'modified', fromValue, toValue });
        }
      } else {
        changes.push({ path, kind: 'modified', fromValue, toValue });
      }
    }
    return changes;
  }
}
