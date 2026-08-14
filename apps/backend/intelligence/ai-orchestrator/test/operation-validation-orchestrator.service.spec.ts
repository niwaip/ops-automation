import { OperationValidationOrchestratorService } from '../src/modules/llm-operation/eval/operation-validation-orchestrator.service';
import { OperationManifestValidatorService } from '../src/modules/llm-operation/eval/operation-manifest-validator.service';
import { FixtureRunnerService } from '../src/modules/llm-operation/eval/fixture-runner.service';
import { EvalRunnerService } from '../src/modules/llm-operation/eval/eval-runner.service';
import { AttestationService } from '../src/modules/llm-operation/eval/attestation.service';
import type { LlmOperationRepository } from '../src/modules/llm-operation/registry/llm-operation.repository';
import type {
  LlmOperationRecord,
  LlmOperationVersionRecord,
} from '../src/modules/llm-operation/registry/types';
import { LLM_OPERATION_ERROR_CODES } from '../src/modules/llm-operation/registry/errors';

describe('OperationValidationOrchestratorService', () => {
  const operation: LlmOperationRecord = {
    id: 'operation-1',
    operationKey: 'summarize_text',
    displayName: 'Summarize text',
    description: 'Summarize text',
    owner: 'system',
    status: 'active',
    source: 'system_seed',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const version: LlmOperationVersionRecord = {
    id: 'version-1',
    operationId: operation.id,
    version: '1.0.1',
    state: 'validating',
    manifestJson: { prompt: {} },
    operationDigest: 'sha256:operation',
    contractDigest: 'sha256:contract',
    changeSummary: 'Prompt update',
    source: 'admin_created',
    approvedBy: null,
    approvedAt: null,
    createdBy: 'editor',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const suite = {
    id: 'suite-1',
    operationId: operation.id,
    versionId: null,
    name: 'baseline',
    description: null,
    suiteDigest: 'sha256:suite',
    createdBy: 'system',
    createdAt: new Date('2026-01-01'),
  };
  const cases = [
    { name: 'normal', isNegative: false, errorContains: null },
    { name: 'schema-fail', isNegative: true, errorContains: 'schema' },
    { name: 'invalid-json', isNegative: true, errorContains: 'JSON' },
    { name: 'tool-call', isNegative: true, errorContains: 'tool' },
    { name: 'over-budget', isNegative: true, errorContains: 'budget' },
  ].map((item, index) => ({
    id: `case-${index}`,
    suiteId: suite.id,
    inputJson: { text: 'input' },
    expectedJson: item.isNegative ? null : { summary: 'output' },
    createdAt: new Date('2026-01-01'),
    ...item,
  }));

  let repository: jest.Mocked<LlmOperationRepository>;
  let manifestValidator: jest.Mocked<OperationManifestValidatorService>;
  let fixtureRunner: jest.Mocked<FixtureRunnerService>;
  let evalRunner: jest.Mocked<EvalRunnerService>;
  let attestationService: jest.Mocked<AttestationService>;
  let service: OperationValidationOrchestratorService;

  beforeEach(() => {
    repository = {
      findEvalSuiteForVersion: jest.fn().mockResolvedValue(suite),
      findEvalCasesBySuiteId: jest.fn().mockResolvedValue(cases),
    } as unknown as jest.Mocked<LlmOperationRepository>;
    manifestValidator = {
      validate: jest.fn().mockReturnValue({
        passed: true,
        promptVariables: ['text'],
        inputFields: ['text'],
        outputFields: ['summary'],
        checks: ['closed-json-schema'],
      }),
    } as unknown as jest.Mocked<OperationManifestValidatorService>;
    fixtureRunner = {
      validateBundleCoverage: jest.fn().mockReturnValue({ ok: true, missingCategories: [] }),
      runFixturesForExactVersion: jest.fn().mockResolvedValue({
        totalCases: 5,
        passed: 5,
        failed: 0,
        results: [],
      }),
    } as unknown as jest.Mocked<FixtureRunnerService>;
    evalRunner = {
      runEvalAndWait: jest.fn().mockResolvedValue({
        runId: 'eval-1',
        config: {
          operationKey: operation.operationKey,
          version: version.version,
          suiteId: suite.id,
          actor: 'editor',
        },
        startedAt: new Date('2026-01-01'),
        completedAt: new Date('2026-01-01'),
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
      }),
    } as unknown as jest.Mocked<EvalRunnerService>;
    attestationService = {
      generateAttestation: jest.fn().mockResolvedValue({
        id: 'attestation-1',
        operationId: operation.id,
        versionId: version.id,
        operationDigest: version.operationDigest,
        contractDigest: version.contractDigest,
        evalSuiteDigest: suite.suiteDigest,
        validatorVersion: '1.0.0',
        gateResults: {
          schemaTests: 'passed',
          offlineEvals: 'passed',
          liveEvals: 'passed',
          securityEvals: 'passed',
        },
        createdAt: new Date('2026-01-01'),
      }),
    } as unknown as jest.Mocked<AttestationService>;
    service = new OperationValidationOrchestratorService(
      repository,
      manifestValidator,
      fixtureRunner,
      evalRunner,
      attestationService,
    );
  });

  it('validates the exact draft and creates a digest-bound attestation', async () => {
    const result = await service.validate({ operation, version, actor: 'editor' });

    expect(repository.findEvalSuiteForVersion).toHaveBeenCalledWith(operation.id, version.id);
    expect(fixtureRunner.runFixturesForExactVersion).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: operation.operationKey }),
      operation.operationKey,
      version.version,
    );
    expect(evalRunner.runEvalAndWait).toHaveBeenCalledWith({
      operationKey: operation.operationKey,
      version: version.version,
      suiteId: suite.id,
      actor: 'editor',
    });
    expect(attestationService.generateAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: operation.id,
        versionId: version.id,
        evalSuiteDigest: suite.suiteDigest,
        actor: 'editor',
      }),
    );
    expect(result.attestation.id).toBe('attestation-1');
  });

  it('fails closed when no Eval Suite is configured', async () => {
    repository.findEvalSuiteForVersion.mockResolvedValue(null);

    await expect(
      service.validate({ operation, version, actor: 'editor' }),
    ).rejects.toMatchObject({ code: LLM_OPERATION_ERROR_CODES.VALIDATION_FAILED });
    expect(fixtureRunner.runFixturesForExactVersion).not.toHaveBeenCalled();
  });

  it('fails closed when deterministic guard coverage is incomplete', async () => {
    fixtureRunner.validateBundleCoverage.mockReturnValue({
      ok: false,
      missingCategories: ['tool-call'],
    });

    await expect(
      service.validate({ operation, version, actor: 'editor' }),
    ).rejects.toMatchObject({
      code: LLM_OPERATION_ERROR_CODES.VALIDATION_FAILED,
      details: expect.objectContaining({ missingCategories: ['tool-call'] }),
    });
    expect(evalRunner.runEvalAndWait).not.toHaveBeenCalled();
  });
});
