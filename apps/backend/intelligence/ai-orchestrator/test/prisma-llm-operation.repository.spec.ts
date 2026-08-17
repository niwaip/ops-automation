import { Test, TestingModule } from '@nestjs/testing';
import { PrismaLlmOperationRepository } from '../src/modules/llm-operation/registry/prisma-llm-operation.repository';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('PrismaLlmOperationRepository', () => {
  let repository: PrismaLlmOperationRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockOperation = {
    id: 'op-uuid-1',
    operationKey: 'test_operation',
    displayName: 'Test Operation',
    description: 'Test description',
    owner: 'test-owner',
    status: 'active',
    source: 'admin_created',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockVersion = {
    id: 'ver-uuid-1',
    operationId: 'op-uuid-1',
    version: '1.0.0',
    state: 'approved',
    manifestJson: { promptTemplateId: 'test' },
    operationDigest: 'sha256:abc123',
    contractDigest: 'sha256:abc123',
    changeSummary: 'Initial version',
    source: 'system_seed',
    approvedBy: 'system',
    approvedAt: new Date('2026-01-01'),
    createdBy: 'system',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockActivation = {
    id: 'act-uuid-1',
    operationId: 'op-uuid-1',
    versionId: 'ver-uuid-1',
    environment: 'production',
    label: 'production',
    activatedBy: 'system',
    reason: 'Initial activation',
    rolloutPercent: null,
    activatedAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaLlmOperationRepository,
        {
          provide: PrismaService,
          useValue: {
            llmOperation: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              upsert: jest.fn(),
            },
            llmOperationVersion: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            llmOperationActivation: {
              findUnique: jest.fn(),
              create: jest.fn(),
              upsert: jest.fn(),
            },
            llmOperationActivationEvent: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
            llmOperationEvalSuite: {
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    repository = module.get<PrismaLlmOperationRepository>(PrismaLlmOperationRepository);
    prisma = module.get<PrismaService>(PrismaService) as jest.Mocked<PrismaService>;
  });

  describe('findOperationByKey', () => {
    it('should return null when operation not found', async () => {
      prisma.llmOperation.findUnique.mockResolvedValue(null);

      const result = await repository.findOperationByKey('nonexistent');

      expect(result).toBeNull();
      expect(prisma.llmOperation.findUnique).toHaveBeenCalledWith({
        where: { operationKey: 'nonexistent' },
      });
    });

    it('should return operation record when found', async () => {
      prisma.llmOperation.findUnique.mockResolvedValue(mockOperation);

      const result = await repository.findOperationByKey('test_operation');

      expect(result).toEqual({
        id: 'op-uuid-1',
        operationKey: 'test_operation',
        displayName: 'Test Operation',
        description: 'Test description',
        owner: 'test-owner',
        status: 'active',
        source: 'admin_created',
        createdAt: mockOperation.createdAt,
        updatedAt: mockOperation.updatedAt,
      });
    });
  });

  describe('upsertOperationByKey', () => {
    it('should create new operation', async () => {
      prisma.llmOperation.upsert.mockResolvedValue(mockOperation);

      const result = await repository.upsertOperationByKey('test_operation', {
        operationKey: 'test_operation',
        displayName: 'Test Operation',
        description: 'Test description',
        owner: 'test-owner',
        status: 'active',
        source: 'admin_created',
      });

      expect(result.operationKey).toBe('test_operation');
      expect(prisma.llmOperation.upsert).toHaveBeenCalledWith({
        where: { operationKey: 'test_operation' },
        create: {
          operationKey: 'test_operation',
          displayName: 'Test Operation',
          description: 'Test description',
          owner: 'test-owner',
          status: 'active',
          source: 'admin_created',
        },
        update: {},
      });
    });

    it('should return existing operation without updating', async () => {
      prisma.llmOperation.upsert.mockResolvedValue(mockOperation);

      const result = await repository.upsertOperationByKey('test_operation', {
        operationKey: 'test_operation',
        displayName: 'Updated Name',
        description: 'Updated description',
        owner: 'new-owner',
        status: 'deprecated',
        source: 'imported',
      });

      expect(result.displayName).toBe('Test Operation');
      expect(prisma.llmOperation.upsert).toHaveBeenCalledWith({
        where: { operationKey: 'test_operation' },
        create: expect.any(Object),
        update: {},
      });
    });
  });

  describe('insertVersion', () => {
    it('should insert version with complete manifestJson', async () => {
      prisma.llmOperationVersion.create.mockResolvedValue(mockVersion);

      const result = await repository.insertVersion({
        operationId: 'op-uuid-1',
        version: '1.0.0',
        state: 'approved',
        manifestJson: { promptTemplateId: 'test', temperature: 0 },
        operationDigest: 'sha256:abc123',
        contractDigest: 'sha256:abc123',
        changeSummary: 'Initial version',
        source: 'system_seed',
        approvedBy: 'system',
        approvedAt: new Date('2026-01-01'),
        createdBy: 'system',
      });

      expect(result.id).toBe('ver-uuid-1');
      expect(result.state).toBe('approved');
      expect(prisma.llmOperationVersion.create).toHaveBeenCalledWith({
        data: {
          operationId: 'op-uuid-1',
          version: '1.0.0',
          state: 'approved',
          manifestJson: { promptTemplateId: 'test', temperature: 0 },
          operationDigest: 'sha256:abc123',
          contractDigest: 'sha256:abc123',
          changeSummary: 'Initial version',
          source: 'system_seed',
          approvedBy: 'system',
          approvedAt: expect.any(Date),
          createdBy: 'system',
        },
      });
    });
  });

  describe('version uniqueness constraints', () => {
    it('should throw on duplicate (operation_id, version)', async () => {
      const error = new Error('Unique constraint violation');
      prisma.llmOperationVersion.create.mockRejectedValue(error);

      await expect(
        repository.insertVersion({
          operationId: 'op-uuid-1',
          version: '1.0.0',
          state: 'approved',
          manifestJson: {},
          operationDigest: 'sha256:abc123',
          contractDigest: 'sha256:abc123',
          changeSummary: '',
          source: 'system_seed',
          createdBy: 'system',
        }),
      ).rejects.toThrow('Unique constraint violation');
    });

    it('should throw on duplicate (operation_id, operationDigest)', async () => {
      const error = new Error('Unique constraint violation');
      prisma.llmOperationVersion.create.mockRejectedValue(error);

      await expect(
        repository.insertVersion({
          operationId: 'op-uuid-1',
          version: '2.0.0',
          state: 'approved',
          manifestJson: {},
          operationDigest: 'sha256:abc123',
          contractDigest: 'sha256:abc123',
          changeSummary: '',
          source: 'system_seed',
          createdBy: 'system',
        }),
      ).rejects.toThrow('Unique constraint violation');
    });
  });

  describe('findApprovedVersionByOperationKeyAndVersion', () => {
    it('should return null when operation not found', async () => {
      prisma.llmOperation.findUnique.mockResolvedValue(null);

      const result = await repository.findApprovedVersionByOperationKeyAndVersion(
        'nonexistent',
        '1.0.0',
      );

      expect(result).toBeNull();
    });

    it('should return null when version not approved', async () => {
      prisma.llmOperation.findUnique.mockResolvedValue(mockOperation);
      prisma.llmOperationVersion.findUnique.mockResolvedValue({
        ...mockVersion,
        state: 'draft',
      });

      const result = await repository.findApprovedVersionByOperationKeyAndVersion(
        'test_operation',
        '1.0.0',
      );

      expect(result).toBeNull();
    });

    it('should return approved version', async () => {
      prisma.llmOperation.findUnique.mockResolvedValue(mockOperation);
      prisma.llmOperationVersion.findUnique.mockResolvedValue(mockVersion);

      const result = await repository.findApprovedVersionByOperationKeyAndVersion(
        'test_operation',
        '1.0.0',
      );

      expect(result).not.toBeNull();
      expect(result?.state).toBe('approved');
    });
  });

  describe('upsertActivation', () => {
    it('should create activation with UNIQUE constraint', async () => {
      prisma.llmOperationActivation.upsert.mockResolvedValue(mockActivation);

      const result = await repository.upsertActivation(
        'op-uuid-1',
        'ver-uuid-1',
        'production',
        'system',
        'Initial activation',
        'production',
      );

      expect(result.environment).toBe('production');
      expect(prisma.llmOperationActivation.upsert).toHaveBeenCalledWith({
        where: {
          operationId_environment: {
            operationId: 'op-uuid-1',
            environment: 'production',
          },
        },
        create: {
          operationId: 'op-uuid-1',
          versionId: 'ver-uuid-1',
          environment: 'production',
          label: 'production',
          activatedBy: 'system',
          reason: 'Initial activation',
          rolloutPercent: undefined,
        },
        update: {
          versionId: 'ver-uuid-1',
          label: 'production',
          activatedBy: 'system',
          reason: 'Initial activation',
          rolloutPercent: undefined,
        },
      });
    });
  });

  describe('insertActivationEvent', () => {
    it('should insert event without modifying activations table', async () => {
      const mockEvent = {
        id: 'event-uuid-1',
        operation_id: 'op-uuid-1',
        previous_version_id: null,
        new_version_id: 'ver-uuid-1',
        environment: 'production',
        action: 'activate',
        actor: 'system',
        reason: 'Initial activation',
        metadata_json: null,
        created_at: new Date('2026-01-01'),
      };

      prisma.llmOperationActivationEvent.create.mockResolvedValue(mockEvent);

      const result = await repository.insertActivationEvent({
        operationId: 'op-uuid-1',
        previousVersionId: null,
        newVersionId: 'ver-uuid-1',
        environment: 'production',
        action: 'activate',
        actor: 'system',
        reason: 'Initial activation',
        metadataJson: null,
      });

      expect(result.action).toBe('activate');
      expect(prisma.llmOperationActivationEvent.create).toHaveBeenCalled();
      expect(prisma.llmOperationActivation.upsert).not.toHaveBeenCalled();
    });
  });

  describe('findEvalSuiteForVersion', () => {
    const exactSuite = {
      id: 'suite-exact',
      operationId: 'op-uuid-1',
      versionId: 'ver-uuid-1',
      name: 'version-suite',
      description: null,
      suiteDigest: 'sha256:exact',
      createdBy: 'admin',
      createdAt: new Date('2026-01-01'),
    };

    it('prefers the exact version suite', async () => {
      prisma.llmOperationEvalSuite.findFirst.mockResolvedValue(exactSuite);

      const result = await repository.findEvalSuiteForVersion(
        'op-uuid-1',
        'ver-uuid-1',
      );

      expect(result?.id).toBe('suite-exact');
      expect(prisma.llmOperationEvalSuite.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.llmOperationEvalSuite.findFirst).toHaveBeenCalledWith({
        where: { operationId: 'op-uuid-1', versionId: 'ver-uuid-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('falls back to the operation-level shared suite', async () => {
      prisma.llmOperationEvalSuite.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...exactSuite,
          id: 'suite-shared',
          versionId: null,
          name: 'system-baseline',
        });

      const result = await repository.findEvalSuiteForVersion(
        'op-uuid-1',
        'ver-uuid-1',
      );

      expect(result?.id).toBe('suite-shared');
      expect(prisma.llmOperationEvalSuite.findFirst).toHaveBeenNthCalledWith(2, {
        where: { operationId: 'op-uuid-1', versionId: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
