import { Logger } from '@nestjs/common';
import { EvalRunnerService } from '../src/modules/llm-operation/eval/eval-runner.service';
import type { LlmOperationRegistryService } from '../src/modules/llm-operation/registry/llm-operation-registry.service';
import type { LlmOperationV2RuntimeService } from '../src/modules/llm-operation/runtime/llm-operation-v2-runtime.service';
import type { LlmOperationRepository } from '../src/modules/llm-operation/registry/llm-operation.repository';
import { RegressionComparatorService } from '../src/modules/llm-operation/eval/regression-comparator.service';
import type { EvalRunConfig } from '../src/modules/llm-operation/eval/types';

describe('EvalRunnerService', () => {
  let service: EvalRunnerService;
  let registry: jest.Mocked<LlmOperationRegistryService>;
  let operationRuntime: jest.Mocked<LlmOperationV2RuntimeService>;
  let repository: jest.Mocked<LlmOperationRepository>;
  let comparator: jest.Mocked<RegressionComparatorService>;

  beforeEach(() => {
    registry = {
      resolveExactVersion: jest.fn(),
    } as any;

    operationRuntime = {
      executeForEvaluation: jest.fn(),
    } as any;

    repository = {
      findEvalSuite: jest.fn(),
      findEvalCasesBySuiteId: jest.fn(),
      insertEvalRun: jest.fn(),
      updateEvalRun: jest.fn(),
      findEvalRunById: jest.fn(),
      listEvalRunsByVersionId: jest.fn(),
      findApprovedVersionByOperationKeyAndVersion: jest.fn(),
    } as any;
    repository.findEvalCasesBySuiteId.mockResolvedValue([]);

    comparator = {
      compare: jest.fn(),
    } as any;

    const logger = new Logger();
    service = new EvalRunnerService(
      registry,
      operationRuntime,
      repository,
      comparator,
      logger,
    );
  });

  describe('startEvalRun', () => {
    it('should create eval run and return runId', async () => {
      const config: EvalRunConfig = {
        operationKey: 'test-op',
        version: '1.0.0',
        suiteId: 'suite-1',
        actor: 'test-user',
      };

      registry.resolveExactVersion.mockResolvedValue({
        id: 'version-1',
        operationId: 'test-op',
        version: '1.0.0',
        state: 'approved',
        manifestJson: {
          modelPolicyId: 'policy-1',
          temperature: 0.7,
        },
        operationDigest: 'digest',
        contractDigest: 'cdigest',
        changeSummary: '',
        source: 'admin_created',
        approvedBy: null,
        approvedAt: null,
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      repository.findEvalSuite.mockResolvedValue({
        id: 'suite-1',
        operationId: 'test-op',
        versionId: null,
        name: 'Test Suite',
        description: 'Test',
        suiteDigest: 'digest',
        createdBy: 'admin',
        createdAt: new Date(),
      } as any);

      repository.insertEvalRun.mockResolvedValue({
        id: 'run-1',
        versionId: 'version-1',
        suiteId: 'suite-1',
        modelPolicySnapshot: {},
        resultsJson: {},
        metricsJson: {},
        baselineVersionId: null,
        executedBy: 'test-user',
        startedAt: new Date(),
        completedAt: null,
      } as any);

      const runId = await service.startEvalRun(config);

      expect(runId).toBeDefined();
      expect(runId).toBe('run-1');
      expect(repository.insertEvalRun).toHaveBeenCalled();
      expect(repository.insertEvalRun).toHaveBeenCalledWith(
        expect.objectContaining({
          versionId: 'version-1',
          suiteId: 'suite-1',
          executedBy: 'test-user',
        }),
      );
    });

    it('should throw error when version not found', async () => {
      const config: EvalRunConfig = {
        operationKey: 'test-op',
        version: '1.0.0',
        suiteId: 'suite-1',
        actor: 'test-user',
      };

      registry.resolveExactVersion.mockResolvedValue(null);

      await expect(service.startEvalRun(config)).rejects.toThrow('Version not found');
    });

    it('should throw error when suite not found', async () => {
      const config: EvalRunConfig = {
        operationKey: 'test-op',
        version: '1.0.0',
        suiteId: 'suite-1',
        actor: 'test-user',
      };

      registry.resolveExactVersion.mockResolvedValue({
        id: 'version-1',
        operationId: 'test-op',
        version: '1.0.0',
        state: 'approved',
        manifestJson: {},
        operationDigest: 'digest',
        contractDigest: 'cdigest',
        changeSummary: '',
        source: 'admin_created',
        approvedBy: null,
        approvedAt: null,
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      repository.findEvalSuite.mockResolvedValue(null);

      await expect(service.startEvalRun(config)).rejects.toThrow('Eval suite not found');
    });
  });

  describe('getEvalRunResult', () => {
    it('should return eval run result when found', async () => {
      repository.findEvalRunById.mockResolvedValue({
        id: 'run-1',
        versionId: 'version-1',
        suiteId: 'suite-1',
        modelPolicySnapshot: {},
        resultsJson: {
          fixtureResults: [{ caseName: 'test', passed: true, durationMs: 100 }],
        },
        metricsJson: {
          schemaPassRate: 1.0,
          taskSuccessRate: 1.0,
          avgInputTokens: 100,
          avgOutputTokens: 50,
          avgLatencyMs: 200,
          p95LatencyMs: 300,
          totalEstimatedCost: 0.01,
          safetyRejectRate: 0,
        },
        baselineVersionId: null,
        executedBy: 'test-user',
        startedAt: new Date(),
        completedAt: new Date(),
      } as any);

      const result = await service.getEvalRunResult('run-1');

      expect(result).toBeDefined();
      expect(result?.runId).toBe('run-1');
      expect(result?.passed).toBe(true);
      expect(result?.fixtureResults).toHaveLength(1);
    });

    it('should return null when run not found', async () => {
      repository.findEvalRunById.mockResolvedValue(null);

      const result = await service.getEvalRunResult('run-unknown');

      expect(result).toBeNull();
    });

    it('should fail the result when task quality is below the gate', async () => {
      repository.findEvalRunById.mockResolvedValue({
        id: 'run-1',
        versionId: 'version-1',
        suiteId: 'suite-1',
        modelPolicySnapshot: {},
        resultsJson: { fixtureResults: [] },
        metricsJson: {
          schemaPassRate: 1,
          taskSuccessRate: 0.5,
          avgInputTokens: 100,
          avgOutputTokens: 50,
          avgLatencyMs: 200,
          p95LatencyMs: 300,
          totalEstimatedCost: 0.01,
          safetyRejectRate: 0,
        },
        baselineVersionId: null,
        executedBy: 'test-user',
        startedAt: new Date(),
        completedAt: new Date(),
      } as any);

      const result = await service.getEvalRunResult('run-1');

      expect(result?.passed).toBe(false);
      expect(result?.gateViolations).toContain('taskSuccessRate 0.5 is below 0.9');
    });
  });

  describe('async execution', () => {
    it('should execute cases asynchronously after startEvalRun returns', async () => {
      const config: EvalRunConfig = {
        operationKey: 'test-op',
        version: '1.0.0',
        suiteId: 'suite-1',
        actor: 'test-user',
      };

      registry.resolveExactVersion.mockResolvedValue({
        id: 'version-1',
        operationId: 'test-op',
        version: '1.0.0',
        state: 'approved',
        manifestJson: {},
        operationDigest: 'digest',
        contractDigest: 'cdigest',
        changeSummary: '',
        source: 'admin_created',
        approvedBy: null,
        approvedAt: null,
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      repository.findEvalSuite.mockResolvedValue({
        id: 'suite-1',
        operationId: 'test-op',
        versionId: null,
        name: 'Test Suite',
        description: 'Test',
        suiteDigest: 'digest',
        createdBy: 'admin',
        createdAt: new Date(),
      } as any);

      repository.insertEvalRun.mockResolvedValue({
        id: 'run-1',
        versionId: 'version-1',
        suiteId: 'suite-1',
        modelPolicySnapshot: {},
        resultsJson: {},
        metricsJson: {},
        baselineVersionId: null,
        executedBy: 'test-user',
        startedAt: new Date(),
        completedAt: null,
      } as any);

      repository.findEvalCasesBySuiteId.mockResolvedValue([
        {
          id: 'case-1',
          suiteId: 'suite-1',
          name: 'test-case',
          inputJson: { input: 'test' },
          expectedJson: null,
          isNegative: false,
          errorContains: null,
          createdAt: new Date(),
        },
      ] as any);

      operationRuntime.executeForEvaluation.mockResolvedValue({
        success: true,
        operationRef: { id: 'test-op', version: '1.0.0', digest: 'digest' },
        source: 'database',
        data: { result: 'ok' },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        metadata: {
          provider: 'test',
          requestedModel: 'test',
          repairAttempts: 0,
          latencyMs: 1,
          schemaValidated: true,
          toolCallDetected: false,
        },
      });

      repository.findEvalRunById.mockResolvedValue({
        id: 'run-1',
        versionId: 'version-1',
        suiteId: 'suite-1',
        modelPolicySnapshot: {},
        resultsJson: {},
        metricsJson: {},
        baselineVersionId: null,
        executedBy: 'test-user',
        startedAt: new Date(),
        completedAt: null,
      } as any);

      const runId = await service.startEvalRun(config);

      expect(runId).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(operationRuntime.executeForEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          operationVersion: '1.0.0',
          operationDigest: 'digest',
          contractDigest: 'cdigest',
          idempotencyKey: 'eval:run-1:case-1',
        }),
      );
      expect(repository.updateEvalRun).toHaveBeenCalled();
    });
  });

  describe('baseline comparison', () => {
    it('should compare against baseline when provided', async () => {
      const config: EvalRunConfig = {
        operationKey: 'test-op',
        version: '1.0.0',
        baselineVersion: '0.9.0',
        suiteId: 'suite-1',
        actor: 'test-user',
      };

      registry.resolveExactVersion.mockResolvedValue({
        id: 'version-1',
        operationId: 'test-op',
        version: '1.0.0',
        state: 'approved',
        manifestJson: {},
        operationDigest: 'digest',
        contractDigest: 'cdigest',
        changeSummary: '',
        source: 'admin_created',
        approvedBy: null,
        approvedAt: null,
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      repository.findEvalSuite.mockResolvedValue({
        id: 'suite-1',
        operationId: 'test-op',
        versionId: null,
        name: 'Test Suite',
        description: 'Test',
        suiteDigest: 'digest',
        createdBy: 'admin',
        createdAt: new Date(),
      } as any);

      repository.insertEvalRun.mockResolvedValue({
        id: 'run-1',
        versionId: 'version-1',
        suiteId: 'suite-1',
        modelPolicySnapshot: {},
        resultsJson: {},
        metricsJson: {},
        baselineVersionId: 'baseline-version-1',
        executedBy: 'test-user',
        startedAt: new Date(),
        completedAt: null,
      } as any);

      repository.findApprovedVersionByOperationKeyAndVersion.mockResolvedValue({
        id: 'baseline-version-1',
        operationId: 'test-op',
        version: '0.9.0',
        state: 'approved',
        manifestJson: {},
        operationDigest: 'baseline-digest',
        contractDigest: 'baseline-cdigest',
        changeSummary: '',
        source: 'admin_created',
        approvedBy: null,
        approvedAt: null,
        createdBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const runId = await service.startEvalRun(config);

      expect(runId).toBeDefined();
      expect(repository.findApprovedVersionByOperationKeyAndVersion).toHaveBeenCalledWith(
        'test-op',
        '0.9.0',
      );
    });
  });
});
