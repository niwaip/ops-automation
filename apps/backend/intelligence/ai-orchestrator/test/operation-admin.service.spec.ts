import { Test, TestingModule } from '@nestjs/testing';
import { OperationAdminService } from '../src/modules/llm-operation/admin/operation-admin.service';
import { LLM_OPERATION_REPOSITORY } from '../src/modules/llm-operation/registry/llm-operation.repository';
import type { LlmOperationRepository } from '../src/modules/llm-operation/registry/llm-operation.repository';
import { LlmOperationRegistryService } from '../src/modules/llm-operation/registry/llm-operation-registry.service';
import { OperationActivationService } from '../src/modules/llm-operation/registry/operation-activation.service';
import { OperationVersionPolicyService } from '../src/modules/llm-operation/registry/operation-version-policy.service';
import { OperationDigestRecomputeService } from '../src/modules/llm-operation/registry/operation-digest-recompute.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../src/modules/llm-operation/registry/errors';
import { Logger } from '@nestjs/common';
import { AttestationService } from '../src/modules/llm-operation/eval/attestation.service';
import { OperationValidationOrchestratorService } from '../src/modules/llm-operation/eval/operation-validation-orchestrator.service';

describe('OperationAdminService', () => {
  let service: OperationAdminService;
  let repository: jest.Mocked<LlmOperationRepository>;
  let registry: jest.Mocked<LlmOperationRegistryService>;
  let activation: jest.Mocked<OperationActivationService>;
  let versionPolicy: jest.Mocked<OperationVersionPolicyService>;
  let digestRecompute: jest.Mocked<OperationDigestRecomputeService>;
  let validationOrchestrator: jest.Mocked<OperationValidationOrchestratorService>;

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

  const mockVersionDraft = {
    id: 'ver-uuid-draft',
    operationId: 'op-uuid-1',
    version: '1.0.0',
    state: 'draft' as const,
    manifestJson: {
      inputSchema: null,
      outputSchema: null,
      promptTemplateId: 'test',
      version: '1.0.0',
      modelPolicyId: 'default',
      temperature: 0,
      maxInputTokens: 4000,
      maxOutputTokens: 2000,
    },
    operationDigest: 'sha256:abc123',
    contractDigest: '',
    changeSummary: 'Initial draft',
    source: 'admin_created' as const,
    approvedBy: null,
    approvedAt: null,
    createdBy: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockApprovedVersion = {
    ...mockVersionDraft,
    id: 'ver-uuid-approved',
    state: 'approved' as const,
    approvedBy: 'approver',
    approvedAt: new Date(),
  };

  const mockActivation = {
    id: 'act-uuid-1',
    operationId: 'op-uuid-1',
    versionId: 'ver-uuid-approved',
    environment: 'production' as const,
    label: 'production' as const,
    activatedBy: 'admin',
    reason: 'Test activation',
    rolloutPercent: null,
    activatedAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationAdminService,
        {
          provide: LLM_OPERATION_REPOSITORY,
          useValue: {
            findOperationByKey: jest.fn(),
            findVersionByOperationIdAndVersion: jest.fn(),
            insertVersion: jest.fn(),
            updateVersion: jest.fn(),
            updateVersionState: jest.fn(),
            listOperations: jest.fn(),
          },
        },
        {
          provide: LlmOperationRegistryService,
          useValue: {
            getOperation: jest.fn(),
          },
        },
        {
          provide: OperationActivationService,
          useValue: {
            activate: jest.fn(),
            rollback: jest.fn(),
            adjustCanary: jest.fn(),
            listHistory: jest.fn(),
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
            computeDigestForVersion: jest.fn(),
          },
        },
        {
          provide: AttestationService,
          useValue: {
            hasValidAttestation: jest.fn().mockResolvedValue(true),
            hasValidAttestationForVersion: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: OperationValidationOrchestratorService,
          useValue: {
            validate: jest.fn().mockResolvedValue({
              manifest: { passed: true, checks: [] },
              fixture: { totalCases: 5, passed: 5, failed: 0, results: [] },
              eval: { passed: true, metrics: {} },
              attestation: { id: 'attestation-1' },
              suite: { id: 'suite-1', digest: 'suite-digest', name: 'Suite' },
            }),
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

    service = module.get<OperationAdminService>(OperationAdminService);
    repository = module.get(LLM_OPERATION_REPOSITORY);
    registry = module.get(LlmOperationRegistryService);
    activation = module.get(OperationActivationService);
    versionPolicy = module.get(OperationVersionPolicyService);
    digestRecompute = module.get(OperationDigestRecomputeService);
    validationOrchestrator = module.get(OperationValidationOrchestratorService);
  });

  describe('createVersionDraft', () => {
    it('should compute and write digest', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.insertVersion.mockResolvedValue(mockVersionDraft);

      const result = await service.createVersionDraft(
        'test_operation',
        {
          version: '1.0.0',
          manifestJson: {
            inputSchema: null,
            outputSchema: null,
            promptTemplateId: 'test',
            version: '1.0.0',
            modelPolicyId: 'default',
            temperature: 0,
            maxInputTokens: 4000,
            maxOutputTokens: 2000,
          },
          changeSummary: 'Initial draft',
        },
        'admin',
      );

      expect(result).toEqual(mockVersionDraft);
      expect(repository.insertVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          operationDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      );
    });
  });

  describe('updateDraft', () => {
    it('should throw CONCURRENT_MODIFICATION when expectedVersionId mismatches', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockVersionDraft);

      await expect(
        service.updateDraft('test_operation', '1.0.0', {
          manifestJson: { ...mockVersionDraft.manifestJson },
          changeSummary: 'Update',
          expectedVersionId: 'different-id',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.CONCURRENT_MODIFICATION,
        }),
      );
    });

    it('should update draft when expectedVersionId matches', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockVersionDraft);
      repository.updateVersion.mockResolvedValue(mockVersionDraft);

      await service.updateDraft('test_operation', '1.0.0', {
        manifestJson: { ...mockVersionDraft.manifestJson },
        changeSummary: 'Update',
        expectedVersionId: mockVersionDraft.id,
      });

      expect(repository.updateVersion).toHaveBeenCalled();
    });
  });

  describe('approveVersion', () => {
    it('should call assertDigestMatchesPersisted before approval', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockVersionDraft);
      repository.updateVersion.mockResolvedValue(mockApprovedVersion);

      await service.approveVersion('test_operation', '1.0.0', {
        expectedVersionId: mockVersionDraft.id,
        approvedBy: 'approver',
      });

      expect(digestRecompute.assertDigestMatchesPersisted).toHaveBeenCalled();
    });

    it('should throw DIGEST_MISMATCH when digest does not match', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockVersionDraft);
      digestRecompute.assertDigestMatchesPersisted.mockImplementation(() => {
        throw new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.DIGEST_MISMATCH,
          'Digest mismatch',
        );
      });

      await expect(
        service.approveVersion('test_operation', '1.0.0', {
          expectedVersionId: mockVersionDraft.id,
          approvedBy: 'approver',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.DIGEST_MISMATCH,
        }),
      );
    });

    it('should call versionPolicy.assertTransitionAllowed', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockVersionDraft);
      repository.updateVersion.mockResolvedValue(mockApprovedVersion);

      await service.approveVersion('test_operation', '1.0.0', {
        expectedVersionId: mockVersionDraft.id,
        approvedBy: 'approver',
      });

      expect(versionPolicy.assertTransitionAllowed).toHaveBeenCalledWith('draft', 'approved');
    });
  });

  describe('transitionToValidating', () => {
    it('should execute validation and automatically transition to candidate', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockVersionDraft);
      repository.updateVersionState.mockResolvedValue({
        ...mockVersionDraft,
        state: 'candidate',
      });

      const result = await service.transitionToValidating('test_operation', '1.0.0', 'admin');

      expect(versionPolicy.assertTransitionAllowed).toHaveBeenCalledWith('draft', 'validating');
      expect(versionPolicy.assertTransitionAllowed).toHaveBeenCalledWith('validating', 'candidate');
      expect(validationOrchestrator.validate).toHaveBeenCalledWith(
        expect.objectContaining({ operation: mockOperation, version: mockVersionDraft, actor: 'admin' }),
      );
      expect(result.version.state).toBe('candidate');
    });

    it('moves the version to validation_failed when a gate fails', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockResolvedValue(mockVersionDraft);
      repository.updateVersionState.mockResolvedValue(mockVersionDraft);
      validationOrchestrator.validate.mockRejectedValue(
        new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.VALIDATION_FAILED,
          'Fixture validation failed',
        ),
      );

      await expect(
        service.transitionToValidating('test_operation', '1.0.0', 'admin'),
      ).rejects.toThrow('Fixture validation failed');
      expect(repository.updateVersionState).toHaveBeenLastCalledWith(
        mockVersionDraft.id,
        'validation_failed',
      );
    });
  });

  describe('activate', () => {
    it('should delegate to OperationActivationService', async () => {
      activation.activate.mockResolvedValue(mockActivation);

      const result = await service.activate('test_operation', {
        version: '1.0.0',
        environment: 'production' as any,
        actor: 'admin',
        reason: 'Test',
      });

      expect(result).toEqual(mockActivation);
      expect(activation.activate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationKey: 'test_operation',
          version: '1.0.0',
        }),
      );
    });
  });

  describe('rollback', () => {
    it('should delegate to OperationActivationService', async () => {
      activation.rollback.mockResolvedValue(mockActivation);

      const result = await service.rollback('test_operation', {
        environment: 'production' as any,
        actor: 'admin',
        reason: 'Rollback',
      });

      expect(result).toEqual(mockActivation);
      expect(activation.rollback).toHaveBeenCalledWith(
        expect.objectContaining({
          operationKey: 'test_operation',
        }),
      );
    });
  });

  describe('adjustCanary', () => {
    it('should delegate to OperationActivationService', async () => {
      activation.adjustCanary.mockResolvedValue({
        ...mockActivation,
        rolloutPercent: 20,
      });

      const result = await service.adjustCanary('test_operation', {
        environment: 'production' as any,
        rolloutPercent: 20,
        actor: 'admin',
        reason: 'Canary',
      });

      expect(result.rolloutPercent).toBe(20);
      expect(activation.adjustCanary).toHaveBeenCalledWith(
        expect.objectContaining({
          rolloutPercent: 20,
        }),
      );
    });
  });

  describe('diffVersions', () => {
    it('should output changes array with scalar fields', async () => {
      repository.findOperationByKey.mockResolvedValue(mockOperation);
      repository.findVersionByOperationIdAndVersion.mockImplementation(async (_, version) => {
        if (version === '1.0.0') {
          return {
            ...mockVersionDraft,
            version: '1.0.0',
            manifestJson: {
              ...mockVersionDraft.manifestJson,
              promptTemplateId: 'old-template',
              temperature: 0,
            },
          };
        }
        return {
          ...mockVersionDraft,
          version: '2.0.0',
          manifestJson: {
            ...mockVersionDraft.manifestJson,
            promptTemplateId: 'new-template',
            temperature: 0.5,
          },
        };
      });

      const result = await service.diffVersions('test_operation', '1.0.0', '2.0.0');

      expect(result.changes).toContainEqual(
        expect.objectContaining({
          path: '/promptTemplateId',
          kind: 'modified',
        }),
      );
      expect(result.changes).toContainEqual(
        expect.objectContaining({
          path: '/temperature',
          kind: 'modified',
        }),
      );
    });
  });

  describe('getRegistryHealth', () => {
    it('should return dbBacked status', async () => {
      repository.listOperations.mockResolvedValue([mockOperation]);

      const result = await service.getRegistryHealth();

      expect(result.dbBacked).toBe(true);
      expect(result.seedStatus).toBe('applied');
    });

    it('should return not_applied when no operations', async () => {
      repository.listOperations.mockResolvedValue([]);

      const result = await service.getRegistryHealth();

      expect(result.dbBacked).toBe(false);
      expect(result.seedStatus).toBe('not_applied');
    });
  });
});
