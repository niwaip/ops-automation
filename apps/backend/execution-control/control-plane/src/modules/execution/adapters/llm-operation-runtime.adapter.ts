import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../../config/service-endpoints';

export interface LlmOperationInvokeParams {
  executionId: string;
  stepId: string;
  operationId: string;
  promptTemplateId: string;
  promptTemplateVersion: string;
  modelPolicyId: string;
  input: Record<string, any>;
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

@Injectable()
export class LlmOperationRuntimeAdapter {
  private readonly logger = new Logger(LlmOperationRuntimeAdapter.name);
  private static readonly DEFAULT_TIMEOUT_MS = 180000;
  private static readonly MIN_TIMEOUT_MS = 60000;
  private static readonly MAX_TIMEOUT_MS = 300000;

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
    const url = `${this.getOrchestratorUrl()}/ai/operations/execute`;
    const timeoutMs = this.getRequestTimeoutMs();
    try {
      this.logger.log(
        `Invoking LLM Operation '${params.operationId}' at ${url} with timeout ${timeoutMs}ms`,
      );
      const response = await axios.post<LlmOperationInvokeResult>(url, params, {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service': 'control-plane',
        },
      });
      return response.data;
    } catch (error: any) {
      const errMsg =
        error.code === 'ECONNABORTED'
          ? `LLM operation '${params.operationId}' exceeded timeout policy (${timeoutMs}ms)`
          : error.response?.data?.message || error.message || 'LLM operation request failed';
      this.logger.error(`LLM operation execution failed for ${params.operationId}: ${errMsg}`);
      return {
        success: false,
        operationId: params.operationId,
        templateVersion: params.promptTemplateVersion,
        output: {},
        errorMessage: errMsg,
      };
    }
  }
}
