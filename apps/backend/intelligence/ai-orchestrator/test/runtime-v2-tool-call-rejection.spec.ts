import { LlmOperationV2RuntimeService } from '../src/modules/llm-operation/runtime/llm-operation-v2-runtime.service';
import { LlmOperationRegistryService } from '../src/modules/llm-operation/registry/llm-operation-registry.service';
import { ModelService } from '../src/modules/model/model.service';
import { PromptRendererService } from '../src/modules/llm-operation/runtime/prompt-renderer.service';
import { InputValidatorService } from '../src/modules/llm-operation/runtime/input-validator.service';
import { ToolCallGuardService } from '../src/modules/llm-operation/runtime/tool-call-guard.service';
import { OutputValidatorService } from '../src/modules/llm-operation/runtime/output-validator.service';
import { BudgetEnforcerService } from '../src/modules/llm-operation/runtime/budget-enforcer.service';
import { LlmOperationAuditService } from '../src/modules/llm-operation/audit/llm-operation-audit.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../src/modules/llm-operation/registry/errors';
import { PromptDebugSettingsService } from '../src/modules/debug-settings/prompt-debug-settings.service';

/**
 * Phase 2-β — V2 Runtime Tool Call Rejection (fail-closed)
 *
 * Tests that V2 runtime rejects tool_calls unconditionally. Tool calls are
 * forbidden in V2 operations (executionPolicy.tools must be 'disabled'), and
 * the runtime enforces this by throwing TOOL_CALL_FORBIDDEN.
 */
