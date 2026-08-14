import { Test, TestingModule } from '@nestjs/testing';
import { OperationActivationService } from '../src/modules/llm-operation/registry/operation-activation.service';
import { LLM_OPERATION_REPOSITORY } from '../src/modules/llm-operation/registry/llm-operation.repository';
import type { LlmOperationRepository } from '../src/modules/llm-operation/registry/llm-operation.repository';
import { OperationVersionPolicyService } from '../src/modules/llm-operation/registry/operation-version-policy.service';
import { OperationDigestRecomputeService } from '../src/modules/llm-operation/registry/operation-digest-recompute.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../src/modules/llm-operation/registry/errors';
import { Logger } from '@nestjs/common';

describe('OperationActivationService', () => {
  let service: OperationActivationService;
  let repository: jest.Mocked<LlmOperationRepository>;
  let digestRecompute: jest.Mocked<OperationDigestRecomputeService>;

  const mockOperation = {
    id: 'op-uuid-1',
    operationKey: 'test_operation',
    displayName: 'Test Operation',
    description: 'Test description',
    owner: 'test-owner',
    status: 'active',
    source: 'admin_created',
    createdAt: new Date(),
    updatedAt: new Date(),
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

  const mockDraftVersion = {
    ...mockApprovedVersion,
    id: 'ver-uuid-draft',
    state: 'draft' as const,
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

  const mockActivationEvent = {
    id: 'event-uuid-1',
    operationId: 'op-uuid-1',
    previousVersionId: null,
    newVersionId: 'ver-uuid-1',
    environment: 'production' as const,
    action: 'activate' as const,
    actor: 'admin',
    reason: 'Initial',
    metadataJson: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationActivationService,
        {
          provide: LLM_OPERATION_REPOSITORY,
          useValue: {
            findOperationByKey: jest.fn(),
            findVersionByOperationIdAndVersion: jest.fn(),
            findVersionById: jest.fn(),
            findActivationByOperationAndEnv: jest.fn(),
            upsertActivation: jest.fn(),
            insertActivationEvent: jest.fn(),
            listActivationEvents: jest.fn(),
          },
        },
        {
          provide: OperationVersionPolicyService,
          useValue: {
            assertTransitionAllowed: jest.fn(),
          },
        },
        {
          provide: OperationDigestRecomputeService,
          useValue: {
            assertDigestMatchesPersisted: jest.fn(),
          },
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            warn: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OperationActivationService>(OperationActivationService);
    repository = module.get(LLM_OPERATION_REPOSITORY);
    digestRecompute = module.get(OperationDigestRecomputeService);
  });

  describe('activate', () => {
    it('should activate approved version and create event', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockApprovedVersion);
      repository.findActivationByOperationAndEnv.mockResolvedValue(null);
      repository.upsertActivation.mockResolvedValue(mockActivation);
      repository.insertActivationEvent.mockResolvedValue(mockActivationEvent);

      const result = await service.activate({
        operationKey: 'test_operation',
        version: '1.0.0',
        environment: 'production',
        actor: 'admin',
        reason: 'Initial activation',
      });

      expect(result).toEqual(mockActivation);
      expect(digestRecompute.assertDigestMatchesPersisted).toHaveBeenCalledWith(mockApprovedVersion);
      expect(repository.insertActivationEvent).toHaveBeenCalled();
    });

    it('should reject activation of draft version', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockDraftVersion);

      await expect(
        service.activate({
          operationKey: 'test_operation',
          version: 'draft',
          environment: 'production',
          actor: 'admin',
          reason: 'Test',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.ACTIVATION_FAILED,
        })
      );
    });

    it('should be idempotent: second activation overwrites first', async () => {
      const existingActivation = { ...mockActivation, versionId: 'ver-uuid-old' };
      
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockApprovedVersion);
      repository.findActivationByOperationAndEnv.mockResolvedValue(existingActivation);
      repository.upsertActivation.mockResolvedValue(mockActivation);
      repository.insertActivationEvent.mockResolvedValue(mockActivationEvent);

      await service.activate({
        operationKey: 'test_operation',
        version: '1.0.0',
        environment: 'production',
        actor: 'admin',
        reason: 'Re-activation',
      });

      expect(repository.insertActivationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          previousVersionId: 'ver-uuid-old',
          newVersionId: 'ver-uuid-1',
        })
      );
    });
  });

  describe('rollback', () => {
    it('should rollback to previous version', async () => {
      const previousEvent = {
        ...mockActivationEvent,
        previousVersionId: 'ver-uuid-old',
      };

      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findActivationByOperationAndEnv.mockResolvedValue(mockActivation);
      repository.listActivationEvents.mockResolvedValue([mockActivationEvent, previousEvent]);
      repository.findVersionById.mockResolvedValue({ ...mockApprovedVersion, id: 'ver-uuid-old' });
      repository.upsertActivation.mockResolvedValue({ ...mockActivation, versionId: 'ver-uuid-old' });
      repository.insertActivationEvent.mockResolvedValue(mockActivationEvent);

      await service.rollback({
        operationKey: 'test_operation',
        environment: 'production',
        actor: 'admin',
        reason: 'Rollback',
      });

      expect(repository.insertActivationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'rollback',
          previousVersionId: 'ver-uuid-1',
          newVersionId: 'ver-uuid-old',
        })
      );
    });

    it('should reject rollback when no previous version', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findActivationByOperationAndEnv.mockResolvedValue(mockActivation);
      repository.listActivationEvents.mockResolvedValue([mockActivationEvent]);

      await expect(
        service.rollback({
          operationKey: 'test_operation',
          environment: 'production',
          actor: 'admin',
          reason: 'Rollback',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.NOT_FOUND,
        })
      );
    });

    it('should reject rollback when previous equals current', async () => {
      const previousEvent = {
        ...mockActivationEvent,
        previousVersionId: 'ver-uuid-1',
      };

      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findActivationByOperationAndEnv.mockResolvedValue(mockActivation);
      repository.listActivationEvents.mockResolvedValue([mockActivationEvent, previousEvent]);

      await expect(
        service.rollback({
          operationKey: 'test_operation',
          environment: 'production',
          actor: 'admin',
          reason: 'Rollback',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.INVALID_STATE_TRANSITION,
        })
      );
    });
  });

  describe('adjustCanary', () => {
    it('should adjust rollout percent without changing version', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findActivationByOperationAndEnv.mockResolvedValue(mockActivation);
      repository.upsertActivation.mockResolvedValue({
        ...mockActivation,
        rolloutPercent: 20,
      });
      repository.insertActivationEvent.mockResolvedValue(mockActivationEvent);

      const result = await service.adjustCanary({
        operationKey: 'test_operation',
        environment: 'production',
        rolloutPercent: 20,
        actor: 'admin',
        reason: 'Canary adjustment',
      });

      expect(result.rolloutPercent).toBe(20);
      expect(repository.insertActivationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'canary_adjust',
          previousVersionId: mockActivation.versionId,
          newVersionId: mockActivation.versionId,
        })
      );
    });
  });

  describe('listHistory', () => {
    it('should return events in DESC order', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.listActivationEvents.mockResolvedValue([mockActivationEvent]);

      const result = await service.listHistory('test_operation', 10);

      expect(result).toHaveLength(1);
      expect(repository.listActivationEvents).toHaveBeenCalledWith('op-uuid-1', 10);
    });
  });

  describe('resolveCurrent', () => {
    it('should return current activation from DB', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findActivationByOperationAndEnv.mockResolvedValue(mockActivation);
      repository.findVersionById.mockResolvedValue(mockApprovedVersion);

      const result = await service.resolveCurrent('test_operation', 'production');

      expect(result).toEqual({
        operation: mockOperation,
        version: mockApprovedVersion,
        activation: mockActivation,
      });
    });

    it('should return null when operation not found', async () => {
      repository.findOperationByKey.mockResolvedValue(null);

      const result = await service.resolveCurrent('nonexistent', 'production');

      expect(result).toBeNull();
    });

    it('should return null when no activation', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findActivationByOperationAndEnv.mockResolvedValue(null);

      const result = await service.resolveCurrent('test_operation', 'production');

      expect(result).toBeNull();
    });
  });
});