import type { LlmOperationV2Result, ExecuteLlmOperationV2Request } from '../runtime/v2-runtime-types';

export interface GenAiAttributes {
  'gen_ai.system': string;
  'gen_ai.request.model': string;
  'gen_ai.response.model'?: string;
  'gen_ai.request.max_tokens'?: number;
  'gen_ai.request.temperature'?: number;
  'gen_ai.usage.input_tokens'?: number;
  'gen_ai.usage.output_tokens'?: number;
  'gen_ai.usage.total_tokens'?: number;
  'gen_ai.response.finish_reasons'?: string[];
  'gen_ai.operation.name': string;
  'llm.operation.id': string;
  'llm.operation.version': string;
  'llm.operation.digest': string;
  'llm.operation.source': 'database' | 'legacy_registry';
  'llm.operation.error_code'?: string;
  'llm.operation.repair_attempts'?: number;
  'llm.operation.tool_call_detected'?: boolean;
  'llm.operation.latency_ms'?: number;
}

export function buildGenAiAttributes(params: {
  result: LlmOperationV2Result;
  request: ExecuteLlmOperationV2Request;
  resolvedModel: string;
}): GenAiAttributes {
  const { result, resolvedModel } = params;

  const attrs: GenAiAttributes = {
    'gen_ai.system': result.metadata.provider,
    'gen_ai.request.model': result.metadata.requestedModel,
    'gen_ai.response.model': resolvedModel,
    'gen_ai.operation.name': 'llm_operation',
    'llm.operation.id': result.operationRef.id,
    'llm.operation.version': result.operationRef.version,
    'llm.operation.digest': result.operationRef.digest,
    'llm.operation.source': result.source,
    'llm.operation.repair_attempts': result.metadata.repairAttempts,
    'llm.operation.tool_call_detected': result.metadata.toolCallDetected,
    'llm.operation.latency_ms': result.metadata.latencyMs,
  };

  if (result.usage.inputTokens !== undefined) {
    attrs['gen_ai.usage.input_tokens'] = result.usage.inputTokens;
  }
  if (result.usage.outputTokens !== undefined) {
    attrs['gen_ai.usage.output_tokens'] = result.usage.outputTokens;
  }
  if (result.usage.totalTokens !== undefined) {
    attrs['gen_ai.usage.total_tokens'] = result.usage.totalTokens;
  }
  if (result.metadata.finishReason) {
    attrs['gen_ai.response.finish_reasons'] = [result.metadata.finishReason];
  }
  if (result.errorCode) {
    attrs['llm.operation.error_code'] = result.errorCode;
  }

  return attrs;
}

export function buildSpanName(params: { operationId: string; version: string }): string {
  return `llm_operation.${params.operationId}.${params.version}`;
}
