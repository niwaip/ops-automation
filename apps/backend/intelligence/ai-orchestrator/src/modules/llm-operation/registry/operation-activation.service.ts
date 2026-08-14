import { Injectable, Logger, Inject } from '@nestjs/common';
import { LLM_OPERATION_REPOSITORY } from './llm-operation.repository';
import type { LlmOperationRepository } from './llm-operation.repository';
import type {
  LlmOperationRecord,
  LlmOperationVersionRecord,
  LlmOperationActivationRecord,
  LlmOperationActivationEventRecord,
  Environment,
  ActivationLabel,
} from './types';
import { OperationVersionPolicyService } from './operation-version-policy.service';
import { OperationDigestRecomputeService } from './operation-digest-recompute.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from './errors';

@Injectable()
export class OperationActivationService {
  constructor(
    @Inject(LLM_OPERATION_REPOSITORY)
    private readonly repository: LlmOperationRepository,
    private readonly versionPolicy: OperationVersionPolicyService,
    private readonly digestRecompute: OperationDigestRecomputeService,
    private readonly logger: Logger,
  ) {}

  public async activate(params: {
    operationKey: string;
    version: string;
    environment: Environment;
    actor: string;
    reason: string;
    label?: ActivationLabel;
    rolloutPercent?: number;
  }): Promise<LlmOperationActivationRecord> {
    const operation = await this.repository.findOperationByKey(params.operationKey);
    if (!operation) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.NOT_FOUND,
        `Operation not found: ${params.operationKey}`,
      );
    }

    const versionRecord = await this.repository.findVersionByOperationIdAndVersion(
      operation.id,
      params.version,
    );
    if (!versionRecord) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.VERSION_NOT_FOUND,
        `Version not found: ${params.operationKey}@${params.version}`,
      );
    }

    if (versionRecord.state !== 'approved') {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.ACTIVATION_FAILED,
        `Cannot activate version in state '${versionRecord.state}'`,
        { operationKey: params.operationKey, version: params.version, state: versionRecord.state },
      );
    }

    this.digestRecompute.assertDigestMatchesPersisted(versionRecord);

    const currentActivation = await this.repository.findActivationByOperationAndEnv(
      operation.id,
      params.environment,
    );

    const activation = await this.repository.upsertActivation(
      operation.id,
      versionRecord.id,
      params.environment,
      params.actor,
      params.reason,
      params.label,
      params.rolloutPercent,
    );

    await this.repository.insertActivationEvent({
      operationId: operation.id,
      previousVersionId: currentActivation?.versionId || null,
      newVersionId: versionRecord.id,
      environment: params.environment,
      action: 'activate',
      actor: params.actor,
      reason: params.reason,
      metadataJson: { label: params.label, rolloutPercent: params.rolloutPercent },
    });

    this.logger.log(
      `Activated ${params.operationKey}@${params.version} to ${params.environment} by ${params.actor}`,
      'OperationActivationService',
    );

    return activation;
  }

  public async rollback(params: {
    operationKey: string;
    environment: Environment;
    actor: string;
    reason: string;
  }): Promise<LlmOperationActivationRecord> {
    const operation = await this.repository.findOperationByKey(params.operationKey);
    if (!operation) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.NOT_FOUND,
        `Operation not found: ${params.operationKey}`,
      );
    }

    const currentActivation = await this.repository.findActivationByOperationAndEnv(
      operation.id,
      params.environment,
    );

    if (!currentActivation) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.NOT_ACTIVE,
        `No active version for ${params.operationKey} in ${params.environment}`,
      );
    }

    const events = await this.repository.listActivationEvents(
      operation.id,
      20,
      params.environment,
    );
    const currentPointerEvent = events.find(
      (event) =>
        event.newVersionId === currentActivation.versionId &&
        event.previousVersionId !== null &&
        event.previousVersionId !== currentActivation.versionId,
    );
    if (!currentPointerEvent) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.NOT_FOUND,
        `No rollback target for ${params.operationKey} in ${params.environment}`,
      );
    }

    const previousVersionId = currentPointerEvent.previousVersionId;
    if (!previousVersionId) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.NOT_FOUND,
        `No previous version ID in rollback event`,
      );
    }

    if (previousVersionId === currentActivation.versionId) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.INVALID_STATE_TRANSITION,
        `Rollback target is same as current version`,
        { operationKey: params.operationKey, versionId: currentActivation.versionId },
      );
    }

    const previousVersion = await this.repository.findVersionById(previousVersionId);
    if (!previousVersion) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.VERSION_NOT_FOUND,
        `Previous version not found: ${previousVersionId}`,
      );
    }

    const activation = await this.repository.upsertActivation(
      operation.id,
      previousVersionId,
      params.environment,
      params.actor,
      params.reason,
      currentActivation.label || undefined,
      currentActivation.rolloutPercent || undefined,
    );

    await this.repository.insertActivationEvent({
      operationId: operation.id,
      previousVersionId: currentActivation.versionId,
      newVersionId: previousVersionId,
      environment: params.environment,
      action: 'rollback',
      actor: params.actor,
      reason: params.reason,
      metadataJson: null,
    });

    this.logger.log(
      `Rolled back ${params.operationKey} in ${params.environment} to version ${previousVersion.version} by ${params.actor}`,
      'OperationActivationService',
    );

    return activation;
  }

  public async adjustCanary(params: {
    operationKey: string;
    environment: Environment;
    rolloutPercent: number;
    actor: string;
    reason: string;
  }): Promise<LlmOperationActivationRecord> {
    const operation = await this.repository.findOperationByKey(params.operationKey);
    if (!operation) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.NOT_FOUND,
        `Operation not found: ${params.operationKey}`,
      );
    }

    const currentActivation = await this.repository.findActivationByOperationAndEnv(
      operation.id,
      params.environment,
    );

    if (!currentActivation) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.NOT_ACTIVE,
        `No active version for ${params.operationKey} in ${params.environment}`,
      );
    }

    const activation = await this.repository.upsertActivation(
      operation.id,
      currentActivation.versionId,
      params.environment,
      params.actor,
      params.reason,
      currentActivation.label || undefined,
      params.rolloutPercent,
    );

    await this.repository.insertActivationEvent({
      operationId: operation.id,
      previousVersionId: currentActivation.versionId,
      newVersionId: currentActivation.versionId,
      environment: params.environment,
      action: 'canary_adjust',
      actor: params.actor,
      reason: params.reason,
      metadataJson: { rolloutPercent: params.rolloutPercent },
    });

    this.logger.log(
      `Adjusted canary for ${params.operationKey} in ${params.environment} to ${params.rolloutPercent}% by ${params.actor}`,
      'OperationActivationService',
    );

    return activation;
  }

  public async listHistory(
    operationKey: string,
    limit: number = 20,
  ): Promise<LlmOperationActivationEventRecord[]> {
    const operation = await this.repository.findOperationByKey(operationKey);
    if (!operation) {
      return [];
    }
    return this.repository.listActivationEvents(operation.id, limit);
  }

  public async resolveCurrent(operationKey: string, environment: Environment): Promise<{
    operation: LlmOperationRecord;
    version: LlmOperationVersionRecord;
    activation: LlmOperationActivationRecord;
  } | null> {
    const operation = await this.repository.findOperationByKey(operationKey);
    if (!operation) {
      return null;
    }

    const activation = await this.repository.findActivationByOperationAndEnv(
      operation.id,
      environment,
    );
    if (!activation) {
      return null;
    }

    const version = await this.repository.findVersionById(activation.versionId);
    if (!version) {
      return null;
    }

    return { operation, version, activation };
  }
}
