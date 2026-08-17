import { Injectable, Logger } from '@nestjs/common';
import { LlmOperationRegistryService } from '../registry/llm-operation-registry.service';
import type {
  LlmOperationVersionRecord,
  LegacyLlmOperationVersion,
  Environment,
} from '../registry/types';
import type { FixtureBundle, FixtureCase, FixtureRunResult, FixtureRunSummary } from './types';
import { InputValidatorService } from '../runtime/input-validator.service';
import { OutputValidatorService } from '../runtime/output-validator.service';
import { ToolCallGuardService } from '../runtime/tool-call-guard.service';
import { BudgetEnforcerService } from '../runtime/budget-enforcer.service';

@Injectable()
export class FixtureRunnerService {
  constructor(
    private readonly registry: LlmOperationRegistryService,
    private readonly inputValidator: InputValidatorService,
    private readonly outputValidator: OutputValidatorService,
    private readonly toolCallGuard: ToolCallGuardService,
    private readonly budgetEnforcer: BudgetEnforcerService,
    private readonly logger: Logger,
  ) {}

  public async runFixtures(
    bundle: FixtureBundle,
    environment: Environment,
  ): Promise<FixtureRunSummary> {
    const resolved = await this.registry.resolveActiveVersion(bundle.operationId, environment);
    return this.runFixturesAgainstVersion(bundle, resolved.version);
  }

  public async runFixturesForExactVersion(
    bundle: FixtureBundle,
    operationKey: string,
    version: string,
  ): Promise<FixtureRunSummary> {
    const exactVersion = await this.registry.resolveExactVersion(operationKey, version);
    if (!exactVersion) {
      throw new Error(`Version not found: ${operationKey}@${version}`);
    }
    return this.runFixturesAgainstVersion(bundle, exactVersion);
  }

