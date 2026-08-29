import { Injectable, Logger, Inject } from '@nestjs/common';
import { LLM_OPERATION_REPOSITORY } from '../registry/llm-operation.repository';
import type { LlmOperationRepository } from '../registry/llm-operation.repository';
import type { LlmOperationInvocationRecord } from '../registry/types';

export interface InvocationRecord {
  versionId: string;
  executionId?: string;
  stepId?: string;
  tenantId?: string;
  provider: string;
  requestedModel: string;
  resolvedModel?: string;
  inputDigest?: string;
  outputDigest?: string;
  idempotencyKey?: string;
  resultJson?: Record<string, unknown>;
  inputStorageRef?: string;
  outputStorageRef?: string;
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  latencyMs?: number;
  estimatedCost?: number;
  parseAttempts: number;
  repairAttempts: number;
  validationResult: 'passed' | 'failed' | 'skipped';
  finishReason?: string;
  errorCode?: string;
  actor: string;
  environment: string;
  startedAt: Date;
  completedAt?: Date;
}

@Injectable()
export class LlmOperationAuditService {
  constructor(
    @Inject(LLM_OPERATION_REPOSITORY)
    private readonly repository: LlmOperationRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * 记录一次 LLM Operation 调用
   * 失败时只 warn，不影响主调用流程（audit 是 best-effort）
   */
  public async recordInvocation(params: InvocationRecord): Promise<void> {
    try {
      await this.repository.insertInvocation({
        versionId: params.versionId,
        executionId: params.executionId,
        stepId: params.stepId,
        tenantId: params.tenantId,
        provider: params.provider,
        requestedModel: params.requestedModel,
        resolvedModel: params.resolvedModel,
        inputDigest: params.inputDigest,
        outputDigest: params.outputDigest,
        idempotencyKey: params.idempotencyKey,
        resultJson: params.resultJson,
        inputStorageRef: params.inputStorageRef,
        outputStorageRef: params.outputStorageRef,
        tokenUsage: params.tokenUsage,
        latencyMs: params.latencyMs,
        estimatedCost: params.estimatedCost,
        parseAttempts: params.parseAttempts,
        repairAttempts: params.repairAttempts,
        validationResult: params.validationResult,
        finishReason: params.finishReason,
        errorCode: params.errorCode,
        actor: params.actor,
        environment: params.environment,
        startedAt: params.startedAt,
        completedAt: params.completedAt,
      });
    } catch (err: any) {
      this.logger.warn(
        `LLM_OPERATION_AUDIT_FAILED: Failed to record invocation for version ${params.versionId}: ${err.message}`,
      );
    }
  }

  /** 返回同一不可变版本下已经完整落盘的成功结果。 */
  public async findCompletedByIdempotencyKey(
    versionId: string,
    idempotencyKey?: string,
  ): Promise<LlmOperationInvocationRecord | null> {
    if (!idempotencyKey) return null;
    const invocation = await this.repository.findInvocationByVersionAndIdempotencyKey(
      versionId,
      idempotencyKey,
    );
    return invocation?.validationResult === 'passed' && invocation.resultJson
      ? invocation
      : null;
  }

  /** 查询某 execution 的所有 invocation */
  public async listByExecution(executionId: string): Promise<LlmOperationInvocationRecord[]> {
    return this.repository.listInvocationsByExecution(executionId);
  }

  /** 查询某 version 的最近 N 条 invocation */
  public async listByVersion(
    versionId: string,
    limit?: number,
  ): Promise<LlmOperationInvocationRecord[]> {
    return this.repository.listInvocationsByVersion(versionId, limit);
  }
}
