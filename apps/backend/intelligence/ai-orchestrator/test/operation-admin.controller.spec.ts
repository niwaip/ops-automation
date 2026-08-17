import { Test, TestingModule } from '@nestjs/testing';
import { OperationAdminController } from '../src/modules/llm-operation/admin/operation-admin.controller';
import { OperationAdminService } from '../src/modules/llm-operation/admin/operation-admin.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../src/modules/llm-operation/registry/errors';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('OperationAdminController', () => {
  let controller: OperationAdminController;
  let admin: jest.Mocked<OperationAdminService>;

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
    manifestJson: {},
    operationDigest: 'sha256:abc123',
    contractDigest: '',
    changeSummary: 'Initial',
    source: 'admin_created' as const,
    approvedBy: null,
    approvedAt: null,
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
    reason: 'Test',
    rolloutPercent: null,
    activatedAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OperationAdminController],
      providers: [
        {
          provide: OperationAdminService,
          useValue: {
            listOperations: jest.fn(),
            getOperationDetail: jest.fn(),
            upsertOperationByKey: jest.fn(),
            createVersionDraft: jest.fn(),
            updateDraft: jest.fn(),
            approveVersion: jest.fn(),
            transitionToValidating: jest.fn(),
            activate: jest.fn(),
            rollback: jest.fn(),
            adjustCanary: jest.fn(),
            listActivationHistory: jest.fn(),
            diffVersions: jest.fn(),
            getRegistryHealth: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OperationAdminController>(OperationAdminController);
    admin = module.get(OperationAdminService);
  });

  describe('list', () => {
    it('should call list service', async () => {
      admin.listOperations.mockResolvedValue([mockOperation]);

      const result = await controller.list({});

      expect(result).toHaveLength(1);
      expect(result[0].operationKey).toBe('test_operation');
    });
  });

  describe('getDetail', () => {
    it('should return detail', async () => {
      admin.getOperationDetail.mockResolvedValue({
        operation: mockOperation,
        versions: [],
        activations: [],
      });

      const result = await controller.getDetail('test_operation');

      expect(result.operation.operationKey).toBe('test_operation');
    });

    it('should throw 404 when not found', async () => {
      admin.getOperationDetail.mockResolvedValue(null);

      await expect(controller.getDetail('nonexistent')).rejects.toThrow(HttpException);
    });
  });

  describe('createDraft', () => {
    it('should throw 400 when x-actor header missing', async () => {
      await expect(
        controller.createDraft('test_operation', {
          version: '1.0.0',
          manifestJson: {},
          changeSummary: 'Initial',
        }, undefined),
      ).rejects.toThrow(HttpException);
    });

    it('should create draft with x-actor header', async () => {
      admin.createVersionDraft.mockResolvedValue(mockVersionDraft);

      const result = await controller.createDraft('test_operation', {
        version: '1.0.0',
        manifestJson: {
          promptTemplateId: 'test',
          version: '1.0.0',
          modelPolicyId: 'default',
          temperature: 0,
          maxInputTokens: 4000,
          maxOutputTokens: 2000,
        },
        changeSummary: 'Initial',
      }, 'admin');

      expect(result.version).toBe('1.0.0');
    });
  });

  describe('updateDraft', () => {
    it('should throw 409 on CONCURRENT_MODIFICATION', async () => {
      admin.updateDraft.mockImplementation(async () => {
        throw new LlmOperationError(
          LLM_OPERATION_ERROR_CODES.CONCURRENT_MODIFICATION,
          'Concurrent modification',
        );
      });

      await expect(
        controller.updateDraft('test_operation', '1.0.0', {
          manifestJson: {},
          changeSummary: 'Update',
          expectedVersionId: 'ver-uuid',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('validate', () => {
    it('should require an actor and return the validation report', async () => {
      await expect(
        controller.validate('test_operation', '1.0.0', ''),
      ).rejects.toThrow(HttpException);

      const validation = {
        manifest: {
          passed: true as const,
          promptVariables: ['text'],
          inputFields: ['text'],
          outputFields: ['summary'],
          checks: ['closed-json-schema'],
        },
        fixture: { totalCases: 5, passed: 5, failed: 0, results: [] },
        eval: {
          runId: 'eval-1',
          config: {
            operationKey: 'test_operation',
            version: '1.0.0',
            suiteId: 'suite-1',
            actor: 'admin',
          },
          startedAt: new Date(),
          completedAt: new Date(),
          metrics: {
            schemaPassRate: 1,
            taskSuccessRate: 1,
            avgInputTokens: 1,
            avgOutputTokens: 1,
            avgLatencyMs: 1,
            p95LatencyMs: 1,
            totalEstimatedCost: 0,
            safetyRejectRate: 0,
          },
          fixtureResults: [],
          passed: true,
          gateViolations: [],
        },
        attestation: {
          id: 'attestation-1',
          operationId: mockOperation.id,
          versionId: mockVersionDraft.id,
          operationDigest: mockVersionDraft.operationDigest,
          contractDigest: mockVersionDraft.contractDigest,
          evalSuiteDigest: 'sha256:suite',
          validatorVersion: '1.0.0',
          gateResults: {
            schemaTests: 'passed' as const,
            offlineEvals: 'passed' as const,
            liveEvals: 'passed' as const,
            securityEvals: 'passed' as const,
          },
          createdAt: new Date(),
        },
        suite: { id: 'suite-1', digest: 'sha256:suite', name: 'baseline' },
      };
      admin.transitionToValidating.mockResolvedValue({
        version: { ...mockVersionDraft, state: 'candidate' },
        validation,
      });

      const result = await controller.validate('test_operation', '1.0.0', 'admin');

      expect(admin.transitionToValidating).toHaveBeenCalledWith(
        'test_operation',
        '1.0.0',
        'admin',
      );
      expect(result.validation.attestation.id).toBe('attestation-1');
      expect(result.version.state).toBe('candidate');
    });
  });

  describe('activate', () => {
    it('should call admin service activate', async () => {
      admin.activate.mockResolvedValue(mockActivation);

      const result = await controller.activate('test_operation', {
        version: '1.0.0',
        environment: 'production' as any,
        actor: 'admin',
        reason: 'Test activation',
      });

      expect(admin.activate).toHaveBeenCalledWith('test_operation', expect.any(Object));
    });
  });

  describe('rollback', () => {
    it('should call admin service rollback', async () => {
      admin.rollback.mockResolvedValue(mockActivation);

      await controller.rollback('test_operation', {
        environment: 'production' as any,
        actor: 'admin',
        reason: 'Rollback',
      });

      expect(admin.rollback).toHaveBeenCalledWith('test_operation', expect.any(Object));
    });
  });

  describe('diff', () => {
    it('should parse query and return diff result', async () => {
      admin.diffVersions.mockResolvedValue({
        operationKey: 'test_operation',
        from: { version: '1.0.0', operationDigest: 'sha256:a', manifestJson: {} },
        to: { version: '2.0.0', operationDigest: 'sha256:b', manifestJson: {} },
        changes: [
          { path: '/temperature', kind: 'modified' as const, fromValue: 0, toValue: 0.5 },
        ],
      });

      const result = await controller.diff('test_operation', '2.0.0', {
        fromVersion: '1.0.0',
        toVersion: '2.0.0',
      });

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].path).toBe('/temperature');
      expect(admin.diffVersions).toHaveBeenCalledWith('test_operation', '1.0.0', '2.0.0');
    });
  });

  describe('health', () => {
    it('should return health status', async () => {
      admin.getRegistryHealth.mockResolvedValue({
        dbBacked: true,
        legacyFallbacksAvailable: 0,
        seedStatus: 'applied',
      });

      const result = await controller.health();

      expect(result.dbBacked).toBe(true);
    });
  });
});
