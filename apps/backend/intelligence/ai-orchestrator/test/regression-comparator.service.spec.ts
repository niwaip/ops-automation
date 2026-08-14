import { RegressionComparatorService } from '../src/modules/llm-operation/eval/regression-comparator.service';
import type { EvalRunMetrics } from '../src/modules/llm-operation/eval/types';

describe('RegressionComparatorService', () => {
  let service: RegressionComparatorService;

  beforeEach(() => {
    service = new RegressionComparatorService();
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

  it('should return empty regressions for identical metrics', () => {
    const baseline = createMetrics();
    const candidate = createMetrics();

    const result = service.compare(baseline, candidate);

    expect(result.regressions).toEqual([]);
    expect(result.baselineMetrics).toEqual(baseline);
    expect(result.candidateMetrics).toEqual(candidate);
  });

  it('should detect critical regression for schemaPassRate drop', () => {
    const baseline = createMetrics({ schemaPassRate: 1.0 });
    const candidate = createMetrics({ schemaPassRate: 0.9 });

    const result = service.compare(baseline, candidate);

    expect(result.regressions.length).toBeGreaterThan(0);
    expect(result.regressions[0].metric).toBe('schemaPassRate');
    expect(result.regressions[0].severity).toBe('critical');
    expect(result.regressions[0].delta).toBeCloseTo(-0.1);
  });

  it('should detect warning regression for latency increase', () => {
    const baseline = createMetrics({ avgLatencyMs: 500 });
    const candidate = createMetrics({ avgLatencyMs: 750 });

    const result = service.compare(baseline, candidate);

    expect(result.regressions.length).toBeGreaterThan(0);
    const latencyRegression = result.regressions.find(r => r.metric === 'avgLatencyMs');
    expect(latencyRegression).toBeDefined();
    expect(latencyRegression!.severity).toBe('warning');
  });

  it('should detect critical regression for safetyRejectRate increase', () => {
    const baseline = createMetrics({ safetyRejectRate: 0 });
    const candidate = createMetrics({ safetyRejectRate: 0.06 });

    const result = service.compare(baseline, candidate);

    expect(result.regressions.length).toBeGreaterThan(0);
    const safetyRegression = result.regressions.find(r => r.metric === 'safetyRejectRate');
    expect(safetyRegression).toBeDefined();
    expect(safetyRegression!.severity).toBe('critical');
  });

  it('should detect critical regression for taskSuccessRate drop', () => {
    const baseline = createMetrics({ taskSuccessRate: 0.95 });
    const candidate = createMetrics({ taskSuccessRate: 0.85 });

    const result = service.compare(baseline, candidate);

    expect(result.regressions.length).toBeGreaterThan(0);
    const taskRegression = result.regressions.find(r => r.metric === 'taskSuccessRate');
    expect(taskRegression).toBeDefined();
    expect(taskRegression!.severity).toBe('critical');
    expect(taskRegression!.delta).toBeCloseTo(-0.1);
  });

  it('should not flag minor variations as regressions', () => {
    const baseline = createMetrics({ avgLatencyMs: 500, avgInputTokens: 100 });
    const candidate = createMetrics({ avgLatencyMs: 550, avgInputTokens: 110 });

    const result = service.compare(baseline, candidate);

    expect(result.regressions.length).toBe(0);
  });

  it('should detect multiple regressions simultaneously', () => {
    const baseline = createMetrics({
      schemaPassRate: 1.0,
      avgLatencyMs: 500,
      safetyRejectRate: 0,
    });
    const candidate = createMetrics({
      schemaPassRate: 0.9,
      avgLatencyMs: 800,
      safetyRejectRate: 0.06,
    });

    const result = service.compare(baseline, candidate);

    expect(result.regressions.length).toBeGreaterThanOrEqual(3);
    expect(result.regressions.some(r => r.metric === 'schemaPassRate')).toBe(true);
    expect(result.regressions.some(r => r.metric === 'avgLatencyMs')).toBe(true);
    expect(result.regressions.some(r => r.metric === 'safetyRejectRate')).toBe(true);
  });
});