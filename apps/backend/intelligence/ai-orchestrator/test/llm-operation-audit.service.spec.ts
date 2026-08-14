import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { LlmOperationAuditService } from '../src/modules/llm-operation/audit/llm-operation-audit.service';
import { LLM_OPERATION_REPOSITORY } from '../src/modules/llm-operation/registry/llm-operation.repository';

describe('LlmOperationAuditService', () => {
  let service: LlmOperationAuditService;
  let repository: any;
  let logger: jest.Mocked<Logger>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmOperationAuditService,
        {
          provide: LLM_OPERATION_REPOSITORY,
          useValue: {
            insertInvocation: jest.fn(),
            listInvocationsByExecution: jest.fn(),
            listInvocationsByVersion: jest.fn(),
          },
        },
        {
          provide: Logger,
          useValue: { warn: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<LlmOperationAuditService>(LlmOperationAuditService);
    repository = module.get(LLM_OPERATION_REPOSITORY);
    logger = module.get(Logger);
  });

  describe('recordInvocation', () => {
    it('should insert invocation to database', async () => {
      repository.insertInvocation.mockResolvedValue({
        id: 'inv-1',
        versionId: 'ver-1',
        provider: 'openai',
        requestedModel: 'gpt-4',
        parseAttempts: 1,
        repairAttempts: 0,
        validationResult: 'passed',
        actor: 'system',
        environment: 'production',
        startedAt: new Date(),
      } as any);

      await service.recordInvocation({
        versionId: 'ver-1',
        provider: 'openai',
        requestedModel: 'gpt-4',
        parseAttempts: 1,
        repairAttempts: 0,
        validationResult: 'passed',
        actor: 'system',
        environment: 'production',
        startedAt: new Date(),
      });

      expect(repository.insertInvocation).toHaveBeenCalled();
    });

    it('should only warn on database failure', async () => {
      repository.insertInvocation.mockRejectedValue(new Error('DB error'));

      await service.recordInvocation({
        versionId: 'ver-1',
        provider: 'openai',
        requestedModel: 'gpt-4',
        parseAttempts: 1,
        repairAttempts: 0,
        validationResult: 'passed',
        actor: 'system',
        environment: 'production',
        startedAt: new Date(),
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('LLM_OPERATION_AUDIT_FAILED'),
      );
    });
  });

  describe('listByExecution', () => {
    it('should return invocations array', async () => {
      const mockInvocations = [
        { id: 'inv-1', executionId: 'exec-1' },
        { id: 'inv-2', executionId: 'exec-1' },
      ] as any;
      repository.listInvocationsByExecution.mockResolvedValue(mockInvocations);

      const result = await service.listByExecution('exec-1');

      expect(result).toEqual(mockInvocations);
      expect(repository.listInvocationsByExecution).toHaveBeenCalledWith('exec-1');
    });
  });

  describe('listByVersion', () => {
    it('should return invocations sorted by startedAt DESC', async () => {
      const mockInvocations = [
        { id: 'inv-2', startedAt: new Date('2024-01-02') },
        { id: 'inv-1', startedAt: new Date('2024-01-01') },
      ] as any;
      repository.listInvocationsByVersion.mockResolvedValue(mockInvocations);

      const result = await service.listByVersion('ver-1');

      expect(result).toEqual(mockInvocations);
      expect(repository.listInvocationsByVersion).toHaveBeenCalledWith('ver-1', undefined);
    });

    it('should pass limit parameter', async () => {
      repository.listInvocationsByVersion.mockResolvedValue([]);

      await service.listByVersion('ver-1', 50);

      expect(repository.listInvocationsByVersion).toHaveBeenCalledWith('ver-1', 50);
    });
  });
});