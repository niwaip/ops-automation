import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LlmOperationRepository,
} from './llm-operation.repository';
import {
  LlmOperationRecord,
  LlmOperationVersionRecord,
  LlmOperationActivationRecord,
  LlmOperationActivationEventRecord,
  LlmOperationVersionState,
  Environment,
  ActivationLabel,
  LlmOperationInvocationRecord,
  LlmOperationAttestationRecord,
  LlmOperationEvalSuiteRecord,
  LlmOperationEvalCaseRecord,
  LlmOperationEvalRunRecord,
} from './types';

@Injectable()
export class PrismaLlmOperationRepository implements LlmOperationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOperationByKey(operationKey: string): Promise<LlmOperationRecord | null> {
    const row = await this.prisma.llmOperation.findUnique({
      where: { operationKey },
    });
    return row ? this.mapOperationToRecord(row) : null;
  }

  async findOperationById(id: string): Promise<LlmOperationRecord | null> {
    const row = await this.prisma.llmOperation.findUnique({
      where: { id },
    });
    return row ? this.mapOperationToRecord(row) : null;
  }

  async listOperations(): Promise<LlmOperationRecord[]> {
    const rows = await this.prisma.llmOperation.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.mapOperationToRecord(row));
  }

  async upsertOperationByKey(
    operationKey: string,
    data: Omit<LlmOperationRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<LlmOperationRecord> {
    const row = await this.prisma.llmOperation.upsert({
      where: { operationKey },
      create: {
        operationKey: data.operationKey,
        displayName: data.displayName,
        description: data.description,
        owner: data.owner,
        status: data.status,
        source: data.source,
      },
      update: {},
    });
    return this.mapOperationToRecord(row);
  }

  async findVersionByOperationIdAndVersion(
    operationId: string,
    version: string,
  ): Promise<LlmOperationVersionRecord | null> {
    const row = await this.prisma.llmOperationVersion.findUnique({
      where: {
        operationId_version: {
          operationId,
          version,
        },
      },
    });
    return row ? this.mapVersionToRecord(row) : null;
  }

  async findVersionById(id: string): Promise<LlmOperationVersionRecord | null> {
    const row = await this.prisma.llmOperationVersion.findUnique({
      where: { id },
    });
    return row ? this.mapVersionToRecord(row) : null;
  }

  async findApprovedVersionByOperationKeyAndVersion(
    operationKey: string,
    version: string,
  ): Promise<LlmOperationVersionRecord | null> {
    const operation = await this.findOperationByKey(operationKey);
    if (!operation) return null;

    const versionRecord = await this.findVersionByOperationIdAndVersion(
      operation.id,
      version,
    );
    return versionRecord && versionRecord.state === 'approved' ? versionRecord : null;
  }

  async listVersionsByOperationId(operationId: string): Promise<LlmOperationVersionRecord[]> {
    const rows = await this.prisma.llmOperationVersion.findMany({
      where: { operationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapVersionToRecord(row));
  }

  async insertVersion(
    record: Omit<LlmOperationVersionRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<LlmOperationVersionRecord> {
    const row = await this.prisma.llmOperationVersion.create({
      data: {
        operationId: record.operationId,
        version: record.version,
        state: record.state,
        manifestJson: record.manifestJson as any,
        operationDigest: record.operationDigest,
        contractDigest: record.contractDigest,
        changeSummary: record.changeSummary,
        source: record.source,
        approvedBy: record.approvedBy,
        approvedAt: record.approvedAt,
        createdBy: record.createdBy,
      },
    });
    return this.mapVersionToRecord(row);
  }

  async updateVersionState(
    id: string,
    state: LlmOperationVersionState,
    approvedBy?: string,
  ): Promise<LlmOperationVersionRecord> {
    const row = await this.prisma.llmOperationVersion.update({
      where: { id },
      data: {
        state,
        approvedBy,
        approvedAt: approvedBy ? new Date() : null,
      },
    });
    return this.mapVersionToRecord(row);
  }

  async updateVersion(
    id: string,
    data: {
      state?: LlmOperationVersionState;
      manifestJson?: Record<string, unknown>;
      operationDigest?: string;
      contractDigest?: string;
      changeSummary?: string;
      approvedBy?: string;
    },
  ): Promise<LlmOperationVersionRecord> {
    const row = await this.prisma.llmOperationVersion.update({
      where: { id },
      data: {
        ...(data.state !== undefined && { state: data.state }),
        ...(data.manifestJson !== undefined && { manifestJson: data.manifestJson as any }),
        ...(data.operationDigest !== undefined && { operationDigest: data.operationDigest }),
        ...(data.contractDigest !== undefined && { contractDigest: data.contractDigest }),
        ...(data.changeSummary !== undefined && { changeSummary: data.changeSummary }),
        ...(data.approvedBy !== undefined && {
          approvedBy: data.approvedBy,
          approvedAt: data.approvedBy ? new Date() : null,
        }),
      },
    });
    return this.mapVersionToRecord(row);
  }

  async findActivationByOperationAndEnv(
    operationId: string,
    environment: Environment,
  ): Promise<LlmOperationActivationRecord | null> {
    const row = await this.prisma.llmOperationActivation.findUnique({
      where: {
        operationId_environment: {
          operationId,
          environment,
        },
      },
    });
    return row ? this.mapActivationToRecord(row) : null;
  }

  async upsertActivation(
    operationId: string,
    versionId: string,
    environment: Environment,
    activatedBy: string,
    reason: string,
    label?: ActivationLabel,
    rolloutPercent?: number,
  ): Promise<LlmOperationActivationRecord> {
    const row = await this.prisma.llmOperationActivation.upsert({
      where: {
        operationId_environment: {
          operationId,
          environment,
        },
      },
      create: {
        operationId,
        versionId,
        environment,
        label,
        activatedBy,
        reason,
        rolloutPercent,
      },
      update: {
        versionId,
        label,
        activatedBy,
        reason,
        rolloutPercent,
      },
    });
    return this.mapActivationToRecord(row);
  }

  async insertActivationEvent(
    event: Omit<LlmOperationActivationEventRecord, 'id' | 'createdAt'>,
  ): Promise<LlmOperationActivationEventRecord> {
    const row = await this.prisma.llmOperationActivationEvent.create({
      data: {
        operationId: event.operationId,
        previousVersionId: event.previousVersionId,
        newVersionId: event.newVersionId,
        environment: event.environment,
        action: event.action,
        actor: event.actor,
        reason: event.reason,
        metadataJson: event.metadataJson as any,
      },
    });
    return this.mapActivationEventToRecord(row);
  }

  async listActivationEvents(
    operationId: string,
    limit: number,
    environment?: Environment,
  ): Promise<LlmOperationActivationEventRecord[]> {
    const rows = await this.prisma.llmOperationActivationEvent.findMany({
      where: { operationId, ...(environment ? { environment } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.mapActivationEventToRecord(row));
  }

  async insertInvocation(
    record: Omit<LlmOperationInvocationRecord, 'id'>,
  ): Promise<LlmOperationInvocationRecord> {
    const row = await this.prisma.llmOperationInvocation.create({
      data: {
        versionId: record.versionId,
        executionId: record.executionId,
        stepId: record.stepId,
        tenantId: record.tenantId,
        provider: record.provider,
        requestedModel: record.requestedModel,
        resolvedModel: record.resolvedModel,
        inputDigest: record.inputDigest,
        outputDigest: record.outputDigest,
        idempotencyKey: record.idempotencyKey,
        resultJson: record.resultJson as any,
        inputStorageRef: record.inputStorageRef,
        outputStorageRef: record.outputStorageRef,
        tokenUsageJson: record.tokenUsage as any,
        latencyMs: record.latencyMs,
        estimatedCost: record.estimatedCost,
        parseAttempts: record.parseAttempts,
        repairAttempts: record.repairAttempts,
        validationResult: record.validationResult,
        finishReason: record.finishReason,
        errorCode: record.errorCode,
        actor: record.actor,
        environment: record.environment,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
      },
    });
    return this.mapInvocationToRecord(row);
  }

  async findInvocationByVersionAndIdempotencyKey(
    versionId: string,
    idempotencyKey?: string,
  ): Promise<LlmOperationInvocationRecord | null> {
    if (!idempotencyKey) return null;
    const row = await this.prisma.llmOperationInvocation.findUnique({
      where: {
        versionId_idempotencyKey: { versionId, idempotencyKey },
      },
    });
    return row ? this.mapInvocationToRecord(row) : null;
  }

  async listInvocationsByExecution(executionId: string): Promise<LlmOperationInvocationRecord[]> {
    const rows = await this.prisma.llmOperationInvocation.findMany({
      where: { executionId },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map((row) => this.mapInvocationToRecord(row));
  }

  async listInvocationsByVersion(
    versionId: string,
    limit = 100,
  ): Promise<LlmOperationInvocationRecord[]> {
    const rows = await this.prisma.llmOperationInvocation.findMany({
      where: { versionId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.mapInvocationToRecord(row));
  }

  async insertAttestation(
    record: Omit<LlmOperationAttestationRecord, 'id' | 'createdAt'>,
  ): Promise<LlmOperationAttestationRecord> {
    const row = await this.prisma.llmOperationAttestation.create({
      data: {
        operationId: record.operationId,
        versionId: record.versionId,
        operationDigest: record.operationDigest,
        contractDigest: record.contractDigest,
        evalSuiteDigest: record.evalSuiteDigest,
        validatorVersion: record.validatorVersion,
        schemaTests: record.schemaTests,
        offlineEvals: record.offlineEvals,
        liveEvals: record.liveEvals,
        securityEvals: record.securityEvals,
        gateResultsJson: record.gateResultsJson as any,
        createdBy: record.createdBy,
      },
    });
    return this.mapAttestationToRecord(row);
  }

  async findLatestAttestationForVersion(
    versionId: string,
  ): Promise<LlmOperationAttestationRecord | null> {
    const row = await this.prisma.llmOperationAttestation.findFirst({
      where: { versionId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.mapAttestationToRecord(row) : null;
  }

  async findAttestationById(id: string): Promise<LlmOperationAttestationRecord | null> {
    const row = await this.prisma.llmOperationAttestation.findUnique({
      where: { id },
    });
    return row ? this.mapAttestationToRecord(row) : null;
  }

  async listAttestationsByVersionId(versionId: string): Promise<LlmOperationAttestationRecord[]> {
    const rows = await this.prisma.llmOperationAttestation.findMany({
      where: { versionId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapAttestationToRecord(row));
  }

  private mapOperationToRecord(row: any): LlmOperationRecord {
    return {
      id: row.id,
      operationKey: row.operationKey,
      displayName: row.displayName,
      description: row.description,
      owner: row.owner,
      status: row.status,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapVersionToRecord(row: any): LlmOperationVersionRecord {
    return {
      id: row.id,
      operationId: row.operationId,
      version: row.version,
      state: row.state,
      manifestJson: row.manifestJson,
      operationDigest: row.operationDigest,
      contractDigest: row.contractDigest,
      changeSummary: row.changeSummary,
      source: row.source,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapActivationToRecord(row: any): LlmOperationActivationRecord {
    return {
      id: row.id,
      operationId: row.operationId,
      versionId: row.versionId,
      environment: row.environment,
      label: row.label,
      activatedBy: row.activatedBy,
      reason: row.reason,
      rolloutPercent: row.rolloutPercent,
      activatedAt: row.activatedAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapActivationEventToRecord(row: any): LlmOperationActivationEventRecord {
    return {
      id: row.id,
      operationId: row.operationId,
      previousVersionId: row.previousVersionId,
      newVersionId: row.newVersionId,
      environment: row.environment,
      action: row.action,
      actor: row.actor,
      reason: row.reason,
      metadataJson: row.metadataJson,
      createdAt: row.createdAt,
    };
  }

  private mapInvocationToRecord(row: any): LlmOperationInvocationRecord {
    return {
      id: row.id,
      versionId: row.versionId,
      executionId: row.executionId,
      stepId: row.stepId,
      tenantId: row.tenantId,
      provider: row.provider,
      requestedModel: row.requestedModel,
      resolvedModel: row.resolvedModel,
      inputDigest: row.inputDigest,
      outputDigest: row.outputDigest,
      idempotencyKey: row.idempotencyKey,
      resultJson: row.resultJson,
      inputStorageRef: row.inputStorageRef,
      outputStorageRef: row.outputStorageRef,
      tokenUsage: row.tokenUsageJson,
      latencyMs: row.latencyMs,
      estimatedCost: row.estimatedCost,
      parseAttempts: row.parseAttempts,
      repairAttempts: row.repairAttempts,
      validationResult: row.validationResult,
      finishReason: row.finishReason,
      errorCode: row.errorCode,
      actor: row.actor,
      environment: row.environment,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    };
  }

  private mapAttestationToRecord(row: any): LlmOperationAttestationRecord {
    return {
      id: row.id,
      operationId: row.operationId,
      versionId: row.versionId,
      operationDigest: row.operationDigest,
      contractDigest: row.contractDigest,
      evalSuiteDigest: row.evalSuiteDigest,
      validatorVersion: row.validatorVersion,
      schemaTests: row.schemaTests,
      offlineEvals: row.offlineEvals,
      liveEvals: row.liveEvals,
      securityEvals: row.securityEvals,
      gateResultsJson: row.gateResultsJson,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  async findEvalSuite(suiteId: string): Promise<LlmOperationEvalSuiteRecord | null> {
    const row = await this.prisma.llmOperationEvalSuite.findUnique({
      where: { id: suiteId },
    });
    return row ? this.mapEvalSuiteToRecord(row) : null;
  }

  async findEvalSuiteForVersion(
    operationId: string,
    versionId: string,
  ): Promise<LlmOperationEvalSuiteRecord | null> {
    const exact = await this.prisma.llmOperationEvalSuite.findFirst({
      where: { operationId, versionId },
      orderBy: { createdAt: 'desc' },
    });
    if (exact) return this.mapEvalSuiteToRecord(exact);

    const shared = await this.prisma.llmOperationEvalSuite.findFirst({
      where: { operationId, versionId: null },
      orderBy: { createdAt: 'desc' },
    });
    return shared ? this.mapEvalSuiteToRecord(shared) : null;
  }

  async findEvalCasesBySuiteId(suiteId: string): Promise<LlmOperationEvalCaseRecord[]> {
    const rows = await this.prisma.llmOperationEvalCase.findMany({
      where: { suiteId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.mapEvalCaseToRecord(row));
  }

  async insertEvalRun(
    record: Omit<LlmOperationEvalRunRecord, 'id'>,
  ): Promise<LlmOperationEvalRunRecord> {
    const row = await this.prisma.llmOperationEvalRun.create({
      data: {
        versionId: record.versionId,
        suiteId: record.suiteId,
        modelPolicySnapshot: record.modelPolicySnapshot as any,
        resultsJson: record.resultsJson as any,
        metricsJson: record.metricsJson as any,
        baselineVersionId: record.baselineVersionId,
        executedBy: record.executedBy,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
      },
    });
    return this.mapEvalRunToRecord(row);
  }

  async updateEvalRun(
    runId: string,
    data: Partial<Omit<LlmOperationEvalRunRecord, 'id' | 'startedAt'>>,
  ): Promise<LlmOperationEvalRunRecord> {
    const row = await this.prisma.llmOperationEvalRun.update({
      where: { id: runId },
      data: {
        ...(data.modelPolicySnapshot !== undefined && {
          modelPolicySnapshot: data.modelPolicySnapshot as any,
        }),
        ...(data.resultsJson !== undefined && { resultsJson: data.resultsJson as any }),
        ...(data.metricsJson !== undefined && { metricsJson: data.metricsJson as any }),
        ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
      },
    });
    return this.mapEvalRunToRecord(row);
  }

  async findEvalRunById(runId: string): Promise<LlmOperationEvalRunRecord | null> {
    const row = await this.prisma.llmOperationEvalRun.findUnique({
      where: { id: runId },
    });
    return row ? this.mapEvalRunToRecord(row) : null;
  }

  async listEvalRunsByVersionId(versionId: string): Promise<LlmOperationEvalRunRecord[]> {
    const rows = await this.prisma.llmOperationEvalRun.findMany({
      where: { versionId },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map((row) => this.mapEvalRunToRecord(row));
  }

  private mapEvalSuiteToRecord(row: any): LlmOperationEvalSuiteRecord {
    return {
      id: row.id,
      operationId: row.operationId,
      versionId: row.versionId,
      name: row.name,
      description: row.description,
      suiteDigest: row.suiteDigest,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  private mapEvalCaseToRecord(row: any): LlmOperationEvalCaseRecord {
    return {
      id: row.id,
      suiteId: row.suiteId,
      name: row.name,
      inputJson: row.inputJson,
      expectedJson: row.expectedJson,
      isNegative: row.isNegative,
      errorContains: row.errorContains,
      createdAt: row.createdAt,
    };
  }

  private mapEvalRunToRecord(row: any): LlmOperationEvalRunRecord {
    return {
      id: row.id,
      versionId: row.versionId,
      suiteId: row.suiteId,
      modelPolicySnapshot: row.modelPolicySnapshot,
      resultsJson: row.resultsJson,
      metricsJson: row.metricsJson,
      baselineVersionId: row.baselineVersionId,
      executedBy: row.executedBy,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    };
  }
}
