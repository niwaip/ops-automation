import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
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

describe('LlmOperationV2RuntimeService', () => {
  let service: LlmOperationV2RuntimeService;
  let registry: jest.Mocked<LlmOperationRegistryService>;
  let modelService: jest.Mocked<ModelService>;
  let inputValidator: jest.Mocked<InputValidatorService>;
  let toolCallGuard: jest.Mocked<ToolCallGuardService>;
  let outputValidator: jest.Mocked<OutputValidatorService>;
  let budgetEnforcer: jest.Mocked<BudgetEnforcerService>;
  let auditService: jest.Mocked<LlmOperationAuditService>;

  const mockDbVersion = {
    id: 'ver-uuid-1',
    operationId: 'op-uuid-1',
    version: '1.0.0',
    state: 'approved' as const,
    manifestJson: {
      promptTemplateId: 'test',
      version: '1.0.0',
      modelPolicyId: 'default',
      temperature: 0,
      maxInputTokens: 4000,
      maxOutputTokens: 2000,
      timeoutMs: 30000,
      prompt: {
        systemTemplate: 'You are a helpful assistant.',
        userTemplate: 'Summarize: {{text}}',
      },
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' } },
      },
      outputSchema: {
        type: 'object',
        required: ['markdown_content'],
        properties: { markdown_content: { type: 'string' } },
      },
      executionPolicy: { tools: 'disabled' },
      repair: { maxAttempts: 1 },
    },
    operationDigest: 'sha256:abc123',
    contractDigest: 'sha256:def456',
    changeSummary: 'Initial',
    source: 'admin_created' as const,
    approvedBy: 'admin',
    approvedAt: new Date(),
    createdBy: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockActiveModel = {
    id: 'model-1',
    name: 'gpt-4',
    provider: 'openai',
    api_endpoint: 'https://api.openai.com/v1',
    status: 'active',
    config: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmOperationV2RuntimeService,
        { provide: Logger, useValue: { log: jest.fn(), warn: jest.fn() } },
        {
          provide: LlmOperationRegistryService,
          useValue: {
            resolveActiveVersion: jest.fn(),
            resolveExactVersion: jest.fn(),
          },
        },
        {
          provide: ModelService,
          useValue: {
            getPreferredDefaultModel: jest.fn(),
            callModel: jest.fn(),
          },
        },
        {
          provide: PromptRendererService,
          useValue: {
            renderUserTemplate: jest.fn((t, i) => t.replace(/{{(\w+)}}/g, (_, k) => i[k] || '')),
            renderManifestPrompt: jest.fn((m, i) => ({
              systemPrompt: (m.prompt as any).systemTemplate,
              userPrompt: (m.prompt as any).userTemplate.replace(/{{(\w+)}}/g, (_, k) => i[k] || ''),
            })),
          },
        },
        {
          provide: InputValidatorService,
          useValue: { validate: jest.fn() },
        },
        {
          provide: ToolCallGuardService,
          useValue: { assertNoToolCall: jest.fn() },
        },
        {
          provide: OutputValidatorService,
          useValue: {
            parseAndValidate: jest.fn(),
            buildRepairPrompt: jest.fn((_, raw) => `Repair: ${raw.slice(0, 20)}`),
          },
        },
        {
          provide: BudgetEnforcerService,
          useValue: {
            preflightInput: jest.fn(),
            assertOutputWithinBudget: jest.fn(),
            assertLatencyWithinBudget: jest.fn(),
          },
        },
        {
          provide: LlmOperationAuditService,
          useValue: {
            recordInvocation: jest.fn().mockResolvedValue(undefined),
            findCompletedByIdempotencyKey: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<LlmOperationV2RuntimeService>(LlmOperationV2RuntimeService);
    registry = module.get(LlmOperationRegistryService);
    modelService = module.get(ModelService);
    inputValidator = module.get(InputValidatorService);
    toolCallGuard = module.get(ToolCallGuardService);
    outputValidator = module.get(OutputValidatorService);
    budgetEnforcer = module.get(BudgetEnforcerService);
    auditService = module.get(LlmOperationAuditService);
  });

  describe('execute', () => {
    it('should succeed on happy path with DB version', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({
        content: '{"markdown_content": "Test summary"}',
        usage: { total_tokens: 100 },
      });
      outputValidator.parseAndValidate.mockReturnValue({
        data: { markdown_content: 'Test summary' },
        schemaValidated: true,
      });

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        environment: 'production',
        input: { text: 'Test input' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('database');
      expect(result.operationRef.version).toBe('1.0.0');
      expect(result.operationRef.digest).toBe('sha256:abc123');
      expect(result.metadata.schemaValidated).toBe(true);
      expect(result.metadata.toolCallDetected).toBe(false);
      expect(inputValidator.validate).toHaveBeenCalled();
      expect(toolCallGuard.assertNoToolCall).toHaveBeenCalled();
      expect(registry.resolveExactVersion).toHaveBeenCalledWith('summarize_list', '1.0.0');
      expect(auditService.recordInvocation).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'key-1',
          resultJson: expect.objectContaining({ success: true }),
        }),
      );
    });

    it('replays a completed result without calling the model again', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      auditService.findCompletedByIdempotencyKey.mockResolvedValue({
        id: 'invocation-1',
        versionId: mockDbVersion.id,
        provider: 'openai',
        requestedModel: 'gpt-4',
        idempotencyKey: 'key-replay',
        resultJson: {
          success: true,
          operationRef: {
            id: 'summarize_list',
            version: '1.0.0',
            digest: 'sha256:abc123',
          },
          source: 'database',
          data: { markdown_content: 'Persisted summary' },
          usage: { totalTokens: 12 },
          metadata: {
            provider: 'openai',
            requestedModel: 'gpt-4',
            repairAttempts: 0,
            latencyMs: 10,
            schemaValidated: true,
            toolCallDetected: false,
          },
        },
        parseAttempts: 1,
        repairAttempts: 0,
        validationResult: 'passed',
        actor: 'system',
        environment: 'production',
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        environment: 'production',
        input: { text: 'Test input' },
        idempotencyKey: 'key-replay',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ markdown_content: 'Persisted summary' });
      expect(result.metadata.idempotentReplay).toBe(true);
      expect(modelService.callModel).not.toHaveBeenCalled();
    });

    it('should throw TOOL_CALL_FORBIDDEN on tool call detection', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({
        content: 'using tool',
        tool_calls: [{ function: { name: 'search' } }],
      });
      toolCallGuard.assertNoToolCall.mockImplementation(() => {
        throw new LlmOperationError('TOOL_CALL_FORBIDDEN', 'Tool call detected');
      });

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TOOL_CALL_FORBIDDEN');
    });

    it('should throw DIGEST_MISMATCH on operationDigest mismatch', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        operationDigest: 'sha256:different',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LLM_OPERATION_DIGEST_MISMATCH');
    });

    it('should throw INVALID_OPERATION_CONFIG when tools enabled', async () => {
      const versionWithTools = {
        ...mockDbVersion,
        manifestJson: {
          ...mockDbVersion.manifestJson,
          executionPolicy: { tools: 'enabled' },
        },
      };
      registry.resolveExactVersion.mockResolvedValue(versionWithTools);

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_OPERATION_CONFIG');
    });

    it('should throw INPUT_SCHEMA_VIOLATION on input validation failure', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      inputValidator.validate.mockImplementation(() => {
        throw new LlmOperationError('INPUT_SCHEMA_VIOLATION', 'Missing required field');
      });

const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INPUT_SCHEMA_VIOLATION');
    });

    it('should repair output and succeed on second attempt', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel
        .mockResolvedValueOnce({ content: '{"invalid": "output"}', usage: { total_tokens: 50 } })
        .mockResolvedValueOnce({ content: '{"markdown_content": "Repaired"}', usage: { total_tokens: 80 } });
      outputValidator.parseAndValidate
        .mockImplementationOnce(() => {
          throw new LlmOperationError('OUTPUT_SCHEMA_VIOLATION', 'Schema mismatch');
        })
        .mockReturnValueOnce({ data: { markdown_content: 'Repaired' }, schemaValidated: true });

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(true);
      expect(result.metadata.repairAttempts).toBe(1);
      expect(modelService.callModel).toHaveBeenCalledTimes(2);
    });

    it('should throw REPAIR_EXHAUSTED after max attempts', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({ content: '{"invalid": "output"}', usage: {} });
      outputValidator.parseAndValidate.mockImplementation(() => {
        throw new LlmOperationError('OUTPUT_SCHEMA_VIOLATION', 'Schema mismatch');
      });

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('REPAIR_EXHAUSTED');
      expect(result.metadata.repairAttempts).toBe(1);
    });

    it('should throw BUDGET_EXCEEDED when output exceeds max tokens', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({
        content: '{"markdown_content": "Test"}',
        usage: { output_tokens: 3000 },
      });
      outputValidator.parseAndValidate.mockReturnValue({
        data: { markdown_content: 'Test' },
        schemaValidated: true,
      });
      budgetEnforcer.assertOutputWithinBudget.mockImplementation(() => {
        throw new LlmOperationError('BUDGET_EXCEEDED', 'Output exceeds budget');
      });

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('BUDGET_EXCEEDED');
    });

    it('should use legacy registry when DB not found', async () => {
      const mockLegacyVersion = {
        id: 'legacy',
        operationId: null,
        version: '1',
        state: 'approved' as const,
        manifestJson: {
          inputSchema: {},
          outputSchema: {},
          promptTemplateId: 'test',
          version: '1',
          modelPolicyId: 'task-default',
          temperature: 0,
          maxInputTokens: 4000,
          maxOutputTokens: 2000,
          executionPolicy: { tools: 'disabled' },
          repair: { maxAttempts: 1 },
        },
        operationDigest: 'sha256:legacy',
        contractDigest: '',
        changeSummary: 'Legacy',
        source: 'legacy_registry' as const,
        approvedBy: null,
        approvedAt: null,
        createdBy: 'legacy',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      registry.resolveActiveVersion.mockResolvedValue({
        source: 'legacy_registry',
        version: mockLegacyVersion,
        operation: null,
      });
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({
        content: '{"markdown_content": "Test"}',
        usage: { total_tokens: 100 },
      });
      outputValidator.parseAndValidate.mockReturnValue({
        data: { markdown_content: 'Test' },
        schemaValidated: true,
      });

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        environment: 'dev',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('legacy_registry');
      expect(result.operationRef.digest).toBe('sha256:legacy');
    });

    it('should call auditService.recordInvocation on success', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({
        content: '{"markdown_content": "Test"}',
        usage: { total_tokens: 100 },
      });
      outputValidator.parseAndValidate.mockReturnValue({
        data: { markdown_content: 'Test' },
        schemaValidated: true,
      });

      await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(auditService.recordInvocation).toHaveBeenCalledWith(
        expect.objectContaining({
          versionId: mockDbVersion.id,
          executionId: 'exec-1',
          stepId: 'step-1',
          validationResult: 'passed',
        }),
      );
    });

    it('should call auditService on TOOL_CALL_FORBIDDEN', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({
        content: 'using tool',
        tool_calls: [{ function: { name: 'search' } }],
      });
      toolCallGuard.assertNoToolCall.mockImplementation(() => {
        throw new LlmOperationError('TOOL_CALL_FORBIDDEN', 'Tool call detected');
      });

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TOOL_CALL_FORBIDDEN');
    });

    it('should not fail when auditService throws error', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({
        content: '{"markdown_content": "Test"}',
        usage: { total_tokens: 100 },
      });
      outputValidator.parseAndValidate.mockReturnValue({
        data: { markdown_content: 'Test' },
        schemaValidated: true,
      });
      auditService.recordInvocation.mockRejectedValue(new Error('Audit failed'));

      const result = await service.execute({
        executionId: 'exec-1',
        stepId: 'step-1',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(result.success).toBe(true);
    });

    it('should pass executionId and stepId to auditService', async () => {
      registry.resolveExactVersion.mockResolvedValue(mockDbVersion);
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({
        content: '{"markdown_content": "Test"}',
        usage: { total_tokens: 100 },
      });
      outputValidator.parseAndValidate.mockReturnValue({
        data: { markdown_content: 'Test' },
        schemaValidated: true,
      });

      await service.execute({
        executionId: 'exec-abc',
        stepId: 'step-xyz',
        operationId: 'summarize_list',
        operationVersion: '1.0.0',
        input: { text: 'Test' },
        idempotencyKey: 'key-1',
      });

      expect(auditService.recordInvocation).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: 'exec-abc',
          stepId: 'step-xyz',
        }),
      );
    });
  });
});
