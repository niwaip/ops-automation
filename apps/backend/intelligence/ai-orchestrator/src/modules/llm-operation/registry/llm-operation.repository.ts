import { InjectionToken } from '@nestjs/common';
import {
  LlmOperationRecord,
  LlmOperationVersionRecord,
  LlmOperationActivationRecord,
  LlmOperationActivationEventRecord,
  LlmOperationVersionState,
  Environment,
  ActivationLabel,
  LlmOperationInvocationRecord,
  LlmOperationEvalSuiteRecord,
  LlmOperationEvalCaseRecord,
  LlmOperationEvalRunRecord,
  LlmOperationAttestationRecord,
} from './types';

export interface LlmOperationRepository {
  findOperationByKey(operationKey: string): Promise<LlmOperationRecord | null>;
  findOperationById(id: string): Promise<LlmOperationRecord | null>;
  listOperations(): Promise<LlmOperationRecord[]>;
  upsertOperationByKey(
    operationKey: string,
    data: Omit<LlmOperationRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<LlmOperationRecord>;

  findVersionByOperationIdAndVersion(
    operationId: string,
    version: string,
  ): Promise<LlmOperationVersionRecord | null>;
  findVersionById(id: string): Promise<LlmOperationVersionRecord | null>;
  findApprovedVersionByOperationKeyAndVersion(
    operationKey: string,
    version: string,
  ): Promise<LlmOperationVersionRecord | null>;
  listVersionsByOperationId(operationId: string): Promise<LlmOperationVersionRecord[]>;
  insertVersion(
    record: Omit<LlmOperationVersionRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<LlmOperationVersionRecord>;
  updateVersionState(
    id: string,
    state: LlmOperationVersionState,
    approvedBy?: string,
  ): Promise<LlmOperationVersionRecord>;

  updateVersion(
    id: string,
    data: {
      state?: LlmOperationVersionState;
      manifestJson?: Record<string, unknown>;
      operationDigest?: string;
      contractDigest?: string;
      changeSummary?: string;
      approvedBy?: string;
    },
  ): Promise<LlmOperationVersionRecord>;

  findActivationByOperationAndEnv(
    operationId: string,
    environment: Environment,
  ): Promise<LlmOperationActivationRecord | null>;
  upsertActivation(
    operationId: string,
    versionId: string,
    environment: Environment,
    activatedBy: string,
    reason: string,
    label?: ActivationLabel,
    rolloutPercent?: number,
  ): Promise<LlmOperationActivationRecord>;
  insertActivationEvent(
    event: Omit<LlmOperationActivationEventRecord, 'id' | 'createdAt'>,
  ): Promise<LlmOperationActivationEventRecord>;
  listActivationEvents(
    operationId: string,
    limit: number,
    environment?: Environment,
  ): Promise<LlmOperationActivationEventRecord[]>;

  insertInvocation(
    record: Omit<LlmOperationInvocationRecord, 'id'>,
  ): Promise<LlmOperationInvocationRecord>;
  findInvocationByVersionAndIdempotencyKey(
    versionId: string,
    idempotencyKey: string,
  ): Promise<LlmOperationInvocationRecord | null>;
  listInvocationsByExecution(executionId: string): Promise<LlmOperationInvocationRecord[]>;
  listInvocationsByVersion(
    versionId: string,
    limit?: number,
  ): Promise<LlmOperationInvocationRecord[]>;

  insertAttestation(
    record: Omit<LlmOperationAttestationRecord, 'id' | 'createdAt'>,
  ): Promise<LlmOperationAttestationRecord>;
  findLatestAttestationForVersion(
    versionId: string,
  ): Promise<LlmOperationAttestationRecord | null>;
  findAttestationById(id: string): Promise<LlmOperationAttestationRecord | null>;
  listAttestationsByVersionId(versionId: string): Promise<LlmOperationAttestationRecord[]>;

  findEvalSuite(suiteId: string): Promise<LlmOperationEvalSuiteRecord | null>;
  findEvalSuiteForVersion(
    operationId: string,
    versionId: string,
  ): Promise<LlmOperationEvalSuiteRecord | null>;
  findEvalCasesBySuiteId(suiteId: string): Promise<LlmOperationEvalCaseRecord[]>;

  insertEvalRun(record: Omit<LlmOperationEvalRunRecord, 'id'>): Promise<LlmOperationEvalRunRecord>;
  updateEvalRun(
    runId: string,
    data: Partial<Omit<LlmOperationEvalRunRecord, 'id' | 'startedAt'>>,
  ): Promise<LlmOperationEvalRunRecord>;
  findEvalRunById(runId: string): Promise<LlmOperationEvalRunRecord | null>;
  listEvalRunsByVersionId(versionId: string): Promise<LlmOperationEvalRunRecord[]>;
}

export const LLM_OPERATION_REPOSITORY: InjectionToken = 'LlmOperationRepository';
