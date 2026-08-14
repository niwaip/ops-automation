import { Test, TestingModule } from '@nestjs/testing';
import { LlmOperationRegistryService } from '../src/modules/llm-operation/registry/llm-operation-registry.service';
import { LLM_OPERATION_REPOSITORY } from '../src/modules/llm-operation/registry/llm-operation.repository';
import type { LlmOperationRepository } from '../src/modules/llm-operation/registry/llm-operation.repository';
import { OperationDigestRecomputeService } from '../src/modules/llm-operation/registry/operation-digest-recompute.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../src/modules/llm-operation/registry/errors';
import { Logger } from '@nestjs/common';

describe('LlmOperationRegistryService', () => {
  let service: LlmOperationRegistryService;
  let repository: jest.Mocked<LlmOperationRepository>;
  let digestRecompute: jest.Mocked<OperationDigestRecomputeService>;
  let logger: jest.Mocked<Logger>;

  const mockOperation = {
    id: 'op-uuid-1',
    operationKey: 'test_operation',
    displayName: 'Test Operation',
    description: 'Test description',
    owner: 'test-owner',
    status: 'active' as const,
    source: 'admin_created' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDeprecatedOperation = {
    ...mockOperation,
    id: 'op-uuid-2',
    operationKey: 'deprecated_operation',
    status: 'deprecated' as const,
  };

  const mockApprovedVersion = {
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

  const mockActivation = {
    id: 'act-uuid-1',
    operationId: 'op-uuid-1',
    versionId: 'ver-uuid-1',
    environment: 'production' as const,
    label: 'production' as const,
    activatedBy: 'admin',
    reason: 'Initial',
    rolloutPercent: null,
    activatedAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmOperationRegistryService,
        {
          provide: LLM_OPERATION_REPOSITORY,
          useValue: {
            listOperations: jest.fn(),
            findOperationByKey: jest.fn(),
            listVersionsByOperationId: jest.fn(),
            findActivationByOperationAndEnv: jest.fn(),
            findVersionById: jest.fn(),
            findVersionByOperationIdAndVersion: jest.fn(),
          },
        },
        {
          provide: OperationDigestRecomputeService,
          useValue: {
            assertDigestMatchesPersisted: jest.fn(),
            computeDigestForVersion: jest.fn(),
          },
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LlmOperationRegistryService>(LlmOperationRegistryService);
    repository = module.get(LLM_OPERATION_REPOSITORY);
    digestRecompute = module.get(OperationDigestRecomputeService);
    logger = module.get(Logger);
  });

  describe('listActiveOperations', () => {
    it('should return only active operations', async () => {
      repository.listOperations.mockResolvedValue([mockOperation, mockDeprecatedOperation]);
      repository.listVersionsByOperationId.mockResolvedValue([mockApprovedVersion]);
      repository.findActivationByOperationAndEnv.mockResolvedValue(mockActivation);
      repository.findVersionById.mockResolvedValue(mockApprovedVersion);

      const result = await service.listActiveOperations();

      expect(result).toHaveLength(1);
      expect(result[0].operation.operationKey).toBe('test_operation');
      expect(result[0].currentVersion.state).toBe('approved');
    });

    it('should return empty array when no active operations', async () => {
      repository.listOperations.mockResolvedValue([mockDeprecatedOperation]);

      const result = await service.listActiveOperations();

      expect(result).toHaveLength(0);
    });
  });

  describe('getOperation', () => {
    it('should return operation detail with versions and activations', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.listVersionsByOperationId.mockResolvedValue([mockApprovedVersion]);
      repository.findActivationByOperationAndEnv.mockResolvedValue(mockActivation);

      const result = await service.getOperation('test_operation');

      expect(result).not.toBeNull();
      expect(result?.operation.operationKey).toBe('test_operation');
      expect(result?.versions).toHaveLength(1);
    });

    it('should return null when operation not found', async () => {
      repository.findOperationByKey.mockResolvedValue(null);

      const result = await service.getOperation('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('resolveActiveVersion', () => {
    it('should return database version when found', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findActivationByOperationAndEnv.mockResolvedValue(mockActivation);
      repository.findVersionById.mockResolvedValue(mockApprovedVersion);

      const result = await service.resolveActiveVersion('test_operation', 'production');

      expect(result.source).toBe('database');
      expect(result.version.id).toBe('ver-uuid-1');
      expect(result.operation).not.toBeNull();
      expect(digestRecompute.assertDigestMatchesPersisted).toHaveBeenCalledWith(mockApprovedVersion);
    });

    it('should fallback to legacy registry when DB not found', async () => {
      repository.findOperationByKey.mockResolvedValue(null);

      const result = await service.resolveActiveVersion('summarize_list', 'production');

      expect(result.source).toBe('legacy_registry');
      expect(result.version.state).toBe('approved');
      expect(result.version.id).toBe('legacy');
      expect(result.operation).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('LLM_OPERATION_LEGACY_REGISTRY_FALLBACK'),
        'LlmOperationRegistryService',
      );
    });

    it('should throw NOT_FOUND when neither DB nor legacy exists', async () => {
      repository.findOperationByKey.mockResolvedValue(null);

      await expect(
        service.resolveActiveVersion('nonexistent_operation', 'production')
      ).rejects.toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.NOT_FOUND,
        })
      );
    });

    it('should throw DIGEST_MISMATCH when digest invalid', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findActivationByOperationAndEnv.mockResolvedValue(mockActivation);
      repository.findVersionById.mockResolvedValue(mockApprovedVersion);
      digestRecompute.assertDigestMatchesPersisted.mockImplementation(() => {
        throw new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.DIGEST_MISMATCH,
          'Digest mismatch',
        );
      });

      await expect(
        service.resolveActiveVersion('test_operation', 'production')
      ).rejects.toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.DIGEST_MISMATCH,
        })
      );
    });
  });

  describe('resolveExactVersion', () => {
    it('should return version from database without legacy fallback', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockApprovedVersion);

      const result = await service.resolveExactVersion('test_operation', '1.0.0');

      expect(result).not.toBeNull();
      expect(result?.version).toBe('1.0.0');
      expect(digestRecompute.assertDigestMatchesPersisted).toHaveBeenCalledWith(mockApprovedVersion);
    });

    it('should return null when version not found', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(null);

      const result = await service.resolveExactVersion('test_operation', '99.0.0');

      expect(result).toBeNull();
    });

    it('should not fallback to legacy registry', async () => {
      repository.findOperationByKey.mockResolvedValue(null);

      const result = await service.resolveExactVersion('summarize_list', '1');

      expect(result).toBeNull();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
