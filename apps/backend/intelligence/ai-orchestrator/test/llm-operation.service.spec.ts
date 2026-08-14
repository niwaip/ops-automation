import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LlmOperationService } from '../src/modules/llm-operation/llm-operation.service';
import { LlmOperationRegistryService } from '../src/modules/llm-operation/registry/llm-operation-registry.service';
import { ModelService } from '../src/modules/model/model.service';
import { LlmOperationCatalogProjector } from '../src/modules/llm-operation/llm-operation-catalog.projector';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../src/modules/llm-operation/registry/errors';
import { PromptRendererService } from '../src/modules/llm-operation/runtime/prompt-renderer.service';

describe('LlmOperationService', () => {
  let service: LlmOperationService;
  let registry: jest.Mocked<LlmOperationRegistryService>;
  let modelService: jest.Mocked<ModelService>;
  let catalogProjector: jest.Mocked<LlmOperationCatalogProjector>;

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
      prompt: {
        systemTemplate: 'You are a helpful assistant.',
        userTemplate: 'Summarize: {{text}}',
      },
    },
    operationDigest: 'sha256:abc123',
    contractDigest: 'sha256:abc123',
    changeSummary: 'Initial',
    source: 'admin_created' as const,
    approvedBy: 'admin',
    approvedAt: new Date(),
    createdBy: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLegacyVersion = {
    id: 'legacy',
    operationId: null,
    version: '1',
    state: 'approved' as const,
    manifestJson: {
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      promptTemplateId: 'news-summary',
      version: '1',
      modelPolicyId: 'task-default',
      temperature: 0,
      maxInputTokens: 4000,
      maxOutputTokens: 2000,
    },
    operationDigest: 'sha256:legacy',
    contractDigest: '',
    changeSummary: 'Legacy registry fallback',
    source: 'legacy_registry' as const,
    approvedBy: null,
    approvedAt: null,
    createdBy: 'legacy',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockActiveModel = { id: 'model-1', name: 'gpt-4', provider: 'openai' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmOperationService,
        { provide: ModelService, useValue: { getPreferredDefaultModel: jest.fn(), callModel: jest.fn() } },
        { provide: LlmOperationCatalogProjector, useValue: { projectAll: jest.fn(), projectOne: jest.fn() } },
        { provide: LlmOperationRegistryService, useValue: { resolveActiveVersion: jest.fn() } },
        {
          provide: PromptRendererService,
          useValue: {
            renderUserTemplate: jest.fn((t, i) => t.replace(/{{(\w+)}}/g, (_, k) => i[k] || '')),
          },
        },
      ],
    }).compile();
    service = module.get<LlmOperationService>(LlmOperationService);
    modelService = module.get(ModelService);
    catalogProjector = module.get(LlmOperationCatalogProjector);
    registry = module.get(LlmOperationRegistryService);
  });

  describe('executeOperation', () => {
    it('should use DB version when available', async () => {
      registry.resolveActiveVersion.mockResolvedValue({ source: 'database', version: mockDbVersion, operation: null });
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({ content: '{"markdown_content": "Test summary"}', usage: { total_tokens: 100 } });
      const result = await service.executeOperation({
        executionId: 'exec-1', stepId: 'step-1', operationId: 'summarize_list', environment: 'production', input: { text: 'Test input' },
      });
      expect(result.success).toBe(true);
      expect(result.source).toBe('database');
      expect(result.templateVersion).toBe('1.0.0');
      expect(result.operationDigest).toBe('sha256:abc123');
      expect(registry.resolveActiveVersion).toHaveBeenCalledWith('summarize_list', 'production');
    });

    it('should fallback to legacy registry when DB not found', async () => {
      registry.resolveActiveVersion.mockResolvedValue({ source: 'legacy_registry', version: mockLegacyVersion, operation: null });
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({ content: '{"markdown_content": "Test summary"}', usage: { total_tokens: 100 } });
      const result = await service.executeOperation({
        executionId: 'exec-1', stepId: 'step-1', operationId: 'summarize_list', input: { items: ['Test item'] },
      });
      expect(result.success).toBe(true);
      expect(result.source).toBe('legacy_registry');
      expect(result.operationDigest).toBe('sha256:legacy');
      expect(registry.resolveActiveVersion).toHaveBeenCalledWith('summarize_list', 'production');
    });

    it('should throw BadRequestException on version mismatch', async () => {
      registry.resolveActiveVersion.mockResolvedValue({ source: 'database', version: mockDbVersion, operation: null });
      await expect(service.executeOperation({
        executionId: 'exec-1', stepId: 'step-1', operationId: 'summarize_list', promptTemplateVersion: '2.0.0', input: {},
      })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on modelPolicyId mismatch', async () => {
      registry.resolveActiveVersion.mockResolvedValue({ source: 'database', version: mockDbVersion, operation: null });
      await expect(service.executeOperation({
        executionId: 'exec-1', stepId: 'step-1', operationId: 'summarize_list', modelPolicyId: 'different-policy', input: {},
      })).rejects.toThrow(BadRequestException);
    });

    it('should throw NOT_FOUND when operation not in registry or legacy', async () => {
      registry.resolveActiveVersion.mockRejectedValue(
        new LlmOperationError(LLM_OPERATION_ERROR_CODES.NOT_FOUND, 'Operation not found: nonexistent')
      );
      await expect(service.executeOperation({
        executionId: 'exec-1', stepId: 'step-1', operationId: 'nonexistent' as any, input: {},
      })).rejects.toThrow();
    });

    it('should return source and operationDigest in response', async () => {
      registry.resolveActiveVersion.mockResolvedValue({ source: 'database', version: mockDbVersion, operation: null });
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({ content: '{"markdown_content": "Test"}', usage: { total_tokens: 50 } });
      const result = await service.executeOperation({
        executionId: 'exec-1', stepId: 'step-1', operationId: 'summarize_list', input: { text: 'Test' },
      });
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('operationDigest');
      expect(result.source).toBe('database');
      expect(result.operationDigest).toBe('sha256:abc123');
    });

    it('should use default environment when not specified', async () => {
      registry.resolveActiveVersion.mockResolvedValue({ source: 'legacy_registry', version: mockLegacyVersion, operation: null });
      modelService.getPreferredDefaultModel.mockReturnValue(mockActiveModel as any);
      modelService.callModel.mockResolvedValue({ content: '{"markdown_content": "Test"}', usage: { total_tokens: 50 } });
      await service.executeOperation({
        executionId: 'exec-1', stepId: 'step-1', operationId: 'summarize_list', input: { items: ['Test'] },
      });
      expect(registry.resolveActiveVersion).toHaveBeenCalledWith('summarize_list', 'production');
    });
  });

  describe('getOperationDefinition', () => {
    it('should return definition from legacy registry', () => {
      const result = service.getOperationDefinition('summarize_list');
      expect(result.operationId).toBe('summarize_list');
      expect(result.promptTemplateId).toBe('news-summary');
      expect(result.version).toBe('1');
    });

    it('should throw BadRequestException for non-existent operation', () => {
      expect(() => { service.getOperationDefinition('nonexistent'); }).toThrow(BadRequestException);
    });
  });
});