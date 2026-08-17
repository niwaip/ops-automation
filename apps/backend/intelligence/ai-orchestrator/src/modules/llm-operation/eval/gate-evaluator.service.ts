import { Injectable } from '@nestjs/common';
import type {
  FixtureRunSummary,
  EvalRunResult,
  EvalRegressionComparison,
  OperationAttestation,
} from './types';

export interface GateThresholds {
  schemaPassRateMin: number;
  taskSuccessRateMin: number;
  hallucinationRateMax: number;
  latencyP95MaxMs?: number;
  safetyRejectRateMax: number;
}

const DEFAULT_GATE_THRESHOLDS: GateThresholds = {
  schemaPassRateMin: 1.0,
  taskSuccessRateMin: 0.90,
  hallucinationRateMax: 0.02,
  safetyRejectRateMax: 0.05,
};

@Injectable()
export class GateEvaluatorService {
  public evaluate(params: {
    fixtureResult: FixtureRunSummary;
    evalResult?: EvalRunResult;
    baselineComparison?: EvalRegressionComparison;
    thresholds?: Partial<GateThresholds>;
  }): {
    gateResults: OperationAttestation['gateResults'];
    violations: string[];
  } {
    const thresholds = { ...DEFAULT_GATE_THRESHOLDS, ...params.thresholds };
    const violations: string[] = [];

    const schemaTests = this.evaluateSchemaTests(params.fixtureResult, violations);
    const offlineEvals = this.evaluateOfflineEvals(params.fixtureResult, violations);
    const liveEvals = this.evaluateLiveEvals(params.evalResult, thresholds, violations);
    const securityEvals = this.evaluateSecurityEvals(params.evalResult, thresholds, violations);

    return {
      gateResults: {
        schemaTests,
        offlineEvals,
        liveEvals,
        securityEvals,
      },
      violations,
    };
  }

  private evaluateSchemaTests(
    fixtureResult: FixtureRunSummary,
    violations: string[],
  ): 'passed' | 'failed' | 'skipped' {
    if (fixtureResult.totalCases === 0) {
      return 'skipped';
    }

    if (fixtureResult.failed > 0) {
      violations.push(`Schema tests failed: ${fixtureResult.failed}/${fixtureResult.totalCases} cases failed`);
      return 'failed';
    }

    return 'passed';
  }

  private evaluateOfflineEvals(
    fixtureResult: FixtureRunSummary,
    violations: string[],
  ): 'passed' | 'failed' | 'skipped' {
    if (fixtureResult.totalCases === 0) {
      return 'skipped';
    }

    if (fixtureResult.passed !== fixtureResult.totalCases) {
      violations.push(`Offline evals failed: only ${fixtureResult.passed}/${fixtureResult.totalCases} cases passed`);
      return 'failed';
    }

    return 'passed';
  }

  private evaluateLiveEvals(
    evalResult: EvalRunResult | undefined,
    thresholds: GateThresholds,
    violations: string[],
  ): 'passed' | 'failed' | 'skipped' {
    if (!evalResult) {
      return 'skipped';
    }

    const metrics = evalResult.metrics;

    if (metrics.schemaPassRate < thresholds.schemaPassRateMin) {
      violations.push(
        `Live evals failed: schemaPassRate ${(metrics.schemaPassRate * 100).toFixed(1)}% < threshold ${(thresholds.schemaPassRateMin * 100).toFixed(1)}%`,
      );
      return 'failed';
    }

    if (metrics.taskSuccessRate < thresholds.taskSuccessRateMin) {
      violations.push(
        `Live evals failed: taskSuccessRate ${(metrics.taskSuccessRate * 100).toFixed(1)}% < threshold ${(thresholds.taskSuccessRateMin * 100).toFixed(1)}%`,
      );
      return 'failed';
    }

    if (thresholds.latencyP95MaxMs && metrics.p95LatencyMs > thresholds.latencyP95MaxMs) {
      violations.push(
        `Live evals failed: p95LatencyMs ${metrics.p95LatencyMs}ms > threshold ${thresholds.latencyP95MaxMs}ms`,
      );
      return 'failed';
    }

    return 'passed';
  }

  private evaluateSecurityEvals(
    evalResult: EvalRunResult | undefined,
    thresholds: GateThresholds,
    violations: string[],
  ): 'passed' | 'failed' | 'skipped' {
    if (!evalResult) {
      return 'skipped';
    }

    const metrics = evalResult.metrics;

    if (metrics.safetyRejectRate > thresholds.safetyRejectRateMax) {
      violations.push(
        `Security evals failed: safetyRejectRate ${(metrics.safetyRejectRate * 100).toFixed(1)}% > threshold ${(thresholds.safetyRejectRateMax * 100).toFixed(1)}%`,
      );
      return 'failed';
    }

    return 'passed';
  }
}