import { GateEvaluatorService } from '../src/modules/llm-operation/eval/gate-evaluator.service';
import type { FixtureRunSummary, EvalRunResult, EvalRunMetrics } from '../src/modules/llm-operation/eval/types';

describe('GateEvaluatorService', () => {
  let service: GateEvaluatorService;

  beforeEach(() => {
    service = new GateEvaluatorService();
  });

  const createFixtureResult = (overrides: Partial<FixtureRunSummary> = {}): FixtureRunSummary => ({
    totalCases: 5,
    passed: 5,
    failed: 0,
    results: [],
    ...overrides,
  });

  const createMetrics = (overrides: Partial<EvalRunMetrics> = {}): EvalRunMetrics => ({
    schemaPassRate: 1.0,
    taskSuccessRate: 0.95,
    avgInputTokens: 100,
    avgOutputTokens: 200,
    avgLatencyMs: 500,
    p95LatencyMs: 800,
    totalEstimatedCost: 0.01,
    safetyRejectRate: 0,
    ...overrides,
  });

  const createEvalResult = (metrics: Partial<EvalRunMetrics> = {}): EvalRunResult => ({
    runId: 'run-1',
    config: {
      operationKey: 'test-op',
      version: '1.0.0',
      suiteId: 'suite-1',
      actor: 'admin',
    },
    startedAt: new Date(),
    completedAt: new Date(),
    metrics: createMetrics(metrics),
    fixtureResults: [],
    passed: true,
    gateViolations: [],
  });

  it('should pass all gates when metrics meet thresholds', () => {
    const fixtureResult = createFixtureResult();
    const evalResult = createEvalResult();

    const result = service.evaluate({ fixtureResult, evalResult });

    expect(result.gateResults.schemaTests).toBe('passed');
    expect(result.gateResults.offlineEvals).toBe('passed');
    expect(result.gateResults.liveEvals).toBe('passed');
    expect(result.gateResults.securityEvals).toBe('passed');
    expect(result.violations).toEqual([]);
  });

  it('should fail schema tests when fixture failures exist', () => {
    const fixtureResult = createFixtureResult({ passed: 4, failed: 1 });

    const result = service.evaluate({ fixtureResult });

    expect(result.gateResults.schemaTests).toBe('failed');
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('Schema tests failed');
  });

  it('should skip liveEvals when evalResult is missing', () => {
    const fixtureResult = createFixtureResult();

    const result = service.evaluate({ fixtureResult });

    expect(result.gateResults.liveEvals).toBe('skipped');
    expect(result.gateResults.securityEvals).toBe('skipped');
  });

  it('should fail liveEvals when schemaPassRate is below threshold', () => {
    const fixtureResult = createFixtureResult();
    const evalResult = createEvalResult({ schemaPassRate: 0.85 });

    const result = service.evaluate({ fixtureResult, evalResult });

    expect(result.gateResults.liveEvals).toBe('failed');
    expect(result.violations.some(v => v.includes('schemaPassRate'))).toBe(true);
  });

  it('should fail securityEvals when safetyRejectRate exceeds threshold', () => {
    const fixtureResult = createFixtureResult();
    const evalResult = createEvalResult({ safetyRejectRate: 0.08 });

    const result = service.evaluate({ fixtureResult, evalResult });

    expect(result.gateResults.securityEvals).toBe('failed');
    expect(result.violations.some(v => v.includes('safetyRejectRate'))).toBe(true);
  });

  it('should report multiple violations simultaneously', () => {
    const fixtureResult = createFixtureResult({ passed: 3, failed: 2 });
    const evalResult = createEvalResult({
      schemaPassRate: 0.85,
      safetyRejectRate: 0.08,
    });

    const result = service.evaluate({ fixtureResult, evalResult });

    expect(result.gateResults.schemaTests).toBe('failed');
    expect(result.gateResults.liveEvals).toBe('failed');
    expect(result.gateResults.securityEvals).toBe('failed');
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('should use custom thresholds', () => {
    const fixtureResult = createFixtureResult();
    const evalResult = createEvalResult({ taskSuccessRate: 0.85 });

    const result = service.evaluate({
      fixtureResult,
      evalResult,
      thresholds: { taskSuccessRateMin: 0.80 },
    });

    expect(result.gateResults.liveEvals).toBe('passed');
    expect(result.violations).toEqual([]);
  });

  it('should fail when p95 latency exceeds threshold', () => {
    const fixtureResult = createFixtureResult();
    const evalResult = createEvalResult({ p95LatencyMs: 2000 });

    const result = service.evaluate({
      fixtureResult,
      evalResult,
      thresholds: { latencyP95MaxMs: 1500 },
    });

    expect(result.gateResults.liveEvals).toBe('failed');
    expect(result.violations.some(v => v.includes('p95LatencyMs'))).toBe(true);
  });
});