  private runFixturesAgainstVersion(
    bundle: FixtureBundle,
    version: LlmOperationVersionRecord | LegacyLlmOperationVersion,
  ): FixtureRunSummary {
    const results: FixtureRunResult[] = [];

    for (const fixtureCase of bundle.cases) {
      results.push(this.executeCase(fixtureCase, version));
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;

    return {
      totalCases: results.length,
      passed,
      failed,
      results,
    };
  }

  public validateBundleCoverage(
    bundle: FixtureBundle,
    exemptCategories: string[] = [],
  ): { ok: boolean; missingCategories: string[] } {
    const requiredCategories = ['normal', 'schema-fail', 'invalid-json', 'tool-call', 'over-budget'];
    const exempted = new Set(exemptCategories);
    const foundCategories = new Set<string>();

    for (const fixtureCase of bundle.cases) {
      const expectedError = fixtureCase.errorContains?.toLowerCase() || '';
      if (!fixtureCase.isNegative && !fixtureCase.errorContains) {
        foundCategories.add('normal');
      } else if (expectedError.includes('schema') || expectedError.includes('validation')) {
        foundCategories.add('schema-fail');
      } else if (expectedError.includes('json') || expectedError.includes('parse')) {
        foundCategories.add('invalid-json');
      } else if (expectedError.includes('tool') || expectedError.includes('function')) {
        foundCategories.add('tool-call');
      } else if (expectedError.includes('budget') || expectedError.includes('token')) {
        foundCategories.add('over-budget');
      }
    }

    const missingCategories = requiredCategories.filter(
      (cat) => !foundCategories.has(cat) && !exempted.has(cat),
    );
    return {
      ok: missingCategories.length === 0,
      missingCategories,
    };
  }

  private executeCase(
    fixtureCase: FixtureCase,
    version: LlmOperationVersionRecord | LegacyLlmOperationVersion,
  ): FixtureRunResult {
    const startedAt = Date.now();
    const manifest = version.manifestJson;
    const inputSchema = manifest.inputSchema as Record<string, unknown> | null;
    const outputSchema = manifest.outputSchema as Record<string, unknown> | null;

    try {
      if (fixtureCase.name.includes('over-budget') || fixtureCase.errorContains?.includes('budget')) {
        return this.handleOverBudgetCase(fixtureCase, manifest, startedAt);
      }

      if (inputSchema) {
        try {
          this.inputValidator.validate(fixtureCase.input, inputSchema);
        } catch (error: unknown) {
          const failure = this.readError(error);
          const expectedError = fixtureCase.errorContains?.toLowerCase();
          if (
            fixtureCase.isNegative &&
            expectedError &&
            failure.message.toLowerCase().includes(expectedError)
          ) {
            return {
              caseName: fixtureCase.name,
              passed: true,
              errorCode: failure.code || 'INPUT_SCHEMA_VIOLATION',
              errorMessage: failure.message,
              durationMs: Date.now() - startedAt,
            };
          }
          return {
            caseName: fixtureCase.name,
            passed: false,
            errorCode: failure.code || 'INPUT_SCHEMA_VIOLATION',
            errorMessage: failure.message,
            durationMs: Date.now() - startedAt,
          };
        }
      }

      const mockResponse = this.constructMockResponse(fixtureCase);

      if (fixtureCase.name.includes('tool-call') || fixtureCase.name.includes('tool_call')) {
        return this.handleToolCallCase(fixtureCase, mockResponse, startedAt);
      }

      try {
        const rawText = this.constructMockText(mockResponse);
        const parsed = this.outputValidator.parseAndValidate(rawText, outputSchema);

        if (fixtureCase.expectedOutput) {
          const matches = this.deepEqual(parsed.data, fixtureCase.expectedOutput);
          if (!matches && !fixtureCase.isNegative) {
            return {
              caseName: fixtureCase.name,
              passed: false,
              errorCode: 'OUTPUT_MISMATCH',
              errorMessage: 'Output does not match expected',
              actualOutput: parsed.data,
              durationMs: Date.now() - startedAt,
            };
          }
        }

        if (fixtureCase.isNegative) {
          return {
            caseName: fixtureCase.name,
            passed: false,
            errorCode: 'NEGATIVE_CASE_PASSED',
            errorMessage: 'Expected to fail but passed',
            actualOutput: parsed.data,
            durationMs: Date.now() - startedAt,
          };
        }

        return {
          caseName: fixtureCase.name,
          passed: true,
          actualOutput: parsed.data,
          durationMs: Date.now() - startedAt,
        };
      } catch (error: unknown) {
        const failure = this.readError(error);
        if (fixtureCase.isNegative && fixtureCase.errorContains) {
          if (
            failure.message
              .toLowerCase()
              .includes(fixtureCase.errorContains.toLowerCase())
          ) {
            return {
              caseName: fixtureCase.name,
              passed: true,
              errorCode: failure.code || 'UNKNOWN_ERROR',
              errorMessage: failure.message,
              durationMs: Date.now() - startedAt,
            };
          }
        }
        return {
          caseName: fixtureCase.name,
          passed: false,
          errorCode: failure.code || 'UNKNOWN_ERROR',
          errorMessage: failure.message,
          durationMs: Date.now() - startedAt,
        };
      }
    } catch (error: unknown) {
      const failure = this.readError(error);
      return {
        caseName: fixtureCase.name,
        passed: false,
        errorCode: 'FIXTURE_ERROR',
        errorMessage: failure.message,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  private handleOverBudgetCase(
    fixtureCase: FixtureCase,
    manifest: Record<string, unknown>,
    startedAt: number,
  ): FixtureRunResult {
    const maxInputTokens =
      typeof manifest.maxInputTokens === 'number' ? manifest.maxInputTokens : 1000;
    try {
      this.budgetEnforcer.preflightInput(fixtureCase.input, maxInputTokens);
      return {
        caseName: fixtureCase.name,
        passed: fixtureCase.isNegative ? false : true,
        errorCode: fixtureCase.isNegative ? 'NEGATIVE_CASE_PASSED' : undefined,
        errorMessage: fixtureCase.isNegative ? 'Expected budget error but passed' : undefined,
        durationMs: Date.now() - startedAt,
      };
    } catch (error: unknown) {
      const failure = this.readError(error);
      if (fixtureCase.isNegative && fixtureCase.errorContains) {
        const matches = failure.message
          .toLowerCase()
          .includes(fixtureCase.errorContains.toLowerCase());
        return {
          caseName: fixtureCase.name,
          passed: matches,
          errorCode: matches ? failure.code : 'ERROR_MISMATCH',
          errorMessage: failure.message,
          durationMs: Date.now() - startedAt,
        };
      }
      return {
        caseName: fixtureCase.name,
        passed: false,
        errorCode: failure.code || 'BUDGET_EXCEEDED',
        errorMessage: failure.message,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  private handleToolCallCase(
    fixtureCase: FixtureCase,
    mockResponse: Record<string, unknown>,
    startedAt: number,
  ): FixtureRunResult {
    try {
      this.toolCallGuard.assertNoToolCall(mockResponse);
      return {
        caseName: fixtureCase.name,
        passed: false,
        errorCode: 'TOOL_CALL_EXPECTED',
        errorMessage: 'Expected tool call detection but got clean response',
        durationMs: Date.now() - startedAt,
      };
    } catch (error: unknown) {
      const failure = this.readError(error);
      if (fixtureCase.isNegative) {
        return {
          caseName: fixtureCase.name,
          passed: true,
          errorCode: failure.code,
          errorMessage: failure.message,
          durationMs: Date.now() - startedAt,
        };
      }
      return {
        caseName: fixtureCase.name,
        passed: false,
        errorCode: failure.code || 'TOOL_CALL_FORBIDDEN',
        errorMessage: failure.message,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  private constructMockResponse(fixtureCase: FixtureCase): Record<string, unknown> {
    if (fixtureCase.name.includes('tool-call') || fixtureCase.name.includes('tool_call')) {
      return {
        content: 'mock response',
        tool_calls: [
          {
            id: 'call_mock',
            type: 'function',
            function: {
              name: 'mock_tool',
              arguments: '{}',
            },
          },
        ],
      };
    }

    if (fixtureCase.name.includes('invalid-json') || fixtureCase.errorContains?.includes('JSON')) {
      return {
        content: 'this is not valid JSON {{{',
      };
    }

    return {
      content: JSON.stringify(fixtureCase.expectedOutput || { result: 'mock-success' }),
    };
  }

  private constructMockText(response: Record<string, unknown>): string {
    return typeof response.content === 'string' ? response.content : JSON.stringify(response);
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private readError(error: unknown): { message: string; code?: string } {
    if (error instanceof Error) {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
      return { message: error.message, code };
    }
    return { message: String(error) };
  }
}
