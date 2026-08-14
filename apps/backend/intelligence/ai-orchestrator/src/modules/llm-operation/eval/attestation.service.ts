import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LLM_OPERATION_REPOSITORY,
  type LlmOperationRepository,
} from '../registry/llm-operation.repository';
import type { LlmOperationAttestationRecord } from '../registry/types';
import type { FixtureRunSummary, EvalRunResult, OperationAttestation } from './types';
import { GateEvaluatorService } from './gate-evaluator.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../registry/errors';

@Injectable()
export class AttestationService {
  constructor(
    @Inject(LLM_OPERATION_REPOSITORY)
    private readonly repository: LlmOperationRepository,
    private readonly gateEvaluator: GateEvaluatorService,
    private readonly logger: Logger,
  ) {}

  public async generateAttestation(params: {
    operationId: string;
    versionId: string;
    fixtureResult: FixtureRunSummary;
    evalResult?: EvalRunResult;
    evalSuiteDigest?: string;
    actor?: string;
  }): Promise<OperationAttestation> {
    const version = await this.repository.findVersionById(params.versionId);
    if (!version) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.VERSION_NOT_FOUND,
        `Version not found: ${params.versionId}`,
      );
    }
    if (version.operationId !== params.operationId) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.ATTESTATION_INVALID,
        'Attestation operation and version do not match',
        {
          operationId: params.operationId,
          versionOperationId: version.operationId,
          versionId: params.versionId,
        },
      );
    }

    const evaluation = this.gateEvaluator.evaluate({
      fixtureResult: params.fixtureResult,
      evalResult: params.evalResult,
    });

    const allGates = ['schemaTests', 'offlineEvals', 'liveEvals', 'securityEvals'] as const;
    for (const gate of allGates) {
      if (evaluation.gateResults[gate] === 'failed') {
        throw new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.ATTESTATION_INVALID,
          `Gate '${gate}' failed`,
          { gateResults: evaluation.gateResults, violations: evaluation.violations },
        );
      }
      if (evaluation.gateResults[gate] === 'skipped') {
        throw new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.ATTESTATION_INVALID,
          `Gate '${gate}' skipped — all gates must be explicitly evaluated`,
          { gateResults: evaluation.gateResults, violations: evaluation.violations },
        );
      }
    }

    const record = await this.repository.insertAttestation({
      operationId: params.operationId,
      versionId: params.versionId,
      operationDigest: version.operationDigest,
      contractDigest: version.contractDigest,
      evalSuiteDigest: params.evalSuiteDigest || null,
      validatorVersion: '1.0.0',
      schemaTests: evaluation.gateResults.schemaTests,
      offlineEvals: evaluation.gateResults.offlineEvals,
      liveEvals: evaluation.gateResults.liveEvals,
      securityEvals: evaluation.gateResults.securityEvals,
      gateResultsJson: {
        gateResults: evaluation.gateResults,
        violations: evaluation.violations,
      },
      createdBy: params.actor || 'system',
    });

    this.logger.log(
      `Attestation ${record.id} generated for ${params.operationId}@${version.version}`,
    );

    return this.mapRecordToAttestation(record);
  }

  public async hasValidAttestation(versionId: string): Promise<boolean> {
    const [latest, version] = await Promise.all([
      this.repository.findLatestAttestationForVersion(versionId),
      this.repository.findVersionById(versionId),
    ]);
    if (!latest || !version) return false;

    return (
      latest.operationId === version.operationId &&
      latest.operationDigest === version.operationDigest &&
      latest.contractDigest === version.contractDigest &&
      latest.schemaTests === 'passed' &&
      latest.offlineEvals === 'passed' &&
      latest.liveEvals === 'passed' &&
      latest.securityEvals === 'passed'
    );
  }

  public async hasValidAttestationForVersion(operationKey: string, version: string): Promise<boolean> {
    const operation = await this.repository.findOperationByKey(operationKey);
    if (!operation) return false;

    const versionRecord = await this.repository.findApprovedVersionByOperationKeyAndVersion(operationKey, version);
    if (!versionRecord) return false;

    return this.hasValidAttestation(versionRecord.id);
  }

  public async getLatestAttestation(operationKey: string, version: string): Promise<OperationAttestation | null> {
    const operation = await this.repository.findOperationByKey(operationKey);
    if (!operation) return null;

    const versionRecord = await this.repository.findApprovedVersionByOperationKeyAndVersion(operationKey, version);
    if (!versionRecord) return null;

    const record = await this.repository.findLatestAttestationForVersion(versionRecord.id);
    return record ? this.mapRecordToAttestation(record) : null;
  }

  public async listAttestations(operationId: string): Promise<OperationAttestation[]> {
    const operation = await this.repository.findOperationById(operationId);
    if (!operation) return [];

    const versions = await this.repository.listVersionsByOperationId(operationId);
    const attestations: OperationAttestation[] = [];

    for (const version of versions) {
      const versionAttestations = await this.repository.listAttestationsByVersionId(version.id);
      for (const record of versionAttestations) {
        attestations.push(this.mapRecordToAttestation(record));
      }
    }

    return attestations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private mapRecordToAttestation(record: LlmOperationAttestationRecord): OperationAttestation {
    return {
      id: record.id,
      operationId: record.operationId,
      versionId: record.versionId,
      operationDigest: record.operationDigest,
      contractDigest: record.contractDigest,
      evalSuiteDigest: record.evalSuiteDigest || '',
      validatorVersion: record.validatorVersion,
      gateResults: {
        schemaTests: record.schemaTests,
        offlineEvals: record.offlineEvals,
        liveEvals: record.liveEvals,
        securityEvals: record.securityEvals,
      },
      createdAt: record.createdAt,
    };
  }
}