describe('Runtime V2 Tool Call Rejection (P2-β)', () => {
  function buildVersionRecord(manifestJson: Record<string, unknown>) {
    return {
      version: 'v1',
      operationDigest: 'test-digest',
      contractDigest: 'test-contract',
      state: 'approved',
      manifestJson,
    };
  }

  function createRuntime() {
    const registry = {
      resolveActiveVersion: jest.fn(),
      resolveExactVersion: jest.fn(),
    };
    const modelService = {
      getPreferredDefaultModel: jest.fn(),
      callModel: jest.fn(),
    };
    const promptRenderer = {
      renderManifestPrompt: jest.fn().mockReturnValue({
        systemPrompt: 'test system',
        userPrompt: 'test user',
      }),
    };
    const inputValidator = { validate: jest.fn() };
    const toolCallGuard = new ToolCallGuardService();
    const outputValidator = {
      parseAndValidate: jest.fn(),
      buildRepairPrompt: jest.fn(),
    };
    const budgetEnforcer = {
      preflightInput: jest.fn(),
      prepareInput: jest.fn((input: Record<string, unknown>) => input),
      assertOutputWithinBudget: jest.fn(),
      assertLatencyWithinBudget: jest.fn(),
    };
    const auditService = {
      recordInvocation: jest.fn().mockResolvedValue(undefined),
      findCompletedByIdempotencyKey: jest.fn().mockResolvedValue(null),
    };

    const runtime = new LlmOperationV2RuntimeService(
      registry as any,
      modelService as any,
      { call: modelService.callModel } as any,
      promptRenderer as any,
      inputValidator as any,
      toolCallGuard,
      outputValidator as any,
      budgetEnforcer as any,
      auditService as any,
      new Logger(LlmOperationV2RuntimeService.name),
      new PromptDebugSettingsService(),
    );

    return { runtime, registry, modelService, outputValidator };
  }

  describe('tool_calls detection and rejection', () => {
    it('rejects OpenAI-style tool_calls', async () => {
      const { runtime, registry, modelService } = createRuntime();

      registry.resolveExactVersion.mockResolvedValue(
        buildVersionRecord({
          executionPolicy: { tools: 'disabled' },
          inputSchema: { type: 'object', properties: { items: { type: 'array' } } },
          outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
        }),
      );

      modelService.getPreferredDefaultModel.mockReturnValue({
        id: 'model-1',
        name: 'test-model',
        provider: 'openai',
      });

      modelService.callModel.mockResolvedValue({
        content: '{"summary": "test"}',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query": "test"}' },
          },
        ],
      });

      const request = {
        operationId: 'summarize_list',
        operationVersion: 'v1',
        input: { items: ['a', 'b'] },
      };

      const result = await runtime.execute(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(LLM_OPERATION_ERROR_CODES.TOOL_CALL_FORBIDDEN);
      expect(result.errorMessage).toContain('Tool call detected and forbidden');
      expect(result.metadata?.toolCallDetected).toBe(false);
    });

    it('rejects legacy function_call', async () => {
      const { runtime, registry, modelService } = createRuntime();

      registry.resolveExactVersion.mockResolvedValue(
        buildVersionRecord({
          executionPolicy: { tools: 'disabled' },
          inputSchema: { type: 'object', properties: {} },
          outputSchema: { type: 'object', properties: {} },
        }),
      );

      modelService.getPreferredDefaultModel.mockReturnValue({
        id: 'model-1',
        name: 'test-model',
        provider: 'openai',
      });

      modelService.callModel.mockResolvedValue({
        content: '',
        function_call: { name: 'read_file', arguments: '{"path": "/etc/passwd"}' },
      });

      const request = {
        operationId: 'test_op',
        operationVersion: 'v1',
        input: {},
      };

      const result = await runtime.execute(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(LLM_OPERATION_ERROR_CODES.TOOL_CALL_FORBIDDEN);
      expect(result.errorMessage).toContain('Tool call detected and forbidden');
    });

    it('rejects XML-style <tool_use> tags in content', async () => {
      const { runtime, registry, modelService } = createRuntime();

      registry.resolveExactVersion.mockResolvedValue(
        buildVersionRecord({
          executionPolicy: { tools: 'disabled' },
          inputSchema: { type: 'object', properties: {} },
          outputSchema: { type: 'object', properties: {} },
        }),
      );

      modelService.getPreferredDefaultModel.mockReturnValue({
        id: 'model-1',
        name: 'test-model',
        provider: 'anthropic',
      });

      modelService.callModel.mockResolvedValue({
        content: '<tool_use name="execute_command"><args>{"cmd": "ls -la"}</args></tool_use>',
      });

      const request = {
        operationId: 'test_op',
        operationVersion: 'v1',
        input: {},
      };

      const result = await runtime.execute(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(LLM_OPERATION_ERROR_CODES.TOOL_CALL_FORBIDDEN);
    });
  });

  describe('no repair path for tool_calls', () => {
    it('never enters repair loop when tool_call detected', async () => {
      const { runtime, registry, modelService, outputValidator } = createRuntime();

      registry.resolveExactVersion.mockResolvedValue(
        buildVersionRecord({
          executionPolicy: { tools: 'disabled' },
          repair: { maxAttempts: 3 },
          inputSchema: { type: 'object', properties: {} },
          outputSchema: { type: 'object', properties: {} },
        }),
      );

      modelService.getPreferredDefaultModel.mockReturnValue({
        id: 'model-1',
        name: 'test-model',
        provider: 'openai',
      });

      modelService.callModel.mockResolvedValue({
        content: '',
        tool_calls: [{ function: { name: 'web_search', arguments: '{}' } }],
      });

      outputValidator.buildRepairPrompt.mockReturnValue('repair prompt');

      const request = {
        operationId: 'test_op',
        operationVersion: 'v1',
        input: {},
      };

      const result = await runtime.execute(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(LLM_OPERATION_ERROR_CODES.TOOL_CALL_FORBIDDEN);
      expect(result.metadata?.repairAttempts).toBe(0);
      expect(modelService.callModel).toHaveBeenCalledTimes(1);
      expect(outputValidator.buildRepairPrompt).not.toHaveBeenCalled();
    });
  });
});
import { Logger } from '@nestjs/common';
