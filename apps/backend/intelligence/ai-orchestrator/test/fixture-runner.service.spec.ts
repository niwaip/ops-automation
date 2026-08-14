import { Logger } from '@nestjs/common';
import { FixtureRunnerService } from '../src/modules/llm-operation/eval/fixture-runner.service';
import type { LlmOperationRegistryService } from '../src/modules/llm-operation/registry/llm-operation-registry.service';
import { InputValidatorService } from '../src/modules/llm-operation/runtime/input-validator.service';
import { OutputValidatorService } from '../src/modules/llm-operation/runtime/output-validator.service';
import { ToolCallGuardService } from '../src/modules/llm-operation/runtime/tool-call-guard.service';
import { BudgetEnforcerService } from '../src/modules/llm-operation/runtime/budget-enforcer.service';
import type { FixtureBundle } from '../src/modules/llm-operation/eval/types';
import { LlmOperationError } from '../src/modules/llm-operation/registry/errors';

describe('FixtureRunnerService', () => {
  let service: FixtureRunnerService;
  let registry: jest.Mocked<LlmOperationRegistryService>;
  let inputValidator: jest.Mocked<InputValidatorService>;
  let outputValidator: jest.Mocked<OutputValidatorService>;
  let toolCallGuard: jest.Mocked<ToolCallGuardService>;
  let budgetEnforcer: jest.Mocked<BudgetEnforcerService>;

  beforeEach(() => {
    registry = {
      resolveActiveVersion: jest.fn(),
    } as any;

    inputValidator = {
      validate: jest.fn(),
    } as any;

    outputValidator = {
      parseAndValidate: jest.fn(),
    } as any;

    toolCallGuard = {
      assertNoToolCall: jest.fn(),
      detect: jest.fn(),
    } as any;

    budgetEnforcer = {
      preflightInput: jest.fn(),
      assertOutputWithinBudget: jest.fn(),
      assertLatencyWithinBudget: jest.fn(),
    } as any;

    const logger = new Logger();
    service = new FixtureRunnerService(
      registry,
      inputValidator,
      outputValidator,
      toolCallGuard,
      budgetEnforcer,
      logger,
    );
  });

  describe('validateBundleCoverage', () => {
    it('should return ok=true when all 5 categories are covered', () => {
      const bundle: FixtureBundle = {
        operationId: 'test-op',
        cases: [
          { name: 'normal', input: {}, isNegative: false },
          { name: 'schema-fail', input: {}, isNegative: true, errorContains: 'schema validation' },
          { name: 'invalid-json', input: {}, isNegative: true, errorContains: 'JSON parse' },
          { name: 'tool-call', input: {}, isNegative: true, errorContains: 'tool function' },
          { name: 'over-budget', input: {}, isNegative: true, errorContains: 'token budget' },
        ],
      };

      const result = service.validateBundleCoverage(bundle);

      expect(result.ok).toBe(true);
      expect(result.missingCategories).toEqual([]);
    });

    it('should detect missing tool-call category', () => {
      const bundle: FixtureBundle = {
        operationId: 'test-op',
        cases: [
          { name: 'normal', input: {}, isNegative: false },
          { name: 'schema-fail', input: {}, isNegative: true, errorContains: 'schema' },
          { name: 'invalid-json', input: {}, isNegative: true, errorContains: 'JSON' },
          { name: 'over-budget', input: {}, isNegative: true, errorContains: 'budget' },
        ],
      };

      const result = service.validateBundleCoverage(bundle);

      expect(result.ok).toBe(false);
      expect(result.missingCategories).toContain('tool-call');
    });
  });

  describe('runFixtures - Input Schema Validation', () => {
    it('should fail when input schema validation fails', async () => {
      const bundle: FixtureBundle = {
        operationId: 'test-op',
        cases: [
          { name: 'normal-case', input: { value: 'test' }, isNegative: false },
        ],
      };

      registry.resolveActiveVersion.mockResolvedValue({
        source: 'database',
        version: {
          id: 'v1',
          operationId: 'test-op',
          version: '1.0.0',
          state: 'approved',
          manifestJson: {
            inputSchema: { type: 'object', properties: { value: { type: 'number' } } },
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
        },
        operation: null,
      });

      inputValidator.validate.mockImplementation(() => {
        throw new LlmOperationError('INPUT_SCHEMA_VIOLATION', 'Input schema validation failed');
      });

      const result = await service.runFixtures(bundle, 'production');

      expect(result.totalCases).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].errorCode).toBe('INPUT_SCHEMA_VIOLATION');
      expect(inputValidator.validate).toHaveBeenCalled();
    });
  });

  describe('runFixtures - Output Schema Validation', () => {
    it('should validate output schema with real OutputValidator', async () => {
      const bundle: FixtureBundle = {
        operationId: 'test-op',
        cases: [
          { name: 'normal-case', input: {}, isNegative: false },
        ],
      };

      registry.resolveActiveVersion.mockResolvedValue({
        source: 'database',
        version: {
          id: 'v1',
          operationId: 'test-op',
          version: '1.0.0',
          state: 'approved',
          manifestJson: {
            outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
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
        },
        operation: null,
      });

      inputValidator.validate.mockReturnValue(undefined);
      outputValidator.parseAndValidate.mockReturnValue({
        data: { result: 'mock-success' },
        schemaValidated: true,
      });

      const result = await service.runFixtures(bundle, 'production');

      expect(result.totalCases).toBe(1);
      expect(result.passed).toBe(1);
      expect(outputValidator.parseAndValidate).toHaveBeenCalled();
    });

    it('should handle negative case expecting output parse failure', async () => {
      const bundle: FixtureBundle = {
        operationId: 'test-op',
        cases: [
          { name: 'invalid-json-case', input: {}, isNegative: true, errorContains: 'JSON' },
        ],
      };

      registry.resolveActiveVersion.mockResolvedValue({
        source: 'database',
        version: {
          id: 'v1',
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
        },
        operation: null,
      });

      inputValidator.validate.mockReturnValue(undefined);
      outputValidator.parseAndValidate.mockImplementation(() => {
        throw new LlmOperationError('OUTPUT_PARSE_FAILED', 'Failed to parse JSON from model output');
      });

      const result = await service.runFixtures(bundle, 'production');

      expect(result.totalCases).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.results[0].errorCode).toBe('OUTPUT_PARSE_FAILED');
    });
  });

  describe('runFixtures - Tool Call Detection', () => {
    it('should detect tool call and pass negative case', async () => {
      const bundle: FixtureBundle = {
        operationId: 'test-op',
        cases: [
          { name: 'tool-call-case', input: {}, isNegative: true, errorContains: 'tool' },
        ],
      };

      registry.resolveActiveVersion.mockResolvedValue({
        source: 'database',
        version: {
          id: 'v1',
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
        },
        operation: null,
      });

      inputValidator.validate.mockReturnValue(undefined);
      toolCallGuard.assertNoToolCall.mockImplementation(() => {
        throw new LlmOperationError('TOOL_CALL_FORBIDDEN', 'Tool call detected and forbidden');
      });

      const result = await service.runFixtures(bundle, 'production');

      expect(result.totalCases).toBe(1);
      expect(result.passed).toBe(1);
      expect(toolCallGuard.assertNoToolCall).toHaveBeenCalled();
    });

    it('should fail when tool call is expected but not detected', async () => {
      const bundle: FixtureBundle = {
        operationId: 'test-op',
        cases: [
          { name: 'tool-call-case', input: {}, isNegative: false },
        ],
      };

      registry.resolveActiveVersion.mockResolvedValue({
        source: 'database',
        version: {
          id: 'v1',
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
        },
        operation: null,
      });

      inputValidator.validate.mockReturnValue(undefined);
      toolCallGuard.assertNoToolCall.mockReturnValue(undefined);
      outputValidator.parseAndValidate.mockReturnValue({
        data: { result: 'ok' },
        schemaValidated: true,
      });

      const result = await service.runFixtures(bundle, 'production');

      expect(result.totalCases).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].errorCode).toBe('TOOL_CALL_EXPECTED');
    });
  });

  describe('runFixtures - Budget Enforcement', () => {
    it('should detect over-budget and pass negative case', async () => {
      const bundle: FixtureBundle = {
        operationId: 'test-op',
        cases: [
          { name: 'over-budget-case', input: { large: 'data' }, isNegative: true, errorContains: 'budget' },
        ],
      };

      registry.resolveActiveVersion.mockResolvedValue({
        source: 'database',
        version: {
          id: 'v1',
          operationId: 'test-op',
          version: '1.0.0',
          state: 'approved',
          manifestJson: {
            maxInputTokens: 100,
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
        },
        operation: null,
      });

      budgetEnforcer.preflightInput.mockImplementation(() => {
        throw new LlmOperationError('BUDGET_EXCEEDED', 'Input exceeds budget');
      });

      const result = await service.runFixtures(bundle, 'production');

      expect(result.totalCases).toBe(1);
      expect(result.passed).toBe(1);
      expect(budgetEnforcer.preflightInput).toHaveBeenCalled();
    });

    it('should fail when over-budget but error message does not match', async () => {
      const bundle: FixtureBundle = {
        operationId: 'test-op',
        cases: [
          { name: 'over-budget-case', input: { large: 'data' }, isNegative: true, errorContains: 'different-error' },
        ],
      };

      registry.resolveActiveVersion.mockResolvedValue({
        source: 'database',
        version: {
          id: 'v1',
          operationId: 'test-op',
          version: '1.0.0',
          state: 'approved',
          manifestJson: {
            maxInputTokens: 100,
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
        },
        operation: null,
      });

      budgetEnforcer.preflightInput.mockImplementation(() => {
        throw new LlmOperationError('BUDGET_EXCEEDED', 'Input exceeds budget');
      });

      const result = await service.runFixtures(bundle, 'production');

      expect(result.totalCases).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].errorCode).toBe('ERROR_MISMATCH');
    });
  });
});