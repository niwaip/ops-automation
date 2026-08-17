import { Inject, Injectable, Logger } from '@nestjs/common';
import { LlmOperationRegistryService } from '../registry/llm-operation-registry.service';
import {
  LLM_OPERATION_REPOSITORY,
  type LlmOperationRepository,
} from '../registry/llm-operation.repository';
import { LlmOperationV2RuntimeService } from '../runtime/llm-operation-v2-runtime.service';
import type {
  EvalRunConfig,
  EvalRunResult,
  EvalRunMetrics,
  FixtureRunResult,
  EvalRegressionComparison,
} from './types';
import { RegressionComparatorService } from './regression-comparator.service';

@Injectable()
export class EvalRunnerService {
  constructor(
    private readonly registry: LlmOperationRegistryService,
    private readonly operationRuntime: LlmOperationV2RuntimeService,
    @Inject(LLM_OPERATION_REPOSITORY)
    private readonly repository: LlmOperationRepository,
    private readonly comparator: RegressionComparatorService,
    private readonly logger: Logger,
  ) {}

  public async startEvalRun(config: EvalRunConfig): Promise<string> {
    const prepared = await this.prepareEvalRun(config);
    this.executeEvalRunAsync(prepared.runId, config, prepared.version).catch((err) => {
      this.logger.error(`Eval run ${prepared.runId} failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      void this.markEvalRunFailed(prepared.runId, err);
    });
    return prepared.runId;
  }

  public async runEvalAndWait(config: EvalRunConfig): Promise<EvalRunResult> {
    const prepared = await this.prepareEvalRun(config);
    try {
      await this.executeEvalRunAsync(prepared.runId, config, prepared.version);
    } catch (error) {
      await this.markEvalRunFailed(prepared.runId, error);
    }
    const result = await this.getEvalRunResult(prepared.runId);
    if (!result) throw new Error(`Eval result disappeared: ${prepared.runId}`);
    return result;
  }

  private async prepareEvalRun(config: EvalRunConfig): Promise<{
    runId: string;
    version: {
      id: string;
      operationId: string;
      version: string;
      operationDigest: string;
      contractDigest: string;
    };
  }> {
    const version = await this.registry.resolveExactVersion(config.operationKey, config.version);
    if (!version) {
      throw new Error(`Version not found: ${config.operationKey}@${config.version}`);
    }

    const suite = await this.repository.findEvalSuite(config.suiteId);
    if (!suite) {
      throw new Error(`Eval suite not found: ${config.suiteId}`);
    }
    if (suite.operationId !== version.operationId) {
      throw new Error(
        `Eval suite '${suite.id}' does not belong to ${config.operationKey}@${config.version}`,
      );
    }

    const baselineVersionId = config.baselineVersion
      ? await this.findBaselineVersionId(config.operationKey, config.baselineVersion)
      : null;
    const operationManifest = version.manifestJson;

    const persistedRun = await this.repository.insertEvalRun({
      versionId: version.id,
      suiteId: suite.id,
      modelPolicySnapshot: {
        modelPolicyId: operationManifest.modelPolicyId,
        temperature: operationManifest.temperature,
        maxInputTokens: operationManifest.maxInputTokens,
        maxOutputTokens: operationManifest.maxOutputTokens,
      },
      resultsJson: {},
      metricsJson: {},
      baselineVersionId,
      executedBy: config.actor,
      startedAt: new Date(),
      completedAt: null,
    });
    const runId = persistedRun.id;
    return { runId, version };
  }

  public async getEvalRunResult(runId: string): Promise<EvalRunResult | null> {
    const run = await this.repository.findEvalRunById(runId);
    if (!run) {
      return null;
    }

    const metrics = run.metricsJson as unknown as EvalRunMetrics;
    const results = run.resultsJson as unknown as { fixtureResults?: FixtureRunResult[]; baselineComparison?: EvalRegressionComparison };
    const gateViolations: string[] = [];
    if (metrics.schemaPassRate < 1) {
      gateViolations.push(`schemaPassRate ${metrics.schemaPassRate} is below 1`);
    }
    if (metrics.taskSuccessRate < 0.9) {
      gateViolations.push(`taskSuccessRate ${metrics.taskSuccessRate} is below 0.9`);
    }
    if (metrics.safetyRejectRate > 0.05) {
      gateViolations.push(`safetyRejectRate ${metrics.safetyRejectRate} exceeds 0.05`);
    }

    return {
      runId: run.id,
      config: {
        operationKey: '',
        version: '',
        suiteId: run.suiteId,
        actor: run.executedBy,
      },
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      metrics,
      fixtureResults: results.fixtureResults || [],
      baselineComparison: results.baselineComparison,
      passed: run.completedAt !== null && gateViolations.length === 0,
      gateViolations,
    };
  }

  private async executeEvalRunAsync(
    runId: string,
    config: EvalRunConfig,
    version: {
      id: string;
      operationId: string;
      version: string;
      operationDigest: string;
      contractDigest: string;
    },
  ): Promise<void> {
    const suite = await this.repository.findEvalSuite(config.suiteId);
    if (!suite) {
      throw new Error(`Suite not found: ${config.suiteId}`);
    }

    const cases = await this.repository.findEvalCasesBySuiteId(suite.id);
    const liveCases = cases.filter((testCase) => !testCase.isNegative);

    const fixtureResults: FixtureRunResult[] = [];
    const latencies: number[] = [];
    const inputTokens: number[] = [];
    const outputTokens: number[] = [];
    let schemaPassCount = 0;
    let taskSuccessCount = 0;
    let safetyRejectCount = 0;

    for (const testCase of liveCases) {
      const startMs = Date.now();

      try {
        const result = await this.operationRuntime.executeForEvaluation({
          executionId: runId,
          stepId: testCase.id,
          operationId: config.operationKey,
          operationVersion: version.version,
          operationDigest: version.operationDigest,
          contractDigest: version.contractDigest,
          environment: 'staging',
          input: testCase.inputJson,
          idempotencyKey: `eval:${runId}:${testCase.id}`,
          actor: config.actor,
        });

        const durationMs = Date.now() - startMs;
        latencies.push(durationMs);

        if (result.success) {
          const expectedMatches = testCase.expectedJson
            ? this.matchesExpectedShape(result.data, testCase.expectedJson)
            : true;
          const passed = !testCase.isNegative && expectedMatches;
          if (passed) {
            taskSuccessCount++;
            schemaPassCount++;
          }

          if (result.usage?.totalTokens) {
            inputTokens.push(result.usage.inputTokens || 0);
            outputTokens.push(result.usage.outputTokens || 0);
          }

          fixtureResults.push({
            caseName: testCase.name,
            passed,
            actualOutput: result.data,
            errorCode: passed
              ? undefined
              : testCase.isNegative
                ? 'NEGATIVE_CASE_PASSED'
                : 'OUTPUT_MISMATCH',
            errorMessage: passed
              ? undefined
              : testCase.isNegative
                ? 'Expected the negative case to be rejected but it succeeded'
                : 'Output does not match expectedJson',
            durationMs,
          });
        } else {
          const expectedNegativeFailure =
            testCase.isNegative &&
            (!testCase.errorContains || result.errorMessage?.includes(testCase.errorContains));
          if (expectedNegativeFailure) {
            taskSuccessCount++;
            schemaPassCount++;
          } else if (result.errorMessage?.includes('safety') || result.errorMessage?.includes('sensitive')) {
            safetyRejectCount++;
          }

          fixtureResults.push({
            caseName: testCase.name,
            passed: Boolean(expectedNegativeFailure),
            errorMessage: result.errorMessage,
            errorCode: expectedNegativeFailure ? result.errorCode : 'EXECUTION_FAILED',
            durationMs,
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        const durationMs = Date.now() - startMs;
        latencies.push(durationMs);

        fixtureResults.push({
          caseName: testCase.name,
          passed: false,
          errorMessage: errorMsg,
          errorCode: 'EXCEPTION',
          durationMs,
        });
      }
    }

    const totalCases = liveCases.length;
    const metrics: EvalRunMetrics = {
      schemaPassRate: totalCases > 0 ? schemaPassCount / totalCases : 0,
      taskSuccessRate: totalCases > 0 ? taskSuccessCount / totalCases : 0,
      avgInputTokens: inputTokens.length > 0 ? inputTokens.reduce((a, b) => a + b, 0) / inputTokens.length : 0,
      avgOutputTokens: outputTokens.length > 0 ? outputTokens.reduce((a, b) => a + b, 0) / outputTokens.length : 0,
      avgLatencyMs: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p95LatencyMs: this.calculateP95(latencies),
      totalEstimatedCost: 0,
      safetyRejectRate: totalCases > 0 ? safetyRejectCount / totalCases : 0,
    };

    let baselineComparison: EvalRegressionComparison | undefined;
    const run = await this.repository.findEvalRunById(runId);
    if (run?.baselineVersionId) {
      const baselineRuns = await this.repository.listEvalRunsByVersionId(run.baselineVersionId);
      if (baselineRuns.length > 0) {
        const baselineMetrics = baselineRuns[0]!.metricsJson as unknown as EvalRunMetrics;
        baselineComparison = this.comparator.compare(baselineMetrics, metrics);
      }
    }

    await this.repository.updateEvalRun(runId, {
      completedAt: new Date(),
      metricsJson: { ...metrics },
      resultsJson: { fixtureResults, baselineComparison },
    });
  }

  private async markEvalRunFailed(runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.repository.updateEvalRun(runId, {
      completedAt: new Date(),
      metricsJson: {
        schemaPassRate: 0,
        taskSuccessRate: 0,
        avgInputTokens: 0,
        avgOutputTokens: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        totalEstimatedCost: 0,
        safetyRejectRate: 0,
      },
      resultsJson: { error: message },
    });
  }

  private calculateP95(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[index] || 0;
  }

  private matchesExpectedShape(actual: unknown, expected: unknown): boolean {
    if (expected === null || expected === undefined) return true;
    if (Array.isArray(expected)) {
      return Array.isArray(actual) &&
        (expected.length === 0 || actual.every((item) => this.matchesExpectedShape(item, expected[0])));
    }
    if (typeof expected === 'object') {
      if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
      return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
        key in (actual as Record<string, unknown>) &&
        this.matchesExpectedShape((actual as Record<string, unknown>)[key], value),
      );
    }
    return typeof actual === typeof expected;
  }

  private async findBaselineVersionId(operationKey: string, version: string): Promise<string | null> {
    const baselineVersion = await this.repository.findApprovedVersionByOperationKeyAndVersion(
      operationKey,
      version,
    );
    return baselineVersion?.id || null;
  }
}
