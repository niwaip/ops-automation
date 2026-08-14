import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../../config/service-endpoints';

export interface LlmOperationInvokeParams {
  executionId: string;
  stepId: string;
  planHash?: string;
  operationId: string;
  operationVersion: string;
  operationDigest: string;
  contractDigest: string;
  environment?: string;
  input: Record<string, any>;
  idempotencyKey?: string;
  promptTemplateId?: string;
  promptTemplateVersion?: string;
  modelPolicyId?: string;
}

export interface LlmOperationInvokeResult {
  success: boolean;
  operationId: string;
  templateVersion: string;
  output: Record<string, any>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  errorMessage?: string;
}

interface LlmOperationRuntimeV2Response {
  success: boolean;
  operationRef: { id: string; version: string; digest: string };
  source: 'database' | 'legacy_registry';
  data?: Record<string, any>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  errorMessage?: string;
}

@Injectable()
export class LlmOperationRuntimeAdapter {
  private readonly logger = new Logger(LlmOperationRuntimeAdapter.name);
  private static readonly DEFAULT_TIMEOUT_MS = 300000;
  private static readonly MIN_TIMEOUT_MS = 60000;
  private static readonly MAX_TIMEOUT_MS = 600000;

  private getOrchestratorUrl(): string {
    return getAiOrchestratorUrl();
  }

  private getRequestTimeoutMs(): number {
    const configuredTimeout = Number(process.env.LLM_OPERATION_TIMEOUT_MS);
    if (!Number.isFinite(configuredTimeout)) {
      return LlmOperationRuntimeAdapter.DEFAULT_TIMEOUT_MS;
    }

    return Math.min(
      Math.max(
        Math.trunc(configuredTimeout),
        LlmOperationRuntimeAdapter.MIN_TIMEOUT_MS,
      ),
      LlmOperationRuntimeAdapter.MAX_TIMEOUT_MS,
    );
  }

  public async executeOperation(params: LlmOperationInvokeParams): Promise<LlmOperationInvokeResult> {
    if (!params.operationVersion || !params.operationDigest || !params.contractDigest) {
      throw new Error(
        `Frozen plan must pin operationVersion, operationDigest, contractDigest for operation '${params.operationId}'`
      );
    }

    const url = `${this.getOrchestratorUrl()}/ai/operations/v2/execute`;
    const timeoutMs = this.getRequestTimeoutMs();

    try {
      this.logger.log(
        `Invoking LLM Operation '${params.operationId}' v${params.operationVersion} at ${url} with timeout ${timeoutMs}ms`,
      );

      const request = {
        executionId: params.executionId,
        stepId: params.stepId,
        planHash: params.planHash,
        operationId: params.operationId,
        operationVersion: params.operationVersion,
        operationDigest: params.operationDigest,
        contractDigest: params.contractDigest,
        environment: params.environment ?? 'production',
        input: params.input,
        idempotencyKey: params.idempotencyKey ?? `${params.executionId}:${params.stepId}`,
      };

      const response = await axios.post<LlmOperationRuntimeV2Response>(url, request, {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service': 'control-plane',
        },
      });
      const runtimeResult = response.data;
      return {
        success: runtimeResult.success,
        operationId: runtimeResult.operationRef?.id || params.operationId,
        templateVersion: runtimeResult.operationRef?.version || params.operationVersion,
        output: runtimeResult.data || {},
        usage: runtimeResult.usage
          ? {
              promptTokens: runtimeResult.usage.inputTokens || 0,
              completionTokens: runtimeResult.usage.outputTokens || 0,
              totalTokens: runtimeResult.usage.totalTokens || 0,
            }
          : undefined,
        errorMessage: runtimeResult.errorMessage,
      };
    } catch (error: any) {
      const errMsg =
        error.code === 'ECONNABORTED'
          ? `LLM operation '${params.operationId}' exceeded timeout policy (${timeoutMs}ms)`
          : error.response?.data?.message || error.message || 'LLM operation request failed';
      this.logger.error(`LLM operation execution failed for ${params.operationId}: ${errMsg}`);
      return {
        success: false,
        operationId: params.operationId,
        templateVersion: params.operationVersion,
        output: {},
        errorMessage: errMsg,
      };
    }
  }
}
