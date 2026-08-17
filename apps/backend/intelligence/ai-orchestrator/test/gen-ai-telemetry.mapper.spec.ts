import { buildGenAiAttributes, buildSpanName } from '../src/modules/llm-operation/audit/gen-ai-telemetry.mapper';

describe('GenAiTelemetryMapper', () => {
  describe('buildGenAiAttributes', () => {
    it('should contain all required fields', () => {
      const result = {
        success: true,
        operationRef: { id: 'op-1', version: '1.0.0', digest: 'sha256:abc' },
        source: 'database' as const,
        data: { test: 'data' },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        metadata: {
          provider: 'openai',
          requestedModel: 'gpt-4',
          resolvedModel: 'gpt-4',
          finishReason: 'stop',
          repairAttempts: 0,
          latencyMs: 500,
          schemaValidated: true,
          toolCallDetected: false,
        },
      };

      const attrs = buildGenAiAttributes({
        result,
        request: { operationId: 'op-1' } as any,
        resolvedModel: 'gpt-4',
      });

      expect(attrs['gen_ai.system']).toBe('openai');
      expect(attrs['gen_ai.request.model']).toBe('gpt-4');
      expect(attrs['gen_ai.response.model']).toBe('gpt-4');
      expect(attrs['gen_ai.operation.name']).toBe('llm_operation');
      expect(attrs['llm.operation.id']).toBe('op-1');
      expect(attrs['llm.operation.version']).toBe('1.0.0');
      expect(attrs['llm.operation.digest']).toBe('sha256:abc');
      expect(attrs['llm.operation.source']).toBe('database');
      expect(attrs['gen_ai.usage.input_tokens']).toBe(100);
      expect(attrs['gen_ai.usage.output_tokens']).toBe(50);
      expect(attrs['gen_ai.usage.total_tokens']).toBe(150);
      expect(attrs['gen_ai.response.finish_reasons']).toEqual(['stop']);
      expect(attrs['llm.operation.latency_ms']).toBe(500);
    });

    it('should include error_code for failure result', () => {
      const result = {
        success: false,
        operationRef: { id: 'op-1', version: '1.0.0', digest: 'sha256:abc' },
        source: 'database' as const,
        usage: {},
        metadata: {
          provider: 'openai',
          requestedModel: 'gpt-4',
          repairAttempts: 0,
          latencyMs: 100,
          schemaValidated: false,
          toolCallDetected: false,
        },
        errorCode: 'SCHEMA_VIOLATION',
        errorMessage: 'Schema validation failed',
      };

      const attrs = buildGenAiAttributes({
        result,
        request: { operationId: 'op-1' } as any,
        resolvedModel: 'gpt-4',
      });

      expect(attrs['llm.operation.error_code']).toBe('SCHEMA_VIOLATION');
    });

    it('should not include error_code for success result', () => {
      const result = {
        success: true,
        operationRef: { id: 'op-1', version: '1.0.0', digest: 'sha256:abc' },
        source: 'database' as const,
        data: {},
        usage: {},
        metadata: {
          provider: 'openai',
          requestedModel: 'gpt-4',
          repairAttempts: 0,
          latencyMs: 100,
          schemaValidated: true,
          toolCallDetected: false,
        },
      };

      const attrs = buildGenAiAttributes({
        result,
        request: { operationId: 'op-1' } as any,
        resolvedModel: 'gpt-4',
      });

      expect(attrs['llm.operation.error_code']).toBeUndefined();
    });
  });

  describe('buildSpanName', () => {
    it('should format span name correctly', () => {
      const spanName = buildSpanName({
        operationId: 'summarize_list',
        version: '1.0.0',
      });

      expect(spanName).toBe('llm_operation.summarize_list.1.0.0');
    });
  });
});